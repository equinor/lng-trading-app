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
        return {"data": _news_cache}
    rows = news_repo.list_news(limit=limit, favourited=True if favourited_only else None)
    if use_cache:
        _news_cache = rows
        _news_cache_ts = now
    return {"data": rows}


def _bg_update(article_id: int, kwargs: dict) -> None:
    """Write to Databricks in the background — errors are logged, not surfaced to the user."""
    try:
        news_repo.update_article(article_id, **kwargs)
        _invalidate_news_cache()
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
