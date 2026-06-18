# Pipeline & Prompt Optimization — fewer/cheaper LLM calls, weighted rubric

Date: 2026-06-18
Status: Approved — ready for implementation plan

## Problem

Each resume currently triggers **3 + N LLM calls** (N = embedded images):

| Stage | Call | Waste |
|---|---|---|
| `submodel_a` | text LLM | sends the *entire* resume text in just to structure it (mechanical) |
| `submodel_b` | vision LLM ×N | one vision call per image — logos/icons classified too |
| `submodel_c` | text LLM | link categorization a regex does for free |
| `main_eval` | text LLM | no rubric; long, unfocused strengths/gaps |

PyMuPDF is used only for `get_text()`, image bytes, and link bboxes. The eval prompt has
no scoring rubric, and the dashboard shows verbose, unfocused output.

## Goals

- Push structure extraction into Python/PyMuPDF; let AI do only judgment.
- Collapse **3 + N calls → 1** in the common case (the eval); cheaper model; compact inputs.
- Unified, deterministic **link categorization** (icon + normal) with an "Unrecognized" bucket.
- **Certificate** detail extraction (vision) surfaced prominently on the dashboard.
- Eval driven by a **weighted rubric**; dashboard shows the breakdown + **apt bullets (≤20 words)**.

## Non-Goals / explicit exclusions

- **No OCR / no Tesseract** (applicants submit normal digital PDFs).
- **No `pymupdf4llm`** — section detection uses plain PyMuPDF `get_text("dict")` font/layout signals.
- No per-job configurable weights (fixed config defaults; revisit later).
- No new LLM pipeline *stages* beyond the gated certificate vision + the single eval.

## Locked decisions

- **Structuring:** hybrid — Python-first; one LLM fallback only when parse quality is weak.
- **Certificates:** vision-primary, gated (skip icons/logos via link-domain match) + capped.
- **Rubric weights:** fixed config defaults — Hard 0.35 / Experience 0.30 / Seniority 0.15 /
  Education 0.10 / Domain 0.10.
- **Model:** `gemini-1.5-flash` (configurable).
- **Eval output:** LLM returns 5 sub-scores (+reason) + concise strengths/gaps; we compute the
  weighted total and recommendation server-side.

## New pipeline

```
extract (PyMuPDF, 0 AI)
  → structure (Python section parse; LLM fallback only if weak)
  → certificates (gated vision, 0–2 calls)
  → evaluate (1 AI call, weighted rubric)
```

LLM calls: **1** common case; worst case ~4 (fallback + 2 certs + eval).

### Stage 1 — EXTRACT (parser, Python, 0 AI)
- `get_text("dict")` → blocks/lines/spans with font `size`, `flags` (bold/italic), bbox.
- `get_text()` → plain text (preview + signals).
- `get_image_info(xrefs=True)` + `extract_image()` → save images + bbox + width/height.
- `get_links()` → URI links + rects.

### Stage 2 — STRUCTURE (parser, Python, 0 AI)
- **Section detection:** compute body font size (median span size); a line is a *header* if it is
  larger / bold / ALL-CAPS and fuzzy-matches a known section name
  (Summary, Experience, Education, Skills, Projects, Certifications, Awards). Split content by header.
- **Name:** largest-font span near the top of page 1.
- **Skills:** tokenize Skills section (commas/bullets/pipes) → normalize (lowercase, alias map
  `JS→JavaScript`, dedup). Alias map is one extensible file.
- **Experience:** entries (role/company) + date-range regex → computed `total_years`.
- **Education / Certifications:** degree & cert keyword matching.
- **Links (unified):** categorize every link (icon + normal) by domain →
  `{ category, url, source: "text"|"icon" }`; unmatched → `other` ("Unrecognized"). One domain map file.
- **Image flags:** `is_icon` (matched to a link / tiny), `likely_certificate` (large, non-icon).
- **`parse_quality`** signal (sections found? text length?) for the fallback decision.
- `basic_details` retained (name/email/phone/links/preview), name hardened via font heuristic.

Parser `/extract` response gains: `structured` (sections, skills, experience{entries,total_years},
education, certifications, links[]), per-image flags, and `parse_quality`.

