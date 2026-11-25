from __future__ import annotations

import datetime as dt
import logging
from collections import defaultdict
from collections.abc import Callable
from typing import Any

from app.core.config import settings
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
    def __init__(
        self,
        repository: FlareMonitorRepository,
        missing_minutes: int | None = None,
        clock: Callable[[], dt.datetime] | None = None,
    ) -> None:
        self._repository = repository
        self._tables_checked = False
        self._missing = dt.timedelta(
            minutes=settings.FLARE_MISSING_MINUTES
            if missing_minutes is None
            else missing_minutes
        )
        self._clock = clock or (lambda: dt.datetime.now(dt.timezone.utc))

    def overview(self, hours: int) -> OverviewResponse:
        hours = max(1, min(hours, MAX_HOURS))
        self._ensure_tables()
        now = self._clock()
        since = now - dt.timedelta(hours=hours)

        cameras = [self._status(row, now) for row in self._repository.camera_states()]

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

    def _status(self, row: dict[str, Any], now: dt.datetime) -> CameraStatus:
        """A camera with no recent image is unknown, even if the collector has stopped.

        The collector marks cameras unknown itself, but it cannot if it has crashed, so the API
        applies the same rule to the stored last image time.
        """
        last = row["last_image_at"]
        if last is not None and last.tzinfo is None:
            last = last.replace(tzinfo=dt.timezone.utc)
        stale = last is None or now - last > self._missing
        return CameraStatus(
            camera_id=row["camera_id"],
            plant=row["plant"],
            state="unknown" if stale else row["state"],
            stale=stale,
            since=row["since"],
            last_image_at=last,
            last_label=row["last_label"],
            last_usable=row["last_usable"],
            last_score=row["last_score"],
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
