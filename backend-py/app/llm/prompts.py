"""Prompt templates and Gemini response schemas (port of prompts.ts).

Schemas use lowercase JSON-schema `type` values for readability; they are
normalized to the REST API's uppercase Type enum at the HTTP boundary
(see gemini._normalize_schema).
"""

from __future__ import annotations

import json
from typing import Any

RESUME_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "contact": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "email": {"type": "string"},
                "phone": {"type": "string"},
                "location": {"type": "string"},
            },
        },
        "skills": {"type": "array", "items": {"type": "string"}},
        "education": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "institution": {"type": "string"},
                    "degree": {"type": "string"},
                    "year": {"type": "string"},
                },
            },
        },
        "experience": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "company": {"type": "string"},
                    "role": {"type": "string"},
                    "duration": {"type": "string"},
                    "highlights": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
        "projects": {"type": "array", "items": {"type": "string"}},
        "links": {"type": "array", "items": {"type": "string"}},
    },
}

IMAGE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "imageType": {
            "type": "string",
            "enum": ["certificate", "profile_photo", "logo", "other"],
        },
        "details": {
            "type": "object",
            "properties": {
                "issuer": {"type": "string"},
                "name": {"type": "string"},
                "recipient_name": {"type": "string"},
                "issue_date": {"type": "string"},
                "expiry_date": {"type": "string"},
                "credential_id": {"type": "string"},
            },
        },
    },
    "required": ["imageType"],
}

LINKS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "links": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": ["linkedin", "github", "portfolio", "twitter", "other"],
                    },
                    "url": {"type": "string"},
                },
                "required": ["category", "url"],
            },
        },
    },
}

_DIMENSION: dict[str, Any] = {
    "type": "object",
    "properties": {
        "score": {"type": "integer"},
        "reason": {"type": "string"},
    },
    "required": ["score", "reason"],
}

EVAL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "dimensions": {
            "type": "object",
            "properties": {
                "hard_skills": _DIMENSION,
                "experience_relevance": _DIMENSION,
                "seniority_scope": _DIMENSION,
                "education_certs": _DIMENSION,
                "domain_knowledge": _DIMENSION,
            },
            "required": [
                "hard_skills",
                "experience_relevance",
                "seniority_scope",
                "education_certs",
                "domain_knowledge",
            ],
        },
        "strengths": {"type": "array", "items": {"type": "string"}},
        "gaps": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["dimensions", "strengths", "gaps"],
}


def build_resume_prompt(pipeline_a: dict) -> str:
    return "\n".join(
        [
            "You are a resume parser. Convert the raw resume text and links below into structured JSON",
            "matching the provided schema. Use empty strings/arrays for anything not present. Do not invent data.",
            "",
            "RAW TEXT:",
            pipeline_a.get("text", ""),
            "",
            "EXPLICIT LINKS:",
            json.dumps(pipeline_a.get("links", [])),
        ]
    )


IMAGE_PROMPT = "\n".join(
    [
        "This image was extracted from a resume and is likely a certificate.",
        "Classify it as certificate, profile_photo, logo, or other.",
        "If it is a certificate, extract every detail you can into `details`:",
        "issuer (organization), name (the credential/course title), recipient_name,",
        "issue_date, expiry_date, and credential_id. Omit fields that are not present.",
        "Respond as JSON matching the schema.",
    ]
)


def build_links_prompt(pipeline_c: dict) -> str:
    return "\n".join(
        [
            "These hyperlinks were hidden behind clickable icons in a resume (e.g. a LinkedIn icon).",
            "Categorize each URL as linkedin, github, portfolio, twitter, or other. Respond as JSON.",
            "",
            "ICON LINKS:",
            json.dumps(pipeline_c.get("icon_links", [])),
        ]
    )


def build_eval_prompt(
    job_description: str,
    candidate: Any,
    signals: Any,
    max_bullet_words: int,
    max_bullets: int,
) -> str:
    return "\n".join(
        [
            "You are an expert technical recruiter scoring a candidate against a job description.",
            "Score EACH of these five dimensions from 0-100 and give a one-line reason:",
            "- hard_skills: overlap of required tools/languages/frameworks (exact or semantic).",
            "- experience_relevance: do past roles and responsibilities mirror the target role?",
            "- seniority_scope: does their level/scope match (individual contributor vs lead vs manager)?",
            "- education_certs: are minimum degree/certification requirements met?",
            "- domain_knowledge: experience in the relevant industry/domain.",
            "",
            f"Then give the most important strengths and gaps as short bullets — at most {max_bullet_words} words each, at most {max_bullets} of each. Be specific and apt, not generic.",
            "Do NOT output an overall score; only the five dimension scores. Judge only on the data provided.",
            "",
            "JOB DESCRIPTION:",
            job_description,
            "",
            "CANDIDATE (structured from the resume):",
            json.dumps(candidate, indent=2),
            "",
            "PRECOMPUTED SIGNALS (deterministic, for reference):",
            json.dumps(signals),
        ]
    )
