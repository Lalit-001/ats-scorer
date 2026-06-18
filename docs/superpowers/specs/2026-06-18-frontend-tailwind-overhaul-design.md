# Frontend Tailwind Overhaul + Filterable Applicants + Rich-Text JD

Date: 2026-06-18
Status: Approved — implementing

## Problem

The admin frontend is minimal hand-written CSS. Tables are bare, there is no way to
filter/sort applicants, and job descriptions are plain-text `<textarea>` input rendered
as `pre-wrap`. Admins need to (1) triage applicants quickly via better tables + filters,
and (2) author formatted job descriptions (Jira-style: bold/italic/underline/lists) that
render identically on the candidate-facing portal.

## Goals

- Restyle the **entire** frontend with Tailwind CSS v4 (admin + public pages).
- Replace bare tables with a reusable, sortable `DataTable` (TanStack Table, headless).
- Add **client-side** filtering of applicants by search (name/email/phone), status,
  recommendation, and minimum match score. Default sort: match score descending.
- Add a **rich-text** job-description editor (TipTap) with a minimal toolbar
  (bold, italic, underline, bullet list, numbered list, undo/redo).
- Persist the JD as **sanitized HTML** in the existing `description` column (no migration).
- Render the JD identically on the Apply page via Tailwind Typography `prose` + DOMPurify.
- Allow admins to **edit** a posted job's title + description.

## Non-Goals

- No pagination (client-side filtering is sufficient at current data volumes — assumption
  noted; revisit if a single job accrues thousands of applicants).
- No server-side filtering/sorting endpoints.
- No auth or data-model/schema changes (the `description` TEXT column already holds HTML).
- No new LLM pipeline stages; the evaluator prompt is unchanged except its input is now
  HTML-stripped to plain text.

## Architecture

### A. Tailwind v4 foundation

- Add `@tailwindcss/vite` plugin to `frontend/vite.config.ts`.
- `frontend/src/styles.css` becomes:
  - `@import "tailwindcss";`
  - `@plugin "@tailwindcss/typography";`
  - an `@theme` block carrying brand tokens (indigo primary, slate neutrals, status colors)
    so the palette stays familiar.
- The current global element styling (bare `button`, `input`, `table`, `.card`, `.badge`,
  etc.) is removed; styling moves into reusable components.
- New UI primitives in `frontend/src/components/ui/`:
  - `Card`, `Button` (variants: primary / secondary / ghost), `Badge`, `Input`, `Select`,
    `PageHeader`.
  - `StatusBadge` and `Recommendation` are reimplemented on top of `Badge`.
- `TopBar` restyled.

### B. DataTable (TanStack Table)

- `frontend/src/components/DataTable.tsx`: a generic, Tailwind-styled wrapper around
  `@tanstack/react-table`.
- Features: sortable headers with arrow indicators, sticky header, hover + zebra rows,
  empty state, horizontal scroll on narrow viewports.
- Consumers: Jobs list (`AdminJobs`) and Applicants list (`JobApplicants`).
- The static pipeline-stages table in `ApplicationDetail` is styled directly with the same
  visual language (no sorting needed).

### C. Applicants filtering (client-side)

- A `FilterBar` above the applicants `DataTable`:
  - **Search** (debounced) — matches name, email, and detected phone.
  - **Status** — all / uploaded / processing / completed / failed.
  - **Recommendation** — all / strong_match / good_match / reject.
  - **Min match score** — 0–100.
  - Live "showing X of Y" count + "Clear filters".
- Filtering/sorting is performed in-browser by TanStack (global filter + column filters +
  a custom score-range filter). No API change.
- Default sort: `matchScore` descending, nulls last, so the strongest candidates surface
  first for triage.
- Columns: Candidate (name / email / phone / resume link / failure note) · Status (badge)
  · Score (color-coded number + mini bar) · Recommendation (badge) · Applied (relative
  date) · Actions (Re-process for failed / View). Sortable: Score, Status, Recommendation,
  Applied.
- The existing 4s polling is preserved; filter/sort state lives in component state and
  survives data refreshes.

### D. Rich-text Job Description (TipTap)

- `frontend/src/components/JobEditor.tsx`: TipTap (`useEditor`) with `StarterKit` +
  `@tiptap/extension-underline`. Minimal toolbar: bold, italic, underline, bullet list,
  numbered list, undo/redo. Editing surface styled with `prose`.
- `frontend/src/components/JobForm.tsx`: shared form (title input + `JobEditor`) used by
  both create and edit flows. Emits `{ title, description }` where `description` is the
  editor's HTML output.
- **Storage**: HTML string in the existing `JobDescription.description` (`TEXT`) column —
  no migration.
- **Portal render**: the Apply page renders the stored HTML inside a `prose` container,
  sanitized with **DOMPurify** before injection, so it looks identical to the editor.
- **LLM input**: a small pure helper `htmlToText(html)` on the backend strips tags +
  decodes common entities; `buildEvalPrompt` receives plain text. Prompt wording unchanged.

### E. Edit posted JDs (backend additions)

- `GET /api/admin/jobs/:id` → `{ id, title, slug, description }` to prefill the edit form.
- `PATCH /api/admin/jobs/:id` → updates `title` and `description` (validates non-empty).
  Slug is left unchanged to preserve existing apply links.
- Frontend:
  - Route `/admin/jobs/:id/edit` → `EditJob` page that loads the job and renders `JobForm`
    in edit mode.
  - "Edit" action in the jobs table row.
  - API client gains `getAdminJob(id)` and `updateJob(id, title, description)`.

### F. Remaining pages

- `AdminJobs`: create form becomes `JobForm`; jobs `DataTable` with title search and
  Edit / View applicants actions.
- `ApplicationDetail`: cards, evaluation block (large color-coded score + recommendation),
  strengths/gaps, parsed-resume pills, images grid, pipeline-stages table — all Tailwind.
- `Apply` & `Login`: restyled to match the new system; Apply renders the rich JD via
  sanitized `prose` HTML.

## Dependencies (frontend)

`tailwindcss`, `@tailwindcss/vite`, `@tailwindcss/typography`, `@tanstack/react-table`,
`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-underline`, `dompurify`
(+ `@types/dompurify`).

Backend: none (the `htmlToText` helper is dependency-free).

## Security

- Rendered JD HTML is sanitized with DOMPurify at the trust boundary (public Apply page,
  and any admin read-only render). JDs are authored only by authenticated admins, so the
  primary risk (admin → candidate XSS) is low; sanitization is defense-in-depth.

## Verification

- `cd frontend && npm run build` (tsc --noEmit + vite build) passes.
- Backend typechecks; `PATCH`/`GET` admin job routes exercised via a manual run.
- Manual run of the app: create a job with formatting → confirm identical render on the
  Apply page; filter/sort applicants; edit a posted JD; submit a resume and confirm the
  evaluator still scores (HTML-stripped JD).

## Out of scope / assumptions

- Client-side filtering assumes per-job applicant counts stay modest. If that breaks down,
  add server-side filtering + pagination later (additive, non-breaking).
