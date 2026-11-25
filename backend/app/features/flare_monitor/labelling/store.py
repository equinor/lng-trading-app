from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from app.features.flare_monitor.collector.classifier import CameraConfig

# What a person can say about an image. "unsure" images are left out of the accuracy figures.
LABELS = ("flare", "no_flare", "unsure", "unusable")


class LabelStore:
    """Labels and per-camera flare regions, kept in one JSON file next to the labelled images."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.Lock()
        self.labels: dict[str, str] = {}
        self.cameras: dict[str, dict[str, Any]] = {}
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
            self.labels = data.get("labels", {})
            self.cameras = data.get("cameras", {})

    def set_label(self, key: str, label: str | None) -> None:
        if label is not None and label not in LABELS:
            raise ValueError(f"label must be one of {LABELS}")
        with self._lock:
            if label is None:
                self.labels.pop(key, None)
            else:
                self.labels[key] = label
            self._save()

    def set_roi(self, camera_id: str, roi: list[float] | None) -> None:
        with self._lock:
            entry = self.cameras.setdefault(camera_id, {})
            if roi is None:
                entry.pop("roi", None)
            else:
                left, top, right, bottom = (min(max(v, 0.0), 1.0) for v in roi)
                if right - left < 0.01 or bottom - top < 0.01:
                    raise ValueError("the region is too small")
                entry["roi"] = [
                    round(left, 4),
                    round(top, 4),
                    round(right, 4),
                    round(bottom, 4),
                ]
            self._save()

    def camera_config(self, camera_id: str) -> CameraConfig:
        entry = self.cameras.get(camera_id, {})
        roi = entry.get("roi")
        left, top, right, bottom = roi if roi else (0.0, 0.0, 1.0, 1.0)
        return CameraConfig(plant=entry.get("plant"), roi=(left, top, right, bottom))

    def _save(self) -> None:
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps({"labels": self.labels, "cameras": self.cameras}, indent=1),
            encoding="utf-8",
        )
        temporary.replace(self.path)
