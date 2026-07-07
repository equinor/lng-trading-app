# backend/app/api/deps.py
# Auth is handled by the Radix OAuth2 proxy in front of the public component.
# Radix performs the Azure AD authorization-code flow, validates tokens, and
# forwards the authenticated identity as request headers. We trust those headers
# here. For local development (no proxy) we fall back to a dev user.

from typing import Annotated

from fastapi import Depends, Request

from app.core.config import settings

DEV_FALLBACK_EMAIL = "analyst@example.com"


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
        # No proxy in front (local dev / tests): use a fallback identity.
        email = DEV_FALLBACK_EMAIL

    return {
        "email": email,
        "name": user or email,
        "is_superuser": email == settings.FIRST_SUPERUSER,
    }


CurrentUser = Annotated[dict, Depends(get_current_user)]