### Stage 3 — STRUCTURE-CHECK (backend, conditional AI)
- `parse_quality` good → use parser `structured` directly (**0 AI**).
- weak → **one** LLM structuring fallback over the extracted text. Replaces `submodel_a`.
- Persist as pipeline stage `structure`. `submodel_c` is removed (links come from `structured`).

### Stage 4 — CERTIFICATES (backend, gated vision, 0–2 calls)
- Only images flagged `likely_certificate`; skip icons/logos (category known from link domain).
- Cap at `MAX_VISION_IMAGES` (default 2). One vision call each → expanded cert schema:
  `{ issuer, name, recipient_name, issue_date, expiry_date, credential_id }`.
- `verify_url` back-filled from a nearby link. Persist on `ExtractedImage.details`.

### Stage 5 — EVALUATE (backend, 1 AI call)
- **Input:** JD (HTML-stripped via existing `htmlToText`) + compact normalized candidate JSON +
  signals (Python skill-overlap %, `total_years`).
- **LLM output schema:** `dimensions: { hard_skills, experience_relevance, seniority_scope,
  education_certs, domain_knowledge }` each `{ score: 0–100, reason: string }`, plus
  `strengths: string[]`, `gaps: string[]` (each ≤20 words, ≤5 items).
- **Server computes:** `matchScore = round(Σ scoreᵢ × weightᵢ)`; `recommendation` from thresholds
  (≥75 strong_match, 55–74 good_match, <55 reject). Bullets hard-trimmed server-side as a safety net.

## Data model

- `Evaluation` gains `dimensions` JSONB (the 5 sub-scores + weight + reason). `matchScore` = weighted
  total; `strengths`/`gaps` now concise; `rawLlmJson` keeps the full response. One sequelize-cli migration.
- `adminRoutes` detail mapping updated: `submodel_a` → `structure`; links read from `structured`
  (drop `submodel_c`).

## Frontend dashboard

- **Detail page:** 5-dimension breakdown (labeled rows: weight + per-dimension score bar, reusing the
  score spectrum) above the overall `ScoreMeter`; then the ≤20-word strengths/gaps bullets.
- **Links:** grouped by category with labels (LinkedIn / GitHub / Portfolio / … + "Unrecognized links").
- **Certificates:** dedicated card — image thumbnail + all fields + verify link.
- **Applicants list:** small presence icons per row (GitHub / LinkedIn / 🎓 cert) for fast scanning.
- `client.ts` types updated (`dimensions`, unified `links`, cert fields).

## Config (defaults)

- `GEMINI_MODEL=gemini-1.5-flash`
- `MAX_VISION_IMAGES=2`
- Rubric weights + thresholds (75 / 55) in one config module.
- Bullet limits: ≤5 strengths, ≤5 gaps, ≤20 words each.

## Phases (each independently shippable)

1. **Parser (Python):** section detection (`get_text("dict")`), skills/experience/education/cert
   normalization, unified link domain categorizer, image flags, `parse_quality`. Update parser tests.
2. **Backend pipeline:** rename stages → `extract/structure/certificates/evaluate`; parser-structured +
   LLM fallback; gated capped vision; drop `submodel_c`; model + config.
3. **Eval + data:** rubric prompt + output schema; weighted-score/recommendation math; bullet trimming;
   `Evaluation.dimensions` migration; admin detail mapping.
4. **Frontend:** dimension breakdown, grouped links, certificate cards, list presence icons, types.

## Risks / trade-offs

- **Deterministic parsing is less robust than an LLM on unusual layouts** → mitigated by the
  `parse_quality`-gated LLM fallback.
- **Section detection via font heuristics** can misfire on heavily designed resumes → keep the keyword
  fuzzy-match conservative; fallback covers misses.
- **Skill alias/domain maps** need seeding and will grow over time → single extensible files.
- **Vision quality** depends on certificate legibility → capped count bounds cost; non-cert images skipped.

## Verification

- Parser: run real resume PDFs through `/extract`; inspect `structured`, links categories, image flags.
- Backend: typecheck; run a resume through the worker; confirm the call count drops to ~1 and the
  weighted score + dimensions persist.
- Frontend: build; confirm dimension breakdown, grouped links, and certificate card render.
