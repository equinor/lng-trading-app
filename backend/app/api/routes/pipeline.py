from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import require_reader, require_writer
from app.services import databricks_jobs

router = APIRouter(dependencies=[Depends(require_reader)])
logger = logging.getLogger(__name__)


@router.get("/last-run")
def get_last_run():
    try:
        return databricks_jobs.get_last_run()
    except Exception as exc:
        logger.exception("Failed to read Databricks pipeline status")
        raise HTTPException(status_code=502, detail="Could not read pipeline status") from exc


@router.post("/trigger", dependencies=[Depends(require_writer)])
def trigger():
    if not databricks_jobs.is_configured():
        raise HTTPException(status_code=503, detail="Databricks pipeline is not configured")
    try:
        return databricks_jobs.trigger_run()
    except Exception as exc:
        logger.exception("Failed to trigger Databricks pipeline")
        raise HTTPException(status_code=502, detail="Could not start pipeline") from exc
