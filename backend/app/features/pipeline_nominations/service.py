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
    Source,
)

# The table is small and changes daily, so one cached snapshot serves every filter combination.
_TTL = 900.0
_SHORT_WINDOW_DAYS = 14
_LONG_WINDOW_DAYS = 180
_DAILY_TABLE_DAYS = 14

# Nomination cycles in the order they happen within a gas day.
_CYCLES = ("TI", "EV", "I1", "I2", "I3")
_CYCLE_LABELS = {"TI": "Timely", "EV": "Evening", "I1": "ID1", "I2": "ID2", "I3": "ID3"}
# The cycle data is refreshed from Databricks once an hour.
_CYCLE_TTL = 3600.0
_CYCLE_TABLE_DAYS = 3
_CYCLE_CHART_DAYS = 7

Selection = set[tuple[str, str]]  # (facility, pipeline); empty means everything


@dataclass(frozen=True)
class _Flow:
    facility: str
    pipeline: str
    day: dt.date
    bcf: float
    cycle: str = ""
    carried: bool = False


@dataclass(frozen=True)
class _Nomination:
    facility: str
    pipeline: str
    location_id: int
    gas_day: dt.date
    cycle: str
    bcf: float


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
    groups: list[str] | None,
) -> list[MatrixCell]:
    """Cells with the % change against the previous column, kept only for the `keep` columns.

    With `groups`, the previous value is forgotten when the group changes, so a new day's
    first cycle is not compared with the last cycle of the day before.
    """
    triples: list[tuple[float | None, float | None, bool]] = []
    previous: float | None = None
    for index, value in enumerate(values):
        if groups is not None and index > 0 and groups[index] != groups[index - 1]:
            previous = None
        change = None
        if value is not None and previous:
            change = round((value - previous) / previous * 100, 1)
        triples.append((value, change, carried[index]))
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
    return MatrixTable(columns=[], facilities=[], total=[])


