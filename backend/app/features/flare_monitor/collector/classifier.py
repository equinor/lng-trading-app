from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Literal, Protocol

import numpy as np
from PIL import Image

from app.features.flare_monitor.collector.state import Label

CLASSIFIER_VERSION = "thermal-2"


@dataclass(frozen=True)
class CameraConfig:
    """Per-camera setup. The flare region is what makes one classifier work for every layout."""

    plant: str | None = None
    # Flare region as fractions of the image: (left, top, right, bottom). Defaults to the whole
    # image; narrow it to exclude hot stacks, towers and other things that glow all the time.
    roi: tuple[float, float, float, float] = (0.0, 0.0, 1.0, 1.0)
    # A pixel is hot when it is this many grey levels above the image's median brightness.
    hot_delta: float = 90.0
    # Hot pixels in the region needed for "flare". Between max_clear_pixels and this is
    # "uncertain".
    min_pixels: int = 100
    max_clear_pixels: int = 10
    # "blob": a flame shows as a small bright blob above the tower. "glow": there is no flame,
    # the stack itself goes white when hot and stays grey when cool, so the region's overall
    # brightness is what counts.
    mode: Literal["blob", "glow"] = "blob"
    # Glow mode: the region's average brightness (0-255) at or below which the stack is cool, and
    # at or above which it is hot. Between the two is "uncertain". Both come from labelled images.
    glow_clear: float | None = None
    glow_flare: float | None = None


@dataclass(frozen=True)
class Classification:
    label: Label
    # False for obstructed, blank or corrupt images, which say nothing about the flare.
    usable: bool
    hot_pixels: int
    peak_delta: float
    score: float


class Classifier(Protocol):
    version: str

    def classify(self, image_bytes: bytes, config: CameraConfig) -> Classification: ...


_UNUSABLE = Classification(Label.UNCERTAIN, False, 0, 0.0, 0.0)


def decode_grey(image_bytes: bytes) -> np.ndarray | None:
    """The image as a float greyscale array, or None if it cannot be decoded."""
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            return np.asarray(image.convert("L"), dtype=np.float32)
    except Exception:
        return None


def crop_region(grey: np.ndarray, roi: tuple[float, float, float, float]) -> np.ndarray:
    """The part of the image inside a flare region given as fractions (left, top, right, bottom)."""
    height, width = grey.shape
    left, top, right, bottom = roi
    return grey[
        int(top * height) : max(int(bottom * height), int(top * height) + 1),
        int(left * width) : max(int(right * width), int(left * width) + 1),
    ]


class ThermalBlobClassifier:
    """Classifier for the thermal (infrared) cameras, with two ways of reading a flare.

    `blob` mode finds a small bright blob (a flame) and judges it against the image's own median,
    so it is not thrown by the cameras' automatic brightness scaling. `glow` mode reads a stack
    that goes white when hot, from the region's overall brightness. Swap in a trained model
    through the `Classifier` protocol.
    """

    version = CLASSIFIER_VERSION

    def classify(self, image_bytes: bytes, config: CameraConfig) -> Classification:
        grey = decode_grey(image_bytes)
        if grey is None:
            return _UNUSABLE
        return self.classify_grey(grey, config)

    def classify_grey(self, grey: np.ndarray, config: CameraConfig) -> Classification:
        """Classify an already decoded greyscale image (used to sweep thresholds quickly)."""
        region = crop_region(grey, config.roi)
        if region.size == 0:
            return _UNUSABLE

        if config.mode == "glow":
            return self._glow(grey, region, config)

        # A flat region (lens blocked, signal lost) or one that is all clipped carries no signal.
        if float(region.std()) < 1.5 or float(np.mean(region >= 254)) > 0.9:
            return _UNUSABLE

        # The whole image's median is a steadier background than the region's, which a big flare
        # and its halo can dominate.
        background = float(np.median(grey))
        delta = region - background
        hot_pixels = int((delta > config.hot_delta).sum())
        peak_delta = float(delta.max())
        score = min(hot_pixels / max(config.min_pixels, 1), 1.0)

        if hot_pixels >= config.min_pixels:
            label = Label.FLARE
        elif hot_pixels <= config.max_clear_pixels:
            label = Label.NO_FLARE
        else:
            label = Label.UNCERTAIN
        return Classification(
            label, True, hot_pixels, round(peak_delta, 1), round(score, 3)
        )

    @staticmethod
    def _glow(
        grey: np.ndarray, region: np.ndarray, config: CameraConfig
    ) -> Classification:
        """A stack that glows white when hot: judge the region's average brightness.

        A white-hot stack can fill the region, so only the whole image is checked for a blocked
        lens or lost signal. The result's `peak_delta` holds the region's average brightness and
        `score` how far it sits between the cool and hot levels (0 to 1).
        """
        if float(grey.std()) < 1.5 or float(np.mean(grey >= 254)) > 0.9:
            return _UNUSABLE
        level = float(region.mean())
        clear, hot = config.glow_clear, config.glow_flare
        if clear is None or hot is None or hot <= clear:
            # Not calibrated yet: report the brightness but make no call.
            return Classification(Label.UNCERTAIN, True, 0, round(level, 1), 0.0)
        score = min(max((level - clear) / (hot - clear), 0.0), 1.0)
        if level >= hot:
            label = Label.FLARE
        elif level <= clear:
            label = Label.NO_FLARE
        else:
            label = Label.UNCERTAIN
        return Classification(label, True, 0, round(level, 1), round(score, 3))
