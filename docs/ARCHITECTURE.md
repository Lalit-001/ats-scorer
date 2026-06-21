# ATS Resume Scorer — Architecture

Five views of the system. All diagrams are [Mermaid](https://mermaid.js.org/) — they render
on GitHub and in most Markdown previewers.

The backend was **migrated from Node (Express · Sequelize · BullMQ) to Python
(FastAPI · SQLAlchemy 2.0 · Alembic · ARQ)**. The Python stack (`api-py` / `worker-py`) is
the default; the original Node stack (`api` / `worker`) is retained behind a Docker Compose
`legacy` profile and is not started by default. Both talk to the **same** Postgres, Redis,
parser, and `appdata` volume, so the migration changed the application layer, not the data.

The pipeline is **deterministic-first**: PyMuPDF + Python do the structuring, link
categorization, and certificate detection, so AI is used only where it earns its keep —
**one** evaluation call for a clean resume (a structuring fallback and gated certificate
vision fire only when needed), down from the old 3 + N calls.

> **Tech stack at a glance.** Web: FastAPI (Uvicorn). ORM: SQLAlchemy 2.0 async (asyncpg).
> Migrations: Alembic. Queue: ARQ (Redis). LLM: Google Gemini over **raw HTTP (httpx, no SDK)**.
> Validation: Pydantic. Inbound email: Mailpit.

---

## 1. Container topology

The active Docker Compose services, the shared volume, and the one external dependency (Gemini).
Postgres and Redis are **internal only**; the browser reaches just the frontend and the API.
The legacy Node `api`/`worker` (dashed) only run with `docker compose --profile legacy up`.

```mermaid
flowchart LR
  B["Browser<br/>SPA"]

  subgraph compose["Docker Compose network"]
    FE["frontend<br/>React + Vite<br/>:5173"]
    API["api-py<br/>Python + FastAPI<br/>host :4001"]
    WK["worker-py<br/>Python + ARQ"]
    PR["parser<br/>Python + FastAPI<br/>PyMuPDF :8000"]
    MP["mailpit<br/>SMTP :1025 · UI/API :8025<br/>persistent inbox (mailpitdata)"]
    RD[("redis<br/>DB 1: Python · DB 0: legacy Node")]
    DB[("postgres<br/>SQLAlchemy + Alembic")]
    VOL["appdata volume<br/>PDFs and images"]

    subgraph legacy["legacy profile — off by default"]
      LAPI["api<br/>Node + Express :4000"]
      LWK["worker<br/>Node + BullMQ"]
    end
  end

  GEM[("Google Gemini API<br/>REST (no SDK)")]

  B -->|"serves UI"| FE
  B -->|"REST /api"| API

  API -->|"enqueue job (ARQ)"| RD
  API -->|"read / write"| DB
  API -->|"save PDF, serve /files"| VOL

  WK -->|"consume job (ARQ)"| RD
  WK -->|"key usage counters (DB 1)"| RD
  WK -->|"POST /extract"| PR
  WK -->|"read / write"| DB
  WK -->|"read images"| VOL
  WK -->|"structuring fallback, cert vision, eval"| GEM

  MP -->|"webhook POST /api/webhook/email"| API
  PR -->|"read PDF, write images"| VOL
```

---

## 2. Apply → score (end-to-end sequence)

What happens from a candidate hitting submit to the score appearing on the dashboard.

```mermaid
sequenceDiagram
  actor C as Candidate
  participant FE as Frontend
  participant API as api-py (FastAPI)
  participant RD as Redis (DB 1)
  participant WK as worker-py (ARQ)
  participant PR as Parser
  participant G as Gemini
  participant DB as Postgres
  participant VOL as Volume

  C->>FE: open /apply/:slug
  FE->>API: GET /api/jobs/:slug
  API->>DB: find job by slug (SQLAlchemy)
  DB-->>API: job
  API-->>FE: title + rich-text description

  C->>FE: submit name, email, PDF
  FE->>API: POST /api/jobs/:slug/apply
  API->>API: validate PDF + size
  API->>DB: reject if email already applied to job (409)
  API->>VOL: save resume to /data
  API->>DB: create Application status=uploaded
  API->>RD: enqueue process_application (ARQ)
  API-->>FE: 202 Accepted

  Note over WK: worker-py picks up the job (concurrency 2, no retry)
  WK->>DB: status=processing
  WK->>PR: POST /extract with PDF
  PR-->>WK: structured (sections, skills, exp years),<br/>categorized links, image flags, parse_quality
  WK->>DB: persist basic details + images (LLM-free)

  alt parse_quality weak
    WK->>G: structuring fallback (resume text)
  end
  opt likely_certificate images (capped)
    WK->>G: vision — extract certificate details
  end
  WK->>G: evaluate vs JD — 5 rubric sub-scores + bullets
  G-->>WK: dimension scores, strengths, gaps
  WK->>WK: weighted score + recommendation (computed locally)
  WK->>DB: save Evaluation, status=completed

  loop poll every 4s
    FE->>API: GET applicants / detail
    API->>DB: read status + score
    API-->>FE: live update
  end
```

> `VOL` is the shared `/data` (`appdata`) volume that api-py, worker-py, and the parser mount.

### 2b. Email ingestion (alternate entry point)

A candidate can also apply by emailing a PDF with the **job's UUID in the body**. Mailpit
catches the message and fires a webhook at `api-py`; ingestion mirrors the web flow.

```mermaid
sequenceDiagram
  actor C as Candidate
  participant MP as Mailpit
  participant API as api-py
  participant DB as Postgres
  participant RD as Redis (DB 1)

  C->>MP: email PDF (job UUID in body) → SMTP :1025
  MP->>API: POST /api/webhook/email (Basic auth, message ID)
  API->>API: verify shared secret (constant-time); always ack 200
  API->>MP: GET full message + download PDF attachment
  API->>DB: resolve job by UUID; dedupe by (job, email)
  Note over API,DB: job + PDF → uploaded (enqueue) · job + no PDF → failed ·<br/>no job → orphan (awaits manual assignment)
  API->>RD: enqueue (only when status=uploaded)
```

---

## 3. Pipeline orchestration (fail-fast)

`worker-py` drives four stages. Each is recorded as a `PipelineRun` (running → done/failed).
**Any** stage that throws aborts the whole job, records *which* stage broke, and stops — no
partial scoring. Recovery is an explicit admin **Re-process**.

```mermaid
flowchart TD
  start(["job: applicationId"]) --> proc["status = processing"]
  proc --> ex["Stage 1: extract<br/>POST parser /extract"]
  ex -->|ok| basics["persist basic details + images<br/>LLM-free, survives later failures"]
  basics --> st["Stage 2: structure<br/>parser output; LLM fallback only if parse_quality weak"]
  st -->|ok| ce["Stage 3: certificates<br/>gated + capped vision (icons skipped)"]
  ce -->|ok| ev["Stage 4: evaluate<br/>5 rubric sub-scores; weighted score computed locally"]
  ev -->|ok| done(["save Evaluation + dimensions<br/>status = completed"])

  ex -->|throws| fail
  st -->|throws| fail
  ce -->|throws| fail
  ev -->|throws| fail

  fail["status = failed<br/>errorStage + errorMessage"] --> dash["dashboard shows error<br/>+ Re-process button"]
  dash -->|admin re-processes| reset["delete runs / images / eval<br/>status = uploaded"]
  reset --> start

  classDef bad fill:#fee2e2,stroke:#dc2626,color:#991b1b;
  classDef good fill:#dcfce7,stroke:#16a34a,color:#166534;
  class fail,dash bad;
  class done good;
```

**Deterministic-first:** the parser categorizes links by domain and flags certificate-like
images, so the link-structuring and per-image vision calls of the old design are gone. The LLM
runs only for the final evaluation, plus a structuring fallback (weak parses) and gated
certificate vision. The orchestrator is pure control flow with injected collaborators
(`repo`, `extract`, `call`, `load_image`), unchanged in behavior from the Node version.

---

## 4. Gemini key pool (rotation + 429 failover)

Every LLM call goes through the pool so a handful of free-tier keys behave like one larger quota.
The pool is pure Python; calls hit the Gemini REST API directly via `httpx` (no SDK). Usage is
tracked in **Redis DB 1**: `gkey:rpm:<key>` (TTL 60s), `gkey:rpd:<key>` (TTL 24h), and
`gcool:<key>` (cooldown).

```mermaid
flowchart TD
  call["LLM call (httpx)<br/>structuring fallback, cert vision, or eval"] --> acq{"acquire a key"}

  acq -->|"next key under RPM and RPD,<br/>not cooling down"| use["POST generateContent with key<br/>increment rpm + rpd counters"]
  acq -->|"no key available"| exhausted["raise QuotaExhausted<br/>stage fails → fail-fast"]

  use -->|"success"| ret["parse JSON → return"]
  use -->|"429 / RESOURCE_EXHAUSTED"| pen["penalize key<br/>set cooldown"]
  use -->|"other error"| err["raise → stage fails"]

  pen --> acq

  classDef bad fill:#fee2e2,stroke:#dc2626,color:#991b1b;
  class exhausted,err bad;
```

> **Side-by-side caveat.** The Python stack tracks quota on Redis DB 1; the legacy Node stack
> tracks it on DB 0. If you ever run both at once (`--profile legacy`), their per-key budgets are
> counted separately and could collectively exceed the real quota — route live traffic to one
> stack at a time.

---

## 5. Data model

SQLAlchemy models map onto the **existing** schema created by the original Sequelize migrations
(camelCase columns, named Postgres enums). Alembic tracks schema versions in its own
`alembic_version` table, separate from Node's `SequelizeMeta`.

```mermaid
erDiagram
  JobDescription ||--o{ Application : "has"
  Application ||--o{ PipelineRun : "tracks"
  Application ||--o{ ExtractedImage : "contains"
  Application ||--o| Evaluation : "scored by"

  JobDescription {
    uuid id PK
    string title
    string slug UK
    string description "rich-text HTML"
  }
  Application {
    uuid id PK
    uuid jobId FK "null for orphan (email, no matched job)"
    string name
    string email "unique per job, case-insensitive"
    string resumePath "null when email had no PDF"
    enum source "web|email"
    enum status "uploaded|processing|completed|failed|orphan"
    string errorStage
    string errorMessage
    json basicDetails "LLM-free: name, location, emails, phones, links, preview"
  }
  PipelineRun {
    uuid id PK
    uuid applicationId FK
    string stage "extract|structure|certificates|evaluate"
    enum status "pending|running|done|failed"
    json rawOutput
    json structuredOutput "candidate (parser or LLM) incl. categorized links"
    string error
  }
  ExtractedImage {
    uuid id PK
    uuid applicationId FK
    int imageIndex
    string imagePath
    enum imageType "certificate|profile_photo|logo|other"
    json details "issuer, name, recipient, dates, credential_id"
  }
  Evaluation {
    uuid id PK
    uuid applicationId FK "unique"
    int matchScore "weighted from dimensions"
    enum recommendation "strong_match|good_match|reject"
    json dimensions "5 rubric sub-scores + weight + reason"
    json strengths "<= 5 bullets, <= 20 words"
    json gaps "<= 5 bullets, <= 20 words"
    json rawLlmJson
  }
```

---

## Migrations & schema

Schema changes go through **Alembic** (`backend-py/alembic/`), the SQLAlchemy migration tool —
the replacement for the old `sequelize-cli` migrations.

- **On startup**, `api-py` runs `alembic upgrade head` before serving (see its compose `command`),
  mirroring how the Node `api` ran `sequelize-cli db:migrate`. `worker-py` does not run migrations.
- The existing schema was adopted via `alembic stamp head` against an empty baseline revision
  (no tables recreated). Alembic is told to ignore Node's `SequelizeMeta` table and the
  `(jobId, lower(email))` functional index.
- **Create a migration:** edit a model in `app/db/models.py`, then
  `alembic revision --autogenerate -m "…"`, review the generated file, and
  `alembic upgrade head` (or just restart `api-py`).
- **Gotchas:** review autogenerated files; Postgres enum value additions need manual
  `op.execute("ALTER TYPE … ADD VALUE …")`.

---

## Pipeline cheat-sheet

What the parser derives deterministically (no AI), and where AI still runs.

| Concern | Owner | How | AI? |
|---------|-------|-----|-----|
| Resume text | parser | PyMuPDF `get_text` (+ `get_text("dict")` for fonts) | No |
| Sections / skills / experience-years / education | parser | font-size/bold header detection + regex + skill alias map | No |
| Links (text + icon-embedded), categorized | parser | bbox overlap for icon links; domain map → `linkedin/github/…/other` | No |
| Image triage | parser | `is_icon` / `likely_certificate` flags from size + link match | No |
| Structuring fallback | worker-py | only when `parse_quality` is weak (messy/unusual layouts) | Gemini text |
| Certificate details | worker-py | gated + capped vision on `likely_certificate` images | Gemini vision |
| Evaluation | worker-py | JD + compact candidate → 5 rubric sub-scores; **weighted score computed locally** | Gemini text |

**Rubric weights:** Hard Skills 35% · Experience Relevance 30% · Seniority/Scope 15% ·
Education/Certifications 10% · Domain Knowledge 10% (fixed in config). The Gemini model is set
via `GEMINI_MODEL`.

---

## Running it

- **Default (Python) stack:** `docker compose up -d` → db, redis, parser, **api-py (:4001)**,
  **worker-py**, mailpit, frontend. The frontend (`:5173`) talks to `:4001`.
- **Legacy (Node) stack:** `docker compose --profile legacy up -d` brings back `api` (:4000) and
  `worker`. To route traffic to it, set `VITE_API_BASE=http://localhost:4000` and the Mailpit
  `MP_WEBHOOK_URL` back to `@api:4000`.
