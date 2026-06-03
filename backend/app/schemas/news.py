from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Sentiment = Literal["bullish", "bearish", "neutral"]

class NewsItem(BaseModel):
    id: int
    source_id: str
    category: list[str] = Field(default_factory=list)
    region: list[str] = Field(default_factory=list)
    summary: str | None = None
    headline: str
    body: str | None = None
    official_sentiment: Sentiment | None = None
    favourited: bool | None = None
    read: bool | None = None
    source: str | None = None
    updatedDate: datetime | None = None
    rtpTimestamp: datetime | None = None
    publishedChannel: str | None = None
    importantStory: str | None = None
    documentUrl: str | None = None


class NewsListResponse(BaseModel):
    data: list[NewsItem]


class SetFavouriteBody(BaseModel):
    favourited: bool


class SetSentimentBody(BaseModel):
    official_sentiment: Sentiment | None = None


class SetClassificationBody(BaseModel):
    category: list[str] = Field(default_factory=list)
    region: list[str] = Field(default_factory=list)
