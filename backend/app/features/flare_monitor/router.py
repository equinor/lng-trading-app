from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import require_reader
from app.features.flare_monitor.dependencies import FlareMonitorServiceDep
from app.features.flare_monitor.schemas import OverviewResponse

router = APIRouter(dependencies=[Depends(require_reader)])


@router.get("/overview", response_model=OverviewResponse)
def overview(service: FlareMonitorServiceDep, hours: int = 6) -> OverviewResponse:
    """Latest state per camera, each camera's recent observations and the latest state changes."""
    return service.overview(hours)
