from __future__ import annotations

from app.features.pipeline_nominations.schemas import (
    MatrixCell,
    MatrixTable,
    OverviewResponse,
)

_MOVERS = 6
_RECENT_MONTHS = 4

PROMPT_INSTRUCTIONS = """You are an analyst's assistant for a US LNG gas trading desk. \
Using ONLY the data below, write a short overview of US LNG feedgas pipeline nominations.

Format (plain text only, no markdown, no tables, no bold):
- First line: one headline sentence with the total feedgas level (BCF/d) and its direction.
- Then 4 to 6 lines, each starting with "- ", covering in this order where the data allows:
  total level and trend over the last 14 days, the biggest facility movers, pipelines with notable \
day-on-day moves, intraday cycle revisions for the latest gas day, month-on-month change.
- Flag anything unusual such as a facility dropping to or near zero, or a sharp swing.
- "n/a" means the source published no value for that day. It is not zero and not an outage, so \
do not describe it as one; at most say the data is missing.
- Quote numbers in BCF/d with 2 decimals and percentages as whole numbers.
- Do not speculate about causes, prices or events that are not in the data. If a section has no data, skip it.
- Keep the whole answer under 170 words.

DATA
"""


def _bcf(cell: MatrixCell | None) -> float | None:
    return None if cell is None else cell.bcf


def _fmt(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.2f}"


def _signed_pct(value: float) -> str:
    rounded = round(value)
    return f"{rounded:+d}%" if rounded else "0%"


def _pct(new: float | None, old: float | None) -> str:
    if new is None or not old:
        return "n/a"
    return _signed_pct((new - old) / old * 100)


def _average(values: list[float | None]) -> float | None:
    present = [v for v in values if v is not None]
    return sum(present) / len(present) if present else None


def _chg(cell: MatrixCell) -> str:
    return "n/a" if cell.change_pct is None else _signed_pct(cell.change_pct)


def _daily_lines(table: MatrixTable) -> list[str]:
    if not table.columns:
        return []
    labels = [c.key for c in table.columns]
    lines = ["Total by gas day, oldest to newest (BCF/d, % change on previous day):"]
    lines.append(
        "; ".join(
            f"{label} {_fmt(cell.bcf)} ({_chg(cell)})"
            for label, cell in zip(labels, table.total, strict=False)
        )
    )
    lines.append(
        "By facility (latest day, previous day, 7-day average vs the 7 days before):"
    )
    for facility in table.facilities:
        cells = [_bcf(c) for c in facility.cells]
        latest, previous = cells[-1], cells[-2] if len(cells) > 1 else None
        recent, before = _average(cells[-7:]), _average(cells[-14:-7])
        lines.append(
            f"- {facility.name}: latest {_fmt(latest)}, previous {_fmt(previous)} "
            f"({_pct(latest, previous)}), 7-day avg {_fmt(recent)} vs {_fmt(before)} "
            f"({_pct(recent, before)})"
        )
    return lines


def _pipeline_movers(table: MatrixTable) -> list[str]:
    moves: list[tuple[float, str]] = []
    for facility in table.facilities:
        for pipeline in facility.pipelines:
            if len(pipeline.cells) < 2:
                continue
            latest, previous = _bcf(pipeline.cells[-1]), _bcf(pipeline.cells[-2])
            if latest is None or previous is None:
                continue
            delta = latest - previous
            moves.append(
                (
                    abs(delta),
                    f"- {facility.name} / {pipeline.name}: {_fmt(previous)} -> {_fmt(latest)} "
                    f"({delta:+.2f})",
                )
            )
    moves.sort(key=lambda m: m[0], reverse=True)
    if not moves:
        return []
    return [
        "Largest pipeline moves, latest day vs previous day:",
        *[m[1] for m in moves[:_MOVERS]],
    ]


def _monthly_lines(table: MatrixTable) -> list[str]:
    columns = table.columns[-_RECENT_MONTHS:]
    if not columns:
        return []
    offset = len(table.columns) - len(columns)
    lines = ["Monthly average per day (BCF/d, % change on previous month):"]
    lines.append(
        "; ".join(
            f"{c.group} {c.label}{' (partial month, average of the days so far)' if c.partial else ''} "
            f"{_fmt(table.total[offset + i].bcf)} ({_chg(table.total[offset + i])})"
            for i, c in enumerate(columns)
        )
    )
    return lines


def _cycle_lines(table: MatrixTable) -> list[str]:
    if not table.facilities or not table.columns:
        return []
    day = table.columns[-1].group
    indexes = [i for i, c in enumerate(table.columns) if c.group == day]
    labels = [table.columns[i].label for i in indexes]
    lines = [
        f"Intraday cycles for gas day {day} (Timely, Evening, ID1 to ID3 final nominations; Post is the after-day figure):"
    ]
    lines.append(
        "Total by cycle: "
        + "; ".join(
            f"{label} {_fmt(table.total[i].bcf)}"
            for label, i in zip(labels, indexes, strict=True)
            if table.total[i].bcf is not None
        )
    )
    revisions: list[tuple[float, str]] = []
    for facility in table.facilities:
        values = [(labels[k], _bcf(facility.cells[i])) for k, i in enumerate(indexes)]
        present = [(label, v) for label, v in values if v is not None]
        if len(present) < 2:
            continue
        first, last = present[0], present[-1]
        delta = last[1] - first[1]
        revisions.append(
            (
                abs(delta),
                f"- {facility.name}: {first[0]} {_fmt(first[1])} -> {last[0]} {_fmt(last[1])} "
                f"({delta:+.2f})",
            )
        )
    revisions.sort(key=lambda r: r[0], reverse=True)
    if revisions:
        lines.append("Revision from first to latest published cycle, by facility:")
        lines.extend(r[1] for r in revisions[:_MOVERS])
    lines.append(
        "A cycle a meter did not re-post carries its previous value. LNG Canada and Costa Azul come "
        "from Platts, whose cycles are inferred from publish time; the other plants come from WoodMac."
    )
    return lines


def build_prompt(
    overview: OverviewResponse,
    selection_names: list[str],
) -> str:
    """The instructions plus a compact text digest of the overview tables."""
    header = [
        f"Source: pipeline nominations (WoodMac Genscape, and Platts for LNG Canada and Costa Azul). Latest gas day: {overview.latest_date}. "
        "Unit: BCF per day (volumes are per day, including the monthly figures, which are "
        "averages per day).",
        "Scope: "
        + (
            "selected pipelines only (" + ", ".join(selection_names) + ")"
            if selection_names
            else "all facilities and pipelines"
        )
        + ".",
    ]
    sections = [
        header,
        _daily_lines(overview.daily_table),
        _pipeline_movers(overview.daily_table),
        _monthly_lines(overview.monthly_table),
        _cycle_lines(overview.cycle_table),
    ]
    return PROMPT_INSTRUCTIONS + "\n\n".join("\n".join(s) for s in sections if s)
