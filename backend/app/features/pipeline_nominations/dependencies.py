from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from app.features.pipeline_nominations.repository import PipelineNominationsRepository
from app.features.pipeline_nominations.service import PipelineNominationsService


@lru_cache
def get_pipeline_nominations_service() -> PipelineNominationsService:
    return PipelineNominationsService(PipelineNominationsRepository())


PipelineNominationsServiceDep = Annotated[
    PipelineNominationsService, Depends(get_pipeline_nominations_service)
]
