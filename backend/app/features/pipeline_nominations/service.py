from __future__ import annotations

import calendar
import datetime as dt
import threading
import time
from collections import defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass

from app.core.cache import TTLCache
from app.core.config import settings
from app.features.pipeline_nominations.ai_overview import build_prompt
from app.features.pipeline_nominations.repository import (
    HISTORY_MONTHS,
    PipelineNominationsRepository,
)
from app.features.pipeline_nominations.schemas import (
    AiOverviewResponse,
    ColumnMeta,
    CyclePoint,
    CycleSeries,
    DailyPoint,
    DailySeries,
    FacilityFilter,
    FacilityRow,
    FiltersResponse,
    MatrixCell,
    MatrixTable,
    OverviewResponse,
    PipelineRow,
    RegionTotal,
)

# The table is small and changes daily, so one cached snapshot serves every filter combination.
_TTL = 900.0
_SHORT_WINDOW_DAYS = 14
_LONG_WINDOW_DAYS = 180
_DAILY_TABLE_DAYS = 14

# Nomination cycles in the order they happen within a gas day. "PO" is the post-day figure that
# the gold table adds once the gas day is over.
_CYCLES = ("TI", "EV", "I1", "I2", "I3", "PO")
_CYCLE_LABELS = {
    "TI": "Timely",
    "EV": "Evening",
    "I1": "ID1",
    "I2": "ID2",
    "I3": "ID3",
    "PO": "Post",
}
# The cycle data is refreshed from Databricks once an hour.
_CYCLE_TTL = 3600.0
_CYCLE_TABLE_DAYS = 3
_CYCLE_CHART_DAYS = 7
# Generated overviews are kept for an hour so repeated clicks do not call the model again.
_AI_TTL = 3600.0

# The gold table covers the US plants plus these two (LNG Canada and Costa Azul LNG in Mexico),
# which the page shows apart from the US ones. Matched by substring so a renamed plant still fits.
_NON_US_PLANTS = ("lng canada", "costa azul")
REGIONS = ("US", "Non-US")

Selection = set[tuple[str, str]]  # (facility, pipeline); empty means everything


def region_of(facility: str) -> str:
    lowered = facility.lower()
    return "Non-US" if any(p in lowered for p in _NON_US_PLANTS) else "US"


def _by_region(facilities: Iterable[str]) -> list[str]:
    """US facilities first, then the rest, alphabetical within each region."""
    return sorted(facilities, key=lambda name: (REGIONS.index(region_of(name)), name))


@dataclass(frozen=True)
class _Flow:
    facility: str
    pipeline: str
    day: dt.date
    bcf: float
    cycle: str = ""
    carried: bool = False


def _month_key(flow: _Flow) -> str:
    return f"{flow.day.year}-{flow.day.month:02d}"


def _day_key(flow: _Flow) -> str:
    return flow.day.isoformat()


def _cycle_key(flow: _Flow) -> str:
    return f"{flow.day.isoformat()}-{flow.cycle}"


def _cells(
    values: list[float | None],
    carried: list[bool],
    keep: slice,
    skip_blank: bool,
) -> list[MatrixCell]:
    """Cells with the % change against the previous column, kept only for the `keep` columns.

    With `skip_blank` (the cycle view), the comparison is with the previous column that has a
    value, so cycles that were not published are skipped, also across days.
    """
    triples: list[tuple[float | None, float | None, bool]] = []
    previous: float | None = None
    for index, value in enumerate(values):
        change = None
        if value is not None and previous:
            change = round((value - previous) / previous * 100, 1)
        triples.append((value, change, carried[index]))
        if value is not None or not skip_blank:
            previous = value
    return [
        MatrixCell(
            bcf=None if value is None else round(value, 4),
            change_pct=change,
            carried=is_carried and value is not None,
        )
        for value, change, is_carried in triples[keep]
    ]


def _sum_or_none(values: list[float | None]) -> float | None:
    present = [v for v in values if v is not None]
    return sum(present) if present else None


def _empty_table() -> MatrixTable:
    return MatrixTable(columns=[], facilities=[], region_totals=[], total=[])


