"""Shared FastAPI dependencies + small response helpers."""

from __future__ import annotations

from fastapi import HTTPException, Request

from app.config import settings


def get_arq(request: Request):
    """The shared ARQ pool created in the app lifespan."""
    pool = getattr(request.app.state, "arq", None)
    if pool is None:
        raise HTTPException(status_code=503, detail="Queue unavailable")
    return pool


def to_file_url(path: str | None) -> str | None:
    """Map a stored absolute file path to its public /files URL.

    Mirrors the Node toFileUrl: "/files" + path[len(dataDir):].
    """
    if not path:
        return None
    return "/files" + path[len(settings.data_dir):]
