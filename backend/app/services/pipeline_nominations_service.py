from __future__ import annotations

import calendar
import datetime as dt
from collections import defaultdict
from dataclasses import dataclass

from app.core.cache import TTLCache
from app.repositories.pipeline_nominations_repository import (
    HISTORY_MONTHS,
    PipelineNominationsRepository,
)
from app.schemas.pipeline_nominations import (
    DailyPoint,
    DailySeries,
    FacilityFilter,
    FacilityRow,
    FiltersResponse,
    MonthCell,
    MonthlyTable,
    MonthMeta,
    OverviewResponse,
    PipelineRow,
)

# The table is small and changes daily, so one cached snapshot serves every filter combination.
_TTL = 900.0
_SHORT_WINDOW_DAYS = 14
_LONG_WINDOW_DAYS = 180

Selection = set[tuple[str, str]]  # (facility, pipeline); empty means everything


@dataclass(frozen=True)
class _Flow:
    facility: str
    pipeline: str
    day: dt.date
    bcf: float


def _month_key(day: dt.date) -> str:
    return f"{day.year}-{day.month:02d}"


def _cells(values: list[float | None]) -> list[MonthCell]:
    cells: list[MonthCell] = []
    previous: float | None = None
    for value in values:
        mom = None
        if value is not None and previous:
            mom = round((value - previous) / previous * 100, 1)
        cells.append(MonthCell(bcf=None if value is None else round(value, 4), mom_pct=mom))
        previous = value
    return cells


def _sum_or_none(values: list[float | None]) -> float | None:
    present = [v for v in values if v is not None]
    return sum(present) if present else None


class PipelineNominationsService:
    def __init__(self, repo: PipelineNominationsRepository) -> None:
        self._repo = repo
        self._flows: TTLCache[list[_Flow]] = TTLCache(_TTL)

    def _load(self) -> list[_Flow]:
        def loader() -> list[_Flow]:
            return [
                _Flow(
                    facility=row["facility"],
                    pipeline=row["pipeline"] or "Unknown",
                    day=row["flow_date"],
                    # Adding 0.0 turns -0.0 into 0.0.
                    bcf=float(row["bcf"] or 0.0) + 0.0,
                )
                for row in self._repo.daily_by_pipeline()
            ]

        return self._flows.get_or_load(loader)

    def filters(self) -> FiltersResponse:
        flows = self._load()
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

    def overview(self, selection: Selection) -> OverviewResponse:
        flows = self._load()
        if not flows:
            return OverviewResponse(
                latest_date=None,
                daily_14=[],
                daily_180=[],
                monthly=MonthlyTable(months=[], facilities=[], total=[]),
            )

        latest = max(f.day for f in flows)
        # Month columns come from the full dataset so they stay stable while filtering.
        months = self._months(flows, latest)
        chosen = [f for f in flows if not selection or (f.facility, f.pipeline) in selection]
        return OverviewResponse(
            latest_date=latest,
            daily_14=self._daily(chosen, latest, _SHORT_WINDOW_DAYS),
            daily_180=self._daily(chosen, latest, _LONG_WINDOW_DAYS),
            monthly=self._monthly(chosen, months),
        )

    @staticmethod
    def _months(flows: list[_Flow], latest: dt.date) -> list[MonthMeta]:
        keys = sorted({(f.day.year, f.day.month) for f in flows})[-HISTORY_MONTHS:]
        last_day = calendar.monthrange(latest.year, latest.month)[1]
        return [
            MonthMeta(
                key=f"{year}-{month:02d}",
                year=year,
                month=month,
                label=calendar.month_abbr[month],
                partial=(year, month) == (latest.year, latest.month) and latest.day < last_day,
            )
            for year, month in keys
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
    def _monthly(flows: list[_Flow], months: list[MonthMeta]) -> MonthlyTable:
        sums: dict[tuple[str, str, str], float] = defaultdict(float)
        for f in flows:
            sums[(f.facility, f.pipeline, _month_key(f.day))] += f.bcf

        pipelines: dict[str, set[str]] = defaultdict(set)
        for facility, pipeline, _ in sums:
            pipelines[facility].add(pipeline)

        def series(facility: str, pipeline: str) -> list[float | None]:
            return [sums.get((facility, pipeline, m.key)) for m in months]

        facility_rows: list[FacilityRow] = []
        facility_values: list[list[float | None]] = []
        for facility in sorted(pipelines):
            pipeline_values = {p: series(facility, p) for p in sorted(pipelines[facility])}
            totals = [
                _sum_or_none([v[i] for v in pipeline_values.values()]) for i in range(len(months))
            ]
            facility_values.append(totals)
            facility_rows.append(
                FacilityRow(
                    name=facility,
                    cells=_cells(totals),
                    pipelines=[PipelineRow(name=p, cells=_cells(v)) for p, v in pipeline_values.items()],
                )
            )

        grand_total = [
            _sum_or_none([v[i] for v in facility_values]) for i in range(len(months))
        ]
        return MonthlyTable(months=months, facilities=facility_rows, total=_cells(grand_total))
