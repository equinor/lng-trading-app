from __future__ import annotations

import datetime as dt
import logging
from collections import defaultdict
from typing import Any

from app.features.flare_monitor.repository import FlareMonitorRepository
from app.features.flare_monitor.schemas import (
    CameraStatus,
    CameraTimeline,
    FlareEvent,
    ObservationPoint,
    OverviewResponse,
)

logger = logging.getLogger(__name__)

MAX_HOURS = 24
EVENT_LIMIT = 50


class FlareMonitorService:
    def __init__(self, repository: FlareMonitorRepository) -> None:
        self._repository = repository
        self._tables_checked = False

    def overview(self, hours: int) -> OverviewResponse:
        hours = max(1, min(hours, MAX_HOURS))
        self._ensure_tables()
        since = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=hours)

        cameras = [
            CameraStatus(
                camera_id=row["camera_id"],
                plant=row["plant"],
                state=row["state"],
                since=row["since"],
                last_image_at=row["last_image_at"],
                last_label=row["last_label"],
                last_usable=row["last_usable"],
                last_score=row["last_score"],
            )
            for row in self._repository.camera_states()
        ]

        by_camera: dict[str, list[ObservationPoint]] = defaultdict(list)
        for row in self._repository.camera_observations(since):
            by_camera[row["camera_id"]].append(self._point(row))
        timelines = [
            CameraTimeline(
                camera_id=camera.camera_id, points=by_camera[camera.camera_id]
            )
            for camera in cameras
        ]

        events = [
            FlareEvent(**row) for row in self._repository.recent_events(EVENT_LIMIT)
        ]
        return OverviewResponse(
            hours=hours, cameras=cameras, timelines=timelines, events=events
        )

    @staticmethod
    def _point(row: dict[str, Any]) -> ObservationPoint:
        return ObservationPoint(
            image_ts=row["image_ts"],
            label=row["label"],
            usable=bool(row["usable"]),
            score=row["score"],
        )

    def _ensure_tables(self) -> None:
        """Create the tables on first use so the page works before the collector has run."""
        if self._tables_checked:
            return
        try:
            self._repository.ensure_tables()
            self._tables_checked = True
        except Exception:
            logger.exception("Could not ensure the flare monitor tables exist")
