from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import WriterUser, require_reader
from app.features.mid_term_curves.dependencies import MidTermCurvesServiceDep
from app.features.mid_term_curves.schemas import (
    CurvePrices,
    SaveCustomCurveBody,
    SaveCustomCurveResponse,
    SavedCustomCurveMonth,
)

router = APIRouter(dependencies=[Depends(require_reader)])


@router.get("/prices", response_model=list[CurvePrices])
def get_prices(service: MidTermCurvesServiceDep):
    return service.list_prices()


@router.get("/custom-curves", response_model=list[SavedCustomCurveMonth])
def get_custom_curves(service: MidTermCurvesServiceDep):
    return service.list_custom_curves()


@router.post(
    "/custom-curves",
    response_model=SaveCustomCurveResponse,
    status_code=201,
)
def create_custom_curve(
    body: SaveCustomCurveBody,
    user: WriterUser,
    service: MidTermCurvesServiceDep,
):
    curve_id = service.save_custom_curve(
        None,
        body.curve_name,
        body.months,
        user.get("name") or user.get("email") or "Unknown",
    )
    return {"curve_id": curve_id}


@router.patch("/custom-curves/{curve_id}", response_model=SaveCustomCurveResponse)
def update_custom_curve(
    curve_id: str,
    body: SaveCustomCurveBody,
    user: WriterUser,
    service: MidTermCurvesServiceDep,
):
    saved_id = service.save_custom_curve(
        curve_id,
        body.curve_name,
        body.months,
        user.get("name") or user.get("email") or "Unknown",
    )
    return {"curve_id": saved_id}


@router.delete("/custom-curves/{curve_id}", status_code=204)
def delete_custom_curve(
    curve_id: str,
    _user: WriterUser,
    service: MidTermCurvesServiceDep,
):
    service.delete_custom_curve(curve_id)