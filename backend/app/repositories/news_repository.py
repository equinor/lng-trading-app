from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.core.databricks import exec_one, fetch_all

_COLUMNS = (
    "id",
    "source_id",
    "category",
    "region",
    "summary",
    "paragraph_summary",
    "headline",
    "body",
    "official_sentiment",
    "favourited",
    "read",
    "source",
    "updatedDate",
    "app_updated_at",
    "rtpTimestamp",
    "publishedChannel",
    "importantStory",
    "documentUrl",
)
_SELECT = ", ".join(f"`{c}` AS {c}" for c in _COLUMNS)

# Column names are interpolated into SQL, so writes are restricted to this set.
UPDATABLE_COLUMNS = frozenset({"favourited", "read", "official_sentiment", "category", "region"})

_IMPORTANT_STORY_ORDER = (
    "CASE "
    "WHEN lower(coalesce(cast(`importantStory` AS STRING), '')) IN ('true', '1', 'yes', 'y', 'important') THEN 1 "
    "ELSE 0 END"
)


class NewsRepository:
    """SQL access to the Databricks news table. Returns raw rows; normalization lives in the service."""

    def list_rows(
        self, limit: int = 100, favourited: bool | None = None, offset: int = 0
    ) -> list[dict[str, Any]]:
        query = f"""
            SELECT {_SELECT}
            FROM {settings.NEWS_TABLE}
            WHERE (? IS NULL OR `favourited` = ?)
            ORDER BY {_IMPORTANT_STORY_ORDER} DESC,
                     COALESCE(`rtpTimestamp`, `updatedDate`) DESC
            LIMIT ? OFFSET ?
        """
        return fetch_all(query, [favourited, favourited, limit, max(0, offset)])

    def update_row(self, article_id: int, values: dict[str, Any]) -> int:
        """Update the given columns on one article. Returns the number of rows changed."""
        unknown = values.keys() - UPDATABLE_COLUMNS
        if unknown:
            raise ValueError(f"Columns are not updatable: {sorted(unknown)}")
        if not values:
            return 0

        assignments = [f"`{column}` = ?" for column in values]
        assignments.append("`app_updated_at` = current_timestamp()")
        query = f"""
            UPDATE {settings.NEWS_TABLE}
            SET {", ".join(assignments)}
            WHERE `id` = ?
        """
        return exec_one(query, [*values.values(), article_id])
