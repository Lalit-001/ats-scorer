# ATS Resume Scorer — Architecture

Five views of the system. All diagrams are [Mermaid](https://mermaid.js.org/) — they render
on GitHub and in most Markdown previewers.

The pipeline is **deterministic-first**: PyMuPDF + Python do the structuring, link
categorization, and certificate detection, so AI is used only where it earns its keep —
**one** evaluation call for a clean resume (a structuring fallback and gated certificate
vision fire only when needed), down from the old 3 + N calls.

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
    DB[("postgres<br/>Sequelize")]
    VOL["shared volume<br/>data: PDFs and images"]
  end

  GEM[("Google Gemini API<br/>gemini-1.5-flash")]

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
  WK -->|"structuring fallback, cert vision, eval"| GEM

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
  API-->>FE: title + rich-text description

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

> `VOL` above is the shared `/data` volume that the API and worker both mount.

---

## 3. Pipeline orchestration (fail-fast)

The worker drives four stages. Each is recorded as a `PipelineRun` (running → done/failed).
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
certificate vision.

---

## 4. Gemini key pool (rotation + 429 failover)

Every LLM call goes through the pool so a handful of free-tier keys behave like one larger quota.
Usage is tracked in Redis: `rpm:<key>` (TTL 60s), `rpd:<key>` (TTL 24h), `gcool:<key>` (cooldown).

```mermaid
flowchart TD
  call["LLM call<br/>structuring fallback, cert vision, or eval"] --> acq{"acquire a key"}

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
    string description "rich-text HTML"
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
    json basicDetails "LLM-free: name, emails, phones, links, preview"
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

## Pipeline cheat-sheet

What the parser now derives deterministically (no AI), and where AI still runs.

| Concern | Owner | How | AI? |
|---------|-------|-----|-----|
| Resume text | parser | PyMuPDF `get_text` (+ `get_text("dict")` for fonts) | No |
| Sections / skills / experience-years / education | parser | font-size/bold header detection + regex + skill alias map | No |
| Links (text + icon-embedded), categorized | parser | bbox overlap for icon links; domain map → `linkedin/github/…/other` | No |
| Image triage | parser | `is_icon` / `likely_certificate` flags from size + link match | No |
| Structuring fallback | worker | only when `parse_quality` is weak (messy/unusual layouts) | Gemini text |
| Certificate details | worker | gated + capped vision on `likely_certificate` images | Gemini vision |
| Evaluation | worker | JD + compact candidate → 5 rubric sub-scores; **weighted score computed locally** | Gemini text |

**Rubric weights:** Hard Skills 35% · Experience Relevance 30% · Seniority/Scope 15% ·
Education/Certifications 10% · Domain Knowledge 10% (fixed in config).
