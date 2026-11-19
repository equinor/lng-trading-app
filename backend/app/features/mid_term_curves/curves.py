"""Derived curves: the formulas that turn the ICE and EPA source prices into the other curves.

Pure functions with no I/O, so every formula can be tested without Databricks.
"""

from __future__ import annotations

from typing import Any

from app.features.mid_term_curves.schemas import CurvePrices

# Brent-linked oil switching curves, as a share of the EPA Brent base case.
CRUDE_SHARES = {
    "crude_17_2": 0.172,
    "crude_15_5": 0.155,
    "crude_14": 0.14,
    "crude_12_5": 0.125,
    "crude_10": 0.10,
}
CHINA_CENTRAL_ASIA_BRENT_SHARE = 0.067
CHINA_CENTRAL_ASIA_FIXED = 1.96
CHINA_POWER_OF_SIBERIA_RATIO = 3.15 / 36.6
WOODMAC_ASIA_BRENT_SHARE = 0.125

# Freight: charter hire per day over the cargo size, plus fuel burnt at the Henry Hub price.
LONG_RUN_MARGINAL_COST = 86_000.0
CHARTER_RATE_PER_DAY = 85_000.0
CARGO_SIZE = 3_800_000.0
FUEL_FACTOR = 0.0009
FUEL_MARKUP = 1.15
# Voyage length in days for each route.
ROUTE_DAYS = {
    "us_to_jktc": 88.0,
    "us_to_nwe": 32.0,
    "me_to_jktc": 40.0,
    "me_to_nwe": 38.0,
}
# Share of the charter cost that is counted in each freight curve.
_CONTRIBUTIONS = (("100", 1.0), ("50", 0.5), ("0", 0.0))

US_MARGINAL_HH_MARKUP = 1.15
# Suffix of the US -> JKTC curve that each US marginal curve builds on.
_US_MARGINAL_SUFFIX = {"100": "100", "50": "50", "sunk": "0"}

# Source columns that are passed through unchanged.
SOURCE_COLUMNS = (
    "jkm",
    "ttf",
    "hh",
    "brent",
    "epa_jkm",
    "epa_ttf",
    "epa_hh",
    "epa_nbp",
    "epa_brent_base",
    "epa_brent_high",
    "epa_brent_low",
)


def _number(value: Any) -> float | None:
    return None if value is None else float(value)


def _scaled(value: float | None, factor: float) -> float | None:
    return None if value is None else value * factor


def _sum(first: float | None, second: float | None) -> float | None:
    return None if first is None or second is None else first + second


def derive_prices(row: dict[str, Any]) -> CurvePrices:
    """One month of source prices in, every curve for that month out. Missing inputs give blanks."""
    source = {name: _number(row.get(name)) for name in SOURCE_COLUMNS}
    brent = source["epa_brent_base"]
    henry_hub = source["epa_hh"]

    derived: dict[str, float | None] = {
        name: _scaled(brent, share) for name, share in CRUDE_SHARES.items()
    }
    derived["euro_coalswitching"] = None
    derived["china_central_asia"] = _sum(
        _scaled(brent, CHINA_CENTRAL_ASIA_BRENT_SHARE), CHINA_CENTRAL_ASIA_FIXED
    )
    derived["china_power_of_siberia"] = _scaled(brent, CHINA_POWER_OF_SIBERIA_RATIO)
    derived["woodmac_asia_mid_term"] = _scaled(brent, WOODMAC_ASIA_BRENT_SHARE)

    for route, days in ROUTE_DAYS.items():
        hire = days * CHARTER_RATE_PER_DAY / CARGO_SIZE
        fuel = (
            None
            if henry_hub is None
            else days * henry_hub * FUEL_FACTOR * FUEL_MARKUP
        )
        for suffix, contribution in _CONTRIBUTIONS:
            derived[f"{route}_{suffix}"] = _sum(contribution * hire, fuel)

    for suffix, route_suffix in _US_MARGINAL_SUFFIX.items():
        derived[f"us_marginal_des_asia_{suffix}"] = _sum(
            _scaled(henry_hub, US_MARGINAL_HH_MARKUP),
            derived[f"us_to_jktc_{route_suffix}"],
        )

    return CurvePrices(
        start_date=row["start_date"],
        spot_chartering_gea=LONG_RUN_MARGINAL_COST,
        **source,
        **derived,
    )
