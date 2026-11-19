from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, Field, field_validator


class CurvePrices(BaseModel):
    start_date: dt.date
    jkm: float | None
    ttf: float | None
    hh: float | None
    brent: float | None
    epa_jkm: float | None
    epa_ttf: float | None
    epa_hh: float | None
    epa_nbp: float | None
    epa_brent_base: float | None
    epa_brent_high: float | None
    epa_brent_low: float | None
    crude_17_2: float | None
    crude_15_5: float | None
    crude_14: float | None
    crude_12_5: float | None
    crude_10: float | None
    euro_coalswitching: float | None
    china_central_asia: float | None
    china_power_of_siberia: float | None
    spot_chartering_gea: float
    us_to_jktc_100: float | None
    us_to_jktc_50: float | None
    us_to_jktc_0: float | None
    us_to_nwe_100: float | None
    us_to_nwe_50: float | None
    us_to_nwe_0: float | None
    me_to_jktc_100: float | None
    me_to_jktc_50: float | None
    me_to_jktc_0: float | None
    me_to_nwe_100: float | None
    me_to_nwe_50: float | None
    me_to_nwe_0: float | None
    woodmac_asia_mid_term: float | None
    us_marginal_des_asia_100: float | None
    us_marginal_des_asia_50: float | None
    us_marginal_des_asia_sunk: float | None


class CustomCurveMonthInput(BaseModel):
    month: dt.date
    fundamental_rationale: str = Field(default="", max_length=4000)
    curve_1_id: str | None = None
    curve_2_id: str | None = None


class SaveCustomCurveBody(BaseModel):
    curve_name: str = Field(min_length=1, max_length=120)
    months: list[CustomCurveMonthInput] = Field(min_length=1)

    @field_validator("curve_name")
    @classmethod
    def strip_curve_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Curve name cannot be empty")
        return value


class SavedCustomCurveMonth(BaseModel):
    curve_id: str
    curve_name: str
    month: dt.date
    fundamental_rationale: str
    curve_1_id: str | None
    curve_2_id: str | None
    created_by: str
    created_at: dt.datetime
    modified_at: dt.datetime


class SaveCustomCurveResponse(BaseModel):
    curve_id: str