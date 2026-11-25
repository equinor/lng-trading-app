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
_CLEAR = re.compile(r"^\s*clear\s*$", re.IGNORECASE)


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


async def _shown_names(page: Page) -> list[str]:
    """Names of the cameras on the dashboard, read from the panel headers.

    Matching the name anywhere on the page is not enough: the Add Cameras dialog lists the
    names too.
    """
    names: list[str] = await page.evaluate(
        """() => [...document.querySelectorAll('.camera-header')].map(
            header => header.innerText.replace('(reference image)', '').trim()
        )"""
    )
    return names


async def ensure_cameras(page: Page, names: list[str]) -> list[str]:
    """Make the dashboard show exactly the named cameras. Returns the names it could not add.

    Names must match WoodMac's camera names exactly. If the dashboard shows any other camera,
    it is cleared first and the named ones are added again, so cameras you do not track are not
    loaded. The "Add Cameras" list only offers cameras that are not on the dashboard yet.
    """
    if not names:
        return []
    if len(names) > MAX_CAMERAS:
        logger.warning(
            "WoodMac shows at most %s cameras; %s were asked for",
            MAX_CAMERAS,
            len(names),
        )

    shown = await _shown_names(page)
    extra = [name for name in shown if name not in names]
    if extra:
        logger.info(
            "Removing %s camera(s) that are not tracked from the dashboard", len(extra)
        )
        await page.locator("button", has_text=_CLEAR).first.click()
        await page.wait_for_timeout(2_000)
        shown = await _shown_names(page)
    missing = [name for name in names if name not in shown]
    if not missing:
        return []

    dialog = page.locator("mat-dialog-container")
    # With an empty dashboard the page opens the Add Cameras dialog by itself.
    if await dialog.count() == 0:
        await page.locator("button", has_text=_ADD).first.click()
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
    shown = await _shown_names(page)
    still_missing = [name for name in names if name not in shown]
    if still_missing:
        logger.warning(
            "Cameras not on the WoodMac dashboard: %s", ", ".join(still_missing)
        )
    else:
        logger.info("Added %s camera(s) to the WoodMac dashboard", len(wanted))
    return still_missing
