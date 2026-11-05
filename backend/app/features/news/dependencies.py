from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from app.features.news.repository import NewsRepository
from app.features.news.service import NewsService


@lru_cache
def get_news_service() -> NewsService:
    # One instance per process so its dataset cache is shared across requests.
    return NewsService(NewsRepository())


NewsServiceDep = Annotated[NewsService, Depends(get_news_service)]
