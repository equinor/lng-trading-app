from __future__ import annotations

import base64
import datetime as dt
import json
import logging
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

# The camera's number in the image file names appears in its reference image URL.
_REFERENCE_ID = re.compile(r"camera_(\d+)")
_TIME_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


class TokenRejected(Exception):
    """WoodMac answered 401: the login token is expired or was revoked."""


def token_expiry(token: str) -> dt.datetime | None:
    """When a login token (a JWT) expires, or None if it cannot be read."""
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        exp = json.loads(base64.urlsafe_b64decode(payload))["exp"]
        return dt.datetime.fromtimestamp(float(exp), dt.timezone.utc)
    except Exception:
        return None


@dataclass(frozen=True)
class ApiCamera:
    api_id: int
    name: str
    # The number used in image file names, when the reference image gives one.
    file_id: str | None


@dataclass(frozen=True)
class ApiImage:
    file_name: str
    url: str


class WoodMacApi:
    """The WoodMac camera API that its Images page uses, called with a login token."""

    def __init__(self, base_url: str, client: httpx.Client | None = None) -> None:
        self._base = base_url.rstrip("/")
        self._client = client or httpx.Client(timeout=30)

    def _get(
        self, path: str, token: str, params: dict[str, str] | None = None
    ) -> dict[str, Any]:
        response = self._client.get(
            f"{self._base}{path}",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
        )
        if response.status_code in (401, 403):
            raise TokenRejected(f"{path} answered {response.status_code}")
        response.raise_for_status()
        body: dict[str, Any] = response.json()
        return body

    def cameras(self, token: str) -> list[ApiCamera]:
        cameras = []
        for item in self._get("/cameras", token).get("data", []):
            match = _REFERENCE_ID.search(item.get("referenceImageUrl") or "")
            cameras.append(
                ApiCamera(
                    api_id=int(item["id"]),
                    name=item.get("cameraName", ""),
                    file_id=match.group(1) if match else None,
                )
            )
        return cameras

    def images(self, token: str, api_id: int, since: dt.datetime) -> list[ApiImage]:
        """The camera's frames taken since `since`, with signed download links."""
        body = self._get(
            f"/cameras/{api_id}/images",
            token,
            {"minTimestamp": since.astimezone(dt.timezone.utc).strftime(_TIME_FORMAT)},
        )
        images = []
        for item in body.get("data", []):
            url = item.get("url")
            if url:
                images.append(ApiImage(urlparse(url).path.rsplit("/", 1)[-1], url))
        return images

    def download(self, url: str) -> bytes:
        """Frames are signed links, so they need no login token."""
        response = self._client.get(url)
        response.raise_for_status()
        return response.content
