"""Unified, compact candidate shape fed to the evaluator and stored as the
`structure` stage output (port of candidate.ts).

Both the deterministic parser path and the LLM fallback converge on the SAME dict
shape with the SAME camelCase keys the Node version produced — the frontend reads
this straight out of the `structure` pipeline run's structuredOutput.
"""

from __future__ import annotations

from typing import Any

MAX_EXPERIENCE_CHARS = 4000


def candidate_from_parser(structured: dict, links: list) -> dict[str, Any]:
    """Build the candidate from the parser's deterministic structuring."""
    sections = structured.get("sections") or {}
    experience = structured.get("experience") or {}
    experience_text = "\n\n".join(
        s
        for s in [
            sections.get("summary"),
            experience.get("text"),
            sections.get("projects"),
        ]
        if s
    )[:MAX_EXPERIENCE_CHARS]

    return {
        "name": structured.get("name"),
        "skills": structured.get("skills") or [],
        "experienceYears": experience.get("total_years"),
        "experienceText": experience_text,
        "education": structured.get("education") or [],
        "certifications": structured.get("certifications") or [],
        "links": links,
        "source": "parser",
    }


def candidate_from_llm(llm_resume: Any, links: list) -> dict[str, Any]:
    """Build the candidate from the LLM structuring fallback (RESUME_SCHEMA shape)."""
    llm_resume = llm_resume or {}
    experience = llm_resume.get("experience") if isinstance(llm_resume.get("experience"), list) else []
    education = llm_resume.get("education") if isinstance(llm_resume.get("education"), list) else []

    lines = []
    for e in experience:
        e = e or {}
        head = " at ".join(p for p in [e.get("role"), e.get("company")] if p)
        dur = f" ({e.get('duration')})" if e.get("duration") else ""
        highlights = "; ".join(e["highlights"]) if isinstance(e.get("highlights"), list) else ""
        line = f"{head}{dur}{': ' + highlights if highlights else ''}".strip()
        if line:
            lines.append(line)
    experience_text = "\n".join(lines)[:MAX_EXPERIENCE_CHARS]

    contact = llm_resume.get("contact") or {}
    education_lines = []
    for e in education:
        e = e or {}
        joined = ", ".join(p for p in [e.get("degree"), e.get("institution"), e.get("year")] if p)
        if joined:
            education_lines.append(joined)

    return {
        "name": contact.get("name"),
        "skills": llm_resume.get("skills") if isinstance(llm_resume.get("skills"), list) else [],
        "experienceYears": None,
        "experienceText": experience_text,
        "education": education_lines,
        "certifications": [],
        "links": links,
        "source": "llm",
    }
