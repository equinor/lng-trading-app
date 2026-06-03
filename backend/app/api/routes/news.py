# backend/app/api/routes/news.py

import logging
import time
from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.schemas.news import (
    NewsListResponse,
    SetClassificationBody,
    SetFavouriteBody,
    SetReadBody,
    SetSentimentBody,
)
from app.services import news_repo

router = APIRouter()
logger = logging.getLogger(__name__)

# Simple TTL cache for the news list — avoids a Databricks round-trip on every page load.
_news_cache: list | None = None
_news_cache_ts: float = 0.0
_NEWS_CACHE_TTL: float = 60.0  # seconds
_PENDING_OVERRIDE_TTL: float = 180.0  # seconds
_pending_news_overrides: dict[int, dict] = {}


def _prune_pending_overrides(now: float) -> None:
    stale_ids = [
        article_id
        for article_id, entry in _pending_news_overrides.items()
        if (now - float(entry.get("ts", 0.0))) > _PENDING_OVERRIDE_TTL
    ]
    for article_id in stale_ids:
        _pending_news_overrides.pop(article_id, None)


def _apply_pending_overrides(rows: list[dict]) -> list[dict]:
    if not _pending_news_overrides:
        return rows

    now = time.monotonic()
    _prune_pending_overrides(now)

    if not _pending_news_overrides:
        return rows

    patched: list[dict] = []
    for row in rows:
        entry = _pending_news_overrides.get(int(row.get("id", -1)))
        if not entry:
            patched.append(row)
            continue

        updates = entry.get("updates", {})
        if not isinstance(updates, dict):
            patched.append(row)
            continue

        next_row = dict(row)
        next_row.update(updates)
        patched.append(next_row)

    return patched


def _set_pending_override(article_id: int, updates: dict) -> None:
    now = time.monotonic()
    _prune_pending_overrides(now)

    entry = _pending_news_overrides.get(article_id)
    current_updates = dict(entry.get("updates", {})) if entry else {}
    current_updates.update(updates)
    _pending_news_overrides[article_id] = {
        "updates": current_updates,
        "ts": now,
    }


def _clear_pending_override_fields(article_id: int, fields: list[str]) -> None:
    entry = _pending_news_overrides.get(article_id)
    if not entry:
        return
    updates = entry.get("updates", {})
    if not isinstance(updates, dict):
        _pending_news_overrides.pop(article_id, None)
        return

    for key in fields:
        updates.pop(key, None)

    if updates:
        entry["updates"] = updates
        entry["ts"] = time.monotonic()
    else:
        _pending_news_overrides.pop(article_id, None)


def _invalidate_news_cache() -> None:
    global _news_cache, _news_cache_ts
    _news_cache = None
    _news_cache_ts = 0.0


@router.get("/", response_model=NewsListResponse)
def list_news(limit: int = 200, favourited_only: bool = False):
    global _news_cache, _news_cache_ts
    now = time.monotonic()
    # Only cache the default unfavourited full list — other variants go straight to DB
    use_cache = not favourited_only and limit == 200
    if use_cache and _news_cache is not None and (now - _news_cache_ts) < _NEWS_CACHE_TTL:
        return {"data": _apply_pending_overrides(_news_cache)}
    rows = news_repo.list_news(limit=limit, favourited=True if favourited_only else None)
    if use_cache:
        _news_cache = rows
        _news_cache_ts = now
    return {"data": _apply_pending_overrides(rows)}


def _bg_update(article_id: int, kwargs: dict) -> None:
    """Write to Databricks in the background — errors are logged, not surfaced to the user."""
    try:
        news_repo.update_article(article_id, **kwargs)
        _invalidate_news_cache()
        _clear_pending_override_fields(article_id, list(kwargs.keys()))
    except Exception as exc:
        logger.error("Background Databricks update failed for article %s: %s", article_id, exc)


@router.patch("/{article_id}/favourite")
def set_favourite(article_id: int, body: SetFavouriteBody, bg: BackgroundTasks):
    optimistic: dict = {"id": article_id, "favourited": body.favourited}
    bg.add_task(_bg_update, article_id, {"favourited": body.favourited})
    return {"ok": True, "data": optimistic}


@router.patch("/{article_id}/read")
def set_read(article_id: int, body: SetReadBody, bg: BackgroundTasks):
    optimistic: dict = {"id": article_id, "read": body.read}
    _set_pending_override(article_id, {"read": body.read})
    bg.add_task(_bg_update, article_id, {"read": body.read})
    return {"ok": True, "data": optimistic}


@router.patch("/{article_id}/sentiment")
def set_sentiment(article_id: int, body: SetSentimentBody, bg: BackgroundTasks):
    optimistic: dict = {"id": article_id, "official_sentiment": body.official_sentiment}
    bg.add_task(_bg_update, article_id, {"official_sentiment": body.official_sentiment})
    return {"ok": True, "data": optimistic}


@router.patch("/{article_id}/classification")
def set_classification(article_id: int, body: SetClassificationBody, bg: BackgroundTasks):
    optimistic: dict = {"id": article_id, "category": body.category, "region": body.region}
    bg.add_task(_bg_update, article_id, {"category": body.category, "region": body.region})
    return {"ok": True, "data": optimistic}
