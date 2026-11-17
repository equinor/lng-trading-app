from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from app.features.mid_term_curves.repository import MidTermCurvesRepository
from app.features.mid_term_curves.service import MidTermCurvesService


@lru_cache
def get_mid_term_curves_service() -> MidTermCurvesService:
    return MidTermCurvesService(MidTermCurvesRepository())


MidTermCurvesServiceDep = Annotated[
    MidTermCurvesService, Depends(get_mid_term_curves_service)
]