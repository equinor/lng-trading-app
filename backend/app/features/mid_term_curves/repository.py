from __future__ import annotations

import uuid
from typing import Any

from app.core.config import settings
from app.core.databricks import exec_one, fetch_all


class MidTermCurvesRepository:
    def __init__(self) -> None:
        self._custom_table_ready = False

    def _ensure_custom_table(self) -> None:
        if self._custom_table_ready:
            return
        table = settings.MID_TERM_CURVE_BUILDER_CUSTOM_TABLE
        exec_one(f"""
            CREATE TABLE IF NOT EXISTS {table} (
                curve_id STRING NOT NULL,
                curve_name STRING NOT NULL,
                month DATE NOT NULL,
                fundamental_rationale STRING NOT NULL,
                curve_1_id STRING,
                curve_2_id STRING,
                created_by STRING NOT NULL,
                created_at TIMESTAMP NOT NULL,
                modified_at TIMESTAMP NOT NULL
            ) USING DELTA
        """)
        self._custom_table_ready = True

    def list_prices(self) -> list[dict[str, Any]]:
        table = settings.MID_TERM_CURVE_BUILDER_TABLE
        epa_table = settings.MID_TERM_CURVE_BUILDER_EPA_TABLE
        query = f"""
             WITH ice_curves AS (
              SELECT start_date,
                  MAX(CASE WHEN UPPER(curve_id) LIKE '%JKM%' THEN price END) AS jkm,
                  MAX(CASE WHEN UPPER(curve_id) LIKE '%TTF%' THEN price END) AS ttf,
                  MAX(CASE WHEN UPPER(curve_id) LIKE '%HH%' THEN price END) AS hh,
                  MAX(CASE WHEN UPPER(curve_id) LIKE '%BRENT%' THEN price END) AS brent
              FROM {table}
              WHERE start_date IS NOT NULL
                AND (UPPER(curve_id) LIKE '%JKM%'
                  OR UPPER(curve_id) LIKE '%TTF%'
                  OR UPPER(curve_id) LIKE '%HH%'
                  OR UPPER(curve_id) LIKE '%BRENT%')
              GROUP BY start_date
               ),
               epa_curves AS (
              SELECT start_date,
                  MAX(CASE WHEN curve_id = 'JKM [EPA]' THEN price END) AS epa_jkm,
                  MAX(CASE WHEN curve_id = 'TTF [EPA]' THEN price END) AS epa_ttf,
                  MAX(CASE WHEN curve_id = 'HH [EPA]' THEN price END) AS epa_hh,
                  MAX(CASE WHEN curve_id = 'NBP [EPA]' THEN price END) AS epa_nbp,
                  MAX(CASE WHEN curve_id = 'Brent - Base case [USD nominal]' THEN price END) AS epa_brent_base,
                  MAX(CASE WHEN curve_id = 'Brent - High case [USD nominal]' THEN price END) AS epa_brent_high,
                  MAX(CASE WHEN curve_id = 'Brent - Low case [USD nominal]' THEN price END) AS epa_brent_low
              FROM {epa_table}
              GROUP BY start_date
               ),
               curve_values AS (
              SELECT COALESCE(ice_curves.start_date, epa_curves.start_date) AS start_date,
                 jkm,
                 ttf,
                 hh,
                 brent,
                 epa_jkm,
                 epa_ttf,
                 epa_hh,
                 epa_nbp,
                 epa_brent_base,
                 epa_brent_high,
                 epa_brent_low,
                 epa_brent_base * 0.172 AS crude_17_2,
                 epa_brent_base * 0.155 AS crude_15_5,
                 epa_brent_base * 0.14 AS crude_14,
                 epa_brent_base * 0.125 AS crude_12_5,
                 epa_brent_base * 0.10 AS crude_10,
                 CAST(NULL AS DOUBLE) AS euro_coalswitching,
                 epa_brent_base * 0.067 + 1.96 AS china_central_asia,
                epa_brent_base * (CAST(3.15 AS DOUBLE) / CAST(36.6 AS DOUBLE)) AS china_power_of_siberia,
                86000.0 AS spot_chartering_gea,
                (88.0 * 85000.0 / 3800000.0) + (88.0 * epa_hh * 0.0009 * 1.15) AS us_to_jktc_100,
                (0.5 * 88.0 * 85000.0 / 3800000.0) + (88.0 * epa_hh * 0.0009 * 1.15) AS us_to_jktc_50,
                88.0 * epa_hh * 0.0009 * 1.15 AS us_to_jktc_0,
                (32.0 * 85000.0 / 3800000.0) + (32.0 * epa_hh * 0.0009 * 1.15) AS us_to_nwe_100,
                (0.5 * 32.0 * 85000.0 / 3800000.0) + (32.0 * epa_hh * 0.0009 * 1.15) AS us_to_nwe_50,
                32.0 * epa_hh * 0.0009 * 1.15 AS us_to_nwe_0,
                (40.0 * 85000.0 / 3800000.0) + (40.0 * epa_hh * 0.0009 * 1.15) AS me_to_jktc_100,
                (0.5 * 40.0 * 85000.0 / 3800000.0) + (40.0 * epa_hh * 0.0009 * 1.15) AS me_to_jktc_50,
                40.0 * epa_hh * 0.0009 * 1.15 AS me_to_jktc_0,
                (38.0 * 85000.0 / 3800000.0) + (38.0 * epa_hh * 0.0009 * 1.15) AS me_to_nwe_100,
                (0.5 * 38.0 * 85000.0 / 3800000.0) + (38.0 * epa_hh * 0.0009 * 1.15) AS me_to_nwe_50,
                 38.0 * epa_hh * 0.0009 * 1.15 AS me_to_nwe_0
             FROM ice_curves
             FULL OUTER JOIN epa_curves ON epa_curves.start_date = ice_curves.start_date
             )
            SELECT curve_values.*,
                   epa_brent_base * 0.125 AS woodmac_asia_mid_term,
                   1.15 * epa_hh + us_to_jktc_100 AS us_marginal_des_asia_100,
                   1.15 * epa_hh + us_to_jktc_50 AS us_marginal_des_asia_50,
                   1.15 * epa_hh + us_to_jktc_0 AS us_marginal_des_asia_sunk
            FROM curve_values
            ORDER BY start_date
        """
        return fetch_all(query)

    def list_custom_curves(self) -> list[dict[str, Any]]:
        self._ensure_custom_table()
        return fetch_all(f"""
            SELECT curve_id,
                   curve_name,
                   month,
                   fundamental_rationale,
                   curve_1_id,
                   curve_2_id,
                   created_by,
                   created_at,
                   modified_at
            FROM {settings.MID_TERM_CURVE_BUILDER_CUSTOM_TABLE}
            ORDER BY curve_name, month
        """)

    def save_custom_curve(
        self,
        curve_id: str | None,
        curve_name: str,
        months: list[dict[str, Any]],
        created_by: str,
    ) -> str:
        self._ensure_custom_table()
        curve_id = curve_id or str(uuid.uuid4())
        table = settings.MID_TERM_CURVE_BUILDER_CUSTOM_TABLE

        if months:
            exec_one(
                f"UPDATE {table} SET curve_name = ?, modified_at = current_timestamp() WHERE curve_id = ?",
                [curve_name, curve_id],
            )

        batch_size = 50
        for offset in range(0, len(months), batch_size):
            batch = months[offset : offset + batch_size]
            source_queries: list[str] = []
            params: list[Any] = []
            for month in batch:
                source_queries.append(
                    "SELECT ? AS curve_id, ? AS curve_name, ? AS month, "
                    "? AS fundamental_rationale, ? AS curve_1_id, "
                    "? AS curve_2_id, ? AS created_by"
                )
                params.extend(
                    [
                        curve_id,
                        curve_name,
                        month["month"],
                        month["fundamental_rationale"],
                        month["curve_1_id"],
                        month["curve_2_id"],
                        created_by,
                    ]
                )
            exec_one(f"""
                MERGE INTO {table} AS target
                USING ({" UNION ALL ".join(source_queries)}) AS source
                ON target.curve_id = source.curve_id AND target.month = source.month
                WHEN MATCHED THEN UPDATE SET
                    target.curve_name = source.curve_name,
                    target.fundamental_rationale = source.fundamental_rationale,
                    target.curve_1_id = source.curve_1_id,
                    target.curve_2_id = source.curve_2_id,
                    target.modified_at = current_timestamp()
                WHEN NOT MATCHED THEN INSERT (
                    curve_id, curve_name, month, fundamental_rationale,
                    curve_1_id, curve_2_id, created_by, created_at, modified_at
                ) VALUES (
                    source.curve_id, source.curve_name, source.month,
                    source.fundamental_rationale, source.curve_1_id,
                    source.curve_2_id, source.created_by,
                    current_timestamp(), current_timestamp()
                )
            """, params)

        return curve_id

    def delete_custom_curve(self, curve_id: str) -> None:
        self._ensure_custom_table()
        exec_one(
            f"DELETE FROM {settings.MID_TERM_CURVE_BUILDER_CUSTOM_TABLE} WHERE curve_id = ?",
            [curve_id],
        )