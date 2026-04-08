# backend/app/services/news_repo.py
from __future__ import annotations

from typing import List, Optional

from app.core.config import settings

# Toggle via env later: NEWS_BACKEND=mock|databricks
BACKEND = getattr(settings, "NEWS_BACKEND", "mock").lower()

if BACKEND == "databricks":
    # later you will implement this file with real SQL Warehouse calls
    from app.services.news_repo_databricks import (  # type: ignore
        get_article,
        list_news,
        update_article,
    )
else:
    # your current in-memory mock
    from app.services.mock.news_service import (
        get_article,
        list_news,
        update_article,
    )

__all__ = ["list_news", "get_article", "update_article"]
