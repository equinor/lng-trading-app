from __future__ import annotations

import datetime as dt
import threading
from collections import defaultdict
from dataclasses import dataclass

from app.core.cache import TTLCache
from app.features.lng_balance.regions import (
    DESTINATION_TREE,
    LOADING_TREE,
    build_filter_tree,
)
from app.features.lng_balance.repository import LngBalanceRepository
from app.features.lng_balance.schemas import (
    FiltersResponse,
    ForecastDatesResponse,
    ForecastLine,
    ForecastLinesResponse,
    ForecastPoint,
    Measure,
    MonthPoint,
    OverviewResponse,
    QuarterRow,
    YearRow,
)

# The model tables change at most daily, so one cached snapshot serves every filter combination.
_TTL = 900.0
# A page comparing forecasts asks for a handful of dates, so a request can only name this many.
MAX_FORECAST_LINES = 12
# Whole-page views of past forecasts kept in memory (each side counts separately).
_MAX_AS_FORECAST = 24

Countries = set[str]  # empty means every country


@dataclass(frozen=True)
class _Row:
    country: str
    month: dt.date
    cargoes: float
    kt: float
    model: bool  # any of the month's rows come from the model rather than Kpler actuals


_ZERO = (0.0, 0.0)


def _measure(values: tuple[float, float]) -> Measure:
    return Measure(cargoes=round(values[0], 2), kt=round(values[1], 2))


def _add(a: tuple[float, float], b: tuple[float, float]) -> tuple[float, float]:
    return (a[0] + b[0], a[1] + b[1])


def _sub(a: tuple[float, float], b: tuple[float, float]) -> tuple[float, float]:
    return (a[0] - b[0], a[1] - b[1])


def _month_range(first: int, last: int) -> list[dt.date]:
    return [
        dt.date(year, month, 1)
        for year in range(first, last + 1)
        for month in range(1, 13)
    ]


