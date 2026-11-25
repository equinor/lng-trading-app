from __future__ import annotations

import datetime as dt

from pydantic import BaseModel


class CameraStatus(BaseModel):
    camera_id: str
    plant: str | None
    # "on", "off" or "unknown". Unknown covers obstructed cameras and missing images.
    state: str
    # True when no image has arrived recently (or ever), so the stored state is shown as unknown.
    stale: bool
    since: dt.datetime | None
    last_image_at: dt.datetime | None
    # What the latest image looked like: flare, no_flare or uncertain.
    last_label: str | None
    last_usable: bool | None
    last_score: float | None


class ObservationPoint(BaseModel):
    image_ts: dt.datetime
    label: str
    usable: bool
    score: float | None


class CameraTimeline(BaseModel):
    camera_id: str
    points: list[ObservationPoint]


class FlareEvent(BaseModel):
    camera_id: str
    plant: str | None
    event_ts: dt.datetime
    previous_state: str
    state: str
    # True for a real on/off change, as opposed to losing or regaining sight of the flare.
    alert: bool
    reason: str


class OverviewResponse(BaseModel):
    hours: int
    cameras: list[CameraStatus]
    timelines: list[CameraTimeline]
    events: list[FlareEvent]
