from __future__ import annotations

import datetime as dt
import hashlib
import logging
from collections.abc import Callable
from typing import Any

from app.features.flare_monitor.collector.cache import ImageCache
from app.features.flare_monitor.collector.classifier import (
    CameraConfig,
    Classification,
    Classifier,
)
from app.features.flare_monitor.collector.filenames import parse_image_name
from app.features.flare_monitor.collector.settings import CollectorSettings
from app.features.flare_monitor.collector.state import (
    CameraTracker,
    FlareState,
    StateEvent,
)
from app.features.flare_monitor.repository import FlareMonitorRepository

logger = logging.getLogger(__name__)

# Known images are reloaded for this long at startup so a restart does not re-process them.
_DEDUPE_WINDOW = dt.timedelta(hours=12)
_FUTURE_TOLERANCE = dt.timedelta(minutes=10)
_STALE_IMAGE = dt.timedelta(minutes=30)


def _utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class FlareProcessor:
    """Classifies new images, stores the observations and keeps each camera's state."""

    def __init__(
        self,
        settings: CollectorSettings,
        repository: FlareMonitorRepository,
        classifier: Classifier,
        cache: ImageCache,
        clock: Callable[[], dt.datetime] = _utc_now,
    ) -> None:
        self._settings = settings
        self._repository = repository
        self._classifier = classifier
        self._cache = cache
        self._clock = clock
        self._cameras = settings.cameras()
        self._trackers: dict[str, CameraTracker] = {}
        self._seen: set[tuple[str, dt.datetime]] = set()
        self._newest: dict[str, dt.datetime] = {}
        self._last_hash: dict[str, str] = {}
        self._last_arrival: dict[str, dt.datetime] = {}
        self._latest: dict[str, Classification] = {}
        self._persisted: dict[str, dict[str, Any]] = {}
        self._pending: list[dict[str, Any]] = []
        self._dirty: set[str] = set()
        self._events: list[StateEvent] = []

    def start(self) -> None:
        """Create the tables and pick up where the previous run left off."""
        now = self._clock()
        self._repository.ensure_tables()
        self._persisted = self._repository.load_states()
        self._seen = self._repository.known_images(now - _DEDUPE_WINDOW)
        for camera_id, taken_at in self._seen:
            self._newest[camera_id] = max(
                self._newest.get(camera_id, taken_at), taken_at
            )
        # Keep the last image time a camera had before a restart, so a restart that finds no new
        # images does not wipe it.
        for camera_id, saved in self._persisted.items():
            last = saved.get("last_image_at")
            if last is not None:
                if last.tzinfo is None:
                    last = last.replace(tzinfo=dt.timezone.utc)
                self._newest[camera_id] = max(self._newest.get(camera_id, last), last)
        # With no camera list every camera that has a stored state is followed, so one that stops
        # publishing is still marked unknown.
        for camera_id in self._cameras or self._persisted:
            self._tracker(camera_id)
            self._last_arrival.setdefault(camera_id, now)
            if camera_id not in self._persisted:
                self._dirty.add(camera_id)
        self.flush()

    def process_batch(self, images: list[tuple[str, bytes]]) -> int:
        """Handle the images found on one map load, oldest first. Returns how many were new."""
        parsed = []
        for name, data in images:
            image_name = parse_image_name(name, self._settings.image_timezone)
            if image_name is not None:
                parsed.append((image_name, data))
        parsed.sort(key=lambda item: item[0].taken_at)
        self._check_age(parsed[-1][0].taken_at if parsed else None)

        new = 0
        for image_name, data in parsed:
            try:
                new += self._handle(
                    image_name.camera_id,
                    image_name.file_name,
                    image_name.taken_at,
                    data,
                )
            except Exception:
                logger.exception("Could not process %s", image_name.file_name)
        self.flush()
        return new

    def _check_age(self, newest: dt.datetime | None) -> None:
        """The newest image should be minutes old; a big gap usually means a wrong time zone."""
        if newest is None:
            return
        age = self._clock() - newest
        minutes = round(age.total_seconds() / 60)
        if age > _STALE_IMAGE or age < -_FUTURE_TOLERANCE:
            logger.warning(
                "Newest image is %s min old; check FLARE_IMAGE_TIMEZONE (%s)",
                minutes,
                self._settings.FLARE_IMAGE_TIMEZONE,
            )
        else:
            logger.info("Newest image is %s min old", minutes)

    def flush(self) -> None:
        """Write what is waiting: observations, then camera states, then events.

        Observations are retried by reading the same images again. State writes and events are
        remembered until they succeed, because the trackers have already moved on and reading an
        image again cannot recreate them.
        """
        pending, self._pending = self._pending, []
        if pending:
            try:
                self._repository.add_observations(pending)
            except Exception:
                logger.exception("Could not store %s observation(s)", len(pending))
                for row in pending:
                    self._seen.discard((row["camera_id"], row["image_ts"]))
                self._last_hash.clear()

        for camera_id in sorted(self._dirty):
            try:
                self._save_state(self._tracker(camera_id))
                self._dirty.discard(camera_id)
            except Exception:
                logger.exception("Could not save the state of camera %s", camera_id)

        unsaved = []
        for event in self._events:
            try:
                self._save_event(event)
            except Exception:
                logger.exception(
                    "Could not save an event for camera %s", event.camera_id
                )
                unsaved.append(event)
        self._events = unsaved

    def check_missing(self) -> None:
        """A camera with no new image for a while is unknown, not off."""
        now = self._clock()
        limit = dt.timedelta(minutes=self._settings.FLARE_MISSING_MINUTES)
        for camera_id, tracker in self._trackers.items():
            arrived = self._last_arrival.get(camera_id)
            if arrived is None or now - arrived < limit:
                continue
            event = tracker.missing(now)
            if event is not None:
                logger.warning("Camera %s: %s", camera_id, event.reason)
                self._dirty.add(camera_id)
                self._events.append(event)
        self.flush()

    def _handle(
        self, camera_id: str, file_name: str, taken_at: dt.datetime, data: bytes
    ) -> int:
        if self._cameras and camera_id not in self._cameras:
            return 0
        key = (camera_id, taken_at)
        if key in self._seen:
            return 0
        self._seen.add(key)

        digest = hashlib.sha256(data).hexdigest()
        if self._last_hash.get(camera_id) == digest:
            return 0  # the same frame served under a new name
        self._last_hash[camera_id] = digest

        now = self._clock()
        if taken_at - now > _FUTURE_TOLERANCE:
            logger.warning(
                "Image %s is dated in the future; check FLARE_IMAGE_TIMEZONE (%s)",
                file_name,
                self._settings.FLARE_IMAGE_TIMEZONE,
            )

        config = self._cameras.get(camera_id, CameraConfig())
        result = self._classifier.classify(data, config)
        self._cache.save(camera_id, file_name, data)
        self._pending.append(
            {
                "camera_id": camera_id,
                "image_ts": taken_at,
                "image_name": file_name,
                "image_sha256": digest,
                "label": result.label.value,
                "usable": result.usable,
                "hot_pixels": result.hot_pixels,
                "peak_delta": result.peak_delta,
                "score": result.score,
                "classifier_version": self._classifier.version,
                "ingested_at": now,
            }
        )
        self._last_arrival[camera_id] = now

        # Older frames served again are stored but must not rewind the state.
        if taken_at <= self._newest.get(
            camera_id, dt.datetime.min.replace(tzinfo=dt.timezone.utc)
        ):
            return 1
        self._newest[camera_id] = taken_at
        self._latest[camera_id] = result

        tracker = self._tracker(camera_id)
        event = tracker.observe(result.label, result.usable, taken_at)
        self._dirty.add(camera_id)
        if event is not None:
            logger.info(
                "Camera %s: %s -> %s",
                camera_id,
                event.previous.value,
                event.state.value,
            )
            self._events.append(event)
        return 1

    def _tracker(self, camera_id: str) -> CameraTracker:
        tracker = self._trackers.get(camera_id)
        if tracker is None:
            saved = self._persisted.get(camera_id)
            tracker = CameraTracker(
                camera_id,
                self._settings.thresholds,
                FlareState(saved["state"]) if saved else FlareState.UNKNOWN,
                saved["since"] if saved else None,
            )
            self._trackers[camera_id] = tracker
        return tracker

    def _plant(self, camera_id: str) -> str | None:
        config = self._cameras.get(camera_id)
        return config.plant if config else None

    def _save_state(self, tracker: CameraTracker) -> None:
        camera_id = tracker.camera_id
        latest = self._latest.get(camera_id)
        saved = self._persisted.get(camera_id, {})
        self._repository.save_state(
            {
                "camera_id": camera_id,
                "plant": self._plant(camera_id),
                "state": tracker.state.value,
                "since": tracker.since,
                "last_image_at": self._newest.get(camera_id),
                "last_label": latest.label.value if latest else saved.get("last_label"),
                "last_usable": latest.usable if latest else saved.get("last_usable"),
                "last_score": latest.score if latest else saved.get("last_score"),
                "updated_at": self._clock(),
            }
        )

    def _save_event(self, event: StateEvent) -> None:
        self._repository.add_event(
            {
                "camera_id": event.camera_id,
                "plant": self._plant(event.camera_id),
                "event_ts": event.at,
                "previous_state": event.previous.value,
                "state": event.state.value,
                "alert": event.alert,
                "reason": event.reason,
            }
        )
