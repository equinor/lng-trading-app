from __future__ import annotations

import time
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from databricks import sql
from fastapi import HTTPException

from app.core.config import settings


@dataclass(frozen=True)
class ServicePrincipalConfig:
    tenant_id: str
    client_id: str
    client_secret: str
    workspace_resource_id: str | None = None


def _first_non_empty(*values: str | None) -> str | None:
    for value in values:
        if value:
            return value
    return None


def _normalize_hostname(value: str | None) -> str | None:
    if not value:
        return value
    host = value.strip()
    if host.startswith("https://"):
        host = host[len("https://") :]
    if host.startswith("http://"):
        host = host[len("http://") :]
    return host.rstrip("/")


def _sp_cfg() -> ServicePrincipalConfig:
    tenant_id = _first_non_empty(settings.DATABRICKS_TENANT_ID, settings.AZURE_TENANT_ID)
    client_id = _first_non_empty(settings.DATABRICKS_CLIENT_ID, settings.AZURE_CLIENT_ID)
    client_secret = _first_non_empty(
        settings.DATABRICKS_CLIENT_SECRET, settings.AZURE_CLIENT_SECRET
    )
    workspace_resource_id = _first_non_empty(
        settings.DATABRICKS_WORKSPACE_RESOURCE_ID,
        settings.AZURE_WORKSPACE_RESOURCE_ID,
    )

    missing: list[str] = []
    if not tenant_id:
        missing.append("DATABRICKS_TENANT_ID/AZURE_TENANT_ID")
    if not client_id:
        missing.append("DATABRICKS_CLIENT_ID/AZURE_CLIENT_ID")
    if not client_secret:
        missing.append("DATABRICKS_CLIENT_SECRET/AZURE_CLIENT_SECRET")

    if missing:
        raise HTTPException(
            status_code=503,
            detail=f"Databricks Service Principal config missing: {', '.join(missing)}",
        )

    return ServicePrincipalConfig(
        tenant_id=tenant_id,
        client_id=client_id,
        client_secret=client_secret,
        workspace_resource_id=workspace_resource_id,
    )


def _ensure_dbx_configured():
    if not settings.DATABRICKS_SERVER_HOSTNAME or not settings.DATABRICKS_HTTP_PATH:
        raise HTTPException(status_code=503, detail="Databricks not configured")


def _open_connection() -> sql.client.Connection:
    """Open a new Databricks SQL connection."""
    _ensure_dbx_configured()
    server_hostname = _normalize_hostname(settings.DATABRICKS_SERVER_HOSTNAME) or ""
    http_path = settings.DATABRICKS_HTTP_PATH or ""

    if settings.DATABRICKS_USE_SERVICE_PRINCIPAL:
        sp = _sp_cfg()
        return sql.connect(
            server_hostname=server_hostname,
            http_path=http_path,
            auth_type="azure-sp-m2m",
            azure_tenant_id=sp.tenant_id,
            azure_client_id=sp.client_id,
            azure_client_secret=sp.client_secret,
            azure_workspace_resource_id=sp.workspace_resource_id,
        )

    if not settings.DATABRICKS_TOKEN:
        raise HTTPException(
            status_code=503,
            detail=(
                "Databricks not configured: set DATABRICKS_TOKEN or enable "
                "DATABRICKS_USE_SERVICE_PRINCIPAL"
            ),
        )
    return sql.connect(
        server_hostname=server_hostname,
        http_path=http_path,
        access_token=settings.DATABRICKS_TOKEN,
    )


# Module-level cached connection — created once, reused across requests.
# On any error the cursor path will clear it so the next call reconnects.
_conn: sql.client.Connection | None = None


def _get_conn() -> sql.client.Connection:
    global _conn
    if _conn is None:
        _conn = _open_connection()
    return _conn


def _reset_conn() -> None:
    global _conn
    try:
        if _conn is not None:
            _conn.close()
    except Exception:
        pass
    _conn = None


def fetch_all(query: str, params: Sequence[Any] | None = None) -> list[dict]:
    params = params or []
    try:
        t0 = time.monotonic()
        conn = _get_conn()
        t1 = time.monotonic()
        with conn.cursor() as cur:
            t2 = time.monotonic()
            cur.execute(query, params)
            t3 = time.monotonic()
            cols = [c[0] for c in cur.description] if cur.description else []
            rows = cur.fetchall()
        t4 = time.monotonic()
        print(
            f"[DBX] fetch_all — conn={t1-t0:.3f}s cursor={t2-t1:.3f}s execute={t3-t2:.3f}s fetch={t4-t3:.3f}s total={t4-t0:.3f}s",
            flush=True,
        )
        return [dict(zip(cols, r, strict=False)) for r in rows]
    except Exception:
        _reset_conn()
        raise


def exec_one(query: str, params: Sequence[Any] | None = None) -> int:
    params = params or []
    try:
        t0 = time.monotonic()
        conn = _get_conn()
        t1 = time.monotonic()
        with conn.cursor() as cur:
            t2 = time.monotonic()
            cur.execute(query, params)
            t3 = time.monotonic()
        print(
            f"[DBX] exec_one — conn={t1-t0:.3f}s cursor={t2-t1:.3f}s execute={t3-t2:.3f}s total={t3-t0:.3f}s",
            flush=True,
        )
        return int(cur.rowcount or 0)
    except Exception:
        _reset_conn()
        raise
