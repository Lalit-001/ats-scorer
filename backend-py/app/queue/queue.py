"""ARQ queue wiring (producer side).

Replaces the Node BullMQ queue. Runs on a SEPARATE Redis logical DB (settings
.redis_db, default 1) so its keys never collide with Node's BullMQ keys on DB 0
while both stacks run side-by-side. The consumer (worker) lives in
app/queue/worker.py and is built in a later step.
"""

from __future__ import annotations

import uuid
from urllib.parse import urlsplit

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from app.config import settings

# Single job type, mirroring the Node "application-processing" queue.
PROCESS_APPLICATION = "process_application"


def redis_settings() -> RedisSettings:
    """ARQ Redis connection on our isolated logical DB."""
    parts = urlsplit(settings.redis_url)
    return RedisSettings(
        host=parts.hostname or "localhost",
        port=parts.port or 6379,
        database=settings.redis_db,
    )


async def create_arq_pool() -> ArqRedis:
    return await create_pool(redis_settings())


async def enqueue_application(pool: ArqRedis, application_id: uuid.UUID | str) -> None:
    """Enqueue an application for pipeline processing."""
    await pool.enqueue_job(PROCESS_APPLICATION, str(application_id))
