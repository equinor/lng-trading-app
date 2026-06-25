# backend/app/services/databricks_jobs.py
"""Trigger the Databricks news pipeline and read its last-run status via the Jobs REST API.

When Databricks is not configured (e.g. NEWS_BACKEND=mock or missing job id/token), the
module falls back to an in-memory mock so the "Run pipeline" button still works locally.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_DEFAULT_TIMEOUT = 30.0

# In-memory fallback state for mock / unconfigured environments.
_mock_last_run: dict | None = None


def _ssl_verify() -> str | bool:
    """Return an httpx ``verify`` value.

    On a corporate network that intercepts TLS, point DATABRICKS_CA_BUNDLE at the
    company's CA bundle (.pem) so the chain validates without disabling checks.
    """
    if settings.DATABRICKS_CA_BUNDLE:
        return settings.DATABRICKS_CA_BUNDLE
    return settings.DATABRICKS_VERIFY_SSL


def _workspace_host() -> str | None:
    raw = settings.DATABRICKS_WORKSPACE_URL or settings.DATABRICKS_SERVER_HOSTNAME
    if not raw:
        return None
    host = raw.strip().rstrip("/")
    if not host.startswith("http://") and not host.startswith("https://"):
        host = f"https://{host}"
    return host


def _aad_token() -> str | None:
    tenant = settings.DATABRICKS_TENANT_ID or settings.AZURE_TENANT_ID
    client_id = settings.DATABRICKS_CLIENT_ID or settings.AZURE_CLIENT_ID
    client_secret = settings.DATABRICKS_CLIENT_SECRET or settings.AZURE_CLIENT_SECRET
    if not (tenant and client_id and client_secret):
        return None
    url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
    resp = httpx.post(
        url,
        data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": settings.DATABRICKS_AAD_SCOPE,
        },
        timeout=_DEFAULT_TIMEOUT,
        verify=_ssl_verify(),
    )
    resp.raise_for_status()
    return resp.json().get("access_token")


def _bearer_token() -> str | None:
    if settings.DATABRICKS_TOKEN:
        return settings.DATABRICKS_TOKEN
    if settings.DATABRICKS_USE_SERVICE_PRINCIPAL:
        return _aad_token()
    return None


def _is_configured() -> bool:
    return bool(_workspace_host() and settings.DATABRICKS_JOB_ID)


def _ms_to_iso(value: object) -> str | None:
    try:
        ms = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if ms <= 0:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()


def _empty_status(configured: bool) -> dict:
    return {
        "configured": configured,
        "run_id": None,
        "state": None,
        "result": None,
        "start_time": None,
        "end_time": None,
        "run_url": None,
    }


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def get_last_run() -> dict:
    """Return the most recent pipeline run status."""
    if not _is_configured():
        return _mock_last_run or _empty_status(False)

    host = _workspace_host()
    token = _bearer_token()
    if not (host and token):
        return _mock_last_run or _empty_status(False)

    print("CA bundle:", repr(settings.DATABRICKS_CA_BUNDLE), "| verify:", _ssl_verify(), flush=True)
    resp = httpx.get(
        f"{host}/api/2.1/jobs/runs/list",
        headers=_headers(token),
        params={"job_id": settings.DATABRICKS_JOB_ID, "limit": 1},
        timeout=_DEFAULT_TIMEOUT,
        verify=_ssl_verify(),
    )
    resp.raise_for_status()
    runs = resp.json().get("runs") or []
    if not runs:
        return _empty_status(True)

    run = runs[0]
    state = run.get("state") or {}
    return {
        "configured": True,
        "run_id": run.get("run_id"),
        "state": state.get("life_cycle_state"),
        "result": state.get("result_state"),
        "start_time": _ms_to_iso(run.get("start_time")),
        "end_time": _ms_to_iso(run.get("end_time")),
        "run_url": run.get("run_page_url"),
    }


def trigger_run() -> dict:
    """Start a new pipeline run. Returns the created run id."""
    global _mock_last_run

    if not _is_configured():
        now_iso = datetime.now(tz=timezone.utc).isoformat()
        _mock_last_run = {
            "configured": False,
            "run_id": int(time.time()),
            "state": "TERMINATED",
            "result": "SUCCESS",
            "start_time": now_iso,
            "end_time": now_iso,
            "run_url": None,
        }
        return {"ok": True, "run_id": _mock_last_run["run_id"]}

    host = _workspace_host()
    token = _bearer_token()
    if not (host and token):
        raise RuntimeError("Databricks credentials are not configured.")

    resp = httpx.post(
        f"{host}/api/2.1/jobs/run-now",
        headers=_headers(token),
        json={"job_id": int(settings.DATABRICKS_JOB_ID)},
        timeout=_DEFAULT_TIMEOUT,
        verify=_ssl_verify(),
    )
    resp.raise_for_status()
    return {"ok": True, "run_id": resp.json().get("run_id")}
