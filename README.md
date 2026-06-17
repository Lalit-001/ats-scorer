# ATS Resume Scorer

AI-driven Applicant Tracking System. An admin creates a Job Description, candidates apply
with a PDF resume, and an asynchronous pipeline extracts, structures, and evaluates each
resume against the JD to produce a match score and recommendation.

## Stack

- **Frontend:** React + Vite + TypeScript
- **API:** Node + Express + TypeScript
- **Worker:** Node + BullMQ (pipeline orchestration)
- **Parser:** Python + FastAPI + PyMuPDF (PDF extraction only)
- **LLM:** Gemini 2.5 Flash (rotating API key pool)
- **Data:** PostgreSQL (Prisma) + Redis
- **Local:** Docker Compose

See [`docs/superpowers/specs/2026-06-17-ats-resume-scorer-design.md`](docs/superpowers/specs/2026-06-17-ats-resume-scorer-design.md)
for the full design.

## Quick start

```bash
cp .env.example .env   # fill in GEMINI_API_KEYS
docker compose up --build
```

- Admin dashboard: http://localhost:5173/admin
- Apply page: http://localhost:5173/apply/:slug
