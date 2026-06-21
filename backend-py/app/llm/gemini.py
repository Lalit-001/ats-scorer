"""Gemini caller over raw HTTP (port of geminiClient.ts + factory.ts).

No SDK: we call the Generative Language REST API directly with httpx and run every
call through the key pool with 429 failover. The network call is injected (invoke)
so the retry logic stays isolated; create_gemini_invoke builds the production one.
"""

from __future__ import annotations

import base64
import json
import re
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

import httpx

from app.config import settings
from app.llm.key_pool import GeminiKeyPool, RedisRateStore

BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

_RATE_LIMIT_RE = re.compile(r"\b429\b|RESOURCE_EXHAUSTED|rate.?limit|quota", re.I)


@dataclass
class GeminiImage:
    mime_type: str
    data: bytes | str  # raw bytes or a base64 string


@dataclass
class GeminiRequest:
    prompt: str
    schema: dict | None = None
    images: list[GeminiImage] = field(default_factory=list)


class GeminiError(Exception):
    def __init__(self, status: int | None, message: str) -> None:
        super().__init__(message)
        self.status = status


# (key, request) -> raw model text (expected to be JSON)
GeminiInvoke = Callable[[str, GeminiRequest], Awaitable[str]]
# request -> parsed JSON
GeminiCaller = Callable[[GeminiRequest], Awaitable[Any]]


def _is_rate_limit(err: Exception) -> bool:
    if getattr(err, "status", None) == 429:
        return True
    return bool(_RATE_LIMIT_RE.search(str(err)))


def _normalize_schema(node: Any) -> Any:
    """Uppercase JSON-schema `type` values for the REST Type enum (STRING, OBJECT…).

    The JS SDK did this conversion implicitly; over raw REST we must do it ourselves.
    enum values and other fields are left untouched (only the value of key "type").
    """
    if isinstance(node, dict):
        return {
            k: (v.upper() if k == "type" and isinstance(v, str) else _normalize_schema(v))
            for k, v in node.items()
        }
    if isinstance(node, list):
        return [_normalize_schema(x) for x in node]
    return node


async def call_gemini_json(
    pool: GeminiKeyPool,
    req: GeminiRequest,
    invoke: GeminiInvoke,
    max_attempts: int = 5,
) -> Any:
    last_error: Exception | None = None
    for _ in range(max_attempts):
        key = await pool.acquire()  # raises GeminiQuotaExhaustedError when nothing is free
        try:
            text = await invoke(key, req)
            return json.loads(text)
        except Exception as err:  # noqa: BLE001
            if _is_rate_limit(err):
                await pool.penalize(key)
                last_error = err
                continue
            raise
    raise last_error or GeminiError(None, "Gemini call failed after retries")


def create_gemini_invoke(model: str, client: httpx.AsyncClient) -> GeminiInvoke:
    async def invoke(key: str, req: GeminiRequest) -> str:
        parts: list[dict] = [{"text": req.prompt}]
        for img in req.images or []:
            data = (
                img.data
                if isinstance(img.data, str)
                else base64.b64encode(img.data).decode()
            )
            parts.append({"inlineData": {"mimeType": img.mime_type, "data": data}})

        generation_config: dict[str, Any] = {"responseMimeType": "application/json"}
        if req.schema:
            generation_config["responseSchema"] = _normalize_schema(req.schema)

        body = {"contents": [{"parts": parts}], "generationConfig": generation_config}
        resp = await client.post(
            f"{BASE_URL}/models/{model}:generateContent",
            params={"key": key},
            json=body,
        )
        if resp.status_code != 200:
            raise GeminiError(resp.status_code, f"Gemini {resp.status_code}: {resp.text}")
        data = resp.json()
        try:
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError):
            raise GeminiError(
                resp.status_code,
                f"Unexpected Gemini response: {json.dumps(data)[:500]}",
            )

    return invoke


def build_gemini_caller(redis, client: httpx.AsyncClient) -> GeminiCaller:
    """Build a ready-to-use Gemini caller (pool + Redis rate store + invoker)."""
    keys = settings.gemini_keys
    if not keys:
        async def no_keys(_req: GeminiRequest) -> Any:
            raise RuntimeError("No GEMINI_API_KEYS configured — set them in .env")

        return no_keys

    store = RedisRateStore(redis)
    pool = GeminiKeyPool(
        keys, rpm=settings.gemini_rpm, rpd=settings.gemini_rpd, store=store
    )
    invoke = create_gemini_invoke(settings.gemini_model, client)

    async def call(req: GeminiRequest) -> Any:
        return await call_gemini_json(pool, req, invoke)

    return call
