from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import require_reader
from app.features.lng_balance.dependencies import LngBalanceServiceDep
from app.features.lng_balance.schemas import (
    FiltersResponse,
    ForecastDatesResponse,
    ForecastLinesResponse,
    OverviewResponse,
)
from app.features.lng_balance.service import MAX_FORECAST_LINES, Countries

router = APIRouter(dependencies=[Depends(require_reader)])

# Country names contain commas, so the list is joined with "|", which they do not contain.
_LIST_SEPARATOR = "|"


def _parse_countries(value: str | None) -> Countries:
    return {
        name.strip() for name in (value or "").split(_LIST_SEPARATOR) if name.strip()
    }


def _parse_dates(value: str | None) -> list[dt.date]:
    try:
        return [
            dt.date.fromisoformat(part.strip())
            for part in (value or "").split(_LIST_SEPARATOR)
            if part.strip()
        ]
    except ValueError as exc:
        raise HTTPException(
            status_code=422, detail="dates must be YYYY-MM-DD separated by |"
        ) from exc


@router.get("/filters", response_model=FiltersResponse)
def get_filters(service: LngBalanceServiceDep):
    """The loading source and destination trees, limited to the countries in the data."""
    return service.filters()


@router.get("/overview", response_model=OverviewResponse)
def get_overview(
    service: LngBalanceServiceDep,
    loading: str | None = None,
    destination: str | None = None,
    forecast_date: str | None = None,
):
    """Monthly supply and demand with a year and quarter table, optionally limited to countries.

    `loading` filters supply and `destination` filters demand; each is a "|" separated list of
    countries, and empty means all of them. `forecast_date` (YYYY-MM-DD) shows the balance as it
    was forecast on that date, with actuals before it; without it the latest forecast is used.
    """
    chosen = _parse_dates(forecast_date)
    if len(chosen) > 1:
        raise HTTPException(status_code=422, detail="Only one forecast_date is allowed")
    try:
        return service.overview(
            _parse_countries(loading),
            _parse_countries(destination),
            chosen[0] if chosen else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/forecast-dates", response_model=ForecastDatesResponse)
def get_forecast_dates(service: LngBalanceServiceDep):
    """Dates on which a forecast was created, newest first, for the forecast comparison."""
    return service.forecast_dates()


@router.get("/forecast-lines", response_model=ForecastLinesResponse)
def get_forecast_lines(
    service: LngBalanceServiceDep,
    dates: str | None = None,
    loading: str | None = None,
    destination: str | None = None,
):
    """Net short by month as forecast on each date in `dates` (YYYY-MM-DD separated by "|").

    The country filters work as on /overview. At most MAX_FORECAST_LINES dates are accepted.
    """
    parsed = _parse_dates(dates)
    if len(set(parsed)) > MAX_FORECAST_LINES:
        raise HTTPException(
            status_code=422,
            detail=f"At most {MAX_FORECAST_LINES} dates can be compared",
        )
    return service.forecast_lines(
        parsed, _parse_countries(loading), _parse_countries(destination)
    )
