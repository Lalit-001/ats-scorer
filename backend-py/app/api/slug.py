"""URL-safe, unique-ish slug from a job title (port of slug.ts)."""

from __future__ import annotations

import re
import secrets


def slugify(title: str) -> str:
    base = title.lower()
    base = re.sub(r"[^a-z0-9]+", "-", base)
    base = re.sub(r"(^-|-$)", "", base)
    base = base[:40] or "job"
    return f"{base}-{secrets.token_hex(3)}"
