# ATS Resume Scorer — Design Spec

**Date:** 2026-06-17
**Status:** Approved (design) — pending implementation plan
**Scope:** Local POC, run via Docker Compose

---

## 1. Overview

A full-stack Applicant Tracking System with an AI-driven resume-processing pipeline.

An **admin** creates a Job Description (JD), which generates a unique public **apply** link.
**Candidates** open that link, see the JD, and submit Name + Email + a PDF resume.
Submission triggers an **asynchronous pipeline** that extracts data from the PDF across three
pipelines, structures it with an LLM, and produces a final **match score + recommendation**
that the admin sees on a dashboard.

### Goals
- End-to-end working pipeline: upload → extract → structure → evaluate → score on dashboard.
- Robust handling of three extraction concerns: text+links, embedded images/OCR, icon-embedded hyperlinks.
- Run entirely locally via Docker Compose, using **Gemini 2.5 Flash free tier** with a **pool of API keys**.
- Surface pipeline failures clearly on the dashboard with a re-process action.

### Non-Goals (out of scope for this POC)
- Production-grade auth / multi-tenant admin (single static admin password only).
- Cloud object storage (use a local Docker volume; structured to swap for S3/MinIO later).
- Horizontal scaling, observability stack, email notifications.
- Candidate-facing scores (candidate only sees a confirmation).

---

## 2. Architecture

Polyglot: **Node/TS owns everything except PDF extraction**; **Python owns only PDF extraction**.

```
┌──────────┐   ┌─────────────┐   ┌──────────────┐
│ frontend │──▶│     api     │──▶│  postgres    │
│  React   │   │ Node/Express │   │  (Prisma)    │
└──────────┘   └──────┬──────┘   └──────────────┘
                      │ enqueue (BullMQ)
                      ▼
               ┌──────────┐    ┌──────────────────────────┐
               │  redis   │◀──▶│      worker (Node)        │
               │ queue +  │    │  1. POST parser /extract  │──▶ ┌───────────────┐
               │ key-usage│    │  2. Gemini key pool       │    │    parser     │
               └──────────┘    │     (sub-models + eval)   │    │ Python/FastAPI │
                               │  3. write Postgres        │    │  PyMuPDF only  │
                               └──────────────────────────┘    └───────────────┘
       uploaded PDFs + extracted images ⇒ shared Docker volume (api, worker, parser)
```

### Services (Docker Compose)

| Service | Tech | Responsibility |
|---------|------|----------------|
| `frontend` | React + Vite + TS | SPA: public apply page (`/apply/:slug`) + admin dashboard (`/admin/*`) |
| `api` | Node/Express + TS | REST API; validates uploads; enqueues jobs; serves dashboard data |
| `worker` | Node + BullMQ | Consumes queue; orchestrates pipeline (parser → Gemini → DB) |
| `parser` | Python + FastAPI + PyMuPDF | `POST /extract`: PDF → raw extraction JSON. **No LLM, no DB.** |
| `redis` | Redis | BullMQ broker/backend **+** per-key rate-usage counters |
| `db` | PostgreSQL | All persistent data (accessed via Prisma from `api` and `worker`) |
| volume | Docker named volume | Uploaded PDFs + extracted image files |

`api` and `worker` share the same Node codebase (monorepo package) so they share Prisma models,
the Gemini client, and types; they have separate entrypoints (`server.ts` vs `worker.ts`).

---

## 3. Data Model (PostgreSQL via Prisma)

