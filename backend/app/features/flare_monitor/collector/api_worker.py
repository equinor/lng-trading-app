from __future__ import annotations

import datetime as dt
import logging
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

from app.features.flare_monitor.collector.api_source import (
    ApiCamera,
    ApiImage,
    TokenRejected,
    WoodMacApi,
    token_expiry,
)
from app.features.flare_monitor.collector.cache import ImageCache
from app.features.flare_monitor.collector.classifier import ThermalBlobClassifier
from app.features.flare_monitor.collector.processor import FlareProcessor
from app.features.flare_monitor.collector.settings import CollectorSettings
from app.features.flare_monitor.repository import FlareMonitorRepository

logger = logging.getLogger(__name__)

# Re-read a little before the newest stored image, in case a frame was published late.
_OVERLAP = dt.timedelta(minutes=10)
# A token this close to expiring is treated as expired.
_TOKEN_MARGIN = dt.timedelta(minutes=2)
_DOWNLOADS = 8
# One request returns at most a day of frames, so ask in steps well inside that.
_WINDOW = dt.timedelta(hours=12)
_CAMERA_LIST_TTL = dt.timedelta(hours=1)


def _utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class ApiCollector:
    """Collects frames from the WoodMac camera API with the login token kept in Databricks."""

    def __init__(
        self,
        settings: CollectorSettings,
        repository: FlareMonitorRepository,
        processor: FlareProcessor,
        api: WoodMacApi,
        clock: Callable[[], dt.datetime] = _utc_now,
    ) -> None:
        self._settings = settings
        self._repository = repository
        self._processor = processor
        self._api = api
        self._clock = clock
        self._cameras: list[ApiCamera] = []
        self._cameras_at: dt.datetime | None = None
        self._rejected: str | None = None

    def _token(self) -> str | None:
        """The login token to use, or None when there is no usable one."""
        now = self._clock()
        if self._settings.WOODMAC_ACCESS_TOKEN:
            token: str | None = self._settings.WOODMAC_ACCESS_TOKEN
            expires = token_expiry(token) if token else None
        else:
            row = self._repository.load_token()
            if row is None:
                logger.warning(
                    "No WoodMac login token stored yet: run publish_token on a signed-in machine"
                )
                return None
            token = row["access_token"]
            expires = row["expires_at"]
            if expires is not None and expires.tzinfo is None:
                expires = expires.replace(tzinfo=dt.timezone.utc)
        if not token:
            return None
        if token == self._rejected:
            logger.warning(
                "The stored WoodMac token was rejected; waiting for a new one"
            )
            return None
        if expires is not None and expires - _TOKEN_MARGIN <= now:
            logger.warning(
                "The WoodMac login token expired at %s; run publish_token on a signed-in machine",
                expires.isoformat(timespec="minutes"),
            )
            return None
        return token

    def _camera_list(self, token: str) -> list[ApiCamera]:
        now = self._clock()
        if self._cameras_at is None or now - self._cameras_at > _CAMERA_LIST_TTL:
            self._cameras = self._api.cameras(token)
            self._cameras_at = now
        return self._cameras

    def _targets(self, token: str) -> dict[str, ApiCamera]:
        """The cameras to read, keyed by the number used in image file names."""
        listed = self._camera_list(token)
        tracked = self._settings.cameras()
        if not tracked:
            return {c.file_id: c for c in listed if c.file_id}
        by_file_id = {c.file_id: c for c in listed if c.file_id}
        by_name = {c.name: c for c in listed}
        targets: dict[str, ApiCamera] = {}
        for file_id, config in tracked.items():
            camera = by_file_id.get(file_id) or by_name.get(config.plant or "")
            if camera is None:
                logger.warning(
                    "Camera %s (%s) is not in WoodMac's camera list",
                    file_id,
                    config.plant,
                )
            else:
                targets[file_id] = camera
        return targets

    def _since(self, file_id: str) -> dt.datetime:
        now = self._clock()
        newest = self._processor.newest(file_id)
        if newest is None:
            return now - dt.timedelta(hours=self._settings.FLARE_HOURS_BACK)
        floor = now - dt.timedelta(hours=self._settings.FLARE_BACKFILL_HOURS)
        return max(newest - _OVERLAP, floor)

    def cycle(self) -> int:
        """Fetch and process whatever is new. Returns how many images were new.

        WoodMac returns at most a day of frames per request, so after a long gap the collector
        walks forward in windows, processing each one before asking for the next.
        """
        token = self._token()
        if token is None:
            return 0
        total = 0
        try:
            targets = self._targets(token)
            starts = {file_id: self._since(file_id) for file_id in targets}
            if not starts:
                return 0
            window = min(starts.values())
            now = self._clock()
            while window < now:
                wanted: dict[str, ApiImage] = {}
                for file_id, camera in targets.items():
                    start = max(starts[file_id], window)
                    if start >= now:
                        continue
                    for image in self._api.images(token, camera.api_id, start):
                        if not self._processor.knows(image.file_name):
                            wanted[image.file_name] = image
                total += self._process(list(wanted.values()))
                window += _WINDOW
        except TokenRejected as error:
            self._rejected = token
            logger.error(
                "WoodMac rejected the login token (%s); waiting for a new one", error
            )
        return total

    def _process(self, wanted: list[ApiImage]) -> int:
        with ThreadPoolExecutor(_DOWNLOADS) as pool:
            frames = list(pool.map(self._download, wanted))
        images = [
            (i.file_name, data) for i, data in zip(wanted, frames, strict=True) if data
        ]
        new = self._processor.process_batch(images)
        logger.info("API read: %s frame(s) downloaded, %s new", len(images), new)
        return new

    def _download(self, image: ApiImage) -> bytes | None:
        try:
            return self._api.download(image.url)
        except Exception as error:
            logger.warning("Could not download %s: %s", image.file_name, error)
            return None


def run_api() -> None:
    settings = CollectorSettings()
    repository = FlareMonitorRepository()
    cache = ImageCache(settings.cache_dir, settings.FLARE_CACHE_HOURS)
    processor = FlareProcessor(settings, repository, ThermalBlobClassifier(), cache)
    processor.start()
    collector = ApiCollector(
        settings, repository, processor, WoodMacApi(settings.WOODMAC_API_BASE)
    )
    logger.info(
        "Flare collector started in API mode: %s camera(s) configured, images stamped in %s",
        len(settings.cameras()) or "all",
        settings.FLARE_IMAGE_TIMEZONE,
    )
    while True:
        try:
            collector.cycle()
        except Exception:
            logger.exception("Collection cycle failed")
        try:
            processor.check_missing()
            removed = cache.purge(_utc_now())
            if removed:
                logger.info(
                    "Discarded %s cached image(s) older than the retention window",
                    removed,
                )
        except Exception:
            logger.exception("Housekeeping failed")
        time.sleep(settings.FLARE_POLL_SECONDS)
