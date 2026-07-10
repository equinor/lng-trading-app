# backend/app/api/deps.py
# Auth is handled by the Radix OAuth2 proxy in front of the public component.
# Radix performs the Azure AD authorization-code flow, validates tokens, and
# forwards the authenticated identity as request headers (and, when enabled, the
# bearer token). We trust those here. For local development (no proxy) we fall
# back to a dev user with full access.
#
# Authorization uses the Azure AD app roles assigned in the Enterprise
# Application:
#   - "Reader"  -> may call read (GET) routes
#   - "Writer"  -> may call write (PATCH/POST) routes (implies read)

from __future__ import annotations

import base64
import json
import logging
from typing import Annotated

from fastapi import Depends, HTTPException, Request

from app.core.config import settings

logger = logging.getLogger(__name__)

DEV_FALLBACK_EMAIL = "analyst@example.com"
# App-role values that grant write access (matched case-insensitively; a role
# whose value merely contains "writ"/"admin" also counts, to tolerate values
# like "app.writer" or "Analytics.Writer").
WRITER_ROLE = "Writer"
READER_ROLE = "Reader"


def _decode_roles(request: Request) -> list[str]:
    """Read the app-role claim from the forwarded bearer token, if present."""
    token = ""
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
    if not token:
        token = (
            request.headers.get("x-forwarded-access-token")
            or request.headers.get("x-auth-request-access-token")
            or ""
        )
    if not token or token.count(".") < 2:
        return []

    try:
        payload_b64 = token.split(".")[1]
        payload_b64 += "=" * (-len(payload_b64) % 4)
        data = json.loads(base64.urlsafe_b64decode(payload_b64))
    except Exception:
        return []

    roles = data.get("roles")
    if isinstance(roles, str):
        return [roles]
    if isinstance(roles, list):
        return [str(r) for r in roles]
    return []


def _is_writer(roles: list[str], email: str) -> bool:
    for role in roles:
        value = role.strip().lower()
        if value == WRITER_ROLE.lower() or "writ" in value or "admin" in value:
            return True
    # Break-glass: the configured superuser can always write.
    return email == settings.FIRST_SUPERUSER.strip().lower()


def get_current_user(request: Request) -> dict:
    # Headers injected by the Radix OAuth2 proxy (oauth2-proxy).
    email = (
        request.headers.get("x-auth-request-email")
        or request.headers.get("x-forwarded-email")
        or request.headers.get("x-auth-request-preferred-username")
    )
    user = (
        request.headers.get("x-auth-request-user")
        or request.headers.get("x-forwarded-user")
    )

    if not email:
        # No proxy in front (local dev / tests): full access.
        return {
            "email": DEV_FALLBACK_EMAIL,
            "name": user or DEV_FALLBACK_EMAIL,
            "roles": [WRITER_ROLE, READER_ROLE],
            "can_read": True,
            "can_write": True,
            "is_superuser": True,
        }

    email = email.strip().lower()

    # Restrict access to a single email domain (e.g. equinor.com).
    domain = settings.ALLOWED_EMAIL_DOMAIN.strip().lower()
    if domain and not email.endswith(f"@{domain}"):
        raise HTTPException(
            status_code=403,
            detail=f"Access is restricted to @{domain} accounts.",
        )

    roles = _decode_roles(request)
    # Read access: any authenticated user in the domain. Sign-in itself is
    # already restricted to the assigned groups by "Assignment required" in the
    # Enterprise Application, so reaching here means the user is authorized to read.
    can_read = True
    can_write = _is_writer(roles, email)
    logger.info("auth email=%s roles=%s can_write=%s", email, roles, can_write)

    return {
        "email": email,
        "name": user or email,
        "roles": roles,
        "can_read": can_read,
        "can_write": can_write,
        "is_superuser": can_write,
    }


CurrentUser = Annotated[dict, Depends(get_current_user)]


def require_reader(user: CurrentUser) -> dict:
    if not user.get("can_read"):
        raise HTTPException(status_code=403, detail="Read access required.")
    return user


def require_writer(user: CurrentUser) -> dict:
    if not user.get("can_write"):
        raise HTTPException(
            status_code=403,
            detail="Write access requires the Writer role.",
        )
    return user


ReaderUser = Annotated[dict, Depends(require_reader)]
WriterUser = Annotated[dict, Depends(require_writer)]
