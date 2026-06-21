"""FastAPI entrypoint — mirrors server.ts.

Wires CORS, /health, static /files off the shared data volume, the public +
admin routers, and error handlers that preserve the Node {error: ...} response
shape. The ARQ pool is created in the lifespan and shared via app.state.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.admin import login_router as admin_login_router
from app.api.admin import router as admin_router
from app.api.public import router as public_router
from app.api.webhook import router as webhook_router
from app.config import settings
from app.queue.queue import create_arq_pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Shared httpx client for outbound calls (Mailpit REST during ingestion).
    app.state.http = httpx.AsyncClient(timeout=30)
    try:
        app.state.arq = await create_arq_pool()
    except Exception as e:  # noqa: BLE001 - boot read-only routes even if Redis is down
        print(f"[api] WARNING: ARQ/Redis pool unavailable at startup: {e}")
        app.state.arq = None
    try:
        yield
    finally:
        if getattr(app.state, "arq", None) is not None:
            await app.state.arq.close()
        await app.state.http.aclose()


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


# Serve uploaded resumes / extracted images off the shared volume.
os.makedirs(settings.data_dir, exist_ok=True)
app.mount("/files", StaticFiles(directory=settings.data_dir), name="files")

app.include_router(public_router, prefix="/api")
app.include_router(admin_login_router, prefix="/api/admin")
app.include_router(admin_router, prefix="/api/admin")
app.include_router(webhook_router, prefix="/api/webhook")


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=400, content={"error": "Invalid request"})


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception):
    # Node's error handler returns 400 for any unexpected error.
    print("[api]", repr(exc))
    return JSONResponse(status_code=400, content={"error": str(exc) or "Bad request"})
