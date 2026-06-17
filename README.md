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

## Prerequisites

- Docker + Docker Compose
- One or more **Gemini API keys** (free tier) from https://aistudio.google.com/apikey.
  Create the key under several Google accounts and list them comma-separated to multiply the
  free-tier quota — the worker rotates across them and fails over on rate limits.

## Run it

```bash
cp .env.example .env
#   edit .env:
#     GEMINI_API_KEYS=key1,key2,key3      <- your real keys
#     ADMIN_PASSWORD=something-you-pick
docker compose up --build
```

Services and ports:

| URL | What |
|-----|------|
| http://localhost:5173/admin | Admin dashboard (log in with `ADMIN_PASSWORD`) |
| http://localhost:5173/apply/:slug | Candidate apply page (link shown after you create a JD) |
| http://localhost:4000/health | API health |
| http://localhost:8000/health | Parser health |

## Demo flow

1. Open **http://localhost:5173/admin** and log in with `ADMIN_PASSWORD`.
2. **Create a job description.** Copy the generated apply link.
3. Open the apply link, fill in name + email, and upload a **PDF resume**.
4. Back on the job's applicants page, watch the row move
   `uploaded → processing → completed` (polled live). Open a row to see the parsed resume,
   detected certificates/links, match score, strengths/gaps, and recommendation.
5. If a stage breaks (e.g. Gemini quota), the row shows **failed** with the broken stage and a
   **Re-process** button.

## Troubleshooting

- **Everything `failed` at `submodel_*`/`main_eval`** → check `GEMINI_API_KEYS` are valid and not
  over quota (`docker compose logs worker`).
- **`failed` at `extract`** → the parser couldn't read the PDF; check `docker compose logs parser`.
- **Reset the database** → `docker compose down -v` (drops the Postgres + uploads volumes).

## Tests

```bash
# parser (Python)
cd parser && python -m venv .venv && .venv/bin/pip install -e ".[dev]" && .venv/bin/pytest
# backend (Node)
cd backend && npm install && npm test
```
