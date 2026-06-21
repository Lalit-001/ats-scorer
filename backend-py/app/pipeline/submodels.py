"""AI helpers used only when deterministic parsing isn't enough (port of submodels.ts).

- structure_resume: LLM fallback that structures a resume from raw text (used only
  when the parser's parse_quality is weak).
- classify_certificates: vision classification of certificate-candidate images
  (gated + capped by the orchestrator; icons/logos never reach here).
Each takes an injected `call` (Gemini) so it stays isolated.
"""

from __future__ import annotations

from typing import Any, Awaitable, Callable

from app.llm.gemini import GeminiImage, GeminiRequest
from app.llm.prompts import (
    IMAGE_PROMPT,
    IMAGE_SCHEMA,
    RESUME_SCHEMA,
    build_resume_prompt,
)

GeminiCaller = Callable[[GeminiRequest], Awaitable[Any]]
ImageLoader = Callable[[str], Awaitable[GeminiImage]]


async def structure_resume(pipeline_a: dict, call: GeminiCaller) -> Any:
    """Fallback: raw text + explicit links -> structured resume JSON (RESUME_SCHEMA)."""
    return await call(
        GeminiRequest(prompt=build_resume_prompt(pipeline_a), schema=RESUME_SCHEMA)
    )


async def classify_certificates(
    images: list[dict],
    call: GeminiCaller,
    load_image: ImageLoader,
) -> list[dict]:
    """Vision-classify certificate-candidate images and extract their details."""
    out: list[dict] = []
    for img in images:
        loaded = await load_image(img["path"])
        res = await call(
            GeminiRequest(prompt=IMAGE_PROMPT, schema=IMAGE_SCHEMA, images=[loaded])
        )
        out.append(
            {
                "index": img["index"],
                "imageType": res.get("imageType"),
                "details": res.get("details"),
            }
        )
    return out
