from __future__ import annotations

import datetime as dt
from typing import Any

from app.core.config import settings
from app.core.databricks import exec_one, fetch_all

_OBSERVATIONS = """
    camera_id STRING, image_ts TIMESTAMP, image_name STRING, image_sha256 STRING,
    label STRING, usable BOOLEAN, hot_pixels INT, peak_delta DOUBLE, score DOUBLE,
    classifier_version STRING, ingested_at TIMESTAMP
"""
_STATE = """
    camera_id STRING, plant STRING, state STRING, since TIMESTAMP, last_image_at TIMESTAMP,
    last_label STRING, last_usable BOOLEAN, last_score DOUBLE, updated_at TIMESTAMP
"""
_EVENTS = """
    camera_id STRING, plant STRING, event_ts TIMESTAMP, previous_state STRING, state STRING,
    alert BOOLEAN, reason STRING
"""


def _utc(value: dt.datetime) -> dt.datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=dt.timezone.utc)
    return value.astimezone(dt.timezone.utc)


class FlareMonitorRepository:
    """Structured flare observations: written by the collector worker, read by the API."""

    def __init__(self, schema: str | None = None) -> None:
        schema = schema or settings.FLARE_MONITOR_SCHEMA
        self.observations = f"{schema}.flare_observations"
        self.state = f"{schema}.flare_camera_state"
        self.events = f"{schema}.flare_events"

    def ensure_tables(self) -> None:
        for table, columns in (
            (self.observations, _OBSERVATIONS),
            (self.state, _STATE),
            (self.events, _EVENTS),
        ):
            exec_one(f"CREATE TABLE IF NOT EXISTS {table} ({columns})")

    # --- collector writes ---

    def known_images(self, since: dt.datetime) -> set[tuple[str, dt.datetime]]:
        rows = fetch_all(
            f"SELECT camera_id, image_ts FROM {self.observations} WHERE image_ts >= ?",
            [_utc(since)],
        )
        return {(row["camera_id"], _utc(row["image_ts"])) for row in rows}

    def add_observations(self, rows: list[dict[str, Any]]) -> None:
        """Insert observations, skipping any camera and image time that is already stored."""
        chunk_size = 50
        for start in range(0, len(rows), chunk_size):
            chunk = rows[start : start + chunk_size]
            placeholders = ", ".join(["(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"] * len(chunk))
            params: list[Any] = []
            for row in chunk:
                params.extend(
                    [
                        row["camera_id"],
                        _utc(row["image_ts"]),
                        row["image_name"],
                        row["image_sha256"],
                        row["label"],
                        row["usable"],
                        row["hot_pixels"],
                        row["peak_delta"],
                        row["score"],
                        row["classifier_version"],
                        _utc(row["ingested_at"]),
                    ]
                )
            exec_one(
                f"""
                MERGE INTO {self.observations} AS t
                USING (
                    SELECT * FROM VALUES {placeholders} AS v(
                        camera_id, image_ts, image_name, image_sha256, label, usable,
                        hot_pixels, peak_delta, score, classifier_version, ingested_at
                    )
                ) AS s
                ON t.camera_id = s.camera_id AND t.image_ts = s.image_ts
                WHEN NOT MATCHED THEN INSERT *
                """,
                params,
            )

    def load_states(self) -> dict[str, dict[str, Any]]:
        rows = fetch_all(f"SELECT camera_id, state, since FROM {self.state}")
        return {row["camera_id"]: row for row in rows}

    def save_state(self, row: dict[str, Any]) -> None:
        exec_one(
            f"""
            MERGE INTO {self.state} AS t
            USING (
                SELECT ? AS camera_id, ? AS plant, ? AS state, ? AS since,
                       ? AS last_image_at, ? AS last_label, ? AS last_usable,
                       ? AS last_score, ? AS updated_at
            ) AS s
            ON t.camera_id = s.camera_id
            WHEN MATCHED THEN UPDATE SET *
            WHEN NOT MATCHED THEN INSERT *
            """,
            [
                row["camera_id"],
                row.get("plant"),
                row["state"],
                _utc(row["since"]) if row.get("since") else None,
                _utc(row["last_image_at"]) if row.get("last_image_at") else None,
                row.get("last_label"),
                row.get("last_usable"),
                row.get("last_score"),
                _utc(row["updated_at"]),
            ],
        )

    def add_event(self, row: dict[str, Any]) -> None:
        exec_one(
            f"INSERT INTO {self.events} VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                row["camera_id"],
                row.get("plant"),
                _utc(row["event_ts"]),
                row["previous_state"],
                row["state"],
                row["alert"],
                row["reason"],
            ],
        )

    # --- API reads ---

    def camera_states(self) -> list[dict[str, Any]]:
        return fetch_all(f"SELECT * FROM {self.state} ORDER BY plant, camera_id")

    def camera_observations(self, since: dt.datetime) -> list[dict[str, Any]]:
        return fetch_all(
            f"""
            SELECT camera_id, image_ts, label, usable, score
            FROM {self.observations}
            WHERE image_ts >= ?
            ORDER BY camera_id, image_ts
            """,
            [_utc(since)],
        )

    def recent_events(self, limit: int) -> list[dict[str, Any]]:
        return fetch_all(
            f"SELECT * FROM {self.events} ORDER BY event_ts DESC LIMIT ?", [limit]
        )
