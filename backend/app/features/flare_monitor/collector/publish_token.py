"""Sign in to WoodMac on this machine and store its login token for the deployed collector.

    cd backend
    uv run --group collector python -m app.features.flare_monitor.collector.publish_token

It signs in through the browser profile (FLARE_BROWSER_PROFILE, where Equinor single sign-on logs
in without a prompt), reads the login token the WoodMac page uses, and saves it in the
`flare_api_token` table. The token lasts 24 hours, so run this at least once a day; see the
README for a Windows scheduled task. It prints when the token expires, never the token.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import getpass
import logging

from playwright.async_api import async_playwright

from app.features.flare_monitor.collector.api_source import token_expiry
from app.features.flare_monitor.collector.session import Session, sign_in
from app.features.flare_monitor.collector.settings import CollectorSettings
from app.features.flare_monitor.repository import FlareMonitorRepository

logger = logging.getLogger(__name__)

_TIMEOUT_MS = 60_000
# Warn when the token is shorter-lived than this, since the next scheduled run might miss it.
_SHORT_LIFE = dt.timedelta(hours=12)


_EXPIRE_CACHED_TOKEN = """() => {
    // The page reuses the access token it already holds until it nearly expires. Marking it as
    // expired makes the page do its normal token refresh, so the stored token is always new.
    for (const key of Object.keys(localStorage)) {
        if (!key.startsWith('@@auth0spajs@@')) continue;
        try {
            const entry = JSON.parse(localStorage.getItem(key));
            if (entry && entry.body && entry.body.access_token) {
                entry.expiresAt = 0;
                localStorage.setItem(key, JSON.stringify(entry));
            }
        } catch (error) { /* not a token entry */ }
    }
}"""


async def capture_token(session: Session, settings: CollectorSettings) -> str:
    """The Bearer token the WoodMac page sends to its camera API."""
    api_host = settings.WOODMAC_API_BASE.split("/")[2]
    await session.page.evaluate(_EXPIRE_CACHED_TOKEN)
    async with session.page.expect_request(
        lambda request: request.url.split("/")[2] == api_host, timeout=_TIMEOUT_MS
    ) as pending:
        await session.page.reload(wait_until="domcontentloaded")
    request = await pending.value
    authorization = (await request.all_headers()).get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise RuntimeError("The WoodMac page sent no login token")
    return token


async def publish() -> dt.datetime:
    settings = CollectorSettings()
    async with async_playwright() as playwright:
        session = await sign_in(playwright, settings)
        try:
            token = await capture_token(session, settings)
        finally:
            # Closing the browser cleanly saves the renewed login in the profile.
            await session.close()

    expires = token_expiry(token)
    if expires is None:
        raise RuntimeError("Could not read when the login token expires")
    repository = FlareMonitorRepository()
    await asyncio.to_thread(repository.ensure_tables)
    await asyncio.to_thread(repository.save_token, token, expires, getpass.getuser())
    left = expires - dt.datetime.now(dt.timezone.utc)
    logger.info(
        "Stored the WoodMac login token, valid until %s (%.1f hours)",
        expires.isoformat(timespec="minutes"),
        left.total_seconds() / 3600,
    )
    if left < _SHORT_LIFE:
        logger.warning("The token has less than 12 hours left; run this more often")
    return expires


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    asyncio.run(publish())


if __name__ == "__main__":
    main()