class PipelineNominationsService:
    def __init__(self, repo: PipelineNominationsRepository) -> None:
        self._repo = repo
        self._flows: dict[Source, TTLCache[list[_Flow]]] = {
            "platts": TTLCache(_TTL),
            "woodmac": TTLCache(_TTL),
        }
        self._nominations: TTLCache[list[_Nomination]] = TTLCache(_CYCLE_TTL)

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

    def _load_nominations(self) -> list[_Nomination]:
        def loader() -> list[_Nomination]:
            return [
                _Nomination(
                    facility=row["facility"],
                    pipeline=row["pipeline"] or "Unknown",
                    location_id=int(row["location_id"] or 0),
                    gas_day=row["gas_day"],
                    cycle=row["cycle"],
                    bcf=float(row["bcf"] or 0.0) + 0.0,
                )
                for row in self._repo.woodmac_cycle_rows()
            ]

        return self._nominations.get_or_load(loader)

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
                cycle_series=[],
                cycle_table=_empty_table(),
            )

        latest = max(f.day for f in flows)
        # Columns come from the full dataset so they stay stable while filtering.
        months = self._month_columns(flows, latest)
        days = self._day_columns(flows)
        chosen = [f for f in flows if not selection or (f.facility, f.pipeline) in selection]
        cycle_series, cycle_table = (
            self._cycles(selection) if source == "woodmac" else ([], _empty_table())
        )
        return OverviewResponse(
            latest_date=latest,
            daily_14=self._daily(chosen, latest, _SHORT_WINDOW_DAYS),
            daily_180=self._daily(chosen, latest, _LONG_WINDOW_DAYS),
            monthly_table=self._matrix(chosen, months, _month_key),
            daily_table=self._matrix(chosen, days, _day_key, show_last=_DAILY_TABLE_DAYS),
            cycle_series=cycle_series,
            cycle_table=cycle_table,
        )

    def _cycles(self, selection: Selection) -> tuple[list[CycleSeries], MatrixTable]:
        """The final nomination of each cycle (Timely, Evening, ID1 to ID3) for the latest gas days."""
        nominations = self._load_nominations()
        if not nominations:
            return [], _empty_table()

        flows = self._cycle_flows(nominations)
        chosen = [f for f in flows if not selection or (f.facility, f.pipeline) in selection]
        gas_days = sorted({n.gas_day for n in nominations})
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
                change_within_group=True,
            ),
        )

    @staticmethod
    def _cycle_flows(nominations: list[_Nomination]) -> list[_Flow]:
        """One flow per location, gas day and cycle.

        A location does not publish every cycle. Where it skipped one that did happen for other
        locations that day, its previous nomination still stands, so it is carried forward and
        flagged. Cycles that have not happened yet stay empty.
        """
        reached: dict[dt.date, int] = {}
        published: dict[tuple[str, str, int, dt.date], dict[str, float]] = defaultdict(dict)
        for n in nominations:
            reached[n.gas_day] = max(reached.get(n.gas_day, -1), _CYCLES.index(n.cycle))
            published[(n.facility, n.pipeline, n.location_id, n.gas_day)][n.cycle] = n.bcf

        flows: list[_Flow] = []
        for (facility, pipeline, _, gas_day), by_cycle in published.items():
            current: float | None = None
            for cycle in _CYCLES[: reached[gas_day] + 1]:
                carried = cycle not in by_cycle
                if not carried:
                    current = by_cycle[cycle]
                if current is not None:
                    flows.append(_Flow(facility, pipeline, gas_day, current, cycle, carried))
        return flows

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
            by_facility[facility].append(CyclePoint(gas_day=day, cycle=cycle, bcf=round(bcf, 4)))
        return [CycleSeries(name=name, points=pts) for name, pts in sorted(by_facility.items())]

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
        return [DailySeries(name=name, points=pts) for name, pts in sorted(by_facility.items())]

    @staticmethod
    def _matrix(
        flows: list[_Flow],
        columns: list[ColumnMeta],
        key_of: Callable[[_Flow], str],
        show_last: int | None = None,
        change_within_group: bool = False,
    ) -> MatrixTable:
        """Volume per facility and pipeline for each column, with % change on the previous column."""
        sums: dict[tuple[str, str, str], float] = defaultdict(float)
        carried_at: set[tuple[str, str, str]] = set()
        for f in flows:
            key = (f.facility, f.pipeline, key_of(f))
            sums[key] += f.bcf
            if f.carried:
                carried_at.add(key)

        pipelines: dict[str, set[str]] = defaultdict(set)
        for facility, pipeline, _ in sums:
            pipelines[facility].add(pipeline)

        # % change is computed over every column first, so the first visible column still has
        # a previous value to compare with.
        keep = slice(-show_last, None) if show_last else slice(None)
        groups = [c.group for c in columns] if change_within_group else None
        width = len(columns)

        facility_rows: list[FacilityRow] = []
        facility_values: list[list[float | None]] = []
        facility_carried: list[list[bool]] = []
        for facility in sorted(pipelines):
            names = sorted(pipelines[facility])
            values = {p: [sums.get((facility, p, c.key)) for c in columns] for p in names}
            carried = {p: [(facility, p, c.key) in carried_at for c in columns] for p in names}
            totals = [_sum_or_none([v[i] for v in values.values()]) for i in range(width)]
            totals_carried = [any(c[i] for c in carried.values()) for i in range(width)]
            facility_values.append(totals)
            facility_carried.append(totals_carried)
            facility_rows.append(
                FacilityRow(
                    name=facility,
                    cells=_cells(totals, totals_carried, keep, groups),
                    pipelines=[
                        PipelineRow(name=p, cells=_cells(values[p], carried[p], keep, groups))
                        for p in names
                    ],
                )
            )

        grand_total = [_sum_or_none([v[i] for v in facility_values]) for i in range(width)]
        grand_carried = [any(c[i] for c in facility_carried) for i in range(width)]
        return MatrixTable(
            columns=columns[keep],
            facilities=facility_rows,
            total=_cells(grand_total, grand_carried, keep, groups),
        )
