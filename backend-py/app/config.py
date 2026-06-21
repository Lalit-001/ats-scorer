"""Central env-driven configuration (mirror of the Node backend's config.ts).

Reads the same .env as the Node services. Two Python-specific concerns:
  - SQLAlchemy/asyncpg needs a `postgresql+asyncpg://` DSN without the
    `?schema=public` query param that the Node DATABASE_URL carries.
  - To run side-by-side with the Node stack we isolate this service onto a
    separate Redis logical DB so our ARQ queue + Gemini rate-store keys never
    collide with Node's BullMQ keys on DB 0.
"""

from __future__ import annotations

from functools import lru_cache
from urllib.parse import urlsplit, urlunsplit

from pydantic_settings import BaseSettings, SettingsConfigDict


def to_async_dsn(url: str) -> str:
    """Convert a sync Postgres URL into an asyncpg SQLAlchemy DSN.

    postgresql://ats:ats@db:5432/ats?schema=public
      -> postgresql+asyncpg://ats:ats@db:5432/ats

    Forces the asyncpg driver and drops the query string (asyncpg rejects the
    `schema` param Node's Sequelize URL includes).
    """
    parts = urlsplit(url)
    return urlunsplit(("postgresql+asyncpg", parts.netloc, parts.path, "", ""))


# --- Weighted scoring rubric (must stay identical to the Node config). ---
# The LLM returns per-dimension 0-100 sub-scores; we compute the overall score
# and recommendation here so they stay consistent with the Node implementation.
RUBRIC_WEIGHTS: dict[str, float] = {
    "hard_skills": 0.35,
    "experience_relevance": 0.30,
    "seniority_scope": 0.15,
    "education_certs": 0.10,
    "domain_knowledge": 0.10,
}
RUBRIC_THRESHOLDS: dict[str, int] = {"strong": 75, "good": 55}
MAX_BULLETS = 5
MAX_BULLET_WORDS = 20


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore"
    )

    api_port: int = 4000
    database_url: str = ""
    redis_url: str = "redis://localhost:6379"
    parser_url: str = "http://localhost:8000"

    admin_password: str = "changeme"
    admin_token_secret: str = "dev-secret-change-me"

    data_dir: str = "/data"
    max_upload_mb: int = 10
    max_vision_images: int = 2

    # Inbound email ingestion via Mailpit.
    mailpit_api_url: str = "http://localhost:8025"
    email_webhook_secret: str = "dev-email-secret-change-me"

    # Gemini: comma-separated pool of free-tier keys from different accounts.
    gemini_api_keys: str = ""
    gemini_model: str = "gemini-1.5-flash"
    gemini_rpm: int = 10
    gemini_rpd: int = 250

    # Redis logical DB for this Python stack (keeps ARQ + rate-store off Node's DB 0).
    redis_db: int = 1

    @property
    def async_database_url(self) -> str:
        return to_async_dsn(self.database_url)

    @property
    def gemini_keys(self) -> list[str]:
        return [k.strip() for k in self.gemini_api_keys.split(",") if k.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
