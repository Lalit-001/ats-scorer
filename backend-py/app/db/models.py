"""SQLAlchemy models mapped onto the EXISTING Postgres schema.

These tables were created by the Node/Sequelize migrations. The models below
match the live schema byte-for-byte (camelCase columns, named PG enums, FK
cascade, gen_random_uuid() defaults, the functional unique index) so we map
onto the data without recreating anything. create_type=False on every ENUM
keeps SQLAlchemy/Alembic from trying to CREATE TYPE for enums that exist.

Python attributes are snake_case; the real DB column name is given as the first
positional arg to mapped_column where they differ (e.g. "jobId").
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import DateTime


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


# --- Named PG enums already created by the Node migrations (do not recreate). ---
ApplicationStatus = ENUM(
    "uploaded", "processing", "completed", "failed", "orphan",
    name="enum_applications_status", create_type=False,
)
ApplicationSource = ENUM(
    "web", "email",
    name="enum_applications_source", create_type=False,
)
PipelineRunStatus = ENUM(
    "pending", "running", "done", "failed",
    name="enum_pipeline_runs_status", create_type=False,
)
ImageType = ENUM(
    "certificate", "profile_photo", "logo", "other",
    name="enum_extracted_images_imageType", create_type=False,
)
Recommendation = ENUM(
    "strong_match", "good_match", "reject",
    name="enum_evaluations_recommendation", create_type=False,
)

_UUID_PK = mapped_column(
    UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
)


class JobDescription(Base):
    __tablename__ = "job_descriptions"
    __table_args__ = (UniqueConstraint("slug", name="job_descriptions_slug_key"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    applications: Mapped[list[Application]] = relationship(
        back_populates="job", passive_deletes=True
    )


class Application(Base):
    __tablename__ = "applications"
    __table_args__ = (
        Index(
            "applications_job_email_unique",
            text('"jobId"'),
            text("lower(email)"),
            unique=True,
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(
        "jobId",
        UUID(as_uuid=True),
        ForeignKey(
            "job_descriptions.id",
            ondelete="CASCADE",
            onupdate="CASCADE",
            name="applications_jobId_fkey",
        ),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False)
    resume_path: Mapped[str | None] = mapped_column("resumePath", String, nullable=True)
    status: Mapped[str] = mapped_column(
        ApplicationStatus,
        nullable=False,
        server_default=text("'uploaded'::enum_applications_status"),
        default="uploaded",
    )
    error_stage: Mapped[str | None] = mapped_column("errorStage", String, nullable=True)
    error_message: Mapped[str | None] = mapped_column("errorMessage", Text, nullable=True)
    basic_details: Mapped[dict | None] = mapped_column("basicDetails", JSONB, nullable=True)
    source: Mapped[str] = mapped_column(
        ApplicationSource,
        nullable=False,
        server_default=text("'web'::enum_applications_source"),
        default="web",
    )
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    job: Mapped[JobDescription | None] = relationship(back_populates="applications")
    pipeline_runs: Mapped[list[PipelineRun]] = relationship(
        back_populates="application", passive_deletes=True
    )
    images: Mapped[list[ExtractedImage]] = relationship(
        back_populates="application", passive_deletes=True
    )
    evaluation: Mapped[Evaluation | None] = relationship(
        back_populates="application", passive_deletes=True, uselist=False
    )


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"
    __table_args__ = (Index("pipeline_runs_application_id", "applicationId"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    application_id: Mapped[uuid.UUID] = mapped_column(
        "applicationId",
        UUID(as_uuid=True),
        ForeignKey(
            "applications.id",
            ondelete="CASCADE",
            onupdate="CASCADE",
            name="pipeline_runs_applicationId_fkey",
        ),
        nullable=False,
    )
    # Was an ENUM, converted to VARCHAR so stages can evolve without DB churn.
    stage: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        PipelineRunStatus,
        nullable=False,
        server_default=text("'pending'::enum_pipeline_runs_status"),
        default="pending",
    )
    raw_output: Mapped[dict | None] = mapped_column("rawOutput", JSONB, nullable=True)
    structured_output: Mapped[dict | None] = mapped_column(
        "structuredOutput", JSONB, nullable=True
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(
        "startedAt", DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        "finishedAt", DateTime(timezone=True), nullable=True
    )

    application: Mapped[Application] = relationship(back_populates="pipeline_runs")


class ExtractedImage(Base):
    __tablename__ = "extracted_images"
    __table_args__ = (Index("extracted_images_application_id", "applicationId"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    application_id: Mapped[uuid.UUID] = mapped_column(
        "applicationId",
        UUID(as_uuid=True),
        ForeignKey(
            "applications.id",
            ondelete="CASCADE",
            onupdate="CASCADE",
            name="extracted_images_applicationId_fkey",
        ),
        nullable=False,
    )
    image_index: Mapped[int] = mapped_column("imageIndex", Integer, nullable=False)
    image_path: Mapped[str] = mapped_column("imagePath", String, nullable=False)
    image_type: Mapped[str | None] = mapped_column("imageType", ImageType, nullable=True)
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    application: Mapped[Application] = relationship(back_populates="images")


class Evaluation(Base):
    __tablename__ = "evaluations"
    __table_args__ = (
        UniqueConstraint("applicationId", name="evaluations_applicationId_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    application_id: Mapped[uuid.UUID] = mapped_column(
        "applicationId",
        UUID(as_uuid=True),
        ForeignKey(
            "applications.id",
            ondelete="CASCADE",
            onupdate="CASCADE",
            name="evaluations_applicationId_fkey",
        ),
        nullable=False,
    )
    match_score: Mapped[int] = mapped_column("matchScore", Integer, nullable=False)
    recommendation: Mapped[str] = mapped_column(Recommendation, nullable=False)
    strengths: Mapped[list] = mapped_column(JSONB, nullable=False)
    gaps: Mapped[list] = mapped_column(JSONB, nullable=False)
    raw_llm_json: Mapped[dict] = mapped_column("rawLlmJson", JSONB, nullable=False)
    dimensions: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    application: Mapped[Application] = relationship(back_populates="evaluation")
