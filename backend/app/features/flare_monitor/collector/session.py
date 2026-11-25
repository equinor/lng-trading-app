from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from playwright.async_api import Browser, BrowserContext, Page, Playwright
from playwright.async_api import TimeoutError as PlaywrightTimeout

from app.features.flare_monitor.collector.settings import CollectorSettings

logger = logging.getLogger(__name__)

_USERNAME = ", ".join(
    [
        "input[type=email]",
        "input[name=loginfmt]",
        "input[name=username]",
        "input[name=email]",
        "input[autocomplete=username]",
        "input#username",
        "input#email",
    ]
)
_PASSWORD = "input[type=password]"
_SUBMIT = ", ".join(
    [
        "#idSIButton9",
        "button[type=submit]",
        "input[type=submit]",
        'button:has-text("Sign in")',
        'button:has-text("Log in")',
        'button:has-text("Next")',
    ]
)
_STEP_TIMEOUT_MS = 15_000


class SignInFailed(Exception):
    """Neither the service account nor the saved session produced a signed-in browser."""


@dataclass
class Session:
    browser: Browser
    context: BrowserContext
    page: Page
    method: str

    async def close(self) -> None:
        await self.context.close()
        await self.browser.close()


async def _open(
    playwright: Playwright,
    settings: CollectorSettings,
    storage_state: Any,
) -> tuple[Browser, BrowserContext, Page]:
    browser = await playwright.chromium.launch(
        headless=not settings.FLARE_HEADED,
        args=["--disable-dev-shm-usage"],
    )
    context = await browser.new_context(storage_state=storage_state)
    page = await context.new_page()
    return browser, context, page


def _on_map(page: Page, settings: CollectorSettings) -> bool:
    return urlparse(page.url).netloc == urlparse(settings.WOODMAC_MAP_URL).netloc


async def needs_sign_in(page: Page, settings: CollectorSettings) -> bool:
    if not _on_map(page, settings):
        return True
    return await page.locator(_PASSWORD).count() > 0


async def load_map(page: Page, settings: CollectorSettings) -> None:
    await page.goto(settings.WOODMAC_MAP_URL, wait_until="domcontentloaded")
    try:
        await page.wait_for_load_state("networkidle", timeout=_STEP_TIMEOUT_MS)
    except PlaywrightTimeout:
        pass


async def _fill_credentials(page: Page, username: str, password: str) -> None:
    """Handles one-page and two-step (username, then password) sign-in forms."""
    user_field = page.locator(_USERNAME).first
    await user_field.wait_for(state="visible", timeout=_STEP_TIMEOUT_MS)
    await user_field.fill(username)
    if (
        await page.locator(_PASSWORD).count() == 0
        or not await page.locator(_PASSWORD).first.is_visible()
    ):
        await page.locator(_SUBMIT).first.click()
    password_field = page.locator(_PASSWORD).first
    await password_field.wait_for(state="visible", timeout=_STEP_TIMEOUT_MS)
    await password_field.fill(password)
    await page.locator(_SUBMIT).first.click()

    # Microsoft-style "Stay signed in?" prompt, if it appears.
    try:
        await page.locator("#idSIButton9").click(timeout=5_000)
    except PlaywrightTimeout:
        pass


async def _service_account(
    playwright: Playwright, settings: CollectorSettings
) -> Session | None:
    if not (settings.WOODMAC_USERNAME and settings.WOODMAC_PASSWORD):
        return None
    browser, context, page = await _open(playwright, settings, None)
    try:
        await load_map(page, settings)
        if await needs_sign_in(page, settings):
            await _fill_credentials(
                page, settings.WOODMAC_USERNAME, settings.WOODMAC_PASSWORD
            )
            await page.wait_for_load_state("networkidle", timeout=30_000)
            await load_map(page, settings)
        if await needs_sign_in(page, settings):
            raise SignInFailed(
                "still on the sign-in page (MFA, captcha or changed form?)"
            )
        return Session(browser, context, page, "service account")
    except Exception as error:
        logger.warning("Service-account sign-in failed: %s", error)
        await context.close()
        await browser.close()
        return None


def _session_file(settings: CollectorSettings) -> Path:
    return settings.cache_dir / "woodmac_session.json"


async def remember_session(session: Session, settings: CollectorSettings) -> None:
    """Keep the browser's renewed session so a restart can pick it up."""
    path = _session_file(settings)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        await session.context.storage_state(path=path)
    except Exception:
        logger.debug("Could not save the session", exc_info=True)


async def _saved_session(
    playwright: Playwright, settings: CollectorSettings
) -> Session | None:
    """Try the session kept from the last run first, then the WOODMAC_STORAGE_STATE secret."""
    states: list[Any] = []
    path = _session_file(settings)
    if path.exists():
        states.append(json.loads(path.read_text(encoding="utf-8")))
    secret = settings.storage_state()
    if secret is not None:
        states.append(secret)

    for state in states:
        browser, context, page = await _open(playwright, settings, state)
        try:
            await load_map(page, settings)
            if await needs_sign_in(page, settings):
                raise SignInFailed("the saved session has expired")
            return Session(browser, context, page, "saved session")
        except Exception as error:
            logger.warning("Saved-session sign-in failed: %s", error)
            await context.close()
            await browser.close()
    return None


async def sign_in(playwright: Playwright, settings: CollectorSettings) -> Session:
    """Sign in with the service account, falling back to the saved session."""
    for attempt in (_service_account, _saved_session):
        session = await attempt(playwright, settings)
        if session is not None:
            logger.info("Signed in to WoodMac using the %s", session.method)
            return session
    raise SignInFailed(
        "could not sign in: set WOODMAC_USERNAME/WOODMAC_PASSWORD, or refresh WOODMAC_STORAGE_STATE"
    )
