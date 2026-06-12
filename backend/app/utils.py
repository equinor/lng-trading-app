import base64
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
import jwt
from jinja2 import Template
from jwt.exceptions import InvalidTokenError

from app.core import security
from app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class EmailData:
    html_content: str
    subject: str


def render_email_template(*, template_name: str, context: dict[str, Any]) -> str:
    template_str = (
        Path(__file__).parent / "email-templates" / "build" / template_name
    ).read_text()
    html_content = Template(template_str).render(context)
    return html_content


def send_email(
    *,
    email_to: str = "",
    subject: str = "",
    html_content: str = "",
) -> None:
    assert settings.emails_enabled, "Equinor Atlas email not configured"

    recipient = email_to or settings.ATLAS_DEFAULT_RECIPIENT

    # Get access token via client credentials flow
    scope = f"https://{settings.atlas_host}/management/api/.default"
    token_url = f"https://login.microsoftonline.com/{settings.ATLAS_TENANT_ID}/oauth2/v2.0/token"
    token_resp = httpx.post(token_url, data={
        "client_id": settings.ATLAS_CLIENT_ID,
        "client_secret": settings.ATLAS_CLIENT_SECRET,
        "scope": scope,
        "grant_type": "client_credentials",
    }, timeout=30.0)
    if token_resp.status_code != 200:
        logger.error(f"Token request failed ({token_resp.status_code}): {token_resp.text}")
    token_resp.raise_for_status()
    access_token = token_resp.json()["access_token"]

    # Send mail via Atlas API
    api_url = f"https://{settings.atlas_host}/management/api/messages/mail"
    html_b64 = base64.b64encode(html_content.encode("utf-8")).decode("ascii")
    mail_message = {
        "subject": subject,
        "replyTo": settings.ATLAS_REPLY_TO,
        "htmlContent": html_b64,
        "recipients": [recipient],
    }
    resp = httpx.post(
        api_url,
        json=mail_message,
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        timeout=30.0,
    )
    if resp.status_code != 200:
        logger.error(f"Atlas mail failed ({resp.status_code}): {resp.text}")
    resp.raise_for_status()
    logger.info(f"Atlas mail to {recipient}: {resp.status_code}")


def generate_test_email(email_to: str) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Test email"
    html_content = render_email_template(
        template_name="test_email.html",
        context={"project_name": settings.PROJECT_NAME, "email": email_to},
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_reset_password_email(email_to: str, email: str, token: str) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Password recovery for user {email}"
    link = f"{settings.FRONTEND_HOST}/reset-password?token={token}"
    html_content = render_email_template(
        template_name="reset_password.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "username": email,
            "email": email_to,
            "valid_hours": settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS,
            "link": link,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_new_account_email(
    email_to: str, username: str, password: str
) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - New account for user {username}"
    html_content = render_email_template(
        template_name="new_account.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "username": username,
            "password": password,
            "email": email_to,
            "link": settings.FRONTEND_HOST,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_password_reset_token(email: str) -> str:
    delta = timedelta(hours=settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS)
    now = datetime.now(timezone.utc)
    expires = now + delta
    exp = expires.timestamp()
    encoded_jwt = jwt.encode(
        {"exp": exp, "nbf": now, "sub": email},
        settings.SECRET_KEY,
        algorithm=security.ALGORITHM,
    )
    return encoded_jwt


def verify_password_reset_token(token: str) -> str | None:
    try:
        decoded_token = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        return str(decoded_token["sub"])
    except InvalidTokenError:
        return None
