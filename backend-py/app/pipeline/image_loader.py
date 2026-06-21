"""Reads an extracted image off the shared volume for the vision sub-model
(port of imageLoader.ts).
"""

from __future__ import annotations

from pathlib import Path

import aiofiles

from app.llm.gemini import GeminiImage

_MIME_BY_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


async def load_image_from_disk(path: str) -> GeminiImage:
    async with aiofiles.open(path, "rb") as f:
        data = await f.read()
    mime_type = _MIME_BY_EXT.get(Path(path).suffix.lower(), "image/png")
    return GeminiImage(mime_type=mime_type, data=data)
