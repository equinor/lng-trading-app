from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo

from app.features.flare_monitor.collector.filenames import parse_image_name


@dataclass(frozen=True)
class LabelImage:
    key: str  # "<camera id>/<file name>", the identity a label is stored under
    camera_id: str
    file_name: str
    taken_at: dt.datetime
    path: Path


def scan_images(root: Path, tz: ZoneInfo) -> list[LabelImage]:
    """Every camera image under `root` (any folder layout), oldest first within each camera."""
    found: dict[str, LabelImage] = {}
    for path in root.rglob("*.jpg"):
        parsed = parse_image_name(path.name, tz)
        if parsed is None:
            continue
        key = f"{parsed.camera_id}/{parsed.file_name}"
        found[key] = LabelImage(
            key, parsed.camera_id, parsed.file_name, parsed.taken_at, path
        )
    return sorted(found.values(), key=lambda image: (image.camera_id, image.taken_at))
