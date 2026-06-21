"""Admin dashboard routes (port of adminRoutes.ts).

Mounted under /api/admin. /login is public; every other route requires the
admin bearer token (enforced via the router-level require_admin dependency).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.auth import require_admin
from app.api.deps import get_arq, to_file_url
from app.api.slug import slugify
from app.config import settings
from app.db.models import (
    Application,
    Evaluation,
    ExtractedImage,
    JobDescription,
    PipelineRun,
)
from app.db.session import get_session
from app.queue.queue import enqueue_application

# Public admin router (just /login).
login_router = APIRouter()
# Protected router — bearer token required for everything here.
router = APIRouter(dependencies=[Depends(require_admin)])


class LoginBody(BaseModel):
    password: str | None = None


class JobBody(BaseModel):
    title: str | None = None
    description: str | None = None


@login_router.post("/login")
async def login(body: LoginBody):
    if body.password != settings.admin_password:
        raise HTTPException(status_code=401, detail="Invalid password")
    return {"token": settings.admin_token_secret}


@router.post("/jobs", status_code=201)
async def create_job(body: JobBody, session: AsyncSession = Depends(get_session)):
    if not body.title or not body.description:
        raise HTTPException(status_code=400, detail="title and description are required")
    job = JobDescription(
        title=body.title, description=body.description, slug=slugify(body.title)
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return {"id": job.id, "slug": job.slug, "applyUrl": f"/apply/{job.slug}"}


@router.get("/jobs")
async def list_jobs(session: AsyncSession = Depends(get_session)):
    jobs = (
        await session.execute(
            select(JobDescription).order_by(JobDescription.created_at.desc())
        )
    ).scalars().all()
    rows = (
        await session.execute(
            select(Application.job_id, func.count(Application.id)).group_by(
                Application.job_id
            )
        )
    ).all()
    count_by_job = {job_id: count for job_id, count in rows}
    return [
        {
            "id": j.id,
            "title": j.title,
            "slug": j.slug,
            "applicants": count_by_job.get(j.id, 0),
            "createdAt": j.created_at,
        }
        for j in jobs
    ]


@router.get("/jobs/{job_id}")
async def get_job(job_id: uuid.UUID, session: AsyncSession = Depends(get_session)):
    job = await session.get(JobDescription, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"id": job.id, "title": job.title, "slug": job.slug, "description": job.description}


@router.patch("/jobs/{job_id}")
async def update_job(
    job_id: uuid.UUID, body: JobBody, session: AsyncSession = Depends(get_session)
):
    if not body.title or not body.description:
        raise HTTPException(status_code=400, detail="title and description are required")
    job = await session.get(JobDescription, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # Slug is intentionally left unchanged so existing apply links keep working.
    job.title = body.title
    job.description = body.description
    await session.commit()
    return {"id": job.id, "title": job.title, "slug": job.slug}


@router.get("/jobs/{job_id}/applications")
async def list_applications(
    job_id: uuid.UUID, session: AsyncSession = Depends(get_session)
):
    apps = (
        await session.execute(
            select(Application)
            .where(Application.job_id == job_id)
            .order_by(Application.created_at.desc())
            .options(
                selectinload(Application.evaluation),
                selectinload(Application.images),
            )
        )
    ).scalars().all()
    return [
        {
            "id": a.id,
            "name": a.name,
            "email": a.email,
            "status": a.status,
            "errorStage": a.error_stage,
            "errorMessage": a.error_message,
            "resumeUrl": to_file_url(a.resume_path),
            "basicDetails": a.basic_details,
            "matchScore": a.evaluation.match_score if a.evaluation else None,
            "recommendation": a.evaluation.recommendation if a.evaluation else None,
            "hasCertificate": any(
                i.image_type == "certificate" for i in a.images
            ),
            "createdAt": a.created_at,
        }
        for a in apps
    ]


@router.get("/applications/{application_id}")
async def get_application(
    application_id: uuid.UUID, session: AsyncSession = Depends(get_session)
):
    app = (
        await session.execute(
            select(Application)
            .where(Application.id == application_id)
            .options(
                selectinload(Application.job),
                selectinload(Application.evaluation),
                selectinload(Application.images),
                selectinload(Application.pipeline_runs),
            )
        )
    ).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    def run_by_stage(stage: str) -> PipelineRun | None:
        return next((r for r in app.pipeline_runs if r.stage == stage), None)

    structure = run_by_stage("structure")
    structured = structure.structured_output if structure else None
    return {
        "id": app.id,
        "name": app.name,
        "email": app.email,
        "status": app.status,
        "errorStage": app.error_stage,
        "errorMessage": app.error_message,
        "resumeUrl": to_file_url(app.resume_path),
        "basicDetails": app.basic_details,
        "job": {
            "title": app.job.title if app.job else None,
            "description": app.job.description if app.job else None,
        },
        "resume": structured,
        "links": (structured or {}).get("links") if structured else None,
        "runs": [
            {"stage": r.stage, "status": r.status, "error": r.error}
            for r in app.pipeline_runs
        ],
        "images": [
            {
                "imageType": i.image_type,
                "details": i.details,
                "url": to_file_url(i.image_path),
            }
            for i in app.images
        ],
        "evaluation": (
            {
                "matchScore": app.evaluation.match_score,
                "recommendation": app.evaluation.recommendation,
                "dimensions": app.evaluation.dimensions,
                "strengths": app.evaluation.strengths,
                "gaps": app.evaluation.gaps,
            }
            if app.evaluation
            else None
        ),
    }


@router.post("/applications/{application_id}/reprocess", status_code=202)
async def reprocess(
    application_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    arq=Depends(get_arq),
):
    app = await session.get(Application, application_id)
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    await session.execute(
        delete(Evaluation).where(Evaluation.application_id == app.id)
    )
    await session.execute(
        delete(ExtractedImage).where(ExtractedImage.application_id == app.id)
    )
    await session.execute(
        delete(PipelineRun).where(PipelineRun.application_id == app.id)
    )
    app.status = "uploaded"
    app.error_stage = None
    app.error_message = None
    await session.commit()
    await enqueue_application(arq, app.id)
    return {"id": app.id, "status": "uploaded"}
