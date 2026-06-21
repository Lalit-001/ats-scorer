"""Core email-ingestion logic, decoupled from HTTP (port of ingestEmail.ts).

Turns one received Mailpit message into exactly one Application row, mirroring the
web apply flow but: (1) the job is resolved from a UUID in the email body, not a
slug — no/unknown UUID -> "orphan"; (2) nothing is ever surfaced to the sender —
problems are recorded on the row.

Outcome matrix (every email leaves exactly one row, except duplicates):
  job ok + pdf ok  -> "uploaded", enqueue
  job ok + no pdf  -> "failed",  errorMessage set, not enqueued
  no job + pdf ok  -> "orphan",  jobId null,      not enqueued
  no job + no pdf  -> "orphan",  errorMessage set, not enqueued
"""

from __future__ import annotations

import re
import uuid as uuidlib
from pathlib import Path
from uuid import uuid4

import aiofiles
import httpx
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.models import Application, JobDescription
from app.email.mailpit_client import get_attachment, get_message
from app.queue.queue import enqueue_application

# Matches a standard UUID (v1-v5); the first one in the email body is the job id.
_UUID_RE = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", re.I
)


def _is_pdf(att: dict) -> bool:
    ct = (att.get("ContentType") or "").lower()
    fn = (att.get("FileName") or "").lower()
    return "application/pdf" in ct or fn.endswith(".pdf")


async def ingest_email_message(
    message_id: str,
    session: AsyncSession,
    arq,
    client: httpx.AsyncClient,
) -> dict:
    # 1. Pull the full message (body text + attachment metadata).
    msg = await get_message(client, message_id)

    # 2. Candidate identity from the From header (name falls back to local-part).
    frm = msg.get("From") or {}
    from_address = (frm.get("Address") or "").strip()
    email = from_address or "unknown@unknown"
    name = (frm.get("Name") or "").strip() or (
        from_address.split("@")[0] if from_address else ""
    ) or "Unknown"

    # 3. Resolve the job from the first UUID found in the body. Unknown id -> orphan.
    match = _UUID_RE.search(msg.get("Text") or "")
    job = (
        await session.get(JobDescription, uuidlib.UUID(match.group(0)))
        if match
        else None
    )

    # 4. Find + download the PDF attachment, if any.
    pdf_part = next((a for a in (msg.get("Attachments") or []) if _is_pdf(a)), None)
    resume_path: str | None = None
    error_stage: str | None = None
    error_message: str | None = None

    if pdf_part:
        try:
            data = await get_attachment(client, message_id, pdf_part["PartID"])
            resume_dir = Path(settings.data_dir) / "resumes"
            resume_dir.mkdir(parents=True, exist_ok=True)
            resume_path = str(resume_dir / f"{uuid4()}.pdf")
            async with aiofiles.open(resume_path, "wb") as f:
                await f.write(data)
        except Exception as err:  # noqa: BLE001
            resume_path = None
            error_stage = "intake"
            error_message = f"Failed to download PDF attachment: {err}"
    else:
        error_stage = "intake"
        error_message = "No PDF attachment found in email"

    # 5. Decide status. No job -> "orphan"; otherwise a usable PDF -> "uploaded",
    #    a missing one -> "failed".
    has_pdf = resume_path is not None
    status = "orphan" if not job else ("uploaded" if has_pdf else "failed")

    # 6. Duplicate guard — only for job-bound applications (orphans never dedupe).
    if job:
        duplicate = await session.scalar(
            select(Application).where(
                Application.job_id == job.id,
                func.lower(Application.email) == email.lower(),
            )
        )
        if duplicate:
            return {"applicationId": str(duplicate.id), "status": "duplicate"}

    # 7. Create the row (every email leaves a trace) and enqueue when processable.
    application = Application(
        job_id=job.id if job else None,
        name=name,
        email=email,
        resume_path=resume_path,
        source="email",
        status=status,
        error_stage=error_stage,
        error_message=error_message,
    )
    session.add(application)
    try:
        await session.commit()
    except IntegrityError:
        # Lost the race against a concurrent submit — the unique index caught it.
        await session.rollback()
        return {"applicationId": None, "status": "duplicate"}

    await session.refresh(application)
    if status == "uploaded" and arq is not None:
        await enqueue_application(arq, application.id)
    return {"applicationId": str(application.id), "status": status}
