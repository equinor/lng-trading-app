import datetime as dt
import io
import os
import time
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import numpy as np
import pytest
from PIL import Image

from app.features.flare_monitor.collector.cache import ImageCache
from app.features.flare_monitor.collector.classifier import (
    CameraConfig,
    ThermalBlobClassifier,
)
from app.features.flare_monitor.collector.filenames import parse_image_name
from app.features.flare_monitor.collector.processor import FlareProcessor
from app.features.flare_monitor.collector.settings import (
    CollectorSettings,
    parse_cameras,
)
from app.features.flare_monitor.collector.state import (
    CameraTracker,
    FlareState,
    Label,
    Thresholds,
)
from app.features.flare_monitor.labelling.evaluate import evaluate
from app.features.flare_monitor.labelling.images import scan_images
from app.features.flare_monitor.labelling.server import LabellingApp
from app.features.flare_monitor.labelling.store import LabelStore

UTC = dt.timezone.utc
T0 = dt.datetime(2026, 11, 23, 12, 0, tzinfo=UTC)


def _at(minutes: int) -> dt.datetime:
    return T0 + dt.timedelta(minutes=5 * minutes)


def _jpeg(array: np.ndarray) -> bytes:
    buffer = io.BytesIO()
    Image.fromarray(array.astype("uint8")).save(buffer, "JPEG")
    return buffer.getvalue()


def _scene(flare: bool, seed: int = 0) -> bytes:
    pixels = np.random.default_rng(seed).normal(70, 8, (512, 640)).clip(0, 255)
    if flare:
        pixels[40:100, 30:90] = 240
    return _jpeg(pixels)


def test_file_name_gives_camera_and_utc_time_from_the_local_timestamp() -> None:
    parsed = parse_image_name(
        "na_natgas_Storage/20261123/1577/1577_20261123_011828.jpg",
        ZoneInfo("Indian/Cocos"),
    )

    assert parsed is not None
    assert parsed.camera_id == "1577"
    assert parsed.file_name == "1577_20261123_011828.jpg"
    # Cocos Islands time is UTC+6:30.
    assert parsed.taken_at == dt.datetime(2026, 11, 22, 18, 48, 28, tzinfo=UTC)
    assert parse_image_name("logo.png", ZoneInfo("UTC")) is None


def test_flare_is_found_only_inside_the_camera_region() -> None:
    classifier = ThermalBlobClassifier()
    image = _scene(flare=True)

    assert classifier.classify(image, CameraConfig()).label is Label.FLARE
    elsewhere = CameraConfig(roi=(0.5, 0.5, 1.0, 1.0))
    assert classifier.classify(image, elsewhere).label is Label.NO_FLARE
    assert (
        classifier.classify(_scene(flare=False), CameraConfig()).label is Label.NO_FLARE
    )


def test_blank_or_corrupt_images_are_unusable_not_clear() -> None:
    classifier = ThermalBlobClassifier()

    assert not classifier.classify(
        _jpeg(np.full((512, 640), 128.0)), CameraConfig()
    ).usable
    assert not classifier.classify(b"not an image", CameraConfig()).usable


def _tracker(state: FlareState = FlareState.UNKNOWN) -> CameraTracker:
    return CameraTracker("1577", Thresholds(flare_required=2, clear_required=3), state)


def test_switching_off_needs_repeated_clear_images_and_raises_an_alert() -> None:
    tracker = _tracker(FlareState.ON)

    assert tracker.observe(Label.NO_FLARE, True, _at(0)) is None
    assert tracker.observe(Label.NO_FLARE, True, _at(1)) is None
    assert (
        tracker.observe(Label.FLARE, True, _at(2)) is None
    )  # one flare image resets the count
    assert tracker.observe(Label.NO_FLARE, True, _at(3)) is None
    assert tracker.observe(Label.NO_FLARE, True, _at(4)) is None
    event = tracker.observe(Label.NO_FLARE, True, _at(5))

    assert event is not None and event.state is FlareState.OFF and event.alert


def test_first_reading_after_unknown_is_not_an_alert() -> None:
    tracker = _tracker()

    tracker.observe(Label.FLARE, True, _at(0))
    event = tracker.observe(Label.FLARE, True, _at(1))

    assert event is not None and event.state is FlareState.ON and not event.alert


def test_obstruction_and_missing_images_are_unknown_never_off() -> None:
    tracker = _tracker(FlareState.ON)

    events = [tracker.observe(Label.UNCERTAIN, False, _at(i)) for i in range(3)]
    assert events[:2] == [None, None]
    assert events[2] is not None and events[2].state is FlareState.UNKNOWN
    assert not events[2].alert

    other = _tracker(FlareState.ON)
    event = other.missing(_at(0))
    assert event is not None and event.state is FlareState.UNKNOWN


def test_uncertain_images_do_not_count_towards_a_change() -> None:
    tracker = _tracker(FlareState.ON)

    for i in range(5):
        assert tracker.observe(Label.UNCERTAIN, True, _at(i)) is None
    assert tracker.state is FlareState.ON


def test_cache_discards_images_older_than_the_retention_window(tmp_path: Path) -> None:
    cache = ImageCache(tmp_path, keep_hours=6)
    old = cache.save("1577", "old.jpg", b"x")
    fresh = cache.save("1577", "fresh.jpg", b"x")
    old_time = time.time() - 7 * 3600
    os.utime(old, (old_time, old_time))

    removed = cache.purge(dt.datetime.now(UTC))

    assert removed == 1
    assert not old.exists() and fresh.exists()


