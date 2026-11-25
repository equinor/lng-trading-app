from __future__ import annotations

import dataclasses
import itertools
from dataclasses import dataclass
from typing import Any

import numpy as np

from app.features.flare_monitor.collector.classifier import (
    CameraConfig,
    ThermalBlobClassifier,
    decode_grey,
)
from app.features.flare_monitor.collector.state import Label
from app.features.flare_monitor.labelling.images import LabelImage
from app.features.flare_monitor.labelling.store import LabelStore

HOT_DELTAS = range(30, 151, 10)
MIN_PIXELS = (10, 25, 50, 100, 200, 400, 800)
# Fewer labels than this per camera and the numbers say little.
ENOUGH_LABELS = 20


@dataclass
class _Sample:
    truth: str  # flare, no_flare or unusable
    grey: np.ndarray | None


def _predicted(label: Label, usable: bool) -> str:
    if not usable:
        return "unusable"
    return label.value


def _score(samples: list[_Sample], config: CameraConfig) -> dict[str, int]:
    classifier = ThermalBlobClassifier()
    counts = {
        "correct": 0,
        "missed_flares": 0,  # flare in the image, rule said no flare
        "false_flares": 0,  # no flare in the image, rule said flare
        "uncertain": 0,  # rule would not say
        "wrongly_unusable": 0,  # usable image the rule rejected
        "wrongly_usable": 0,  # obstructed image the rule accepted
    }
    for sample in samples:
        if sample.grey is None:
            predicted = "unusable"
        else:
            result = classifier.classify_grey(sample.grey, config)
            predicted = _predicted(result.label, result.usable)
        if predicted == sample.truth:
            counts["correct"] += 1
        elif sample.truth == "unusable":
            counts["wrongly_usable"] += 1
        elif predicted == "unusable":
            counts["wrongly_unusable"] += 1
        elif predicted == "uncertain":
            counts["uncertain"] += 1
        elif sample.truth == "flare":
            counts["missed_flares"] += 1
        else:
            counts["false_flares"] += 1
    return counts


def _suggest(samples: list[_Sample], config: CameraConfig) -> tuple[CameraConfig, int]:
    """The thresholds that agree with the labels most often (ties: fewest uncertain, nearest default)."""
    best: tuple[tuple[int, int, float], CameraConfig, int] | None = None
    for hot_delta, min_pixels in itertools.product(HOT_DELTAS, MIN_PIXELS):
        candidate = dataclasses.replace(
            config,
            hot_delta=float(hot_delta),
            min_pixels=min_pixels,
            max_clear_pixels=max(min_pixels // 10, 1),
        )
        counts = _score(samples, candidate)
        rank = (
            -counts["correct"],
            counts["uncertain"],
            abs(hot_delta - config.hot_delta),
        )
        if best is None or rank < best[0]:
            best = (rank, candidate, counts["correct"])
    assert best is not None
    return best[1], best[2]


def evaluate(
    images: list[LabelImage],
    store: LabelStore,
    base: dict[str, CameraConfig] | None = None,
) -> dict[str, Any]:
    """Compare the rule with the labels, per camera, and suggest better thresholds."""
    by_camera: dict[str, list[_Sample]] = {}
    for image in images:
        label = store.labels.get(image.key)
        if label not in ("flare", "no_flare", "unusable"):
            continue
        by_camera.setdefault(image.camera_id, []).append(
            _Sample(label, decode_grey(image.path.read_bytes()))
        )

    cameras = []
    tuned: dict[str, dict[str, Any]] = {}
    for camera_id, samples in sorted(by_camera.items()):
        config = camera_config(camera_id, store, base)
        counts = _score(samples, config)
        truths = [sample.truth for sample in samples]
        report: dict[str, Any] = {
            "camera_id": camera_id,
            "labelled": len(samples),
            "flare": truths.count("flare"),
            "no_flare": truths.count("no_flare"),
            "unusable": truths.count("unusable"),
            "accuracy": round(counts["correct"] / len(samples), 3),
            **counts,
            "enough_labels": len(samples) >= ENOUGH_LABELS,
            "suggestion": None,
        }
        if report["flare"] and report["no_flare"]:
            best, correct = _suggest(samples, config)
            report["suggestion"] = {
                "hot_delta": best.hot_delta,
                "min_pixels": best.min_pixels,
                "max_clear_pixels": best.max_clear_pixels,
                "accuracy": round(correct / len(samples), 3),
            }
            tuned[camera_id] = {
                "hot_delta": best.hot_delta,
                "min_pixels": best.min_pixels,
                "max_clear_pixels": best.max_clear_pixels,
            }
        else:
            report["note"] = "Label both flare and no-flare images to get a suggestion."
        cameras.append(report)
    return {
        "cameras": cameras,
        "suggested_flare_cameras": merge_cameras(base or {}, store, tuned),
    }


def camera_config(
    camera_id: str, store: LabelStore, base: dict[str, CameraConfig] | None
) -> CameraConfig:
    """The camera as configured today, with the region drawn in the labelling tool on top."""
    config = (base or {}).get(camera_id, CameraConfig())
    region = store.cameras.get(camera_id, {}).get("roi")
    if region:
        left, top, right, bottom = region
        config = dataclasses.replace(config, roi=(left, top, right, bottom))
    return config


def _entry(config: CameraConfig) -> dict[str, Any]:
    """The FLARE_CAMERAS entry for a camera, leaving out values that are the defaults."""
    default = CameraConfig()
    entry: dict[str, Any] = {}
    if config.plant:
        entry["plant"] = config.plant
    if config.roi != default.roi:
        entry["roi"] = list(config.roi)
    for name in ("hot_delta", "min_pixels", "max_clear_pixels"):
        if getattr(config, name) != getattr(default, name):
            entry[name] = getattr(config, name)
    return entry


def merge_cameras(
    base: dict[str, CameraConfig], store: LabelStore, tuned: dict[str, dict[str, Any]]
) -> dict[str, dict[str, Any]]:
    """The paste-ready FLARE_CAMERAS value: every configured camera, keeping its plant name
    and anything not tuned, with the regions and thresholds found here laid on top."""
    merged = {camera_id: _entry(config) for camera_id, config in base.items()}
    for camera_id, entry in store.cameras.items():
        if entry.get("roi"):
            merged.setdefault(camera_id, {})["roi"] = list(entry["roi"])
    for camera_id, values in tuned.items():
        merged.setdefault(camera_id, {}).update(values)
    return merged