```
JobDescription
  id           uuid pk
  title        text
  slug         text unique         // public apply link: /apply/:slug
  description  text                 // the JD body
  createdAt    timestamptz

Application
  id           uuid pk
  jobId        uuid fk -> JobDescription
  name         text
  email        text
  resumePath   text                 // path in shared volume
  status       enum(uploaded|processing|completed|failed)
  errorStage   text null            // e.g. "extract", "submodel_b", "main_eval"
  errorMessage text null
  createdAt    timestamptz
  updatedAt    timestamptz

PipelineRun                         // one row per stage, for visibility + re-process
  id              uuid pk
  applicationId   uuid fk -> Application
  stage           enum(extract|submodel_a|submodel_b|submodel_c|main_eval)
  status          enum(pending|running|done|failed)
  rawOutput       jsonb null
  structuredOutput jsonb null
  error           text null
  startedAt       timestamptz null
  finishedAt      timestamptz null

ExtractedImage                      // Pipeline B artifacts (powers cert UI)
  id              uuid pk
  applicationId   uuid fk -> Application
  imagePath       text
  imageType       enum(certificate|profile_photo|logo|other) null
  details         jsonb null         // e.g. { issuer, date, name } for certificates

Evaluation
  id              uuid pk
  applicationId   uuid fk -> Application (unique)
  matchScore      int                // 0..100
  recommendation  enum(strong_match|good_match|reject)
  strengths       jsonb              // string[]
  gaps            jsonb              // string[]
  rawLlmJson      jsonb              // full main-eval response
  createdAt       timestamptz
```

Gemini API keys are **not** stored in the DB — they come from env (`GEMINI_API_KEYS`),
with live usage counters in Redis.

---

## 4. Parser Service Contract (Python/FastAPI)

Single responsibility: turn a PDF into raw structured data using PyMuPDF (`fitz`). Stateless.

**`POST /extract`** — multipart upload (the PDF) **or** a path within the shared volume.

Response:
```jsonc
{
  "pipeline_a": {
    "text": "full extracted text ...",
    "links": [
      { "uri": "https://github.com/jane", "text": "github.com/jane", "page": 0 }
    ]
  },
  "pipeline_b": {
    "images": [
      { "path": "/data/img/<appid>/img-0.png", "page": 0,
        "bbox": [x0, y0, x1, y1], "width": 480, "height": 480 }
    ]
  },
  "pipeline_c": {
    "icon_links": [
      // hyperlinks whose annotation rect overlaps an image bbox
      { "uri": "https://linkedin.com/in/jane", "page": 0,
        "bbox": [x0, y0, x1, y1], "matched_image_index": 0 }
    ]
  }
}
```

Implementation notes:
- **Pipeline A:** `page.get_text()` + `page.get_links()` (filter `kind == LINK_URI`), capturing the
  visible anchor text where available.
