from __future__ import annotations

import json
from typing import Any

from app.services.databricks_client.news_state_client import (
    UNSET as DBX_UNSET,
    NewsStateDatabricksClient,
)

_UNSET = DBX_UNSET


def _normalize_input_sentiment(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text.lower()


def _normalize_multi(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]

    text = str(value).strip()
    if not text:
        return []

    if text.startswith("[") and text.endswith("]"):
        try:
            loaded = json.loads(text)
            if isinstance(loaded, list):
                return [str(item).strip() for item in loaded if str(item).strip()]
        except json.JSONDecodeError:
            pass

    return [item.strip() for item in text.split(",") if item.strip()]


def _serialize_multi(values: Any) -> str | None:
    normalized = _normalize_multi(values)
    if not normalized:
        return None
    return ", ".join(normalized)


def _normalize_db_row(row: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(row)
    normalized["official_sentiment"] = _normalize_input_sentiment(
        normalized.get("official_sentiment")
    )
    normalized["category"] = _normalize_multi(normalized.get("category"))
    normalized["region"] = _normalize_multi(normalized.get("region"))
    return normalized


def list_news(limit: int = 100, favourited: bool | None = None) -> list[dict[str, Any]]:
    rows = NewsStateDatabricksClient.list_rows(limit=limit, favourited=favourited)
    return [_normalize_db_row(row) for row in rows]


def get_article(article_id: int) -> dict[str, Any]:
    row = NewsStateDatabricksClient.get_row(article_id)
    if not row:
        raise KeyError(article_id)
    return _normalize_db_row(row)


def update_article(
    article_id: int,
    *,
    favourited: Any = _UNSET,
    official_sentiment: Any = _UNSET,
    category: Any = _UNSET,
    region: Any = _UNSET,
    updated_by: str = "analyst@example.com",
) -> dict[str, Any]:
    normalized_official_sentiment: Any = _UNSET
    normalized_region: Any = _UNSET
    normalized_favourited: Any = _UNSET
    normalized_category: Any = _UNSET

    if favourited is not _UNSET:
        normalized_favourited = bool(favourited)

    if official_sentiment is not _UNSET:
        normalized_official_sentiment = _normalize_input_sentiment(official_sentiment)

    if category is not _UNSET:
        normalized_category = _serialize_multi(category)

    if region is not _UNSET:
        normalized_region = _serialize_multi(region)

    if (
        normalized_favourited is _UNSET
        and normalized_official_sentiment is _UNSET
        and normalized_category is _UNSET
        and normalized_region is _UNSET
    ):
        return get_article(article_id)

    changed = NewsStateDatabricksClient.update_row(
        article_id,
        favourited=normalized_favourited,
        official_sentiment=normalized_official_sentiment,
        category=normalized_category,
        region=normalized_region,
    )
    if changed == 0:
        raise KeyError(article_id)

    return get_article(article_id)