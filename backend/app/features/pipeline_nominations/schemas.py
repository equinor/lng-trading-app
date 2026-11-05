from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel

Source = Literal["platts", "woodmac"]


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


class ColumnMeta(BaseModel):
    key: str
    group: str  # header above the column: the year for months, month and year for days
    label: str  # month abbreviation, or day of month
    partial: bool  # latest month with data that has not reached month end


class MatrixCell(BaseModel):
    bcf: float | None
    change_pct: float | None  # against the previous column (month or day)


class PipelineRow(BaseModel):
    name: str
    cells: list[MatrixCell]


class FacilityRow(BaseModel):
    name: str
    cells: list[MatrixCell]
    pipelines: list[PipelineRow]


class MatrixTable(BaseModel):
    columns: list[ColumnMeta]
    facilities: list[FacilityRow]
    total: list[MatrixCell]


class OverviewResponse(BaseModel):
    latest_date: dt.date | None
    daily_14: list[DailySeries]
    daily_180: list[DailySeries]
    monthly_table: MatrixTable
    daily_table: MatrixTable
