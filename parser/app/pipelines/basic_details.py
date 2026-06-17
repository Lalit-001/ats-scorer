"""Lightweight, LLM-free resume basics derived from the extracted text.

Runs purely on PyMuPDF output so we always have *something* to show — name,
contacts, links, and a text preview — even if the later AI stages fail.
"""
import re

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
URL_RE = re.compile(r"https?://[^\s)>\]]+", re.IGNORECASE)
PHONE_RE = re.compile(r"(?<!\w)\+?\d[\d\s().-]{7,}\d(?!\w)")

PREVIEW_CHARS = 600


def _unique(seq):
    seen = set()
    out = []
    for item in seq:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def _guess_name(text: str):
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        words = line.split()
        looks_like_name = (
            1 <= len(words) <= 4
            and "@" not in line
            and not any(ch.isdigit() for ch in line)
            and all(w[0].isalpha() for w in words if w)
        )
        return line if looks_like_name else None
    return None


def _phones(text: str):
    phones = []
    for match in PHONE_RE.findall(text):
        digits = re.sub(r"\D", "", match)
        if 10 <= len(digits) <= 15:
            phones.append(match.strip())
    return _unique(phones)


def extract_basic_details(text: str, link_uris) -> dict:
    return {
        "name_guess": _guess_name(text),
        "emails": _unique(EMAIL_RE.findall(text)),
        "phones": _phones(text),
        "links": _unique([*link_uris, *URL_RE.findall(text)]),
        "text_preview": text[:PREVIEW_CHARS].strip(),
    }
