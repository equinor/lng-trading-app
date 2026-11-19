from __future__ import annotations

import datetime as dt

from pydantic import BaseModel


class FilterNode(BaseModel):
    """A region or country in a filter tree. Leaves are countries, which are what filtering uses."""

    name: str
    children: list[FilterNode] = []


class FiltersResponse(BaseModel):
    loading: list[FilterNode]
    destination: list[FilterNode]


class Measure(BaseModel):
    cargoes: float
    kt: float


class MonthPoint(BaseModel):
    month: dt.date  # first day of the month
    supply: Measure
    demand: Measure


class QuarterRow(BaseModel):
    quarter: int  # 1 to 4
    supply: Measure
    demand: Measure
    net: Measure  # supply minus demand, negative when short


class YearRow(BaseModel):
    year: int
    supply: Measure
    demand: Measure
    net: Measure
    quarters: list[QuarterRow]


class OverviewResponse(BaseModel):
    years: list[int]
    # First month with model (forecast) rows in either table; earlier months are actuals.
    forecast_from: dt.date | None
    months: list[MonthPoint]
    table: list[YearRow]


class ForecastDatesResponse(BaseModel):
    # Dates on which a forecast was created, newest first, for which both supply and demand exist.
    dates: list[dt.date]


class ForecastPoint(BaseModel):
    month: dt.date
    net: Measure  # supply minus demand as forecast on `forecast_date`


class ForecastLine(BaseModel):
    forecast_date: dt.date
    months: list[ForecastPoint]


class ForecastLinesResponse(BaseModel):
    lines: list[ForecastLine]
