from __future__ import annotations

import dataclasses
import itertools
from dataclasses import dataclass
from typing import Any

import numpy as np

from app.features.flare_monitor.collector.classifier import (
    CameraConfig,
    ThermalBlobClassifier,
    crop_region,
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


def _suggest_blob(
    samples: list[_Sample], config: CameraConfig
) -> tuple[CameraConfig, int]:
    """The blob thresholds that agree with the labels most often (ties: fewest uncertain)."""
    best: tuple[tuple[int, int, float], CameraConfig, int] | None = None
    for hot_delta, min_pixels in itertools.product(HOT_DELTAS, MIN_PIXELS):
        candidate = dataclasses.replace(
            config,
            mode="blob",
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


def _suggest_glow(
    samples: list[_Sample], config: CameraConfig
) -> tuple[CameraConfig, int] | None:
    """The cool and hot brightness levels that agree with the labels most often.

    Returns None when the images labelled flare are not brighter than the ones labelled no flare
    (a glowing stack should be).
    """
    levels: dict[str, list[float]] = {"flare": [], "no_flare": []}
    for sample in samples:
        if sample.grey is not None and sample.truth in levels:
            levels[sample.truth].append(
                float(crop_region(sample.grey, config.roi).mean())
            )
    if not levels["flare"] or not levels["no_flare"]:
        return None
    hot_typical = float(np.median(levels["flare"]))
    cool_typical = float(np.median(levels["no_flare"]))
    if hot_typical <= cool_typical:
        return None

    # The uncertain band is a tenth of the gap, so a stack that is warming or cooling is not
    # called either way.
    band = max(2.0, 0.1 * (hot_typical - cool_typical))
    ordered = sorted({*levels["flare"], *levels["no_flare"]})
    cuts = [(a + b) / 2 for a, b in itertools.pairwise(ordered)] or [ordered[0]]
    best: tuple[tuple[int, int], CameraConfig, int] | None = None
    for cut in cuts:
        candidate = dataclasses.replace(
            config,
            mode="glow",
            glow_clear=round(cut, 1),
            glow_flare=round(cut + band, 1),
        )
        counts = _score(samples, candidate)
        rank = (-counts["correct"], counts["uncertain"])
        if best is None or rank < best[0]:
            best = (rank, candidate, counts["correct"])
    assert best is not None
    return best[1], best[2]


def _suggest(samples: list[_Sample], config: CameraConfig) -> tuple[CameraConfig, int]:
    """The best way to read this camera, blob or glow, and its thresholds.

    Blob is kept unless glow agrees with the labels clearly more often.
    """
    blob, blob_correct = _suggest_blob(samples, config)
    glow = _suggest_glow(samples, config)
    if glow is not None and glow[1] > blob_correct + max(1, len(samples) // 50):
        return glow
    return blob, blob_correct


def _tuning(config: CameraConfig) -> dict[str, Any]:
    """The FLARE_CAMERAS values that tune how a camera is read."""
    if config.mode == "glow":
        return {
            "mode": "glow",
            "glow_clear": config.glow_clear,
            "glow_flare": config.glow_flare,
        }
    return {
        "hot_delta": config.hot_delta,
        "min_pixels": config.min_pixels,
        "max_clear_pixels": config.max_clear_pixels,
    }


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
            "mode": config.mode,
            "enough_labels": len(samples) >= ENOUGH_LABELS,
            "suggestion": None,
        }
        if report["flare"] and report["no_flare"]:
            best, correct = _suggest(samples, config)
            report["suggestion"] = {
                **_tuning(best),
                "mode": best.mode,
                "accuracy": round(correct / len(samples), 3),
            }
            tuned[camera_id] = _tuning(best)
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


_TUNING_KEYS = (
    "mode",
    "hot_delta",
    "min_pixels",
    "max_clear_pixels",
    "glow_clear",
    "glow_flare",
)


def _entry(config: CameraConfig) -> dict[str, Any]:
    """The FLARE_CAMERAS entry for a camera, leaving out values that are the defaults."""
    default = CameraConfig()
    entry: dict[str, Any] = {}
    if config.plant:
        entry["plant"] = config.plant
    if config.roi != default.roi:
        entry["roi"] = list(config.roi)
    for name in _TUNING_KEYS:
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
        entry = merged.setdefault(camera_id, {})
        # New tuning replaces the old, so switching between blob and glow leaves no stale values.
        for key in _TUNING_KEYS:
            entry.pop(key, None)
        entry.update(values)
    return merged
