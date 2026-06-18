"""Categorize resume hyperlinks by domain (deterministic, no AI).

Unifies normal text links (Pipeline A) and icon-embedded links (Pipeline C)
into one list. Anything we can't confidently match falls into the ``other``
("Unrecognized") bucket rather than being guessed at or dropped.
"""
from urllib.parse import urlparse

# (category, [domain needles]) — first match wins, so order matters.
_DOMAIN_CATEGORIES = [
    ("linkedin", ["linkedin.com"]),
    ("github", ["github.com"]),
    ("gitlab", ["gitlab.com"]),
    ("twitter", ["twitter.com", "x.com"]),
    ("leetcode", ["leetcode.com"]),
    ("hackerrank", ["hackerrank.com"]),
    ("codeforces", ["codeforces.com"]),
    ("stackoverflow", ["stackoverflow.com"]),
    ("kaggle", ["kaggle.com"]),
    ("medium", ["medium.com", "dev.to", "hashnode."]),
    ("behance", ["behance.net"]),
    ("dribbble", ["dribbble.com"]),
    ("youtube", ["youtube.com", "youtu.be"]),
    # common portfolio hosts
    ("portfolio", ["github.io", "gitlab.io", "vercel.app", "netlify.app"]),
]


def _domain(url: str) -> str:
    netloc = urlparse(url if "//" in url else f"//{url}").netloc.lower()
    return netloc[4:] if netloc.startswith("www.") else netloc


def categorize_url(url: str) -> str:
    domain = _domain(url)
    for category, needles in _DOMAIN_CATEGORIES:
        if any(n in domain for n in needles):
            return category
    return "other"


def categorize_links(normal_links, icon_links) -> list:
    """Unified, de-duplicated, categorized link list.

    ``normal_links`` / ``icon_links`` are ``[{"uri": ...}, ...]``. ``source``
    records whether a link came from page text or from behind an image icon.
    """
    out, seen = [], set()
    for source, links in (("text", normal_links or []), ("icon", icon_links or [])):
        for link in links:
            uri = (link.get("uri") or "").strip()
            if not uri or uri in seen:
                continue
            seen.add(uri)
            out.append({"category": categorize_url(uri), "url": uri, "source": source})
    return out
