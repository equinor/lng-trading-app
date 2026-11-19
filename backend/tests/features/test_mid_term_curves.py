import datetime as dt
from typing import Any

import pytest

from app.features.mid_term_curves.curves import derive_prices
from app.features.mid_term_curves.service import MidTermCurvesService

JAN = dt.date(2026, 1, 1)


def _source(**values: Any) -> dict[str, Any]:
    return {"start_date": JAN, **values}


def test_oil_curves_are_shares_of_epa_brent_base() -> None:
    prices = derive_prices(_source(epa_brent_base=100.0))

    assert prices.crude_17_2 == pytest.approx(17.2)
    assert prices.crude_15_5 == pytest.approx(15.5)
    assert prices.crude_14 == pytest.approx(14.0)
    assert prices.crude_12_5 == pytest.approx(12.5)
    assert prices.crude_10 == pytest.approx(10.0)
    assert prices.china_central_asia == pytest.approx(0.067 * 100 + 1.96)
    assert prices.china_power_of_siberia == pytest.approx(100 * 3.15 / 36.6)
    assert prices.woodmac_asia_mid_term == pytest.approx(12.5)


def test_freight_curves_use_epa_henry_hub() -> None:
    prices = derive_prices(_source(epa_hh=4.0))

    hire = 88 * 85_000 / 3_800_000
    fuel = 88 * 4.0 * 0.0009 * 1.15
    assert prices.us_to_jktc_100 == pytest.approx(hire + fuel)
    assert prices.us_to_jktc_50 == pytest.approx(hire / 2 + fuel)
    assert prices.us_to_jktc_0 == pytest.approx(fuel)
    assert prices.me_to_nwe_0 == pytest.approx(38 * 4.0 * 0.0009 * 1.15)


def test_us_marginal_curves_add_the_us_to_jktc_freight() -> None:
    prices = derive_prices(_source(epa_hh=4.0))

    assert prices.us_marginal_des_asia_100 == pytest.approx(
        1.15 * 4.0 + prices.us_to_jktc_100
    )
    assert prices.us_marginal_des_asia_50 == pytest.approx(
        1.15 * 4.0 + prices.us_to_jktc_50
    )
    assert prices.us_marginal_des_asia_sunk == pytest.approx(
        1.15 * 4.0 + prices.us_to_jktc_0
    )


def test_missing_inputs_leave_dependent_curves_blank() -> None:
    prices = derive_prices(_source(jkm=10.0))

    assert prices.jkm == 10.0
    assert prices.crude_17_2 is None
    assert prices.china_central_asia is None
    assert prices.us_to_jktc_100 is None
    assert prices.us_marginal_des_asia_sunk is None
    assert prices.euro_coalswitching is None
    # The long run marginal cost is a fixed input, so it is always present.
    assert prices.spot_chartering_gea == 86_000.0


def test_source_prices_pass_through_unchanged() -> None:
    prices = derive_prices(
        _source(
            jkm=1,
            ttf=2,
            hh=3,
            brent=4,
            epa_jkm=5,
            epa_ttf=6,
            epa_hh=7,
            epa_nbp=8,
            epa_brent_base=9,
            epa_brent_high=10,
            epa_brent_low=11,
        )
    )

    assert [
        prices.jkm,
        prices.ttf,
        prices.hh,
        prices.brent,
        prices.epa_jkm,
        prices.epa_ttf,
        prices.epa_hh,
        prices.epa_nbp,
        prices.epa_brent_base,
        prices.epa_brent_high,
        prices.epa_brent_low,
    ] == [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]


class _FakeRepository:
    def __init__(self) -> None:
        self.price_loads = 0

    def list_prices(self) -> list[dict[str, Any]]:
        self.price_loads += 1
        return [_source(epa_brent_base=100.0)]


def test_prices_are_cached_until_refreshed() -> None:
    repo = _FakeRepository()
    service = MidTermCurvesService(repo)  # type: ignore[arg-type]

    first = service.list_prices()
    service.list_prices()
    assert repo.price_loads == 1
    assert first[0].crude_17_2 == pytest.approx(17.2)

    service.list_prices(refresh=True)
    assert repo.price_loads == 2
