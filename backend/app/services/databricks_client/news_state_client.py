from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.core.databricks import exec_one, fetch_all

TABLE = settings.NEWS_TABLE
UNSET = object()


class NewsStateDatabricksClient:
    """Databricks table client for the news_state dataset."""

    IMPORTANT_STORY_ORDER = (
        "CASE "
        "WHEN lower(coalesce(cast(`importantStory` AS STRING), '')) IN ('true', '1', 'yes', 'y', 'important') THEN 1 "
        "ELSE 0 END"
    )

    @staticmethod
    def list_rows(limit: int = 100, favourited: bool | None = None) -> list[dict[str, Any]]:
        query = f"""
            SELECT
                `id` AS id,
                `source_id` AS source_id,
                `category` AS category,
                `region` AS region,
                `summary` AS summary,
                `paragraph_summary` AS paragraph_summary,
                `headline` AS headline,
                `body` AS body,
                `official_sentiment` AS official_sentiment,
                `favourited` AS favourited,
                `read` AS read,
                `source` AS source,
                `updatedDate` AS updatedDate,
                `app_updated_at` AS app_updated_at,
                `rtpTimestamp` AS rtpTimestamp,
                `publishedChannel` AS publishedChannel,
                `importantStory` AS importantStory,
                `documentUrl` AS documentUrl
            FROM {TABLE}
            WHERE (? IS NULL OR `favourited` = ?)
            ORDER BY {NewsStateDatabricksClient.IMPORTANT_STORY_ORDER} DESC,
                     COALESCE(`rtpTimestamp`, `updatedDate`) DESC
            LIMIT ?
        """
        return fetch_all(query, [favourited, favourited, limit])

    @staticmethod
    def get_row(article_id: int) -> dict[str, Any] | None:
        query = f"""
            SELECT
                `id` AS id,
                `source_id` AS source_id,
                `category` AS category,
                `region` AS region,
                `summary` AS summary,
                `paragraph_summary` AS paragraph_summary,
                `headline` AS headline,
                `body` AS body,
                `official_sentiment` AS official_sentiment,
                `favourited` AS favourited,
                `read` AS read,
                `source` AS source,
                `updatedDate` AS updatedDate,
                `app_updated_at` AS app_updated_at,
                `rtpTimestamp` AS rtpTimestamp,
                `publishedChannel` AS publishedChannel,
                `importantStory` AS importantStory,
                `documentUrl` AS documentUrl
            FROM {TABLE}
            WHERE `id` = ?
            LIMIT 1
        """
        rows = fetch_all(query, [article_id])
        return rows[0] if rows else None

    @staticmethod
    def update_row(
        article_id: int,
        *,
        favourited: Any = UNSET,
        read: Any = UNSET,
        official_sentiment: Any = UNSET,
        category: Any = UNSET,
        region: Any = UNSET,
    ) -> int:
        assignments: list[str] = []
        params: list[Any] = []

        if favourited is not UNSET:
            assignments.append("`favourited` = ?")
            params.append(bool(favourited))

        if read is not UNSET:
            assignments.append("`read` = ?")
            params.append(bool(read))

        if official_sentiment is not UNSET:
            assignments.append("`official_sentiment` = ?")
            params.append(official_sentiment)

        if category is not UNSET:
            assignments.append("`category` = ?")
            params.append(category)

        if region is not UNSET:
            assignments.append("`region` = ?")
            params.append(region)

        if not assignments:
            return 0

        assignments.append("`app_updated_at` = current_timestamp()")

        query = f"""
            UPDATE {TABLE}
            SET {", ".join(assignments)}
            WHERE `id` = ?
        """
        params.append(article_id)
        return exec_one(query, params)
