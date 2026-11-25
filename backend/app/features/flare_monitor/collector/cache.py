from __future__ import annotations

import datetime as dt
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class ImageCache:
    """Recent images on local disk, kept for `keep_hours` and then discarded.

    The disk is ephemeral on Radix, so the cache is only for inspection and re-classification;
    the structured observations live in Databricks.
    """

    def __init__(self, root: Path, keep_hours: int) -> None:
        self.root = root
        self.keep = dt.timedelta(hours=keep_hours)

    def save(self, camera_id: str, file_name: str, data: bytes) -> Path:
        path = self.root / camera_id / file_name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def purge(self, now: dt.datetime) -> int:
        """Delete images older than the retention window. Returns how many were removed."""
        if not self.root.exists():
            return 0
        cutoff = (now - self.keep).timestamp()
        removed = 0
        for path in self.root.rglob("*.jpg"):
            try:
                if path.stat().st_mtime < cutoff:
                    path.unlink()
                    removed += 1
            except OSError:
                logger.warning("Could not remove cached image %s", path)
        for folder in sorted(self.root.glob("*"), reverse=True):
            if folder.is_dir() and not any(folder.iterdir()):
                folder.rmdir()
        return removed
