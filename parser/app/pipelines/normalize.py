"""Skill tokenization + normalization with an extensible alias map (no AI).

Canonical, display-friendly names map from their common variants so the same
skill written different ways ("JS", "react.js", "Postgres") collapses to one.
Extend ``_ALIASES`` over time — it is the single place skill synonyms live.
"""
import re

# canonical (display) -> variants (matched case-insensitively)
_ALIASES = {
    "JavaScript": ["js", "java script", "ecmascript"],
    "TypeScript": ["ts"],
    "Python": ["py"],
    "Node.js": ["node", "nodejs", "node js"],
    "React": ["reactjs", "react.js"],
    "Next.js": ["nextjs", "next js"],
    "PostgreSQL": ["postgres", "psql"],
    "MongoDB": ["mongo"],
    "Kubernetes": ["k8s"],
    "AWS": ["amazon web services"],
    "GCP": ["google cloud platform", "google cloud"],
    "C++": ["cpp"],
    "C#": ["c sharp", "csharp"],
    "REST": ["rest api", "restful", "restful api"],
}


def _build_lookup(aliases: dict) -> dict:
    lut = {}
    for canon, variants in aliases.items():
        lut[canon.lower()] = canon
        for v in variants:
            lut[v.lower()] = canon
    return lut


_LOOKUP = _build_lookup(_ALIASES)

# Split a skills blob on commas, bullets, pipes, slashes, semicolons, newlines, tabs.
_SPLIT_RE = re.compile(r"[,•·\|/;\n\t]+")


def normalize_skill(token: str) -> str:
    """Map one skill token to its canonical form, or keep it as-is (trimmed)."""
    cleaned = token.strip().strip(".:;-•* ").strip()
    return _LOOKUP.get(cleaned.lower(), cleaned)


def normalize_skills(section_text: str) -> list:
    """Tokenize a Skills section into a normalized, de-duplicated list."""
    if not section_text:
        return []
    out, seen = [], set()
    for raw in _SPLIT_RE.split(section_text):
        token = raw.strip().strip(".:;-•* ").strip()
        if not token:
            continue
        # Drop sentence-like fragments — skills are short.
        if len(token.split()) > 4 or len(token) > 40:
            continue
        canon = normalize_skill(token)
        key = canon.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(canon)
    return out
