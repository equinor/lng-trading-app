from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from app.features.flare_monitor.repository import FlareMonitorRepository
from app.features.flare_monitor.service import FlareMonitorService


@lru_cache
def get_flare_monitor_service() -> FlareMonitorService:
    return FlareMonitorService(FlareMonitorRepository())


FlareMonitorServiceDep = Annotated[
    FlareMonitorService, Depends(get_flare_monitor_service)
]
