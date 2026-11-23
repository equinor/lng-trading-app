from __future__ import annotations

import re
from typing import Any

from app.core.config import settings
from app.core.databricks import fetch_all

# Months of history returned.
# Months of history returned. The gold table keeps a rolling 12 months, so its oldest month
# is always part-filled; starting one month later keeps the monthly columns to whole months.
HISTORY_MONTHS = 12
# Gas days of per-cycle nominations returned.
CYCLE_LOOKBACK_DAYS = 14
# The gold table names its cycles in full; the API keeps the short codes the page already uses.
_CYCLE_CODE_SQL = """CASE g.cycle
                       WHEN 'Timely' THEN 'TI' WHEN 'Evening' THEN 'EV' WHEN 'ID1' THEN 'I1'
                       WHEN 'ID2' THEN 'I2' WHEN 'ID3' THEN 'I3' WHEN 'Post' THEN 'PO'
                   END"""
_ENDPOINT_NAME = re.compile(r"[A-Za-z0-9_.-]+")


class PipelineNominationsRepository:
    """SQL access to the pipeline nominations tables. Both sources return the same row shape."""

    def daily_by_pipeline(self) -> list[dict[str, Any]]:
        """Daily volume (BCF) per LNG facility and pipeline over the history window."""
        return fetch_all(self._daily_query())

    def woodmac_cycle_rows(self) -> list[dict[str, Any]]:
        """Final nomination of each cycle per plant, pipeline and gas day, from the gold table.

        The gold table has a row for every meter, cycle and revision, with meters that did not
        re-post carried forward (`is_carried_forward`), so a plant's value in a cycle is the sum of
        its meters among the rows that are the latest revision in that cycle.
        """
        gold = settings.PIPELINE_NOMINATIONS_GOLD_TABLE
        query = f"""
            WITH latest AS (SELECT MAX(gas_day) AS d FROM {gold})
            SELECT g.plant AS facility,
                   TRIM(g.pipeline_name) AS pipeline,
                   g.gas_day,
                   {_CYCLE_CODE_SQL} AS cycle,
                   SUM(g.vol_bcfd) AS bcf,
                   MAX(CASE WHEN g.is_carried_forward THEN 1 ELSE 0 END) AS carried
            FROM {gold} g
            CROSS JOIN latest
            WHERE g.is_latest_in_cycle
              AND g.gas_day >= date_sub(latest.d, {CYCLE_LOOKBACK_DAYS})
            GROUP BY g.plant, TRIM(g.pipeline_name), g.gas_day, g.cycle
        """
        return fetch_all(query)

    @staticmethod
    def ai_overview(prompt: str) -> str:
        """Ask the serving endpoint through Databricks ai_query, which runs on the SQL warehouse."""
        endpoint = settings.PIPELINE_NOMINATIONS_AI_ENDPOINT
        # ai_query needs the endpoint name as a literal, so it is checked rather than passed as a parameter.
        if not _ENDPOINT_NAME.fullmatch(endpoint):
            raise ValueError("Invalid PIPELINE_NOMINATIONS_AI_ENDPOINT")
        rows = fetch_all(f"SELECT ai_query('{endpoint}', ?) AS text", [prompt])
        return str(rows[0]["text"] or "").strip() if rows else ""

    @staticmethod
    def _daily_query() -> str:
        gold = settings.PIPELINE_NOMINATIONS_GOLD_TABLE
        # The gold table has a row for every cycle and revision, so only the latest revision of
        # each day is kept; otherwise a day would be counted once per cycle.
        return f"""
            WITH latest AS (SELECT MAX(gas_day) AS d FROM {gold})
            SELECT g.plant AS facility,
                   TRIM(g.pipeline_name) AS pipeline,
                   g.gas_day AS flow_date,
                   SUM(g.vol_bcfd) AS bcf
            FROM {gold} g
            CROSS JOIN latest
            WHERE g.is_latest_for_day
              AND g.gas_day >= add_months(trunc(latest.d, 'MM'), -{HISTORY_MONTHS - 1})
            GROUP BY g.plant, TRIM(g.pipeline_name), g.gas_day
        """
