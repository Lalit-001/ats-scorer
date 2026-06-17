# ATS Resume Scorer — Architecture

Five views of the system. All diagrams are [Mermaid](https://mermaid.js.org/) — they render
on GitHub and in most Markdown previewers.

---

## 1. Container topology

The six Docker Compose services, the shared volume, and the one external dependency (Gemini).
Postgres and Redis are **internal only**; the browser reaches just the frontend and the API.

```mermaid
flowchart LR
  B["Browser<br/>SPA"]

  subgraph compose["Docker Compose network"]
    FE["frontend<br/>React + Vite<br/>:5173"]
    API["api<br/>Node + Express<br/>:4000"]
    WK["worker<br/>Node + BullMQ"]
    PR["parser<br/>Python + FastAPI<br/>PyMuPDF :8000"]
    RD[("redis<br/>queue + key counters")]
    DB[("postgres<br/>Prisma")]
    VOL["shared volume<br/>data: PDFs and images"]
  end

  GEM[("Google Gemini API<br/>gemini-2.5-flash")]

  B -->|"serves UI"| FE
  B -->|"REST /api"| API

  API -->|"enqueue job"| RD
  API -->|"read / write"| DB
  API -->|"save PDF, serve /files"| VOL

  WK -->|"consume job"| RD
  WK -->|"key usage counters"| RD
  WK -->|"POST /extract"| PR
  WK -->|"read / write"| DB
  WK -->|"read images"| VOL
  WK -->|"sub-models + main eval"| GEM

  PR -->|"read PDF, write images"| VOL
```

---

## 2. Apply → score (end-to-end sequence)

What happens from a candidate hitting submit to the score appearing on the dashboard.

```mermaid
sequenceDiagram
  actor C as Candidate
  participant FE as Frontend
  participant API as API
  participant RD as Redis
  participant WK as Worker
  participant PR as Parser
  participant G as Gemini
  participant DB as Postgres
  participant VOL as Volume

  C->>FE: open /apply/:slug
  FE->>API: GET /api/jobs/:slug
  API->>DB: find job by slug
  DB-->>API: job
  API-->>FE: title + description

  C->>FE: submit name, email, PDF
  FE->>API: POST /api/jobs/:slug/apply
  API->>API: validate PDF + size
  API->>VOL: save resume to /data
  API->>DB: create Application status=uploaded
  API->>RD: enqueue process_application
  API-->>FE: 202 Accepted

  Note over WK: worker picks up the job
  WK->>DB: status=processing
  WK->>PR: POST /extract with PDF
  PR-->>WK: pipeline A/B/C raw JSON
  WK->>G: sub-model A structure resume
  WK->>G: sub-model B vision classify images
  WK->>G: sub-model C categorize links
  WK->>G: main evaluation + JD
  G-->>WK: score, strengths, gaps, recommendation
  WK->>DB: save Evaluation, status=completed

  loop poll every 4s
    FE->>API: GET applicants / detail
    API->>DB: read status + score
    API-->>FE: live update
  end
```

> `VOL` above is the shared `/data` volume that the API and worker both mount.

---

## 3. Pipeline orchestration (fail-fast)

The worker drives five stages. Each is recorded as a `PipelineRun` (running → done/failed).
**Any** stage that throws aborts the whole job, records *which* stage broke, and stops — no
partial scoring. Recovery is an explicit admin **Re-process**.

```mermaid
flowchart TD
  start(["job: applicationId"]) --> proc["status = processing"]
  proc --> ex["Stage 1: extract<br/>POST parser /extract"]
  ex -->|ok| sa["Stage 2: submodel_a<br/>structure resume text"]
  sa -->|ok| sb["Stage 3: submodel_b<br/>vision classify images"]
  sb -->|ok| sc["Stage 4: submodel_c<br/>categorize icon links"]
  sc -->|ok| me["Stage 5: main_eval<br/>score against JD"]
  me -->|ok| done(["save Evaluation<br/>status = completed"])

  ex -->|throws| fail
  sa -->|throws| fail
  sb -->|throws| fail
  sc -->|throws| fail
  me -->|throws| fail

  fail["status = failed<br/>errorStage + errorMessage"] --> dash["dashboard shows error<br/>+ Re-process button"]
  dash -->|admin re-processes| reset["delete runs / images / eval<br/>status = uploaded"]
  reset --> start

  classDef bad fill:#fee2e2,stroke:#dc2626,color:#991b1b;
  classDef good fill:#dcfce7,stroke:#16a34a,color:#166534;
  class fail,dash bad;
  class done good;
```

**Step 1 of the AI layer** = the three sub-models (A/B/C) turning raw pipeline output into
structured JSON. **Step 2** = the main model combining all three + the JD into the final score.

---

## 4. Gemini key pool (rotation + 429 failover)

Every LLM call goes through the pool so a handful of free-tier keys behave like one larger quota.
Usage is tracked in Redis: `rpm:<key>` (TTL 60s), `rpd:<key>` (TTL 24h), `gcool:<key>` (cooldown).

```mermaid
flowchart TD
  call["LLM call<br/>sub-model or main eval"] --> acq{"acquire a key"}

  acq -->|"next key under RPM and RPD,<br/>not cooling down"| use["invoke Gemini with key<br/>increment rpm + rpd counters"]
  acq -->|"no key available"| exhausted["throw QuotaExhausted<br/>stage fails -> fail-fast"]

  use -->|"success"| ret["parse JSON -> return"]
  use -->|"429 / RESOURCE_EXHAUSTED"| pen["penalize key<br/>set cooldown"]
  use -->|"other error"| err["throw -> stage fails"]

  pen --> acq

  classDef bad fill:#fee2e2,stroke:#dc2626,color:#991b1b;
  class exhausted,err bad;
```

---

## 5. Data model

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
    string description
  }
  Application {
    uuid id PK
    uuid jobId FK
    string name
    string email
    string resumePath
    enum status "uploaded|processing|completed|failed"
    string errorStage
    string errorMessage
  }
  PipelineRun {
    uuid id PK
    uuid applicationId FK
    enum stage "extract|submodel_a|submodel_b|submodel_c|main_eval"
    enum status "pending|running|done|failed"
    json rawOutput
    json structuredOutput
    string error
  }
  ExtractedImage {
    uuid id PK
    uuid applicationId FK
    int imageIndex
    string imagePath
    enum imageType "certificate|profile_photo|logo|other"
    json details
  }
  Evaluation {
    uuid id PK
    uuid applicationId FK "unique"
    int matchScore
    enum recommendation "strong_match|good_match|reject"
    json strengths
    json gaps
    json rawLlmJson
  }
```

---

## Pipeline cheat-sheet

| Pipeline | Owner | Extracts | Library / model |
|----------|-------|----------|-----------------|
| **A** Text + explicit links | parser | Resume text + clickable text URLs | PyMuPDF `get_text` / `get_links` |
| **B** Images + OCR/vision | parser → worker | Embedded images; then certificate vs photo + details | PyMuPDF `extract_image` → Gemini vision |
| **C** Icon-embedded links | parser | Hyperlinks whose rect overlaps an image (e.g. LinkedIn icon) | PyMuPDF link rects + bbox overlap |
