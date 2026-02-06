# backend/app/api/routes/news.py
from fastapi import APIRouter, HTTPException

from app.schemas.news import (
    NewsListResponse,
    SetFavouriteBody,
    SetSentimentBody,
    SetTagsBody,
)
from app.services import news_repo

router = APIRouter()

@router.get("/", response_model=NewsListResponse)
def list_news(limit: int = 200, favourited_only: bool = False):
    rows = news_repo.list_news(limit=limit, favourited=True if favourited_only else None)
    return {"data": rows}

@router.patch("/{article_key}/favourite")
def set_favourite(article_key: str, body: SetFavouriteBody):
    try:
        news_repo.update_article(article_key, favourited=body.favourited)
        return {"ok": True}
    except KeyError:
        raise HTTPException(status_code=404, detail="Article not found")

@router.patch("/{article_key}/sentiment")
def set_sentiment(article_key: str, body: SetSentimentBody):
    try:
        news_repo.update_article(article_key, official_sentiment=body.official_sentiment)
        return {"ok": True}
    except KeyError:
        raise HTTPException(status_code=404, detail="Article not found")

@router.patch("/{article_key}/tags")
def set_tags(article_key: str, body: SetTagsBody):
    try:
        news_repo.update_article(article_key, tags=body.tags, region=body.region)
        return {"ok": True}
    except KeyError:
        raise HTTPException(status_code=404, detail="Article not found")
