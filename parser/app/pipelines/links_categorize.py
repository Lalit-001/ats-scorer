"""Categorize resume hyperlinks by domain (deterministic, no AI).

Unifies the three forms a link can take in a resume:
  - hyperlink : a clickable link behind text (Pipeline A link annotations)
  - icon      : a clickable link behind an image/icon (Pipeline C)
  - plaintext : a bare URL written as text, not clickable (regex over the text)

Anything we can't confidently match falls into the ``other`` ("Unrecognized")
bucket rather than being guessed at or dropped.
"""
import re
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


# Plain-text URLs: scheme/www URLs (any), OR a bare domain that has a /path.
# Requiring a path on bare domains avoids matching degree/tech tokens like
# "B.Tech" or "Node.js" while still catching "github.com/jane", "linkedin.com/in/x".
_PLAINTEXT_URL_RE = re.compile(
    r"(?:https?://|www\.)[^\s)>\]]+"
    r"|(?<![\w@./])(?:[\w-]+\.)+[a-z]{2,}/[^\s)>\]]+",
    re.IGNORECASE,
)


def find_plaintext_urls(text: str) -> list:
    """Bare/plain-text URLs written in the resume body (not clickable annotations)."""
    if not text:
        return []
    return [m.rstrip(".,);") for m in _PLAINTEXT_URL_RE.findall(text)]


def _domain(url: str) -> str:
    netloc = urlparse(url if "//" in url else f"//{url}").netloc.lower()
    return netloc[4:] if netloc.startswith("www.") else netloc


def categorize_url(url: str) -> str:
    domain = _domain(url)
    for category, needles in _DOMAIN_CATEGORIES:
        if any(n in domain for n in needles):
            return category
    return "other"


def _dedup_key(uri: str) -> str:
    """Normalize for de-dup so 'https://x.com/a' and 'x.com/a/' collapse to one."""
    return re.sub(r"^https?://", "", uri.strip().lower()).rstrip("/")


def categorize_links(hyperlinks, icon_links, plain_urls=None) -> list:
    """Unified, de-duplicated, categorized link list across all three forms.

    ``hyperlinks`` / ``icon_links`` are ``[{"uri": ...}, ...]``; ``plain_urls`` is
    a list of URL strings found in the resume text. ``source`` records the form
    each link took; when the same URL appears in more than one form the more
    explicit one wins (hyperlink > icon > plaintext).
    """
    groups = [
        ("hyperlink", [(l.get("uri") or "") for l in (hyperlinks or [])]),
        ("icon", [(l.get("uri") or "") for l in (icon_links or [])]),
        ("plaintext", list(plain_urls or [])),
    ]
    out, seen = [], set()
    for source, uris in groups:
        for uri in uris:
            uri = uri.strip()
            if not uri:
                continue
            key = _dedup_key(uri)
            if key in seen:
                continue
            seen.add(key)
            out.append({"category": categorize_url(uri), "url": uri, "source": source})
    return out
