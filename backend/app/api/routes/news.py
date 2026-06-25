# backend/app/api/routes/news.py

import logging
import time
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, EmailStr, Field

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
    _set_pending_override(article_id, {"favourited": body.favourited})
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
    _set_pending_override(article_id, {"official_sentiment": body.official_sentiment})
    bg.add_task(_bg_update, article_id, {"official_sentiment": body.official_sentiment})
    return {"ok": True, "data": optimistic}


@router.patch("/{article_id}/classification")
def set_classification(article_id: int, body: SetClassificationBody, bg: BackgroundTasks):
    optimistic: dict = {"id": article_id, "category": body.category, "region": body.region}
    _set_pending_override(article_id, {"category": body.category, "region": body.region})
    bg.add_task(_bg_update, article_id, {"category": body.category, "region": body.region})
    return {"ok": True, "data": optimistic}


# --- Email summary ---

class EmailSummaryBody(BaseModel):
    recipient: EmailStr
    date_from: str | None = None  # YYYY-MM-DD
    date_to: str | None = None  # YYYY-MM-DD


SENTIMENT_COLORS = {
    "bullish": "#16a34a",
    "bearish": "#dc2626",
    "neutral": "#2563eb",
}


def _group_for_email(rows: list[dict], date_from: str | None, date_to: str | None) -> dict:
    from_ts = datetime.strptime(date_from, "%Y-%m-%d").timestamp() * 1000 if date_from else None
    to_ts = (datetime.strptime(date_to, "%Y-%m-%d").timestamp() + 86399) * 1000 if date_to else None

    grouped: dict[str, list] = {"bullish": [], "bearish": [], "neutral": []}
    for row in rows:
        # Only favourited articles
        fav = row.get("favourited")
        if not (fav is True or str(fav).lower() == "true"):
            continue

        # Date filter
        ts = row.get("rtpTimestamp")
        if ts:
            if isinstance(ts, str):
                try:
                    ts_ms = datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() * 1000
                except (ValueError, TypeError):
                    ts_ms = 0
            elif isinstance(ts, datetime):
                ts_ms = ts.timestamp() * 1000
            else:
                ts_ms = float(ts)
            if from_ts and ts_ms < from_ts:
                continue
            if to_ts and ts_ms > to_ts:
                continue

        sentiment = (row.get("official_sentiment") or "neutral").lower()
        if sentiment not in grouped:
            sentiment = "neutral"

        grouped[sentiment].append({
            "headline": row.get("headline", ""),
            "summary": row.get("paragraph_summary") or row.get("summary", ""),
            "source": row.get("source", ""),
            "timestamp": _format_ts(row.get("rtpTimestamp")),
            "url": row.get("documentUrl"),
            "regions": row.get("region", []) or [],
            "categories": row.get("category", []) or [],
        })

    return grouped


def _format_ts(ts: str | datetime | None) -> str:
    if not ts:
        return ""
    if isinstance(ts, str):
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return ts
    else:
        dt = ts
    return dt.strftime("%d %b, %I:%M %p")


@router.post("/email-summary")
def send_news_summary_email(body: EmailSummaryBody, bg: BackgroundTasks):
    from app.core.config import settings
    if not settings.emails_enabled:
        raise HTTPException(status_code=503, detail="Email not configured (SMTP_HOST is not set)")

    rows = news_repo.list_news(limit=500, favourited=True)
    grouped = _group_for_email(rows, body.date_from, body.date_to)

    date_range = ""
    if body.date_from and body.date_to:
        date_range = f"{body.date_from} to {body.date_to}"
    elif body.date_from:
        date_range = f"From {body.date_from}"
    elif body.date_to:
        date_range = f"Up to {body.date_to}"
    else:
        date_range = "All dates"

    sections = [
        {"title": "Bullish", "color": SENTIMENT_COLORS["bullish"], "articles": grouped["bullish"]},
        {"title": "Bearish", "color": SENTIMENT_COLORS["bearish"], "articles": grouped["bearish"]},
        {"title": "Neutral", "color": SENTIMENT_COLORS["neutral"], "articles": grouped["neutral"]},
    ]

    from app.utils import render_email_template, send_email
    html = render_email_template(
        template_name="news_summary.html",
        context={"sections": sections, "date_range": date_range},
    )

    bg.add_task(send_email, email_to=body.recipient, subject="LNG News Summary", html_content=html)
    return {"ok": True, "message": f"Summary email queued for {body.recipient}"}


# --- Databricks pipeline ---


@router.get("/pipeline/last-run")
def get_pipeline_last_run():
    from app.services import databricks_jobs

    try:
        return databricks_jobs.get_last_run()
    except Exception as exc:
        import traceback
        logger.error("Failed to read Databricks pipeline status: %r", exc)
        traceback.print_exc()
        raise HTTPException(status_code=502, detail="Could not read pipeline status") from exc


@router.post("/pipeline/trigger")
def trigger_pipeline():
    from app.services import databricks_jobs

    try:
        result = databricks_jobs.trigger_run()
    except Exception as exc:
        logger.error("Failed to trigger Databricks pipeline: %s", exc)
        raise HTTPException(status_code=502, detail="Could not start pipeline") from exc

    _invalidate_news_cache()
    return result

