from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Sentiment = Literal["Bullish", "Bearish", "Neutral"]

class NewsItem(BaseModel):
    article_key: str
    source: str | None = None
    news_source: str | None = None
    external_id: str | None = None
    title: str
    url: str | None = None
    published_at: datetime | None = None
    summary: str | None = None
    content: str | None = None

    favourited: bool | None = None
    official_sentiment: Sentiment | None = None
    tags: list[str] = Field(default_factory=list)
    region: str | None = None

    version: int | None = None
    updated_at: datetime | None = None
    updated_by: str | None = None


class NewsListResponse(BaseModel):
    data: list[NewsItem]


class SetFavouriteBody(BaseModel):
    favourited: bool


class SetSentimentBody(BaseModel):
    official_sentiment: Sentiment | None = None


class SetTagsBody(BaseModel):
    tags: list[str] = Field(default_factory=list, max_length=3)
    region: str | None = None
