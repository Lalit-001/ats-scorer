"""Minimal client for Mailpit's REST API (port of mailpitClient.ts).

The webhook payload is only a message summary; ingestion calls back here to fetch
the full message and download the PDF part.
"""

from __future__ import annotations

from urllib.parse import quote

import httpx

from app.config import settings


async def get_message(client: httpx.AsyncClient, message_id: str) -> dict:
    """GET /api/v1/message/{ID} — full message incl. body text + attachment list."""
    resp = await client.get(
        f"{settings.mailpit_api_url}/api/v1/message/{quote(message_id, safe='')}"
    )
    if resp.status_code != 200:
        raise RuntimeError(
            f"Mailpit GET message {message_id} failed ({resp.status_code}): {resp.text}"
        )
    return resp.json()


async def get_attachment(
    client: httpx.AsyncClient, message_id: str, part_id: str
) -> bytes:
    """GET /api/v1/message/{ID}/part/{PartID} — raw bytes of a single attachment."""
    resp = await client.get(
        f"{settings.mailpit_api_url}/api/v1/message/{quote(message_id, safe='')}"
        f"/part/{quote(part_id, safe='')}"
    )
    if resp.status_code != 200:
        raise RuntimeError(
            f"Mailpit GET part {part_id} failed ({resp.status_code}): {resp.text}"
        )
    return resp.content