- **Pipeline B:** `page.get_images()` / `doc.extract_image()`; write each image to the shared volume,
  return path + bbox + dimensions. (No classification here — that is the worker's LLM job.)
- **Pipeline C:** for each link annotation, compute rect-overlap against every image bbox on the page;
  emit links that overlap an image (the "LinkedIn icon → hidden URL" case) with `matched_image_index`.
- **`GET /health`** for compose healthchecks.

`pytesseract` is an optional fallback for text-poor scanned PDFs; not required for the happy path.

---

## 5. Pipeline Orchestration (Node worker, BullMQ)

**Job:** `process_application` with payload `{ applicationId }`. Enqueued by `api` on submit
and by the re-process endpoint.

Stages (recorded in `PipelineRun`):

1. **`extract`** — POST the PDF to the `parser` service → store raw A/B/C outputs; persist
   `ExtractedImage` rows for Pipeline B images.
2. **Sub-models** (Gemini 2.5 Flash, strict JSON output) — may run concurrently with a small
   concurrency cap to respect free-tier RPM:
   - **`submodel_a`**: raw text + links → structured resume JSON
     (contact, education[], experience[], skills[], projects[], links[]).
   - **`submodel_b`**: for each extracted image → **Gemini vision** classifies
     (certificate/profile_photo/logo/other); if certificate, extract `{ issuer, date, name }`.
     Update `ExtractedImage.imageType` + `details`. Output: structured credentials JSON.
   - **`submodel_c`**: icon-links → categorized social/profile links JSON
     (linkedin, github, portfolio, other).
3. **`main_eval`** — combine A+B+C structured JSON **+ the JD** → final JSON:
   `{ matchScore, recommendation, strengths[], gaps[] }`. Persist `Evaluation`; status → `completed`.

### Failure handling — **fail-fast**
- Any stage that throws (after the key pool has exhausted retries/failover) aborts the whole job.
- Set `Application.status = failed`, `errorStage`, `errorMessage`; mark the failing `PipelineRun` failed.
- Dashboard shows the failure + a **Re-process** button.
- **Re-process** deletes prior `PipelineRun`/`Evaluation`/`ExtractedImage` rows for that application,
  resets status to `uploaded`, and re-enqueues the job.
- Upload validation errors (non-PDF, too large) are rejected at the API (4xx) and never enter the queue.

---

## 6. LLM Layer — Gemini Key Pool (Node)

A `KeyPool` + `GeminiClient` wrapper over `@google/generative-ai`.

- **Keys:** `GEMINI_API_KEYS=k1,k2,k3,...` (comma-separated, from different Google accounts to
  multiply free quota).
- **Rotation:** each call selects the next key **under budget** (round-robin among eligible keys).
- **Budgets (Redis counters):** per-key **RPM** (key TTL 60s) and **RPD** (key TTL 24h);
  defaults configurable (e.g. `GEMINI_RPM=10`, `GEMINI_RPD=250`).
- **Failover:** on `429` / `RESOURCE_EXHAUSTED`, cool that key down briefly and retry with the next
  key; exponential backoff. If all keys are exhausted → throw → pipeline fails fast with a clear
  "Gemini quota exhausted" error.
- **Model:** `gemini-2.5-flash` for all calls (multimodal → handles vision inline).
- **JSON enforcement:** `responseMimeType: "application/json"` + a response schema per prompt.
- **Prompts:** four templates — `submodel_a`, `submodel_b`, `submodel_c`, `main_eval` — each
  instructing strict JSON matching the schemas above.

Main-eval output contract:
```jsonc
{
  "matchScore": 78,                      // 0..100
  "recommendation": "good_match",        // strong_match | good_match | reject
  "strengths": ["5y React", "Led 3 hires"],
  "gaps": ["No Kubernetes", "No FinTech domain"]
}
```

---

## 7. API Contract (Node/Express)

Public:
- `GET  /api/jobs/:slug` — JD for the apply page (title, description).
- `POST /api/jobs/:slug/apply` — multipart (name, email, resume PDF). Validates (PDF, ≤10 MB),
  stores file, creates `Application` (status `uploaded`), enqueues job. → `202`.

Admin (behind static-password token):
- `POST /api/admin/login` — `{ password }` → `{ token }` (compared to `ADMIN_PASSWORD` env).
- `POST /api/admin/jobs` — `{ title, description }` → creates JD + slug; returns apply URL.
- `GET  /api/admin/jobs` — list JDs.
- `GET  /api/admin/jobs/:id/applications` — applicants for a JD (name, email, status, score, recommendation).
- `GET  /api/admin/applications/:id` — full detail (structured data, images, links, evaluation, error).
- `POST /api/admin/applications/:id/reprocess` — re-enqueue (see §5).

Admin endpoints require `Authorization: Bearer <token>`; a thin middleware checks it.

---

## 8. Frontend (React + Vite SPA)

- **`/apply/:slug`** (public) — fetch + render JD; form (name, email, PDF upload; client validation:
  PDF-only, ≤10 MB) → on submit, "Application received" confirmation. No score shown.
- **`/admin/login`** — static password → store token in localStorage.
- **`/admin/jobs`** — list JDs; "Create JD" form → shows shareable `/apply/:slug` link with copy button.
- **`/admin/jobs/:id`** — applicants table: name, email, **status badge**
  (Uploaded/Processing/Completed/Failed), score, recommendation. **Polls every ~4s.**
  Failed rows show the error + **Re-process** button.
- **`/admin/applications/:id`** — full detail: parsed fields, detected certificates (with extracted
  issuer/date/name), categorized links (explicit + icon-embedded), strengths/gaps, score,
  recommendation, raw JSON (collapsible). If failed: error stage + message + Re-process.

Status updates use **polling** (no websockets) — simplest for the POC.

---

## 9. Testing Strategy (TDD)

**Python parser (pytest):**
- Unit tests per pipeline against crafted fixture PDFs:
  - a PDF with body text + an explicit clickable URL (A),
  - a PDF with an embedded certificate image (B),
  - a PDF with a hyperlink annotation overlapping an image icon (C).
- Assert exact extraction shapes; assert C's rect-overlap matching.

**Node api + worker (vitest):**
- `GeminiClient` **mocked** — no real API calls in tests.
- `KeyPool` rotation/failover unit tests with a simulated `429` (asserts key cool-down + failover,
  and "all exhausted → throws").
- Worker orchestration: a thrown stage → `Application.status = failed` with the right `errorStage`;
  happy path → `completed` + `Evaluation` persisted.
- API tests (supertest): upload validation (reject non-PDF / oversized), apply creates + enqueues,
  admin auth gate, re-process resets + re-enqueues.

**Frontend (vitest + RTL):**
- Apply form validation + submit; status-badge rendering; failed-row Re-process control.

**Manual E2E:** seed script + sample resume PDFs to demo the full flow in Docker.

---

## 10. Repository Structure

```
ats-resume-scorer/
  docker-compose.yml
  .env.example                 # GEMINI_API_KEYS, DATABASE_URL, REDIS_URL, ADMIN_PASSWORD, ...
  backend/                     # Node monorepo (api + worker share code)
    package.json  tsconfig.json  Dockerfile
    prisma/schema.prisma
    src/
      server.ts                # Express entrypoint (api)
      worker.ts                # BullMQ entrypoint (worker)
      api/                     # routes: jobs, apply, admin, applications
      queue/                   # BullMQ setup + processor
      pipeline/                # orchestrator + stage functions
      llm/                     # keyPool.ts, geminiClient.ts, prompts.ts, submodels.ts, evaluator.ts
      db/                      # prisma client
      storage.ts
    tests/
  parser/                      # Python extract-only service
    pyproject.toml  Dockerfile
    app/
      main.py                  # FastAPI: /extract, /health
      pipelines/extract_text.py     # A
      pipelines/extract_images.py   # B
      pipelines/extract_links.py    # C
    tests/  fixtures/
  frontend/                    # React + Vite SPA
    package.json  Dockerfile
    src/pages/  src/api/  src/components/
```

---

## 11. Configuration (env)

```
DATABASE_URL=postgresql://...
REDIS_URL=redis://redis:6379
PARSER_URL=http://parser:8000
ADMIN_PASSWORD=changeme
GEMINI_API_KEYS=key1,key2,key3
GEMINI_MODEL=gemini-2.5-flash
GEMINI_RPM=10
GEMINI_RPD=250
MAX_UPLOAD_MB=10
```

---

## 12. Key Decisions (with rationale)

- **Node main + thin Python parser** — keep the team in TS for ~90% of the code; quarantine Python
  to the one thing PyMuPDF is uniquely good at (PDF text/image/annotation extraction).
- **Gemini 2.5 Flash + rotating key pool** — no paid credits; multimodal handles Pipeline B vision
  with no separate OCR lib; key pool multiplies free-tier throughput and survives 429s.
- **Fail-fast** — any broken stage fails the whole application with a visible error + Re-process,
  rather than scoring on partial data.
- **`PipelineRun` table** — per-stage visibility makes the dashboard error reporting and re-process clean.
- **Polling + static-password admin** — minimal, POC-appropriate; easy to harden later.
```
