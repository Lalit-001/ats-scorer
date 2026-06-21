"""Final evaluation (port of evaluator.ts).

The LLM scores five rubric dimensions (0-100) and returns concise strengths/gaps;
WE compute the weighted overall score and the recommendation here so they stay
consistent with the displayed breakdown.
"""

from __future__ import annotations

import math
from typing import Any, Awaitable, Callable

from app.config import (
    MAX_BULLET_WORDS,
    MAX_BULLETS,
    RUBRIC_THRESHOLDS,
    RUBRIC_WEIGHTS,
)
from app.llm.gemini import GeminiRequest
from app.llm.html_to_text import html_to_text
from app.llm.prompts import EVAL_SCHEMA, build_eval_prompt

GeminiCaller = Callable[[GeminiRequest], Awaitable[Any]]


def _trim_bullets(items: list[str]) -> list[str]:
    """Trim each bullet to the word cap and limit how many we keep."""
    cleaned = [s.strip() for s in items]
    cleaned = [s for s in cleaned if s][:MAX_BULLETS]
    out = []
    for s in cleaned:
        words = s.split()
        if len(words) <= MAX_BULLET_WORDS:
            out.append(s)
        else:
            out.append(" ".join(words[:MAX_BULLET_WORDS]) + "…")
    return out


def _compute_signals(jd_text: str, candidate: dict) -> dict:
    """Cheap deterministic signals to ground the LLM's hard-skills judgement."""
    jd = jd_text.lower()
    skills = candidate.get("skills") or []
    matched = [s for s in skills if s.lower() in jd]
    return {
        "matchedSkills": matched,
        "skillMatchCount": len(matched),
        "totalSkills": len(skills),
        "experienceYears": candidate.get("experienceYears"),
    }


def _candidate_for_prompt(candidate: dict) -> dict:
    """Compact candidate view sent to the model (drops bulky link metadata)."""
    links = candidate.get("links") or []
    link_categories = list(dict.fromkeys(l.get("category") for l in links))
    return {
        "name": candidate.get("name"),
        "skills": candidate.get("skills") or [],
        "experienceYears": candidate.get("experienceYears"),
        "experience": candidate.get("experienceText"),
        "education": candidate.get("education") or [],
        "certifications": candidate.get("certifications") or [],
        "linkCategories": link_categories,
    }


def _finalize(parsed: dict) -> dict:
    dimensions: dict[str, Any] = {}
    total = 0.0
    for key, weight in RUBRIC_WEIGHTS.items():
        dim = parsed["dimensions"][key]
        score = int(dim["score"])
        dimensions[key] = {"score": score, "weight": weight, "reason": dim["reason"]}
        total += score * weight

    # Match JS Math.round (round half up), not Python's banker's rounding.
    match_score = math.floor(total + 0.5)
    if match_score >= RUBRIC_THRESHOLDS["strong"]:
        recommendation = "strong_match"
    elif match_score >= RUBRIC_THRESHOLDS["good"]:
        recommendation = "good_match"
    else:
        recommendation = "reject"

    return {
        "matchScore": match_score,
        "recommendation": recommendation,
        "dimensions": dimensions,
        "strengths": _trim_bullets(parsed.get("strengths") or []),
        "gaps": _trim_bullets(parsed.get("gaps") or []),
    }


async def evaluate(job_description: str, candidate: dict, call: GeminiCaller) -> dict:
    # The JD may be rich-text HTML; feed the evaluator clean plain text.
    jd_text = html_to_text(job_description)
    signals = _compute_signals(jd_text, candidate)
    res = await call(
        GeminiRequest(
            prompt=build_eval_prompt(
                jd_text,
                _candidate_for_prompt(candidate),
                signals,
                MAX_BULLET_WORDS,
                MAX_BULLETS,
            ),
            schema=EVAL_SCHEMA,
        )
    )
    return _finalize(res)
