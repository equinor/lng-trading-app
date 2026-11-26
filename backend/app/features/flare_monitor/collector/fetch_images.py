"""Download the tracked cameras' recent images to the cache folder, for labelling.

    cd backend
    uv run --group collector python -m app.features.flare_monitor.collector.fetch_images --hours 12

No Databricks and nothing classified: it only signs in, makes sure the cameras are on the
dashboard, and saves the images under FLARE_CACHE_DIR/<camera id>/. Only the cameras in
FLARE_CAMERAS are kept. The labelling tool reads that folder.
"""

from __future__ import annotations

import argparse
import asyncio
import logging

from playwright.async_api import async_playwright

from app.features.flare_monitor.collector.cache import ImageCache
from app.features.flare_monitor.collector.cameras import ensure_cameras, limit_history
from app.features.flare_monitor.collector.filenames import parse_image_name
from app.features.flare_monitor.collector.session import remember_session, sign_in
from app.features.flare_monitor.collector.settings import CollectorSettings
from app.features.flare_monitor.collector.worker import MapReader

logger = logging.getLogger(__name__)


async def fetch(hours: int, max_seconds: int) -> None:
    settings = CollectorSettings()
    cameras = settings.cameras()
    cache = ImageCache(settings.cache_dir, settings.FLARE_CACHE_HOURS)
    async with async_playwright() as playwright:
        session = await sign_in(playwright, settings)
        try:
            await limit_history(session.context, hours)
            await ensure_cameras(
                session.page, [c.plant for c in cameras.values() if c.plant]
            )
            reader = MapReader(session, settings)
            images = await reader.read_until_idle(max_seconds)
            await remember_session(session, settings)
        finally:
            await session.close()

    saved = 0
    per_camera: dict[str, int] = {}
    for name, data in images:
        parsed = parse_image_name(name, settings.image_timezone)
        if parsed is None or (cameras and parsed.camera_id not in cameras):
            continue
        path = settings.cache_dir / parsed.camera_id / parsed.file_name
        if not path.exists():
            cache.save(parsed.camera_id, parsed.file_name, data)
            saved += 1
        per_camera[parsed.camera_id] = per_camera.get(parsed.camera_id, 0) + 1
    print(  # noqa: T201
        f"Saved {saved} new image(s) to {settings.cache_dir.resolve()} "
        f"({len(per_camera)} camera(s), {len(images)} loaded in total)"
    )
    for camera_id, count in sorted(per_camera.items(), key=lambda item: int(item[0])):
        label = cameras[camera_id].plant if camera_id in cameras else ""
        print(f"  {camera_id:>5}  {count:>4}  {label}")  # noqa: T201


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--hours", type=int, default=12, help="hours of history to load"
    )
    parser.add_argument(
        "--max-seconds", type=int, default=300, help="longest wait for images"
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    asyncio.run(fetch(args.hours, args.max_seconds))


if __name__ == "__main__":
    main()
