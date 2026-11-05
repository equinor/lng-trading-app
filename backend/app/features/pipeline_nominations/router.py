from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import require_reader
from app.features.pipeline_nominations.dependencies import PipelineNominationsServiceDep
from app.features.pipeline_nominations.schemas import FiltersResponse, OverviewResponse
from app.features.pipeline_nominations.service import Selection

router = APIRouter(dependencies=[Depends(require_reader)])

# Pairs are "facility::pipeline", joined with "|" (names contain commas but not these).
_PAIR_SEPARATOR = "::"
_LIST_SEPARATOR = "|"


def _parse_selection(selected: str | None) -> Selection:
    pairs: Selection = set()
    for token in (selected or "").split(_LIST_SEPARATOR):
        facility, sep, pipeline = token.partition(_PAIR_SEPARATOR)
        if sep and facility.strip() and pipeline.strip():
            pairs.add((facility.strip(), pipeline.strip()))
    return pairs


@router.get("/filters", response_model=FiltersResponse)
def get_filters(service: PipelineNominationsServiceDep):
    """Facilities and their pipelines, for the filter tree."""
    return service.filters()


@router.get("/overview", response_model=OverviewResponse)
def get_overview(service: PipelineNominationsServiceDep, selected: str | None = None):
    """Daily flow charts and the monthly matrix, optionally limited to selected facility::pipeline pairs."""
    return service.overview(_parse_selection(selected))
