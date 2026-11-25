"""Sign in to WoodMac by hand once and print the session for the WOODMAC_STORAGE_STATE secret.

Run on your own machine (it opens a browser):

    cd backend
    uv run --group collector python -m app.features.flare_monitor.collector.save_session

Then store the printed value as the `WOODMAC_STORAGE_STATE` secret in Radix. Repeat when the
session expires and the collector reports that it could not sign in.
"""

from __future__ import annotations

import asyncio
import base64
import json

from playwright.async_api import async_playwright

from app.features.flare_monitor.collector.settings import CollectorSettings


async def main() -> None:
    settings = CollectorSettings()
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        await page.goto(settings.WOODMAC_MAP_URL)
        await asyncio.to_thread(
            input,
            "Sign in to WoodMac in the browser, open the map, then press Enter here... ",
        )
        state = await context.storage_state()
        await browser.close()

    encoded = base64.b64encode(json.dumps(state).encode("utf-8")).decode("ascii")
    print("\nWOODMAC_STORAGE_STATE (treat it like a password):\n")  # noqa: T201
    print(encoded)  # noqa: T201


if __name__ == "__main__":
    asyncio.run(main())
