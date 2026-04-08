# backend/app/api/routes/news.py

from fastapi import APIRouter, HTTPException

from app.schemas.news import (
    NewsListResponse,
    SetClassificationBody,
    SetFavouriteBody,
    SetSentimentBody,
)
from app.services import news_repo

router = APIRouter()

@router.get("/", response_model=NewsListResponse)
def list_news(limit: int = 200, favourited_only: bool = False):
    rows = news_repo.list_news(limit=limit, favourited=True if favourited_only else None)
    return {"data": rows}

@router.patch("/{article_id}/favourite")
def set_favourite(article_id: int, body: SetFavouriteBody):
    try:
        news_repo.update_article(article_id, favourited=body.favourited)
        return {"ok": True}
    except KeyError:
        raise HTTPException(status_code=404, detail="Article not found")

@router.patch("/{article_id}/sentiment")
def set_sentiment(article_id: int, body: SetSentimentBody):
    try:
        news_repo.update_article(article_id, official_sentiment=body.official_sentiment)
        return {"ok": True}
    except KeyError:
        raise HTTPException(status_code=404, detail="Article not found")

@router.patch("/{article_id}/classification")
def set_classification(article_id: int, body: SetClassificationBody):
    try:
        news_repo.update_article(article_id, category=body.category, region=body.region)
        return {"ok": True}
    except KeyError:
        raise HTTPException(status_code=404, detail="Article not found")
