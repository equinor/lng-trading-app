from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from enum import Enum


class Label(str, Enum):
    FLARE = "flare"
    NO_FLARE = "no_flare"
    UNCERTAIN = "uncertain"


class FlareState(str, Enum):
    ON = "on"
    OFF = "off"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class Thresholds:
    # Consecutive images needed before the state changes. Switching off needs more evidence than
    # switching on, because "no flare detected" is an observation and not proof the flare is off.
    flare_required: int = 2
    clear_required: int = 3
    # Consecutive unusable (obstructed or blank) images before the camera is treated as unknown.
    unusable_required: int = 3


@dataclass(frozen=True)
class StateEvent:
    camera_id: str
    at: dt.datetime
    previous: FlareState
    state: FlareState
    # True for a real on/off change, as opposed to losing or regaining sight of the flare.
    alert: bool
    reason: str


class CameraTracker:
    """Turns a stream of per-image labels into a flare state with hysteresis for one camera."""

    def __init__(
        self,
        camera_id: str,
        thresholds: Thresholds,
        state: FlareState = FlareState.UNKNOWN,
        since: dt.datetime | None = None,
    ) -> None:
        self.camera_id = camera_id
        self.thresholds = thresholds
        self.state = state
        self.since = since
        self._flare_streak = 0
        self._clear_streak = 0
        self._unusable_streak = 0

    def observe(self, label: Label, usable: bool, at: dt.datetime) -> StateEvent | None:
        """Feed one classified image. Returns an event when the state changes."""
        if not usable:
            self._flare_streak = self._clear_streak = 0
            self._unusable_streak += 1
            if self._unusable_streak >= self.thresholds.unusable_required:
                return self._move(
                    FlareState.UNKNOWN, at, "camera obstructed or image unusable"
                )
            return None

        self._unusable_streak = 0
        if label is Label.FLARE:
            self._flare_streak += 1
            self._clear_streak = 0
            if self._flare_streak >= self.thresholds.flare_required:
                return self._move(
                    FlareState.ON, at, "flare detected in consecutive images"
                )
        elif label is Label.NO_FLARE:
            self._clear_streak += 1
            self._flare_streak = 0
            if self._clear_streak >= self.thresholds.clear_required:
                return self._move(
                    FlareState.OFF, at, "no flare detected in consecutive images"
                )
        else:
            self._flare_streak = self._clear_streak = 0
        return None

    def missing(self, at: dt.datetime) -> StateEvent | None:
        """No new image arrived for too long. A missing image is unknown, never off."""
        self._flare_streak = self._clear_streak = 0
        return self._move(FlareState.UNKNOWN, at, "no new images received")

    def _move(self, new: FlareState, at: dt.datetime, reason: str) -> StateEvent | None:
        if new is self.state:
            return None
        previous = self.state
        self.state = new
        self.since = at
        alert = previous is not FlareState.UNKNOWN and new is not FlareState.UNKNOWN
        return StateEvent(self.camera_id, at, previous, new, alert, reason)
