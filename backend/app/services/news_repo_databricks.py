from __future__ import annotations

import time
from typing import Any

from app.services.databricks_client.news_state_client import (
    UNSET as DBX_UNSET,
    NewsStateDatabricksClient,
)
from app.services.news_query import (
    NewsFilters,
    facets as _facets,
    filter_sort_paginate,
)
from app.services.normalization import normalize_multi as _normalize_multi

_UNSET = DBX_UNSET


def _normalize_input_sentiment(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text.lower()


def _normalize_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    return text in {"true", "1", "yes", "y", "t"}


def _serialize_multi(values: Any) -> str | None:
    normalized = _normalize_multi(values)
    if not normalized:
        return None
    return ", ".join(normalized)


def _normalize_db_row(row: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(row)
    normalized["favourited"] = _normalize_bool(normalized.get("favourited"))
    normalized["read"] = _normalize_bool(normalized.get("read"))
    normalized["official_sentiment"] = _normalize_input_sentiment(
        normalized.get("official_sentiment")
    )
    normalized["category"] = _normalize_multi(normalized.get("category"))
    normalized["region"] = _normalize_multi(normalized.get("region"))
    return normalized


def list_news(
    limit: int = 100, favourited: bool | None = None, offset: int = 0
) -> list[dict[str, Any]]:
    rows = NewsStateDatabricksClient.list_rows(limit=limit, favourited=favourited, offset=offset)
    return [_normalize_db_row(row) for row in rows]


def count_news(favourited: bool | None = None) -> int:
    return NewsStateDatabricksClient.count_rows(favourited=favourited)


# Upper bound on rows pulled for in-Python filtering/sorting/pagination.
_QUERY_CAP = 5000

# TTL cache of the full normalized dataset. Filtering/sorting/pagination all run
# in memory against this snapshot, so only one Databricks round-trip is made per
# TTL window (or until a write invalidates it) instead of one per request.
_DATASET_TTL = 30.0  # seconds
_dataset_cache: list[dict[str, Any]] | None = None
_dataset_ts: float = 0.0


def _invalidate_dataset() -> None:
    global _dataset_cache, _dataset_ts
    _dataset_cache = None
    _dataset_ts = 0.0


def _get_dataset() -> list[dict[str, Any]]:
    global _dataset_cache, _dataset_ts
    now = time.monotonic()
    if _dataset_cache is not None and (now - _dataset_ts) < _DATASET_TTL:
        return _dataset_cache
    rows = NewsStateDatabricksClient.list_rows(limit=_QUERY_CAP, favourited=None, offset=0)
    _dataset_cache = [_normalize_db_row(row) for row in rows]
    _dataset_ts = now
    return _dataset_cache


def query_news(filters: NewsFilters, limit: int, offset: int) -> tuple[list[dict[str, Any]], int]:
    return filter_sort_paginate(_get_dataset(), filters, limit, offset)


def facets() -> dict[str, list[str]]:
    return _facets(_get_dataset())


def get_article(article_id: int) -> dict[str, Any]:
    row = NewsStateDatabricksClient.get_row(article_id)
    if not row:
        raise KeyError(article_id)
    return _normalize_db_row(row)


def update_article(
    article_id: int,
    *,
    favourited: Any = _UNSET,
    read: Any = _UNSET,
    official_sentiment: Any = _UNSET,
    category: Any = _UNSET,
    region: Any = _UNSET,
    updated_by: str = "analyst@example.com",
) -> dict[str, Any]:
    normalized_official_sentiment: Any = _UNSET
    normalized_region: Any = _UNSET
    normalized_favourited: Any = _UNSET
    normalized_read: Any = _UNSET
    normalized_category: Any = _UNSET

    if favourited is not _UNSET:
        normalized_favourited = bool(favourited)

    if read is not _UNSET:
        normalized_read = bool(read)

    if official_sentiment is not _UNSET:
        normalized_official_sentiment = _normalize_input_sentiment(official_sentiment)

    if category is not _UNSET:
        normalized_category = _serialize_multi(category)

    if region is not _UNSET:
        normalized_region = _serialize_multi(region)

    if (
        normalized_favourited is _UNSET
        and normalized_read is _UNSET
        and normalized_official_sentiment is _UNSET
        and normalized_category is _UNSET
        and normalized_region is _UNSET
    ):
        return get_article(article_id)

    changed = NewsStateDatabricksClient.update_row(
        article_id,
        favourited=normalized_favourited,
        read=normalized_read,
        official_sentiment=normalized_official_sentiment,
        category=normalized_category,
        region=normalized_region,
    )

    if changed == 0:
        raise KeyError(article_id)

    _invalidate_dataset()

    updated: dict[str, Any] = {"id": article_id}

    if normalized_favourited is not _UNSET:
        updated["favourited"] = normalized_favourited

    if normalized_read is not _UNSET:
        updated["read"] = normalized_read

    if normalized_official_sentiment is not _UNSET:
        updated["official_sentiment"] = normalized_official_sentiment

    if normalized_category is not _UNSET:
        updated["category"] = _normalize_multi(normalized_category)

    if normalized_region is not _UNSET:
        updated["region"] = _normalize_multi(normalized_region)

    return updated