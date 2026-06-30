from __future__ import annotations

import random
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.core.config import settings
from app.services.mock.news_constants import NEWS_CATEGORIES, NEWS_REGIONS
from app.services.normalization import normalize_multi as _normalize_multi


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Minimal mock in-memory store. key = source_id
_STORE: dict[str, dict] = {}


def pick_category(p_none: float) -> str | None:
    if random.random() < p_none:
        return []
    max_count = min(3, len(NEWS_CATEGORIES))
    count = random.randint(1, max_count)
    return random.sample(NEWS_CATEGORIES, count)


def pick_region(p_none: float) -> str | None:
    if random.random() < p_none:
        return []
    max_count = min(2, len(NEWS_REGIONS))
    count = random.randint(1, max_count)
    return random.sample(NEWS_REGIONS, count)


def seed_if_empty() -> None:
    if _STORE:
        return

    for i in range(settings.MOCK_NEWS_SEED_COUNT):
        source_id = f"mock-{uuid4().hex[:12]}"
        now = utcnow()
        _STORE[source_id] = {
            "id": i + 1,
            "source_id": source_id,
            "category": pick_category(settings.MOCK_NEWS_TAG_NONE_PROBABILITY),
            "region": pick_region(p_none=settings.MOCK_NEWS_REGION_NONE_PROBABILITY),
            "summary": "Mock summary preview...",
            "paragraph_summary": "Mock paragraph summary preview...",
            "headline": f"LNG headline {i + 1}: market moves",
            "body": "Mock content preview...",
            "official_sentiment": None,
            "favourited": False,
            "read": False,
            "source": settings.MOCK_NEWS_SOURCE,
            "updatedDate": now,
            "app_updated_at": now,
            "rtpTimestamp": now,
            "publishedChannel": "Mock Wire",
            "importantStory": "true" if i < 3 else "false",
            "documentUrl": f"https://example.com/article/{i + 1}",
        }


def list_news(limit: int = 100, favourited: bool | None = None) -> list[dict]:
    seed_if_empty()
    rows = list(_STORE.values())
    rows.sort(
        key=lambda r: (
            1 if str(r.get("importantStory") or "").strip().lower() in {"true", "1", "yes", "y", "important"} else 0,
            r["rtpTimestamp"] or utcnow(),
        ),
        reverse=True,
    )

    if favourited is not None:
        rows = [r for r in rows if r.get("favourited") == favourited]

    return rows[:limit]


def get_article(article_id: int) -> dict:
    seed_if_empty()
    for row in _STORE.values():
        if row.get("id") == article_id:
            return row
    raise KeyError(article_id)


_UNSET = object()


def update_article(
    article_id: int,
    *,
    favourited: Any = _UNSET,
    read: Any = _UNSET,
    official_sentiment: Any = _UNSET,
    category: Any = _UNSET,
    region: Any = _UNSET,
    updated_by: str = "analyst@example.com",
) -> dict:
    row = get_article(article_id)

    if favourited is not _UNSET:
        row["favourited"] = bool(favourited)

    if read is not _UNSET:
        row["read"] = bool(read)

    if official_sentiment is not _UNSET:
        row["official_sentiment"] = None if official_sentiment is None else str(official_sentiment)

    if category is not _UNSET:
        row["category"] = _normalize_multi(category)

    if region is not _UNSET:
        row["region"] = _normalize_multi(region)

    row["app_updated_at"] = utcnow()
    return row