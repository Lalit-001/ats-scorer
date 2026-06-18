"""Deterministic resume structuring from PyMuPDF layout (no AI).

Uses ``get_text("dict")`` font sizes / bold flags / ALL-CAPS to spot section
headers, then text-matching to bucket content into known sections. Skills,
experience years, education and certifications are derived with light regex.

The doc-reading part (``lines_from_doc``) is separated from the pure logic
(``sections_from_lines``, ``guess_name_from_lines``, …) so the parsing rules
are unit-testable without building a PDF.
"""
import re
import statistics
from datetime import datetime

from .normalize import normalize_skills

_SECTION_SYNONYMS = {
    "summary": ["summary", "objective", "profile", "about me", "about"],
    "experience": [
        "experience", "work experience", "professional experience",
        "employment", "work history", "career",
    ],
    "education": ["education", "academic background", "academics"],
    "skills": [
        "skills", "technical skills", "core competencies", "technologies",
        "tech stack", "skill",
    ],
    "projects": ["projects", "personal projects", "academic projects", "selected projects"],
    "certifications": [
        "certifications", "certificates", "licenses", "certification",
        "certifications & licenses", "licenses & certifications",
    ],
    "awards": ["awards", "honors", "achievements", "accomplishments"],
}

_SYN_TO_CANON = {syn: canon for canon, syns in _SECTION_SYNONYMS.items() for syn in syns}

_BOLD_FLAG = 1 << 4  # PyMuPDF span flag bit for bold


def lines_from_doc(doc):
    """[(text, max_size, is_bold, page)] per visual line, in reading order."""
    out = []
    for pno, page in enumerate(doc):
        for block in page.get_text("dict").get("blocks", []):
            for line in block.get("lines", []):
                spans = line.get("spans", [])
                text = "".join(s.get("text", "") for s in spans).strip()
                if not text:
                    continue
                max_size = max((s.get("size", 0) for s in spans), default=0)
                is_bold = any(
                    (s.get("flags", 0) & _BOLD_FLAG) or "bold" in (s.get("font", "").lower())
                    for s in spans
                )
                out.append((text, max_size, is_bold, pno))
    return out


def _body_size(lines):
    sizes = [round(sz, 1) for _, sz, _, _ in lines if sz]
    return statistics.median(sizes) if sizes else 0.0


def _match_section(text):
    """Canonical section name if this line reads like a known header, else None."""
    key = re.sub(r"[^a-z& ]", "", text.lower()).strip()
    if not key:
        return None
    if key in _SYN_TO_CANON:
        return _SYN_TO_CANON[key]
    if len(key.split()) <= 4:
        for syn, canon in _SYN_TO_CANON.items():
            if key.startswith(syn + " ") or key.endswith(" " + syn):
                return canon
    return None


def sections_from_lines(lines):
    """Split lines into {canonical_section: text}."""
    body = _body_size(lines)
    sections, current = {}, None
    for text, size, bold, _pno in lines:
        styled = (size >= body * 1.1) or bold or (text.isupper() and len(text) <= 40)
        short = len(text.split()) <= 3
        canon = _match_section(text) if (styled or short) else None
        if canon:
            current = canon
            sections.setdefault(current, [])
            continue
        if current:
            sections[current].append(text)
    return {k: "\n".join(v).strip() for k, v in sections.items()}


def guess_name_from_lines(lines):
    """Largest-font name-like line near the top of page 1."""
    best = None
    for text, size, _bold, pno in lines:
        if pno != 0:
            continue
        words = text.split()
        if not (1 <= len(words) <= 4) or "@" in text or any(ch.isdigit() for ch in text):
            continue
        if not all(w[0].isalpha() for w in words if w):
            continue
        if best is None or size > best[1]:
            best = (text, size)
    return best[0] if best else None


_YEAR = r"(?:19|20)\d{2}"
# A start year, a separator, then an end year or an open-ended marker.
_RANGE_RE = re.compile(
    rf"({_YEAR})\s*(?:[-–—]|to)\s*((?:{_YEAR})|present|current|now|ongoing)",
    re.IGNORECASE,
)


def estimate_total_years(text):
    """Rough total years of experience by summing detected date ranges."""
    if not text:
        return 0.0
    total = 0.0
    now_year = datetime.now().year
    for m in _RANGE_RE.finditer(text):
        start = int(m.group(1))
        end_tok = m.group(2).lower()
        end = now_year if not end_tok.isdigit() else int(end_tok)
        if 0 <= end - start <= 50:
            total += end - start
    return round(float(total), 1)


def _as_list(section_text, max_items=12):
    if not section_text:
        return []
    items = [ln.strip("•-–*· \t") for ln in section_text.splitlines()]
    return [ln for ln in items if ln][:max_items]


def build_structured(doc, full_text):
    lines = lines_from_doc(doc)
    sections = sections_from_lines(lines)
    exp_text = sections.get("experience", "")
    return {
        "name": guess_name_from_lines(lines),
        "sections": sections,
        "skills": normalize_skills(sections.get("skills", "")),
        "experience": {
            "text": exp_text,
            "total_years": estimate_total_years(exp_text or full_text),
        },
        "education": _as_list(sections.get("education", "")),
        "certifications": _as_list(sections.get("certifications", "")),
    }


def parse_quality(structured, full_text):
    """Signal the backend uses to decide whether to trust deterministic parsing."""
    sec = structured.get("sections", {})
    sections_found = sum(
        1 for k in ("experience", "education", "skills", "projects", "certifications") if sec.get(k)
    )
    text_len = len((full_text or "").strip())
    good = sections_found >= 2 and text_len >= 300
    return {
        "sections_found": sections_found,
        "skills_found": len(structured.get("skills", [])),
        "text_len": text_len,
        "status": "good" if good else "weak",
    }
