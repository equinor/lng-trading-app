from __future__ import annotations

import datetime as dt

from pydantic import BaseModel


class FacilityFilter(BaseModel):
    name: str
    pipelines: list[str]


class FiltersResponse(BaseModel):
    latest_date: dt.date | None
    facilities: list[FacilityFilter]


class DailyPoint(BaseModel):
    flow_date: dt.date
    bcf: float


class DailySeries(BaseModel):
    name: str
    points: list[DailyPoint]


class MonthMeta(BaseModel):
    key: str  # YYYY-MM
    year: int
    month: int
    label: str
    partial: bool  # latest month with data that has not reached month end


class MonthCell(BaseModel):
    bcf: float | None
    mom_pct: float | None


class PipelineRow(BaseModel):
    name: str
    cells: list[MonthCell]


class FacilityRow(BaseModel):
    name: str
    cells: list[MonthCell]
    pipelines: list[PipelineRow]


class MonthlyTable(BaseModel):
    months: list[MonthMeta]
    facilities: list[FacilityRow]
    total: list[MonthCell]


class OverviewResponse(BaseModel):
    latest_date: dt.date | None
    daily_14: list[DailySeries]
    daily_180: list[DailySeries]
    monthly: MonthlyTable
