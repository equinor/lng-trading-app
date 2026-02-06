from __future__ import annotations

from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any

from databricks import sql
from fastapi import HTTPException

from app.core.config import settings


@dataclass(frozen=True)
class DBXConfig:
    server_hostname: str
    http_path: str
    access_token: str


def _cfg() -> DBXConfig:
    return DBXConfig(
        server_hostname=settings.DATABRICKS_SERVER_HOSTNAME,
        http_path=settings.DATABRICKS_HTTP_PATH,
        access_token=settings.DATABRICKS_TOKEN,
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
    return [dict(zip(cols, r)) for r in rows]


def exec_one(query: str, params: Sequence[Any] | None = None) -> int:
    params = params or []
    with dbx_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            # databricks-sql-connector sets rowcount for DML
            return int(cur.rowcount or 0)
