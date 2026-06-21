"""Internal webhook for inbound email (port of webhookRoutes.ts).

Mailpit POSTs a received-message summary here (JSON, with the message `ID`); we
hand it to the ingestion logic. This endpoint NEVER returns an error to the caller
except for auth — a non-2xx just makes Mailpit retry. We always ack with 200 and
log problems server-side.

Mounted under /api/webhook.
"""

from __future__ import annotations

import base64
import hmac

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_session
from app.email.ingest import ingest_email_message

router = APIRouter()


def _authorized(header: str | None) -> bool:
    """Verify Mailpit's Basic-auth password against the shared secret (constant-time)."""
    if not header or not header.startswith("Basic "):
        return False
    try:
        decoded = base64.b64decode(header[6:]).decode("utf-8", "ignore")
    except Exception:  # noqa: BLE001
        return False
    password = decoded[decoded.find(":") + 1 :]
    return hmac.compare_digest(password, settings.email_webhook_secret)


@router.post("/email")
async def email_webhook(
    request: Request, session: AsyncSession = Depends(get_session)
):
    print("web hook received from mailpit")
    if not _authorized(request.headers.get("authorization")):
        raise HTTPException(status_code=401, detail="unauthorized")

    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    message_id = str((body or {}).get("ID") or "").strip()
    if not message_id:
        return {"ok": True, "skipped": "no-message-id"}

    # Pull queue + http from app.state directly so a Redis hiccup never 503s the
    # webhook — we always ack so Mailpit clears it from its queue.
    arq = getattr(request.app.state, "arq", None)
    http = request.app.state.http
    try:
        result = await ingest_email_message(message_id, session, arq, http)
        print(
            f"[email] ingested message {message_id} -> application "
            f"{result['applicationId'] or '—'} ({result['status']})"
        )
    except Exception as err:  # noqa: BLE001 - never surface ingestion errors; log + ack
        print(f"[email] failed to ingest message {message_id}: {err}")

    return {"ok": True}
