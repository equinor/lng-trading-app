from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.core.databricks import fetch_all
from app.features.pipeline_nominations.schemas import Source

# Months of history returned.
HISTORY_MONTHS = 13


class PipelineNominationsRepository:
    """SQL access to the pipeline nominations tables. Both sources return the same row shape."""

    def daily_by_pipeline(self, source: Source) -> list[dict[str, Any]]:
        """Daily volume (BCF) per LNG facility and pipeline over the history window."""
        query = self._platts_query() if source == "platts" else self._woodmac_query()
        return fetch_all(query)

    @staticmethod
    def _platts_query() -> str:
        table = settings.PIPELINE_NOMINATIONS_PLATTS_TABLE
        return f"""
            WITH latest AS (SELECT MAX(flowDate) AS d FROM {table})
            SELECT t.name AS facility,
                   TRIM(t.pipelineName) AS pipeline,
                   t.flowDate AS flow_date,
                   SUM(t.Vol_BCF) AS bcf
            FROM {table} t
            CROSS JOIN latest
            WHERE t.flowDate >= add_months(trunc(latest.d, 'MM'), -{HISTORY_MONTHS - 1})
            GROUP BY t.name, TRIM(t.pipelineName), t.flowDate
        """

    @staticmethod
    def _woodmac_query() -> str:
        table = settings.PIPELINE_NOMINATIONS_WOODMAC_TABLE
        # The table can hold every nomination cycle, so keep only the latest row per
        # location and day; otherwise cycles would be added together.
        return f"""
            WITH latest_cycle AS (
                SELECT *,
                       ROW_NUMBER() OVER (
                           PARTITION BY gasDay, pipelineId, locationId
                           ORDER BY insertTimestamp DESC
                       ) AS rn
                FROM {table}
            ),
            latest AS (SELECT MAX(gasDay) AS d FROM latest_cycle)
            SELECT t.LNG_Plant_Name AS facility,
                   TRIM(t.pipelineName) AS pipeline,
                   t.gasDay AS flow_date,
                   SUM(t.Nominated_VolBCF) AS bcf
            FROM latest_cycle t
            CROSS JOIN latest
            WHERE t.rn = 1
              AND t.gasDay >= add_months(trunc(latest.d, 'MM'), -{HISTORY_MONTHS - 1})
            GROUP BY t.LNG_Plant_Name, TRIM(t.pipelineName), t.gasDay
        """
