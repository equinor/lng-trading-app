from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from app.api.dependencies import WriterUser, require_reader
from app.core.config import settings
from app.features.news.dependencies import NewsServiceDep
from app.features.news.email_summary import build_summary_html
from app.features.news.query import NewsFilters
from app.features.news.schemas import (
    NewsListResponse,
    SetClassificationBody,
    SetFavouriteBody,
    SetReadBody,
    SetSentimentBody,
)
from app.features.news.service import NewsService
from app.utils import send_email

router = APIRouter(dependencies=[Depends(require_reader)])


def _split(value: str | None) -> list[str]:
    return [part for part in (value.split("|") if value else []) if part.strip()]


@router.get("/", response_model=NewsListResponse)
def list_news(
    service: NewsServiceDep,
    limit: int = 200,
    offset: int = 0,
    favourited_only: bool = False,
    q: str | None = None,
    favourited: bool | None = None,
    read: bool | None = None,
    sentiment: str | None = None,
    categories: str | None = None,
    regions: str | None = None,
    region_none: bool = False,
    date_from: str | None = None,
    date_to: str | None = None,
    sort: str = "default",
):
    limit = max(1, min(limit, 1000))
    offset = max(0, offset)
    filters = NewsFilters(
        q=q or None,
        favourited=favourited if favourited is not None else (True if favourited_only else None),
        read=read,
        sentiment=sentiment.lower() if sentiment else None,
        categories=_split(categories),
        regions=_split(regions),
        region_none=region_none,
        date_from=date_from or None,
        date_to=date_to or None,
        sort=sort or "default",
    )
    rows, total = service.query(filters, limit, offset)
    return {"data": rows, "total": total, "limit": limit, "offset": offset}


@router.get("/facets")
def news_facets(service: NewsServiceDep):
    """Distinct category and region values across the dataset, for filter dropdowns."""
    return service.facets()


def _update(
    service: NewsService, bg: BackgroundTasks, user: dict, article_id: int, changes: dict
):
    """Answer immediately with the optimistic value and persist to Databricks in the background."""
    optimistic = service.begin_update(article_id, changes)
    bg.add_task(service.commit_update, article_id, changes, user["email"])
    return {"ok": True, "data": optimistic}


@router.patch("/{article_id}/favourite")
def set_favourite(
    article_id: int,
    body: SetFavouriteBody,
    bg: BackgroundTasks,
    user: WriterUser,
    service: NewsServiceDep,
):
    return _update(service, bg, user, article_id, {"favourited": body.favourited})


@router.patch("/{article_id}/read")
def set_read(
    article_id: int,
    body: SetReadBody,
    bg: BackgroundTasks,
    user: WriterUser,
    service: NewsServiceDep,
):
    return _update(service, bg, user, article_id, {"read": body.read})


@router.patch("/{article_id}/sentiment")
def set_sentiment(
    article_id: int,
    body: SetSentimentBody,
    bg: BackgroundTasks,
    user: WriterUser,
    service: NewsServiceDep,
):
    return _update(service, bg, user, article_id, {"official_sentiment": body.official_sentiment})


@router.patch("/{article_id}/classification")
def set_classification(
    article_id: int,
    body: SetClassificationBody,
    bg: BackgroundTasks,
    user: WriterUser,
    service: NewsServiceDep,
):
    return _update(
        service, bg, user, article_id, {"category": body.category, "region": body.region}
    )


class EmailSummaryBody(BaseModel):
    recipient: EmailStr
    date_from: str | None = None  # YYYY-MM-DD
    date_to: str | None = None  # YYYY-MM-DD
    categories: list[str] = Field(default_factory=list)  # extra category sections (on top)


@router.post("/email-summary")
def send_news_summary_email(
    body: EmailSummaryBody, bg: BackgroundTasks, _user: WriterUser, service: NewsServiceDep
):
    if not settings.emails_enabled:
        raise HTTPException(
            status_code=503,
            detail="Email not configured (ATLAS_CLIENT_ID/ATLAS_CLIENT_SECRET not set)",
        )

    html = build_summary_html(
        service.favourites(),
        date_from=body.date_from,
        date_to=body.date_to,
        categories=body.categories,
    )
    bg.add_task(send_email, email_to=body.recipient, subject="LNG News Summary", html_content=html)
    return {"ok": True, "message": f"Summary email queued for {body.recipient}"}
