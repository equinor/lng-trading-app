from __future__ import annotations

import datetime as dt
import logging
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from playwright.async_api import BrowserContext, Page, Route
from playwright.async_api import TimeoutError as PlaywrightTimeout

logger = logging.getLogger(__name__)

# WoodMac allows this many cameras on the dashboard at once.
MAX_CAMERAS = 24
_ADD = re.compile(r"^\s*add\s*$", re.IGNORECASE)


_IMAGE_LIST = re.compile(r"/natgas/iot/v1/cameras/\d+/images")


async def limit_history(context: BrowserContext, hours: int) -> None:
    """Make the dashboard load only the last `hours` of frames, on every page load.

    The page asks WoodMac for each camera's frames since `minTimestamp`, which its "Hours Back"
    setting (3 by default) fills in. That setting is not remembered across reloads, so the
    request is rewritten instead.
    """

    async def rewrite(route: Route) -> None:
        url = urlsplit(route.request.url)
        since = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=hours)
        query = dict(parse_qsl(url.query))
        query["minTimestamp"] = since.strftime("%Y-%m-%dT%H:%M:%SZ")
        await route.continue_(url=urlunsplit(url._replace(query=urlencode(query))))

    await context.route(_IMAGE_LIST, rewrite)


async def ensure_cameras(page: Page, names: list[str]) -> list[str]:
    """Put the named cameras on the dashboard. Returns the names that could not be added.

    Cameras already on the dashboard are left alone; the "Add Cameras" list only offers the
    ones that are not. Names must match WoodMac's camera names exactly.
    """
    if not names:
        return []
    if len(names) > MAX_CAMERAS:
        logger.warning(
            "WoodMac shows at most %s cameras; %s were asked for",
            MAX_CAMERAS,
            len(names),
        )

    missing = [
        name for name in names if await page.get_by_text(name, exact=True).count() == 0
    ]
    if not missing:
        return []

    await page.locator("button", has_text=_ADD).first.click()
    dialog = page.locator("mat-dialog-container")
    select = dialog.locator("select")
    await select.wait_for(state="visible", timeout=15_000)
    offered = await select.locator("option").all_text_contents()
    wanted = [name for name in missing if name in offered]
    if wanted:
        await select.select_option(label=wanted)
        await dialog.locator("button", has_text=_ADD).click()
    else:
        await dialog.locator(
            "button", has_text=re.compile(r"^\s*cancel\s*$", re.I)
        ).click()
    try:
        await dialog.wait_for(state="detached", timeout=15_000)
    except PlaywrightTimeout:
        logger.warning("The Add Cameras dialog did not close")

    await page.wait_for_timeout(3_000)
    still_missing = [
        name for name in names if await page.get_by_text(name, exact=True).count() == 0
    ]
    if still_missing:
        logger.warning(
            "Cameras not on the WoodMac dashboard: %s", ", ".join(still_missing)
        )
    else:
        logger.info("Added %s camera(s) to the WoodMac dashboard", len(wanted))
    return still_missing
