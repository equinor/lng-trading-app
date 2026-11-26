from __future__ import annotations

import asyncio
import datetime as dt
import logging
from urllib.parse import urlparse

from playwright.async_api import Page, Response, async_playwright

from app.features.flare_monitor.collector.cache import ImageCache
from app.features.flare_monitor.collector.cameras import ensure_cameras, limit_history
from app.features.flare_monitor.collector.classifier import ThermalBlobClassifier
from app.features.flare_monitor.collector.processor import FlareProcessor
from app.features.flare_monitor.collector.session import (
    Session,
    SignInFailed,
    needs_sign_in,
    remember_session,
    sign_in,
)
from app.features.flare_monitor.collector.settings import CollectorSettings
from app.features.flare_monitor.repository import FlareMonitorRepository

logger = logging.getLogger(__name__)

# A step that takes longer than this is abandoned and retried, so a stuck page cannot stall the
# collector for good.
_SIGN_IN_TIMEOUT = 180
_STEP_TIMEOUT = 240


class MapReader:
    """Collects the camera images the WoodMac map requests while it loads."""

    def __init__(self, session: Session, settings: CollectorSettings) -> None:
        self._session = session
        self._settings = settings
        self._pending: list[asyncio.Task[None]] = []
        self._images: dict[str, bytes] = {}
        session.page.on("response", self._on_response)

    def _on_response(self, response: Response) -> None:
        parsed = urlparse(response.url)
        if (
            response.request.method == "GET"
            and response.status == 200
            and parsed.netloc == self._settings.WOODMAC_IMAGE_HOST
            and self._settings.WOODMAC_IMAGE_PATH_MARKER in parsed.path
            and parsed.path.lower().endswith(".jpg")
        ):
            self._pending.append(
                asyncio.create_task(self._store(response, parsed.path))
            )

    async def _store(self, response: Response, path: str) -> None:
        try:
            # The query string is a signed token, so only the path is kept.
            self._images[path.rsplit("/", 1)[-1]] = await response.body()
        except Exception as error:
            logger.warning("Could not read an image response: %s", error)

    async def read(self) -> list[tuple[str, bytes]]:
        """Reload the map and return the images it fetched."""
        page: Page = self._session.page
        self._images = {}
        await page.reload(wait_until="domcontentloaded")
        await page.wait_for_timeout(self._settings.FLARE_SETTLE_SECONDS * 1000)
        if self._pending:
            await asyncio.gather(*self._pending, return_exceptions=True)
            self._pending.clear()
        if await needs_sign_in(page, self._settings):
            raise SignInFailed("the session ended")
        return list(self._images.items())

    async def read_until_idle(
        self, max_seconds: int, idle_seconds: int = 20
    ) -> list[tuple[str, bytes]]:
        """Reload the map and wait until no new images arrive (for long history windows)."""
        page: Page = self._session.page
        self._images = {}
        await page.reload(wait_until="domcontentloaded")
        waited = quiet = 0
        count = 0
        while waited < max_seconds and quiet < idle_seconds:
            await page.wait_for_timeout(5_000)
            waited += 5
            if self._pending:
                await asyncio.gather(*self._pending, return_exceptions=True)
                self._pending.clear()
            quiet = 0 if len(self._images) != count else quiet + 5
            count = len(self._images)
        if await needs_sign_in(page, self._settings):
            raise SignInFailed("the session ended")
        return list(self._images.items())


async def run() -> None:
    settings = CollectorSettings()
    cache = ImageCache(settings.cache_dir, settings.FLARE_CACHE_HOURS)
    processor = FlareProcessor(
        settings, FlareMonitorRepository(), ThermalBlobClassifier(), cache
    )
    await asyncio.to_thread(processor.start)
    logger.info(
        "Flare collector started: %s camera(s) configured, images stamped in %s",
        len(settings.cameras()) or "all",
        settings.FLARE_IMAGE_TIMEZONE,
    )
    logger.info(
        "Sign-in options: service account %s, saved session secret %s",
        "set" if settings.WOODMAC_USERNAME and settings.WOODMAC_PASSWORD else "NOT set",
        "set" if settings.WOODMAC_STORAGE_STATE else "NOT set",
    )

    async with async_playwright() as playwright:
        session: Session | None = None
        reader: MapReader | None = None
        while True:
            delay = settings.FLARE_POLL_SECONDS
            try:
                if session is None:
                    session = await asyncio.wait_for(
                        sign_in(playwright, settings), _SIGN_IN_TIMEOUT
                    )
                    reader = MapReader(session, settings)
                    names = [c.plant for c in settings.cameras().values() if c.plant]
                    await limit_history(session.context, settings.FLARE_HOURS_BACK)
                    await asyncio.wait_for(
                        ensure_cameras(session.page, names), _STEP_TIMEOUT
                    )
                assert reader is not None
                images = await asyncio.wait_for(reader.read(), _STEP_TIMEOUT)
                await remember_session(session, settings)
                new = await asyncio.to_thread(processor.process_batch, images)
                logger.info("Map load: %s image(s), %s new", len(images), new)
            except SignInFailed as error:
                logger.error("WoodMac sign-in problem: %s", error)
                delay = settings.FLARE_SIGNIN_RETRY_MINUTES * 60
                await _close(session)
                session = reader = None
            except Exception:
                logger.exception("Collection cycle failed")
                await _close(session)
                session = reader = None

            try:
                await asyncio.to_thread(processor.check_missing)
                removed = cache.purge(dt.datetime.now(dt.timezone.utc))
                if removed:
                    logger.info(
                        "Discarded %s cached image(s) older than the retention window",
                        removed,
                    )
            except Exception:
                # A failed write is kept by the processor and retried next cycle.
                logger.exception("Housekeeping failed")
            await asyncio.sleep(delay)


async def _close(session: Session | None) -> None:
    if session is None:
        return
    try:
        await session.close()
    except Exception:
        logger.debug("Browser was already closed", exc_info=True)
