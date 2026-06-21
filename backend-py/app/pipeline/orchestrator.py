"""Pipeline orchestrator (port of orchestrator.ts).

Drives an application through extract -> structure -> certificates -> evaluate.
Fail-fast: any stage error marks the application `failed` (recording which stage
broke) and stops; later stages do not run.

All side effects go through injected collaborators (repo, extract, call, load_image)
so the control flow stays isolated from the DB and network.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Protocol

from app.config import settings
from app.pipeline.candidate import candidate_from_llm, candidate_from_parser
from app.pipeline.evaluator import evaluate
from app.pipeline.submodels import classify_certificates, structure_resume

# extract / structure / certificates / evaluate
Stage = str


class PipelineRepo(Protocol):
    async def get_application(self, id: str) -> dict: ...
    async def set_status(
        self, id: str, status: str, error_stage: str | None = None, error_message: str | None = None
    ) -> None: ...
    async def save_basic_details(self, id: str, basic_details: Any) -> None: ...
    async def start_run(self, id: str, stage: Stage) -> None: ...
    async def finish_run(self, id: str, stage: Stage, output: Any) -> None: ...
    async def fail_run(self, id: str, stage: Stage, error: str) -> None: ...
    async def save_extracted_images(self, id: str, images: list[dict]) -> None: ...
    async def update_image_classifications(self, id: str, classified: list[dict]) -> None: ...
    async def save_evaluation(self, id: str, evaluation: dict) -> None: ...


@dataclass
class ProcessDeps:
    repo: PipelineRepo
    extract: Callable[[str, str], Awaitable[dict]]
    call: Callable[..., Awaitable[Any]]
    load_image: Callable[[str], Awaitable[Any]]


class StageError(Exception):
    def __init__(self, stage: Stage, cause: Exception) -> None:
        self.stage = stage
        self.cause = cause
        super().__init__(str(cause))


async def _run_stage(
    repo: PipelineRepo, id: str, stage: Stage, fn: Callable[[], Awaitable[Any]]
) -> Any:
    await repo.start_run(id, stage)
    try:
        result = await fn()
        await repo.finish_run(id, stage, result)
        return result
    except Exception as err:  # noqa: BLE001
        await repo.fail_run(id, stage, str(err))
        raise StageError(stage, err)


async def process_application(id: str, deps: ProcessDeps) -> None:
    repo, extract, call, load_image = deps.repo, deps.extract, deps.call, deps.load_image
    app = await repo.get_application(id)

    try:
        await repo.set_status(id, "processing")

        raw = await _run_stage(repo, id, "extract", lambda: extract(id, app["resumePath"]))
        # Persist the cheap, LLM-free basics + images BEFORE any Gemini call, so a
        # later stage failure still leaves the dashboard with usable details.
        await repo.save_basic_details(id, raw["basic_details"])
        await repo.save_extracted_images(id, raw["pipeline_b"]["images"])

        # STRUCTURE: trust the parser's deterministic output; only fall back to the
        # LLM when parsing came out weak (messy/unusual layout).
        async def do_structure() -> dict:
            if raw["parse_quality"]["status"] == "good":
                return candidate_from_parser(raw["structured"], raw["links"])
            llm_resume = await structure_resume(raw["pipeline_a"], call)
            return candidate_from_llm(llm_resume, raw["links"])

        candidate = await _run_stage(repo, id, "structure", do_structure)

        # CERTIFICATES: gated + capped vision. Icons/logos are skipped; only
        # certificate-like images reach the LLM.
        cert_images = [
            img for img in raw["pipeline_b"]["images"] if img.get("likely_certificate")
        ][: settings.max_vision_images]
        certs = await _run_stage(
            repo, id, "certificates", lambda: classify_certificates(cert_images, call, load_image)
        )
        await repo.update_image_classifications(id, certs)

        # EVALUATE: the single guaranteed LLM call, over the compact candidate JSON.
        evaluation = await _run_stage(
            repo, id, "evaluate", lambda: evaluate(app["jobDescription"], candidate, call)
        )
        await repo.save_evaluation(id, evaluation)

        await repo.set_status(id, "completed")
    except Exception as err:  # noqa: BLE001
        stage = err.stage if isinstance(err, StageError) else "unknown"
        message = str(err)
        await repo.set_status(id, "failed", error_stage=stage, error_message=message)
        raise
