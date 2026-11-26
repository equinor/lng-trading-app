from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from pydantic import BaseModel, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.features.flare_monitor.collector.classifier import CameraConfig
from app.features.flare_monitor.collector.state import Thresholds


class CollectorSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env", env_ignore_empty=True, extra="ignore"
    )

    WOODMAC_MAP_URL: str = "https://cta.woodmac.com/natgas/images#3/42/-97"
    WOODMAC_IMAGE_HOST: str = "genimages.blob.core.windows.net"
    WOODMAC_IMAGE_PATH_MARKER: str = "/irimageimages/"

    # Service account used to sign in automatically.
    WOODMAC_USERNAME: str | None = None
    WOODMAC_PASSWORD: str | None = None
    # Fallback: a Playwright storage state (JSON, or the same base64-encoded) saved after signing
    # in by hand with `python -m app.features.flare_monitor.collector.save_session`.
    WOODMAC_STORAGE_STATE: str | None = None

    # Cameras to track, as JSON: {"1577": {"plant": "Cameron LNG", "roi": [0, 0, 0.4, 0.55]}}.
    # When empty, every camera that shows up on the map is tracked.
    FLARE_CAMERAS: str | None = None

    # Time zone of the wall-clock timestamps in the image file names.
    FLARE_IMAGE_TIMEZONE: str = "America/New_York"
    FLARE_POLL_SECONDS: int = 300
    # How long to wait for the map's image requests after each reload.
    FLARE_SETTLE_SECONDS: int = 30
    # No new image for this long marks a camera unknown.
    # The dashboard's "Hours Back" setting: how much history the map loads on each reload.
    FLARE_HOURS_BACK: int = 1
    FLARE_MISSING_MINUTES: int = 30
    # Wait this long before trying to sign in again after a failure, so a bad password or a new
    # MFA prompt does not lock the service account.
    FLARE_SIGNIN_RETRY_MINUTES: int = 30
    FLARE_CACHE_DIR: str = "/tmp/flare_images"
    FLARE_CACHE_HOURS: int = 6
    FLARE_FLARE_REQUIRED: int = 2
    FLARE_CLEAR_REQUIRED: int = 3
    FLARE_UNUSABLE_REQUIRED: int = 3
    # Sign in through a browser profile on this machine (for example an Edge profile on an Equinor
    # laptop, where Equinor single sign-on logs in without a prompt). Tried before the others.
    FLARE_BROWSER_PROFILE: str | None = None
    # Browser to use with the profile, such as "msedge". Empty means Playwright's own Chromium.
    FLARE_BROWSER_CHANNEL: str | None = None
    # The email typed on WoodMac's sign-on page when the profile is signed out. Equinor sign-on
    # then completes by itself on a managed laptop.
    FLARE_SSO_USERNAME: str | None = None
    # Show the browser (local debugging only).
    FLARE_HEADED: bool = False
    # Start Chromium without its own sandbox. Needed in a container that does not allow user
    # namespaces (Radix); the container itself is non-root and only opens WoodMac.
    FLARE_NO_SANDBOX: bool = False

    @field_validator("FLARE_IMAGE_TIMEZONE")
    @classmethod
    def _check_timezone(cls, value: str) -> str:
        ZoneInfo(value)
        return value

    @property
    def image_timezone(self) -> ZoneInfo:
        return ZoneInfo(self.FLARE_IMAGE_TIMEZONE)

    @property
    def thresholds(self) -> Thresholds:
        return Thresholds(
            flare_required=self.FLARE_FLARE_REQUIRED,
            clear_required=self.FLARE_CLEAR_REQUIRED,
            unusable_required=self.FLARE_UNUSABLE_REQUIRED,
        )

    @property
    def cache_dir(self) -> Path:
        return Path(self.FLARE_CACHE_DIR)

    def cameras(self) -> dict[str, CameraConfig]:
        return parse_cameras(self.FLARE_CAMERAS)

    def storage_state(self) -> dict[str, Any] | None:
        return parse_storage_state(self.WOODMAC_STORAGE_STATE)


class _CameraEntry(BaseModel):
    plant: str | None = None
    roi: tuple[float, float, float, float] = (0.0, 0.0, 1.0, 1.0)
    hot_delta: float = 90.0
    min_pixels: int = 100
    max_clear_pixels: int = 10


def parse_cameras(raw: str | None) -> dict[str, CameraConfig]:
    if not raw:
        return {}
    entries = json.loads(raw)
    return {
        str(camera_id): CameraConfig(
            **_CameraEntry.model_validate(entry or {}).model_dump()
        )
        for camera_id, entry in entries.items()
    }


def parse_storage_state(raw: str | None) -> dict[str, Any] | None:
    if not raw:
        return None
    text = raw.strip()
    if not text.startswith("{"):
        text = base64.b64decode(text).decode("utf-8")
    state: dict[str, Any] = json.loads(text)
    return state
