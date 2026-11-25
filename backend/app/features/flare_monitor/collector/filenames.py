from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass
from zoneinfo import ZoneInfo

# WoodMac names images <camera id>_<YYYYMMDD>_<HHMMSS>.jpg, e.g. 1577_20261123_011828.jpg
_NAME = re.compile(
    r"^(?P<camera>[^_/\\]+)_(?P<date>\d{8})_(?P<time>\d{6})\.jpe?g$", re.IGNORECASE
)


@dataclass(frozen=True)
class ImageName:
    camera_id: str
    taken_at: dt.datetime  # timezone-aware UTC
    file_name: str


def parse_image_name(name: str, tz: ZoneInfo) -> ImageName | None:
    """Camera ID and capture time of an image file name, or None if it is not a camera image.

    The timestamp in the name is wall-clock time in `tz`.
    """
    file_name = name.replace("\\", "/").rsplit("/", 1)[-1]
    match = _NAME.match(file_name)
    if match is None:
        return None
    try:
        local = dt.datetime.strptime(
            f"{match['date']}{match['time']}", "%Y%m%d%H%M%S"
        ).replace(tzinfo=tz)
    except ValueError:
        return None
    return ImageName(
        camera_id=match["camera"],
        taken_at=local.astimezone(dt.timezone.utc),
        file_name=file_name,
    )
