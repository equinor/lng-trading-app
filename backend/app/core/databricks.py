from __future__ import annotations

from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from databricks import sql
from fastapi import HTTPException

from app.core.config import settings


@dataclass(frozen=True)
class DBXConfig:
    server_hostname: str
    http_path: str
    access_token: str


@dataclass(frozen=True)
class ServicePrincipalConfig:
    tenant_id: str
    client_id: str
    client_secret: str


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
    )


@lru_cache(maxsize=1)
def _sp_credential() -> Any:
    # Lazy import keeps PAT-only deployments lightweight.
    try:
        from azure.identity import ClientSecretCredential
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="Missing dependency 'azure-identity' for Service Principal auth",
        ) from exc

    cfg = _sp_cfg()
    return ClientSecretCredential(
        tenant_id=cfg.tenant_id,
        client_id=cfg.client_id,
        client_secret=cfg.client_secret,
    )


def _access_token() -> str:
    if settings.DATABRICKS_USE_SERVICE_PRINCIPAL:
        credential = _sp_credential()
        token = credential.get_token(settings.DATABRICKS_AAD_SCOPE)
        return token.token

    if not settings.DATABRICKS_TOKEN:
        raise HTTPException(
            status_code=503,
            detail=(
                "Databricks not configured: set DATABRICKS_TOKEN or enable "
                "DATABRICKS_USE_SERVICE_PRINCIPAL"
            ),
        )

    return settings.DATABRICKS_TOKEN


def _cfg() -> DBXConfig:
    _ensure_dbx_configured()
    return DBXConfig(
        server_hostname=_normalize_hostname(settings.DATABRICKS_SERVER_HOSTNAME) or "",
        http_path=settings.DATABRICKS_HTTP_PATH or "",
        access_token=_access_token(),
    )


def _ensure_dbx_configured():
    if not settings.DATABRICKS_SERVER_HOSTNAME or not settings.DATABRICKS_HTTP_PATH:
        raise HTTPException(status_code=503, detail="Databricks not configured")

@contextmanager
def dbx_conn() -> Iterator[sql.client.Connection]:
    cfg = _cfg()
    conn = sql.connect(
        server_hostname=cfg.server_hostname,
        http_path=cfg.http_path,
        access_token=cfg.access_token,
    )
    try:
        yield conn
    finally:
        conn.close()


def fetch_all(query: str, params: Sequence[Any] | None = None) -> list[dict]:
    params = params or []
    with dbx_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            cols = [c[0] for c in cur.description] if cur.description else []
            rows = cur.fetchall()
    return [dict(zip(cols, r, strict=False)) for r in rows]


def exec_one(query: str, params: Sequence[Any] | None = None) -> int:
    params = params or []
    with dbx_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            # databricks-sql-connector sets rowcount for DML
            return int(cur.rowcount or 0)
