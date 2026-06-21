"""Convert a (rich-text) HTML job description to clean plain text (port of htmlToText.ts).

Dependency-free and conservative: preserves block/list boundaries as line breaks,
strips tags, decodes the handful of entities the editor emits. Plain-text JDs pass
through unchanged. Kept identical to the Node version so JD -> eval-prompt text is
byte-for-byte the same.
"""

from __future__ import annotations

import re

_ENTITIES = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
}


def html_to_text(html: str) -> str:
    if not html:
        return ""
    s = html
    s = re.sub(r"<\s*br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"<\s*li[^>]*>", "\n• ", s, flags=re.I)
    s = re.sub(r"</\s*(p|div|li|h[1-6]|ul|ol|blockquote|tr)\s*>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(
        r"&[a-z#0-9]+;",
        lambda m: _ENTITIES.get(m.group(0).lower(), m.group(0)),
        s,
        flags=re.I,
    )
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    s = re.sub(r"[ \t]{2,}", " ", s)
    return s.strip()