class PipelineNominationsService:
    def __init__(self, repo: PipelineNominationsRepository) -> None:
        self._repo = repo
        self._flows: TTLCache[list[_Flow]] = TTLCache(_TTL)
        self._nominations: TTLCache[list[_Flow]] = TTLCache(_CYCLE_TTL)
        self._ai: dict[tuple, tuple[float, AiOverviewResponse]] = {}
        self._ai_lock = threading.Lock()

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

    def _load_nominations(self) -> list[_Flow]:
        """One flow per plant, pipeline, gas day and cycle, flagged when a meter was carried."""

        def loader() -> list[_Flow]:
            return [
                _Flow(
                    facility=row["facility"],
                    pipeline=row["pipeline"] or "Unknown",
                    day=row["gas_day"],
                    bcf=float(row["bcf"] or 0.0) + 0.0,
                    cycle=row["cycle"],
                    carried=bool(row["carried"]),
                )
                for row in self._repo.woodmac_cycle_rows()
            ]

        return self._nominations.get_or_load(loader)

    def filters(self) -> FiltersResponse:
        flows = self._load()
        pipelines: dict[str, set[str]] = defaultdict(set)
        for flow in flows:
            pipelines[flow.facility].add(flow.pipeline)
        return FiltersResponse(
            latest_date=max((f.day for f in flows), default=None),
            facilities=[
                FacilityFilter(
                    name=name, region=region_of(name), pipelines=sorted(pipelines[name])
                )
                for name in _by_region(pipelines)
            ],
        )

    def overview(self, selection: Selection) -> OverviewResponse:
        flows = self._load()
        if not flows:
            return OverviewResponse(
                latest_date=None,
                daily_14=[],
                daily_180=[],
                monthly_table=_empty_table(),
                daily_table=_empty_table(),
                cycle_series=[],
                cycle_table=_empty_table(),
            )

        latest = max(f.day for f in flows)
        # Columns come from the full dataset so they stay stable while filtering.
        months = self._month_columns(flows, latest)
        days = self._day_columns(flows)
        chosen = [
            f for f in flows if not selection or (f.facility, f.pipeline) in selection
        ]
        cycle_series, cycle_table = self._cycles(selection)
        return OverviewResponse(
            latest_date=latest,
            daily_14=self._daily(chosen, latest, _SHORT_WINDOW_DAYS),
            daily_180=self._daily(chosen, latest, _LONG_WINDOW_DAYS),
            monthly_table=self._matrix(
                chosen, months, _month_key, days_per_column=self._days_per_month(flows)
            ),
            daily_table=self._matrix(
                chosen, days, _day_key, show_last=_DAILY_TABLE_DAYS
            ),
            cycle_series=cycle_series,
            cycle_table=cycle_table,
        )

    def ai_overview(
        self, selection: Selection, refresh: bool = False
    ) -> AiOverviewResponse:
        """A short written summary of the overview data, generated by the serving endpoint."""
        overview = self.overview(selection)
        names = sorted(f"{facility} / {pipeline}" for facility, pipeline in selection)
        key = (tuple(names), overview.latest_date)
        with self._ai_lock:
            cached = self._ai.get(key)
            if cached and not refresh and time.monotonic() - cached[0] < _AI_TTL:
                return cached[1]
            text = self._repo.ai_overview(build_prompt(overview, names))
            if not text:
                raise RuntimeError("The model returned no text")
            result = AiOverviewResponse(
                text=text,
                model=settings.PIPELINE_NOMINATIONS_AI_ENDPOINT,
                latest_date=overview.latest_date,
                generated_at=dt.datetime.now(dt.timezone.utc),
            )
            self._ai[key] = (time.monotonic(), result)
            return result

    def _cycles(self, selection: Selection) -> tuple[list[CycleSeries], MatrixTable]:
        """The final nomination of each cycle (Timely, Evening, ID1 to ID3, Post) for the latest gas days."""
        flows = self._load_nominations()
        if not flows:
            return [], _empty_table()

        chosen = [
            f for f in flows if not selection or (f.facility, f.pipeline) in selection
        ]
        gas_days = sorted({f.day for f in flows})
        columns = [
            ColumnMeta(
                key=f"{day.isoformat()}-{cycle}",
                group=f"{calendar.month_abbr[day.month]} {day.day}",
                label=_CYCLE_LABELS[cycle],
                partial=False,
            )
            for day in gas_days
            for cycle in _CYCLES
        ]
        return (
            self._cycle_series(chosen, gas_days[-_CYCLE_CHART_DAYS:]),
            self._matrix(
                chosen,
                columns,
                _cycle_key,
                show_last=_CYCLE_TABLE_DAYS * len(_CYCLES),
                skip_blank=True,
            ),
        )

    @staticmethod
    def _cycle_series(flows: list[_Flow], gas_days: list[dt.date]) -> list[CycleSeries]:
        wanted = set(gas_days)
        totals: dict[tuple[str, dt.date, str], float] = defaultdict(float)
        for f in flows:
            if f.day in wanted:
                totals[(f.facility, f.day, f.cycle)] += f.bcf

        by_facility: dict[str, list[CyclePoint]] = defaultdict(list)
        for (facility, day, cycle), bcf in sorted(
            totals.items(), key=lambda item: (item[0][1], _CYCLES.index(item[0][2]))
        ):
            by_facility[facility].append(
                CyclePoint(gas_day=day, cycle=cycle, bcf=round(bcf, 4))
            )
        return [
            CycleSeries(name=name, points=pts)
            for name, pts in sorted(by_facility.items())
        ]

    @staticmethod
    def _month_columns(flows: list[_Flow], latest: dt.date) -> list[ColumnMeta]:
        keys = sorted({(f.day.year, f.day.month) for f in flows})[-HISTORY_MONTHS:]
        last_day = calendar.monthrange(latest.year, latest.month)[1]
        return [
            ColumnMeta(
                key=f"{year}-{month:02d}",
                group=str(year),
                label=calendar.month_abbr[month],
                partial=(year, month) == (latest.year, latest.month)
                and latest.day < last_day,
            )
            for year, month in keys
        ]

    @staticmethod
    def _days_per_month(flows: list[_Flow]) -> dict[str, int]:
        """Days with data in each month, from the full dataset so the filter does not change it."""
        days: dict[str, set[dt.date]] = defaultdict(set)
        for f in flows:
            days[_month_key(f)].add(f.day)
        return {month: len(values) for month, values in days.items()}

    @staticmethod
    def _day_columns(flows: list[_Flow]) -> list[ColumnMeta]:
        return [
            ColumnMeta(
                key=day.isoformat(),
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
        return [
            DailySeries(name=name, points=pts)
            for name, pts in sorted(by_facility.items())
        ]

    @staticmethod
    def _matrix(
        flows: list[_Flow],
        columns: list[ColumnMeta],
        key_of: Callable[[_Flow], str],
        show_last: int | None = None,
        skip_blank: bool = False,
        days_per_column: dict[str, int] | None = None,
    ) -> MatrixTable:
        """Volume per facility and pipeline for each column, with % change on the previous column.

        With `days_per_column`, each column holds the average per day instead of the sum.
        """
        sums: dict[tuple[str, str, str], float] = defaultdict(float)
        carried_at: set[tuple[str, str, str]] = set()
        for f in flows:
            key = (f.facility, f.pipeline, key_of(f))
            sums[key] += f.bcf
            if f.carried:
                carried_at.add(key)
        if days_per_column:
            for key in sums:
                sums[key] /= days_per_column.get(key[2]) or 1

        pipelines: dict[str, set[str]] = defaultdict(set)
        for facility, pipeline, _ in sums:
            pipelines[facility].add(pipeline)

        # % change is computed over every column first, so the first visible column still has
        # a previous value to compare with.
        keep = slice(-show_last, None) if show_last else slice(None)
        width = len(columns)

        facility_rows: list[FacilityRow] = []
        facility_values: list[list[float | None]] = []
        facility_carried: list[list[bool]] = []
        for facility in _by_region(pipelines):
            names = sorted(pipelines[facility])
            values = {
                p: [sums.get((facility, p, c.key)) for c in columns] for p in names
            }
            carried = {
                p: [(facility, p, c.key) in carried_at for c in columns] for p in names
            }
            totals = [
                _sum_or_none([v[i] for v in values.values()]) for i in range(width)
            ]
            totals_carried = [any(c[i] for c in carried.values()) for i in range(width)]
            facility_values.append(totals)
            facility_carried.append(totals_carried)
            facility_rows.append(
                FacilityRow(
                    name=facility,
                    region=region_of(facility),
                    cells=_cells(totals, totals_carried, keep, skip_blank),
                    pipelines=[
                        PipelineRow(
                            name=p,
                            cells=_cells(values[p], carried[p], keep, skip_blank),
                        )
                        for p in names
                    ],
                )
            )

        region_totals: list[RegionTotal] = []
        for region in REGIONS:
            members = [i for i, row in enumerate(facility_rows) if row.region == region]
            if not members:
                continue
            region_values = [
                _sum_or_none([facility_values[i][c] for i in members])
                for c in range(width)
            ]
            region_carried = [
                any(facility_carried[i][c] for i in members) for c in range(width)
            ]
            region_totals.append(
                RegionTotal(
                    region=region,
                    cells=_cells(region_values, region_carried, keep, skip_blank),
                )
            )

        grand_total = [
            _sum_or_none([v[i] for v in facility_values]) for i in range(width)
        ]
        grand_carried = [any(c[i] for c in facility_carried) for i in range(width)]
        return MatrixTable(
            columns=columns[keep],
            facilities=facility_rows,
            region_totals=region_totals,
            total=_cells(grand_total, grand_carried, keep, skip_blank),
        )
