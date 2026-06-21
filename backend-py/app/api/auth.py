"""Minimal POC admin auth: static password -> shared bearer token (port of auth.ts).

Kept intentionally identical to the Node behavior so the existing frontend works
unchanged. (A real auth upgrade is out of scope for the migration.)
"""

from __future__ import annotations

from fastapi import Header, HTTPException

from app.config import settings


def require_admin(authorization: str = Header(default="")) -> None:
    """FastAPI dependency enforcing the admin bearer token."""
    token = authorization[7:] if authorization.startswith("Bearer ") else ""
    if token != settings.admin_token_secret:
        raise HTTPException(status_code=401, detail="Unauthorized")
