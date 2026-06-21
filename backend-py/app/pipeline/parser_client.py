"""HTTP client for the Python parser service: PDF on disk -> raw A/B/C extraction
(port of parserClient.ts). The parser service is unchanged and shared with Node.
"""

from __future__ import annotations

import aiofiles
import httpx

from app.config import settings


async def extract_via_parser(
    client: httpx.AsyncClient, app_id: str, resume_path: str
) -> dict:
    async with aiofiles.open(resume_path, "rb") as f:
        data = await f.read()

    resp = await client.post(
        f"{settings.parser_url}/extract",
        data={"app_id": app_id},
        files={"file": ("resume.pdf", data, "application/pdf")},
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Parser /extract failed ({resp.status_code}): {resp.text}")
    return resp.json()
