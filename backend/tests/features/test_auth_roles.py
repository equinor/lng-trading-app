import base64
import json

import pytest
from fastapi import Request

from app.api.dependencies import get_current_user
from app.core.config import settings


def _request(email: str, roles: list[str]) -> Request:
    payload = base64.urlsafe_b64encode(json.dumps({"roles": roles}).encode()).rstrip(
        b"="
    )
    token = b"header." + payload + b".signature"
    headers = [
        (b"x-auth-request-email", email.encode()),
        (b"authorization", b"Bearer " + token),
    ]
    return Request({"type": "http", "headers": headers, "method": "GET", "path": "/"})


@pytest.fixture(autouse=True)
def _any_email_domain(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ALLOWED_EMAIL_DOMAIN", "")


def test_writers_are_admins() -> None:
    user = get_current_user(_request("writer@example.com", ["Writer"]))

    assert user["can_write"] is True
    assert user["is_admin"] is True


def test_readers_are_not_admins() -> None:
    user = get_current_user(_request("reader@example.com", ["Reader"]))

    assert user["can_write"] is False
    assert user["is_admin"] is False


def test_users_without_roles_are_not_admins() -> None:
    user = get_current_user(_request("nobody@example.com", []))

    assert user["is_admin"] is False
