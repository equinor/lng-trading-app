from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.core.databricks import fetch_all
from app.features.pipeline_nominations.schemas import Source

# Months of history returned.
HISTORY_MONTHS = 13
# Gas days of per-cycle nominations returned.
CYCLE_LOOKBACK_DAYS = 14
# Scheduled capacity is in Dth; this is the factor the silver table uses to get BCF.
DTH_PER_BCF = 1_039_000


class PipelineNominationsRepository:
    """SQL access to the pipeline nominations tables. Both sources return the same row shape."""

    def daily_by_pipeline(self, source: Source) -> list[dict[str, Any]]:
        """Daily volume (BCF) per LNG facility and pipeline over the history window."""
        query = self._platts_query() if source == "platts" else self._woodmac_query()
        return fetch_all(query)

    def woodmac_cycle_rows(self) -> list[dict[str, Any]]:
        """Final nomination of each cycle (Timely, Evening, ID1 to ID3) per LNG location and gas day.

        Reads the bronze table, which keeps every cycle, and takes the plant name from the silver
        table's mapping. Only delivery rows into LNG terminals are kept, as in the silver table.
        """
        silver = settings.PIPELINE_NOMINATIONS_WOODMAC_TABLE
        bronze = settings.PIPELINE_NOMINATIONS_WOODMAC_CYCLES_TABLE
        query = f"""
            WITH mapping AS (
                SELECT DISTINCT pipelineId, locationId, LNG_Plant_Name FROM {silver}
            ),
            nominations AS (
                SELECT m.LNG_Plant_Name AS facility,
                       TRIM(b.pipelineName) AS pipeline,
                       b.locationId AS location_id,
                       CAST(b.gasDay AS DATE) AS gas_day,
                       b.cycleCode AS cycle,
                       ABS(b.netScheduledCapacity) / {DTH_PER_BCF} AS bcf,
                       ROW_NUMBER() OVER (
                           PARTITION BY b.gasDay, b.pipelineId, b.locationId, b.cycleCode
                           ORDER BY b.insertTimestamp DESC
                       ) AS rn
                FROM {bronze} b
                JOIN mapping m ON m.pipelineId = b.pipelineId AND m.locationId = b.locationId
                WHERE b.cycleCode IN ('TI', 'EV', 'I1', 'I2', 'I3')
                  AND b.cycleStatus = 'Final'
                  AND b.locationRole = 'DELIVERY'
                  AND b.facilityType = 'LNG TERMINAL'
            ),
            latest AS (SELECT MAX(gas_day) AS d FROM nominations)
            SELECT n.facility, n.pipeline, n.location_id, n.gas_day, n.cycle, n.bcf
            FROM nominations n
            CROSS JOIN latest
            WHERE n.rn = 1 AND n.gas_day >= date_sub(latest.d, {CYCLE_LOOKBACK_DAYS})
        """
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
