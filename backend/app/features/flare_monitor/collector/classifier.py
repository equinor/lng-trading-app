from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Protocol

import numpy as np
from PIL import Image

from app.features.flare_monitor.collector.state import Label

CLASSIFIER_VERSION = "thermal-blob-1"


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


class ThermalBlobClassifier:
    """Baseline classifier for the thermal (infrared) cameras: a flare is a small bright blob.

    It judges brightness against the image's own median, so it is not thrown by the cameras'
    automatic brightness scaling. Swap in a trained model through the `Classifier` protocol.
    """

    version = CLASSIFIER_VERSION

    def classify(self, image_bytes: bytes, config: CameraConfig) -> Classification:
        grey = decode_grey(image_bytes)
        if grey is None:
            return _UNUSABLE
        return self.classify_grey(grey, config)

    def classify_grey(self, grey: np.ndarray, config: CameraConfig) -> Classification:
        """Classify an already decoded greyscale image (used to sweep thresholds quickly)."""
        height, width = grey.shape
        left, top, right, bottom = config.roi
        region = grey[
            int(top * height) : max(int(bottom * height), int(top * height) + 1),
            int(left * width) : max(int(right * width), int(left * width) + 1),
        ]
        if region.size == 0:
            return _UNUSABLE

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
