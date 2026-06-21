"""Candidate-facing routes: view a job and submit an application (port of publicRoutes.ts).

Mounted under /api.
"""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_arq
from app.config import settings
from app.db.models import Application, JobDescription
from app.db.session import get_session
from app.queue.queue import enqueue_application

router = APIRouter()


@router.get("/jobs/{slug}")
async def get_job(slug: str, session: AsyncSession = Depends(get_session)):
    job = await session.scalar(select(JobDescription).where(JobDescription.slug == slug))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "id": job.id,
        "title": job.title,
        "description": job.description,
        "slug": job.slug,
    }


@router.post("/jobs/{slug}/apply", status_code=202)
async def apply(
    slug: str,
    name: str = Form(default=""),
    email: str = Form(default=""),
    resume: UploadFile | None = File(default=None),
    session: AsyncSession = Depends(get_session),
    arq=Depends(get_arq),
):
    job = await session.scalar(select(JobDescription).where(JobDescription.slug == slug))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    name = name.strip()
    email = email.strip()
    if not name or not email:
        raise HTTPException(status_code=400, detail="name and email are required")
    if resume is None:
        raise HTTPException(status_code=400, detail="resume PDF is required")
    if resume.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    # One application per (job, email), case-insensitive.
    duplicate = await session.scalar(
        select(Application).where(
            Application.job_id == job.id,
            func.lower(Application.email) == email.lower(),
        )
    )
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail="You have already applied to this job with this email.",
        )

    content = await resume.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large")

    resume_dir = Path(settings.data_dir) / "resumes"
    resume_dir.mkdir(parents=True, exist_ok=True)
    path = str(resume_dir / f"{uuid4()}.pdf")
    async with aiofiles.open(path, "wb") as f:
        await f.write(content)

    application = Application(
        job_id=job.id, name=name, email=email, resume_path=path, status="uploaded"
    )
    session.add(application)
    try:
        await session.commit()
    except IntegrityError:
        # Lost the race against a concurrent submit — the unique index caught it.
        await session.rollback()
        Path(path).unlink(missing_ok=True)
        raise HTTPException(
            status_code=409,
            detail="You have already applied to this job with this email.",
        )

    await session.refresh(application)
    await enqueue_application(arq, application.id)
    return {"id": application.id, "status": application.status}
