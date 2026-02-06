from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional
from uuid import uuid4


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Minimal mock “DB”
# key = article_key
_STORE: Dict[str, dict] = {}


def seed_if_empty() -> None:
    if _STORE:
        return

    for i in range(12):
        k = f"mock-{uuid4().hex[:12]}"
        _STORE[k] = {
            "article_key": k,
            "source": "mock",
            "external_id": None,
            "title": f"LNG headline {i+1}: market moves",
            "url": f"https://example.com/article/{i+1}",
            "published_at": utcnow(),
            "content": "Mock content preview...",
            "favourited": False,
            "official_sentiment": None,   # "bullish"|"bearish"|"neutral"|None
            "tags": [],
            "region": None,
            "version": 0,
            "updated_at": None,
            "updated_by": None,
        }


def list_news(limit: int = 100, favourited: Optional[bool] = None) -> List[dict]:
    seed_if_empty()
    rows = list(_STORE.values())

    # newest first
    rows.sort(key=lambda r: r["published_at"] or utcnow(), reverse=True)

    if favourited is not None:
        rows = [r for r in rows if r.get("favourited") == favourited]

    return rows[:limit]


def get_article(article_key: str) -> dict:
    seed_if_empty()
    if article_key not in _STORE:
        raise KeyError(article_key)
    return _STORE[article_key]


def update_article(
    article_key: str,
    *,
    favourited: Optional[bool] = None,
    official_sentiment: Optional[str] = None,
    tags: Optional[List[str]] = None,
    region: Optional[str] = None,
    updated_by: str = "analyst@example.com",
) -> dict:
    row = get_article(article_key)

    if favourited is not None:
        row["favourited"] = bool(favourited)

    if official_sentiment is not None:
        row["official_sentiment"] = official_sentiment

    if tags is not None:
        row["tags"] = tags

    if region is not None:
        row["region"] = region

    row["version"] = int(row.get("version") or 0) + 1
    row["updated_at"] = utcnow()
    row["updated_by"] = updated_by

    return row
