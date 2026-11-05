from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.core.databricks import fetch_all

# Months of history returned.
HISTORY_MONTHS = 13


class PipelineNominationsRepository:
    """SQL access to the Platts facility-level flow table. Returns raw rows."""

    def daily_by_pipeline(self) -> list[dict[str, Any]]:
        """Daily volume (BCF) per LNG facility and pipeline over the history window."""
        query = f"""
            WITH latest AS (SELECT MAX(flowDate) AS d FROM {settings.PIPELINE_NOMINATIONS_TABLE})
            SELECT t.name AS facility,
                   TRIM(t.pipelineName) AS pipeline,
                   t.flowDate AS flow_date,
                   SUM(t.Vol_BCF) AS bcf
            FROM {settings.PIPELINE_NOMINATIONS_TABLE} t
            CROSS JOIN latest
            WHERE t.flowDate >= add_months(trunc(latest.d, 'MM'), -{HISTORY_MONTHS - 1})
            GROUP BY t.name, TRIM(t.pipelineName), t.flowDate
        """
        return fetch_all(query)
