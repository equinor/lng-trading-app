import datetime as dt
from typing import Any

import pytest

from app.features.pipeline_nominations.service import (
    PipelineNominationsService,
    region_of,
)

DAY = dt.date(2026, 3, 10)


class _FakeRepo:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows

    def daily_by_pipeline(self) -> list[dict[str, Any]]:
        return self._rows

    def woodmac_cycle_rows(self) -> list[dict[str, Any]]:
        return []


def _row(
    facility: str, pipeline: str, bcf: float, day: dt.date = DAY
) -> dict[str, Any]:
    return {"facility": facility, "pipeline": pipeline, "flow_date": day, "bcf": bcf}


def _service(rows: list[dict[str, Any]]) -> PipelineNominationsService:
    return PipelineNominationsService(_FakeRepo(rows))  # type: ignore[arg-type]


def test_region_of_puts_canada_and_costa_azul_outside_the_us() -> None:
    assert region_of("LNG Canada") == "Non-US"
    assert region_of("Costa Azul LNG") == "Non-US"
    assert region_of("Sabine Pass LNG") == "US"


def test_filters_list_us_facilities_before_non_us_ones() -> None:
    service = _service(
        [
            _row("Costa Azul LNG", "P1", 0.5),
            _row("Sabine Pass LNG", "P2", 4.0),
            _row("LNG Canada", "P3", 1.0),
            _row("Cameron LNG", "P4", 2.0),
        ]
    )

    facilities = service.filters().facilities

    assert [(f.name, f.region) for f in facilities] == [
        ("Cameron LNG", "US"),
        ("Sabine Pass LNG", "US"),
        ("Costa Azul LNG", "Non-US"),
        ("LNG Canada", "Non-US"),
    ]


def test_tables_carry_a_subtotal_per_region() -> None:
    service = _service(
        [
            _row("Costa Azul LNG", "P1", 0.5),
            _row("Sabine Pass LNG", "P2", 4.0),
            _row("LNG Canada", "P3", 1.0),
            _row("Cameron LNG", "P4", 2.0),
        ]
    )

    table = service.overview(set()).daily_table

    assert [f.region for f in table.facilities] == ["US", "US", "Non-US", "Non-US"]
    totals = {t.region: t.cells[-1].bcf for t in table.region_totals}
    assert totals == {"US": pytest.approx(6.0), "Non-US": pytest.approx(1.5)}
    assert table.total[-1].bcf == pytest.approx(7.5)


def test_region_subtotals_only_cover_regions_in_the_selection() -> None:
    service = _service(
        [_row("Sabine Pass LNG", "P2", 4.0), _row("LNG Canada", "P3", 1.0)]
    )

    table = service.overview({("Sabine Pass LNG", "P2")}).monthly_table

    assert [t.region for t in table.region_totals] == ["US"]
    assert table.region_totals[0].cells[-1].bcf == pytest.approx(4.0)
