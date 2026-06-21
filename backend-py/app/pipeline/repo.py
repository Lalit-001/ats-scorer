"""SQLAlchemy-backed implementation of the orchestrator's PipelineRepo
(port of repo.ts).

One repo instance is bound to one async session for the lifetime of a single job
(jobs run sequentially within themselves), mirroring the Node repo's stateless
per-operation writes.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import Application, Evaluation, ExtractedImage, PipelineRun


def _now() -> datetime:
    return datetime.now(timezone.utc)


class SqlAlchemyPipelineRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_application(self, id: str) -> dict:
        app = (
            await self.session.execute(
                select(Application)
                .where(Application.id == uuid.UUID(id))
                .options(selectinload(Application.job))
            )
        ).scalar_one_or_none()
        if not app or not app.job:
            raise RuntimeError(f"Application {id} not found")
        # Only processable (status="uploaded") applications are enqueued, and those
        # always have a stored resume — guard so we fail loudly otherwise.
        if not app.resume_path:
            raise RuntimeError(f"Application {id} has no resume file")
        return {"resumePath": app.resume_path, "jobDescription": app.job.description}

    async def set_status(
        self,
        id: str,
        status: str,
        error_stage: str | None = None,
        error_message: str | None = None,
    ) -> None:
        await self.session.execute(
            update(Application)
            .where(Application.id == uuid.UUID(id))
            .values(status=status, error_stage=error_stage, error_message=error_message)
        )
        await self.session.commit()

    async def save_basic_details(self, id: str, basic_details: Any) -> None:
        await self.session.execute(
            update(Application)
            .where(Application.id == uuid.UUID(id))
            .values(basic_details=basic_details)
        )
        await self.session.commit()

    async def start_run(self, id: str, stage: str) -> None:
        app_id = uuid.UUID(id)
        await self.session.execute(
            delete(PipelineRun).where(
                PipelineRun.application_id == app_id, PipelineRun.stage == stage
            )
        )
        self.session.add(
            PipelineRun(
                application_id=app_id, stage=stage, status="running", started_at=_now()
            )
        )
        await self.session.commit()

    async def finish_run(self, id: str, stage: str, output: Any) -> None:
        app_id = uuid.UUID(id)
        # `extract` is raw PDF data; the other stages are structured JSON.
        if stage == "extract":
            values = {"status": "done", "finished_at": _now(), "raw_output": output or {}}
        else:
            values = {
                "status": "done",
                "finished_at": _now(),
                "structured_output": output or {},
            }
        await self.session.execute(
            update(PipelineRun)
            .where(PipelineRun.application_id == app_id, PipelineRun.stage == stage)
            .values(**values)
        )
        await self.session.commit()

    async def fail_run(self, id: str, stage: str, error: str) -> None:
        await self.session.execute(
            update(PipelineRun)
            .where(
                PipelineRun.application_id == uuid.UUID(id), PipelineRun.stage == stage
            )
            .values(status="failed", finished_at=_now(), error=error)
        )
        await self.session.commit()

    async def save_extracted_images(self, id: str, images: list[dict]) -> None:
        if not images:
            return
        app_id = uuid.UUID(id)
        self.session.add_all(
            [
                ExtractedImage(
                    application_id=app_id,
                    image_index=img["index"],
                    image_path=img["path"],
                )
                for img in images
            ]
        )
        await self.session.commit()

    async def update_image_classifications(self, id: str, classified: list[dict]) -> None:
        app_id = uuid.UUID(id)
        for c in classified:
            await self.session.execute(
                update(ExtractedImage)
                .where(
                    ExtractedImage.application_id == app_id,
                    ExtractedImage.image_index == c["index"],
                )
                .values(image_type=c["imageType"], details=c.get("details"))
            )
        await self.session.commit()

    async def save_evaluation(self, id: str, evaluation: dict) -> None:
        self.session.add(
            Evaluation(
                application_id=uuid.UUID(id),
                match_score=evaluation["matchScore"],
                recommendation=evaluation["recommendation"],
                dimensions=evaluation["dimensions"],
                strengths=evaluation["strengths"],
                gaps=evaluation["gaps"],
                raw_llm_json=evaluation,
            )
        )
        await self.session.commit()
