from __future__ import annotations

import logging
from typing import Any

from app.core.cache import PendingOverrides, TTLCache
from app.repositories.news_repository import NewsRepository
from app.services.news_query import NewsFilters, facets as _facets, filter_sort_paginate
from app.services.normalization import normalize_multi

logger = logging.getLogger(__name__)

# Upper bound on rows pulled for in-Python filtering/sorting/pagination.
_QUERY_CAP = 2000
# Filtering/sorting/pagination run against one cached snapshot, so Databricks is hit
# once per TTL window (or until a failed write invalidates it), not once per request.
_DATASET_TTL = 30.0
_PENDING_TTL = 180.0


def _normalize_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value).strip().lower() in {"true", "1", "yes", "y", "t"}


def _normalize_sentiment(value: Any) -> str | None:
    text = str(value).strip().lower() if value is not None else ""
    return text or None


def _normalize_row(row: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(row)
    normalized["favourited"] = _normalize_bool(normalized.get("favourited"))
    normalized["read"] = _normalize_bool(normalized.get("read"))
    normalized["official_sentiment"] = _normalize_sentiment(normalized.get("official_sentiment"))
    normalized["category"] = normalize_multi(normalized.get("category"))
    normalized["region"] = normalize_multi(normalized.get("region"))
    return normalized


def _normalize_changes(changes: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Split requested changes into (values stored in Databricks, values shown in API rows)."""
    stored: dict[str, Any] = {}
    shown: dict[str, Any] = {}
    for field, value in changes.items():
        if field in ("favourited", "read"):
            stored[field] = shown[field] = bool(value)
        elif field == "official_sentiment":
            stored[field] = shown[field] = _normalize_sentiment(value)
        elif field in ("category", "region"):
            items = normalize_multi(value)
            stored[field] = ", ".join(items) or None
            shown[field] = items
        else:
            raise ValueError(f"Unsupported field: {field}")
    return stored, shown


class NewsService:
    def __init__(self, repo: NewsRepository) -> None:
        self._repo = repo
        self._dataset: TTLCache[list[dict[str, Any]]] = TTLCache(_DATASET_TTL)
        self._pending = PendingOverrides(_PENDING_TTL)

    def _snapshot(self) -> list[dict[str, Any]]:
        rows = self._dataset.get_or_load(
            lambda: [_normalize_row(r) for r in self._repo.list_rows(limit=_QUERY_CAP)]
        )
        return self._pending.apply(rows)

    def query(
        self, filters: NewsFilters, limit: int, offset: int
    ) -> tuple[list[dict[str, Any]], int]:
        return filter_sort_paginate(self._snapshot(), filters, limit, offset)

    def facets(self) -> dict[str, list[str]]:
        return _facets(self._snapshot())

    def favourites(self, limit: int = 500) -> list[dict[str, Any]]:
        rows = [_normalize_row(r) for r in self._repo.list_rows(limit=limit, favourited=True)]
        return self._pending.apply(rows)

    def begin_update(self, article_id: int, changes: dict[str, Any]) -> dict[str, Any]:
        """Show the change immediately; commit_update persists it. Returns the optimistic row fragment."""
        _, shown = _normalize_changes(changes)
        self._pending.set(article_id, shown)
        return {"id": article_id, **shown}

    def commit_update(self, article_id: int, changes: dict[str, Any], updated_by: str) -> None:
        """Persist a change started by begin_update. Runs in the background, so failures are logged."""
        stored, shown = _normalize_changes(changes)
        try:
            changed = self._repo.update_row(article_id, stored)
            if changed == 0:
                raise LookupError(f"article {article_id} not found")
        except Exception:
            logger.exception("News update failed for article %s (by %s)", article_id, updated_by)
            # Drop the optimistic state and refetch so the UI converges on what is stored.
            self._dataset.invalidate()
            self._pending.clear(article_id, shown)
            return

        def apply(rows: list[dict[str, Any]]) -> None:
            for row in rows:
                if row.get("id") == article_id:
                    row.update(shown)
                    break

        self._dataset.patch(apply)
        self._pending.clear(article_id, shown)
        logger.info("News article %s updated by %s: %s", article_id, updated_by, sorted(shown))
