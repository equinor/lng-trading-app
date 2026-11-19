from __future__ import annotations

import datetime as dt
from typing import Any

from app.core.config import settings
from app.core.databricks import fetch_all


class LngBalanceRepository:
    """SQL access to the LNG balance model tables. Both sides return the same row shape."""

    def supply_by_month(self) -> list[dict[str, Any]]:
        """Supply per loading country and month, in cargoes and kt."""
        return fetch_all(self._monthly_query(settings.LNG_BALANCE_SUPPLY_TABLE))

    def demand_by_month(self) -> list[dict[str, Any]]:
        """Demand per destination country and month, in cargoes and kt."""
        return fetch_all(self._monthly_query(settings.LNG_BALANCE_DEMAND_TABLE))

    @staticmethod
    def _monthly_query(table: str) -> str:
        # The daily rows are summed to months here, which keeps the cached snapshot small.
        # `model_rows` counts rows from the model, as opposed to Kpler actuals.
        return f"""
            SELECT country_name AS country,
                   CAST(date_trunc('MONTH', Date) AS DATE) AS month,
                   SUM(cargoes) AS cargoes,
                   SUM(value_kt) AS kt,
                   SUM(CASE WHEN source = 'LNG Model' THEN 1 ELSE 0 END) AS model_rows
            FROM {table}
            WHERE country_name IS NOT NULL AND Date IS NOT NULL
            GROUP BY country_name, CAST(date_trunc('MONTH', Date) AS DATE)
        """

    def supply_as_forecast(self, forecast_date: dt.date) -> list[dict[str, Any]]:
        """Supply per country and month as it stood on `forecast_date`: actuals, then that forecast."""
        return fetch_all(
            self._as_forecast_query(
                settings.LNG_BALANCE_SUPPLY_TABLE,
                settings.LNG_BALANCE_SUPPLY_HISTORY_TABLE,
                forecast_date,
            )
        )

    def demand_as_forecast(self, forecast_date: dt.date) -> list[dict[str, Any]]:
        """Demand per country and month as it stood on `forecast_date`."""
        return fetch_all(
            self._as_forecast_query(
                settings.LNG_BALANCE_DEMAND_TABLE,
                settings.LNG_BALANCE_DEMAND_HISTORY_TABLE,
                forecast_date,
            )
        )

    @staticmethod
    def _as_forecast_query(latest: str, history: str, forecast_date: dt.date) -> str:
        # Days before the forecast date come from the latest table, which holds what happened,
        # and days from the forecast date on come from that day's snapshot. `model_rows` counts the
        # snapshot rows, which is what the page shades as forecast. The date is a parsed `date`
        # object, so inlining its ISO form is safe.
        day = f"DATE'{forecast_date.isoformat()}'"
        return f"""
            SELECT country,
                   CAST(date_trunc('MONTH', Date) AS DATE) AS month,
                   SUM(cargoes) AS cargoes,
                   SUM(value_kt) AS kt,
                   SUM(is_forecast) AS model_rows
            FROM (
                SELECT country_name AS country, Date, cargoes, value_kt, 0 AS is_forecast
                FROM {latest}
                WHERE country_name IS NOT NULL AND Date < {day}
                UNION ALL
                SELECT country_name AS country, Date, cargoes, value_kt, 1 AS is_forecast
                FROM {history}
                WHERE country_name IS NOT NULL AND Date IS NOT NULL
                  AND forecast_date = {day}
            )
            GROUP BY country, CAST(date_trunc('MONTH', Date) AS DATE)
        """

    def forecast_dates(self) -> list[dict[str, Any]]:
        """Every `forecast_date` in each history table, one row per table and date."""
        return [
            *(
                {"side": "supply", **row}
                for row in fetch_all(
                    f"SELECT DISTINCT forecast_date FROM {settings.LNG_BALANCE_SUPPLY_HISTORY_TABLE}"
                )
            ),
            *(
                {"side": "demand", **row}
                for row in fetch_all(
                    f"SELECT DISTINCT forecast_date FROM {settings.LNG_BALANCE_DEMAND_HISTORY_TABLE}"
                )
            ),
        ]

    def supply_forecasts(self, dates: list[dt.date]) -> list[dict[str, Any]]:
        """Monthly supply per country as forecast on each of `dates`."""
        return fetch_all(
            self._forecast_query(settings.LNG_BALANCE_SUPPLY_HISTORY_TABLE, dates)
        )

    def demand_forecasts(self, dates: list[dt.date]) -> list[dict[str, Any]]:
        """Monthly demand per country as forecast on each of `dates`."""
        return fetch_all(
            self._forecast_query(settings.LNG_BALANCE_DEMAND_HISTORY_TABLE, dates)
        )

    @staticmethod
    def _forecast_query(table: str, dates: list[dt.date]) -> str:
        # The dates are parsed `date` objects, so inlining their ISO form is safe.
        listed = ", ".join(f"DATE'{d.isoformat()}'" for d in dates)
        return f"""
            SELECT forecast_date,
                   country_name AS country,
                   CAST(date_trunc('MONTH', Date) AS DATE) AS month,
                   SUM(cargoes) AS cargoes,
                   SUM(value_kt) AS kt
            FROM {table}
            WHERE forecast_date IN ({listed})
              AND country_name IS NOT NULL AND Date IS NOT NULL
            GROUP BY forecast_date, country_name, CAST(date_trunc('MONTH', Date) AS DATE)
        """
