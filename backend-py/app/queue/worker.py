"""ARQ worker entrypoint (replaces worker.ts).

Consumes the queue and runs the fail-fast pipeline. Mirrors the BullMQ worker:
concurrency 2 (max_jobs) and no auto-retry (max_tries=1) — recovery is the explicit
admin "reprocess", not a retry. Reuses ARQ's own Redis connection (on logical DB 1)
for the Gemini rate-store.

Run:  arq app.queue.worker.WorkerSettings
"""

from __future__ import annotations

import httpx
from arq.worker import func

from app.config import settings
from app.db.session import SessionLocal
from app.llm.gemini import build_gemini_caller
from app.pipeline.image_loader import load_image_from_disk
from app.pipeline.orchestrator import ProcessDeps, process_application
from app.pipeline.parser_client import extract_via_parser
from app.pipeline.repo import SqlAlchemyPipelineRepo
from app.queue.queue import PROCESS_APPLICATION, redis_settings


async def process_application_job(ctx, application_id: str) -> None:
    client: httpx.AsyncClient = ctx["http"]
    call = ctx["gemini_call"]
    async with SessionLocal() as session:
        repo = SqlAlchemyPipelineRepo(session)
        deps = ProcessDeps(
            repo=repo,
            extract=lambda aid, path: extract_via_parser(client, aid, path),
            call=call,
            load_image=load_image_from_disk,
        )
        await process_application(application_id, deps)


async def on_startup(ctx) -> None:
    ctx["http"] = httpx.AsyncClient(timeout=120)
    ctx["gemini_call"] = build_gemini_caller(ctx["redis"], ctx["http"])
    print(
        f"[worker] ready; model={settings.gemini_model}, redis db={settings.redis_db}"
    )


async def on_shutdown(ctx) -> None:
    await ctx["http"].aclose()


class WorkerSettings:
    functions = [func(process_application_job, name=PROCESS_APPLICATION)]
    redis_settings = redis_settings()
    on_startup = on_startup
    on_shutdown = on_shutdown
    max_jobs = 2  # concurrency (BullMQ concurrency: 2)
    max_tries = 1  # fail-fast, no auto-retry (BullMQ attempts: 1)
    keep_result = 0  # outcome is persisted in Postgres; no need to keep ARQ results
