from __future__ import annotations

import calendar
import datetime as dt
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass

from app.core.cache import TTLCache
from app.features.pipeline_nominations.repository import (
    HISTORY_MONTHS,
    PipelineNominationsRepository,
)
from app.features.pipeline_nominations.schemas import (
    ColumnMeta,
    DailyPoint,
    DailySeries,
    FacilityFilter,
    FacilityRow,
    FiltersResponse,
    MatrixCell,
    MatrixTable,
    OverviewResponse,
    PipelineRow,
    Source,
)

# The table is small and changes daily, so one cached snapshot serves every filter combination.
_TTL = 900.0
_SHORT_WINDOW_DAYS = 14
_LONG_WINDOW_DAYS = 180
_DAILY_TABLE_DAYS = 14

Selection = set[tuple[str, str]]  # (facility, pipeline); empty means everything


@dataclass(frozen=True)
class _Flow:
    facility: str
    pipeline: str
    day: dt.date
    bcf: float


def _month_key(day: dt.date) -> str:
    return f"{day.year}-{day.month:02d}"


def _day_key(day: dt.date) -> str:
    return day.isoformat()


def _cells(values: list[float | None], keep: slice) -> list[MatrixCell]:
    """Cells with the % change against the previous column, kept only for the `keep` columns."""
    pairs: list[tuple[float | None, float | None]] = []
    previous: float | None = None
    for value in values:
        change = None
        if value is not None and previous:
            change = round((value - previous) / previous * 100, 1)
        pairs.append((value, change))
        previous = value
    return [
        MatrixCell(bcf=None if value is None else round(value, 4), change_pct=change)
        for value, change in pairs[keep]
    ]


def _sum_or_none(values: list[float | None]) -> float | None:
    present = [v for v in values if v is not None]
    return sum(present) if present else None


def _empty_table() -> MatrixTable:
    return MatrixTable(columns=[], facilities=[], total=[])


class PipelineNominationsService:
    def __init__(self, repo: PipelineNominationsRepository) -> None:
        self._repo = repo
        self._flows: dict[Source, TTLCache[list[_Flow]]] = {
            "platts": TTLCache(_TTL),
            "woodmac": TTLCache(_TTL),
        }

    def _load(self, source: Source) -> list[_Flow]:
        def loader() -> list[_Flow]:
            return [
                _Flow(
                    facility=row["facility"],
                    pipeline=row["pipeline"] or "Unknown",
                    day=row["flow_date"],
                    # Adding 0.0 turns -0.0 into 0.0.
                    bcf=float(row["bcf"] or 0.0) + 0.0,
                )
                for row in self._repo.daily_by_pipeline(source)
            ]

        return self._flows[source].get_or_load(loader)

    def filters(self, source: Source) -> FiltersResponse:
        flows = self._load(source)
        pipelines: dict[str, set[str]] = defaultdict(set)
        for flow in flows:
            pipelines[flow.facility].add(flow.pipeline)
        return FiltersResponse(
            latest_date=max((f.day for f in flows), default=None),
            facilities=[
                FacilityFilter(name=name, pipelines=sorted(names))
                for name, names in sorted(pipelines.items())
            ],
        )

    def overview(self, source: Source, selection: Selection) -> OverviewResponse:
        flows = self._load(source)
        if not flows:
            return OverviewResponse(
                latest_date=None,
                daily_14=[],
                daily_180=[],
                monthly_table=_empty_table(),
                daily_table=_empty_table(),
            )

        latest = max(f.day for f in flows)
        # Columns come from the full dataset so they stay stable while filtering.
        months = self._month_columns(flows, latest)
        days = self._day_columns(flows)
        chosen = [f for f in flows if not selection or (f.facility, f.pipeline) in selection]
        return OverviewResponse(
            latest_date=latest,
            daily_14=self._daily(chosen, latest, _SHORT_WINDOW_DAYS),
            daily_180=self._daily(chosen, latest, _LONG_WINDOW_DAYS),
            monthly_table=self._matrix(chosen, months, _month_key),
            daily_table=self._matrix(chosen, days, _day_key, show_last=_DAILY_TABLE_DAYS),
        )

    @staticmethod
    def _month_columns(flows: list[_Flow], latest: dt.date) -> list[ColumnMeta]:
        keys = sorted({(f.day.year, f.day.month) for f in flows})[-HISTORY_MONTHS:]
        last_day = calendar.monthrange(latest.year, latest.month)[1]
        return [
            ColumnMeta(
                key=f"{year}-{month:02d}",
                group=str(year),
                label=calendar.month_abbr[month],
                partial=(year, month) == (latest.year, latest.month) and latest.day < last_day,
            )
            for year, month in keys
        ]

    @staticmethod
    def _day_columns(flows: list[_Flow]) -> list[ColumnMeta]:
        return [
            ColumnMeta(
                key=_day_key(day),
                group=f"{calendar.month_abbr[day.month]} {day.year}",
                label=str(day.day),
                partial=False,
            )
            for day in sorted({f.day for f in flows})
        ]

    @staticmethod
    def _daily(flows: list[_Flow], latest: dt.date, days: int) -> list[DailySeries]:
        start = latest - dt.timedelta(days=days - 1)
        totals: dict[tuple[str, dt.date], float] = defaultdict(float)
        for f in flows:
            if f.day >= start:
                totals[(f.facility, f.day)] += f.bcf

        by_facility: dict[str, list[DailyPoint]] = defaultdict(list)
        for (facility, day), bcf in sorted(totals.items(), key=lambda item: item[0][1]):
            by_facility[facility].append(DailyPoint(flow_date=day, bcf=round(bcf, 4)))
        return [DailySeries(name=name, points=pts) for name, pts in sorted(by_facility.items())]

    @staticmethod
    def _matrix(
        flows: list[_Flow],
        columns: list[ColumnMeta],
        key_of: Callable[[dt.date], str],
        show_last: int | None = None,
    ) -> MatrixTable:
        """Volume per facility and pipeline for each column, with % change on the previous column."""
        sums: dict[tuple[str, str, str], float] = defaultdict(float)
        for f in flows:
            sums[(f.facility, f.pipeline, key_of(f.day))] += f.bcf

        pipelines: dict[str, set[str]] = defaultdict(set)
        for facility, pipeline, _ in sums:
            pipelines[facility].add(pipeline)

        # % change is computed over every column first, so the first visible column still has
        # a previous value to compare with.
        keep = slice(-show_last, None) if show_last else slice(None)

        def series(facility: str, pipeline: str) -> list[float | None]:
            return [sums.get((facility, pipeline, c.key)) for c in columns]

        facility_rows: list[FacilityRow] = []
        facility_values: list[list[float | None]] = []
        for facility in sorted(pipelines):
            pipeline_values = {p: series(facility, p) for p in sorted(pipelines[facility])}
            totals = [
                _sum_or_none([v[i] for v in pipeline_values.values()]) for i in range(len(columns))
            ]
            facility_values.append(totals)
            facility_rows.append(
                FacilityRow(
                    name=facility,
                    cells=_cells(totals, keep),
                    pipelines=[
                        PipelineRow(name=p, cells=_cells(v, keep))
                        for p, v in pipeline_values.items()
                    ],
                )
            )

        grand_total = [
            _sum_or_none([v[i] for v in facility_values]) for i in range(len(columns))
        ]
        return MatrixTable(
            columns=columns[keep], facilities=facility_rows, total=_cells(grand_total, keep)
        )