class LngBalanceService:
    def __init__(self, repo: LngBalanceRepository) -> None:
        self._repo = repo
        self._supply: TTLCache[list[_Row]] = TTLCache(_TTL)
        self._demand: TTLCache[list[_Row]] = TTLCache(_TTL)
        self._dates: TTLCache[list[dt.date]] = TTLCache(_TTL)
        # Monthly rows of one past forecast, by (side, forecast date). A forecast does not change
        # once the day is over, so these are kept; only the newest few dates could still be rebuilt.
        self._vintages: dict[tuple[str, dt.date], list[_Row]] = {}
        self._vintage_lock = threading.Lock()
        self._as_forecast_rows: dict[tuple[str, dt.date], list[_Row]] = {}

    @staticmethod
    def _rows(raw: list[dict]) -> list[_Row]:
        return [
            _Row(
                country=row["country"],
                month=row["month"],
                # Adding 0.0 turns -0.0 into 0.0.
                cargoes=float(row["cargoes"] or 0.0) + 0.0,
                kt=float(row["kt"] or 0.0) + 0.0,
                model=bool(row["model_rows"]),
            )
            for row in raw
        ]

    def _as_forecast(self, side: str, day: dt.date) -> list[_Row]:
        """Rows as they stood on `day`, kept so switching back to a date is instant."""
        with self._vintage_lock:
            key = (side, day)
            if key not in self._as_forecast_rows:
                fetch = (
                    self._repo.supply_as_forecast
                    if side == "supply"
                    else self._repo.demand_as_forecast
                )
                if len(self._as_forecast_rows) >= _MAX_AS_FORECAST:
                    # Dicts keep insertion order, so this drops the oldest entry.
                    self._as_forecast_rows.pop(next(iter(self._as_forecast_rows)))
                self._as_forecast_rows[key] = self._rows(fetch(day))
            return self._as_forecast_rows[key]

    def _load_supply(self) -> list[_Row]:
        return self._supply.get_or_load(
            lambda: self._rows(self._repo.supply_by_month())
        )

    def _load_demand(self) -> list[_Row]:
        return self._demand.get_or_load(
            lambda: self._rows(self._repo.demand_by_month())
        )

    def filters(self) -> FiltersResponse:
        return FiltersResponse(
            loading=build_filter_tree(
                LOADING_TREE, {r.country for r in self._load_supply()}
            ),
            destination=build_filter_tree(
                DESTINATION_TREE, {r.country for r in self._load_demand()}
            ),
        )

    def overview(
        self,
        loading: Countries,
        destination: Countries,
        forecast_date: dt.date | None = None,
    ) -> OverviewResponse:
        """Monthly supply and demand. With `forecast_date`, as it stood on that date: actuals up
        to the day before and that day's forecast after; without it, the latest forecast."""
        if forecast_date is None:
            supply_rows = self._load_supply()
            demand_rows = self._load_demand()
        else:
            if forecast_date not in self.forecast_dates().dates:
                raise ValueError(f"No forecast was created on {forecast_date}")
            supply_rows = self._as_forecast("supply", forecast_date)
            demand_rows = self._as_forecast("demand", forecast_date)
        if not supply_rows or not demand_rows:
            return OverviewResponse(years=[], forecast_from=None, months=[], table=[])

        # Only the years both sides cover, so a partial year at the end of one table (supply runs
        # a few weeks into 2033) does not show up as a year with no demand.
        first = max(
            min(r.month.year for r in supply_rows),
            min(r.month.year for r in demand_rows),
        )
        last = min(
            max(r.month.year for r in supply_rows),
            max(r.month.year for r in demand_rows),
        )
        if first > last:
            return OverviewResponse(years=[], forecast_from=None, months=[], table=[])

        model_months = [r.month for r in (*supply_rows, *demand_rows) if r.model]
        supply = self._by_month(supply_rows, loading)
        demand = self._by_month(demand_rows, destination)

        months = _month_range(first, last)
        return OverviewResponse(
            years=list(range(first, last + 1)),
            forecast_from=min(model_months) if model_months else None,
            months=[
                MonthPoint(
                    month=m,
                    supply=_measure(supply.get(m, _ZERO)),
                    demand=_measure(demand.get(m, _ZERO)),
                )
                for m in months
            ],
            table=self._table(months, supply, demand),
        )

    def forecast_dates(self) -> ForecastDatesResponse:
        def load() -> list[dt.date]:
            by_side: dict[str, set[dt.date]] = defaultdict(set)
            for row in self._repo.forecast_dates():
                by_side[row["side"]].add(row["forecast_date"])
            both = by_side["supply"] & by_side["demand"]
            return sorted(both, reverse=True)

        return ForecastDatesResponse(dates=self._dates.get_or_load(load))

    def forecast_lines(
        self, dates: list[dt.date], loading: Countries, destination: Countries
    ) -> ForecastLinesResponse:
        """Net short by month as it was forecast on each of `dates`, for comparing forecasts."""
        wanted = sorted(set(dates))[:MAX_FORECAST_LINES]
        if not wanted:
            return ForecastLinesResponse(lines=[])
        supply_rows = self._vintage_rows("supply", wanted)
        demand_rows = self._vintage_rows("demand", wanted)

        lines: list[ForecastLine] = []
        for day in wanted:
            supply = self._by_month(supply_rows[day], loading)
            demand = self._by_month(demand_rows[day], destination)
            # A forecast only covers days from its own date onwards, so its first month is
            # incomplete unless it starts on the 1st; that month would look like a false dip.
            partial_first = day.replace(day=1) if day.day > 1 else None
            months = sorted((set(supply) | set(demand)) - {partial_first})
            # Supply can run a year past demand; those months would show supply with no demand.
            if supply and demand:
                cutoff = min(max(supply), max(demand))
                months = [m for m in months if m <= cutoff]
            lines.append(
                ForecastLine(
                    forecast_date=day,
                    months=[
                        ForecastPoint(
                            month=m,
                            net=_measure(
                                _sub(supply.get(m, _ZERO), demand.get(m, _ZERO))
                            ),
                        )
                        for m in months
                    ],
                )
            )
        return ForecastLinesResponse(lines=lines)

    def _vintage_rows(
        self, side: str, dates: list[dt.date]
    ) -> dict[dt.date, list[_Row]]:
        """Monthly rows per forecast date, fetching only the dates not seen before."""
        with self._vintage_lock:
            missing = [d for d in dates if (side, d) not in self._vintages]
            if missing:
                fetch = (
                    self._repo.supply_forecasts
                    if side == "supply"
                    else self._repo.demand_forecasts
                )
                grouped: dict[dt.date, list[_Row]] = {d: [] for d in missing}
                for row in fetch(missing):
                    grouped[row["forecast_date"]].append(
                        _Row(
                            country=row["country"],
                            month=row["month"],
                            cargoes=float(row["cargoes"] or 0.0) + 0.0,
                            kt=float(row["kt"] or 0.0) + 0.0,
                            model=True,
                        )
                    )
                for day, rows in grouped.items():
                    self._vintages[(side, day)] = rows
            return {d: self._vintages[(side, d)] for d in dates}

    @staticmethod
    def _by_month(
        rows: list[_Row], countries: Countries
    ) -> dict[dt.date, tuple[float, float]]:
        totals: dict[dt.date, tuple[float, float]] = defaultdict(lambda: _ZERO)
        for row in rows:
            if not countries or row.country in countries:
                totals[row.month] = _add(totals[row.month], (row.cargoes, row.kt))
        return totals

    @staticmethod
    def _table(
        months: list[dt.date],
        supply: dict[dt.date, tuple[float, float]],
        demand: dict[dt.date, tuple[float, float]],
    ) -> list[YearRow]:
        """Year rows with their quarters. Net is supply minus demand, so a shortfall is negative."""
        quarters: dict[
            tuple[int, int], tuple[tuple[float, float], tuple[float, float]]
        ] = {}
        for m in months:
            key = (m.year, (m.month - 1) // 3 + 1)
            s, d = quarters.get(key, (_ZERO, _ZERO))
            quarters[key] = (
                _add(s, supply.get(m, _ZERO)),
                _add(d, demand.get(m, _ZERO)),
            )

        rows: list[YearRow] = []
        for year in sorted({y for y, _ in quarters}):
            quarter_rows = [
                QuarterRow(
                    quarter=q,
                    supply=_measure(quarters[(year, q)][0]),
                    demand=_measure(quarters[(year, q)][1]),
                    net=_measure(_sub(*quarters[(year, q)])),
                )
                for q in range(1, 5)
                if (year, q) in quarters
            ]
            year_supply = _ZERO
            year_demand = _ZERO
            for q in range(1, 5):
                if (year, q) in quarters:
                    year_supply = _add(year_supply, quarters[(year, q)][0])
                    year_demand = _add(year_demand, quarters[(year, q)][1])
            rows.append(
                YearRow(
                    year=year,
                    supply=_measure(year_supply),
                    demand=_measure(year_demand),
                    net=_measure(_sub(year_supply, year_demand)),
                    quarters=quarter_rows,
                )
            )
        return rows