class FakeRepository:
    def __init__(self) -> None:
        self.observations: list[dict[str, Any]] = []
        self.states: dict[str, dict[str, Any]] = {}
        self.events: list[dict[str, Any]] = []

    def ensure_tables(self) -> None: ...

    def load_states(self) -> dict[str, dict[str, Any]]:
        return {}

    def known_images(self, since: dt.datetime) -> set[tuple[str, dt.datetime]]:
        return set()

    def add_observations(self, rows: list[dict[str, Any]]) -> None:
        self.observations.extend(rows)

    def save_state(self, row: dict[str, Any]) -> None:
        self.states[row["camera_id"]] = row

    def add_event(self, row: dict[str, Any]) -> None:
        self.events.append(row)


def _processor(tmp_path: Path, repository: FakeRepository, cameras: str | None = None):
    settings = CollectorSettings(
        FLARE_CAMERAS=cameras, FLARE_CACHE_DIR=str(tmp_path), FLARE_IMAGE_TIMEZONE="UTC"
    )
    cache = ImageCache(tmp_path, 6)
    return FlareProcessor(
        settings,
        repository,  # type: ignore[arg-type]
        ThermalBlobClassifier(),
        cache,
        clock=lambda: T0 + dt.timedelta(hours=1),
    )


def test_processor_skips_duplicates_and_unwatched_cameras(tmp_path: Path) -> None:
    repository = FakeRepository()
    processor = _processor(tmp_path, repository, '{"1577": {"plant": "Cameron LNG"}}')
    processor.start()
    images = [
        ("1577_20261123_120000.jpg", _scene(True, 1)),
        ("1577_20261123_120500.jpg", _scene(True, 2)),
        ("9999_20261123_120000.jpg", _scene(True, 3)),
    ]

    assert processor.process_batch(images) == 2
    assert (
        processor.process_batch(images) == 0
    )  # the next map load serves the same images

    assert [row["camera_id"] for row in repository.observations] == ["1577", "1577"]
    state = repository.states["1577"]
    assert state["state"] == "on" and state["plant"] == "Cameron LNG"
    assert [event["state"] for event in repository.events] == ["on"]


def test_older_frames_do_not_rewind_the_state(tmp_path: Path) -> None:
    repository = FakeRepository()
    processor = _processor(tmp_path, repository)
    processor.start()

    processor.process_batch(
        [(f"1577_20261123_12{m:02d}00.jpg", _scene(True, m)) for m in range(0, 20, 5)]
    )
    processor.process_batch([("1577_20261123_115500.jpg", _scene(False, 99))])

    assert len(repository.observations) == 5
    assert repository.states["1577"]["state"] == "on"
    assert repository.states["1577"]["last_label"] == "flare"


def test_camera_settings_parse_regions() -> None:
    cameras = parse_cameras(
        '{"1577": {"plant": "Cameron LNG", "roi": [0, 0, 0.4, 0.55]}}'
    )

    assert cameras["1577"].roi == (0.0, 0.0, 0.4, 0.55)
    assert cameras["1577"].plant == "Cameron LNG"


# --- labelling tool ---


def _write_images(folder: Path) -> list[str]:
    keys = []
    for index in range(6):
        flare = index % 2 == 0
        name = f"1577_20261123_12{index:02d}00.jpg"
        (folder / name).write_bytes(_scene(flare, index))
        keys.append(f"1577/{name}")
    return keys


def test_labels_persist_and_regions_are_clamped(tmp_path: Path) -> None:
    store = LabelStore(tmp_path / "labels.json")
    store.set_label("1577/a.jpg", "flare")
    store.set_roi("1577", [-0.2, 0.0, 0.4, 1.5])

    reloaded = LabelStore(tmp_path / "labels.json")

    assert reloaded.labels == {"1577/a.jpg": "flare"}
    assert reloaded.camera_config("1577").roi == (0.0, 0.0, 0.4, 1.0)
    with pytest.raises(ValueError):
        reloaded.set_label("1577/a.jpg", "maybe")
    with pytest.raises(ValueError):
        reloaded.set_roi("1577", [0.1, 0.1, 0.1, 0.5])


def test_report_scores_the_rule_against_labels_and_suggests_thresholds(
    tmp_path: Path,
) -> None:
    keys = _write_images(tmp_path)
    images = scan_images(tmp_path, ZoneInfo("UTC"))
    store = LabelStore(tmp_path / "labels.json")
    for position, key in enumerate(keys):
        store.set_label(key, "flare" if position % 2 == 0 else "no_flare")
    # One image is labelled the wrong way round, so the rule cannot agree with all of them.
    store.set_label(keys[1], "flare")

    report = evaluate(images, store)

    camera = report["cameras"][0]
    assert camera["labelled"] == 6
    assert camera["false_flares"] == 0 and camera["missed_flares"] == 1
    assert camera["accuracy"] == pytest.approx(5 / 6, abs=0.001)
    assert camera["enough_labels"] is False
    assert camera["suggestion"] is not None
    assert "1577" in report["suggested_flare_cameras"]


def test_labelling_state_drops_images_deleted_after_start(tmp_path: Path) -> None:
    keys = _write_images(tmp_path)
    tz = ZoneInfo("UTC")
    app = LabellingApp(
        lambda: scan_images(tmp_path, tz), LabelStore(tmp_path / "labels.json")
    )
    assert len(app.state()["images"]) == 6

    (tmp_path / keys[0].split("/")[1]).unlink()

    assert len(app.state()["images"]) == 5
    assert keys[0] not in app.images


def test_report_needs_both_kinds_of_label_for_a_suggestion(tmp_path: Path) -> None:
    keys = _write_images(tmp_path)
    store = LabelStore(tmp_path / "labels.json")
    store.set_label(keys[0], "flare")

    report = evaluate(scan_images(tmp_path, ZoneInfo("UTC")), store)

    assert report["cameras"][0]["suggestion"] is None
