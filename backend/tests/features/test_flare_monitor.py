import datetime as dt
import io
import os
import time
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import numpy as np
import pytest
from PIL import Image

from app.features.flare_monitor.collector.api_source import WoodMacApi, token_expiry
from app.features.flare_monitor.collector.api_worker import ApiCollector
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
from app.features.flare_monitor.service import FlareMonitorService

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
        self.persisted: dict[str, dict[str, Any]] = {}
        self.fail_state = 0  # the next N state writes raise
        self.fail_events = 0  # the next N event writes raise

    def ensure_tables(self) -> None: ...

    def load_states(self) -> dict[str, dict[str, Any]]:
        return self.persisted

    def known_images(self, since: dt.datetime) -> set[tuple[str, dt.datetime]]:
        return set()

    def add_observations(self, rows: list[dict[str, Any]]) -> None:
        self.observations.extend(rows)

    def save_state(self, row: dict[str, Any]) -> None:
        if self.fail_state:
            self.fail_state -= 1
            raise RuntimeError("database unavailable")
        self.states[row["camera_id"]] = row

    def add_event(self, row: dict[str, Any]) -> None:
        if self.fail_events:
            self.fail_events -= 1
            raise RuntimeError("database unavailable")
        self.events.append(row)


class Clock:
    def __init__(self) -> None:
        self.now = T0 + dt.timedelta(hours=1)

    def __call__(self) -> dt.datetime:
        return self.now


def _processor(
    tmp_path: Path,
    repository: FakeRepository,
    cameras: str | None = None,
    clock: Clock | None = None,
):
    settings = CollectorSettings(
        FLARE_CAMERAS=cameras, FLARE_CACHE_DIR=str(tmp_path), FLARE_IMAGE_TIMEZONE="UTC"
    )
    cache = ImageCache(tmp_path, 6)
    return FlareProcessor(
        settings,
        repository,  # type: ignore[arg-type]
        ThermalBlobClassifier(),
        cache,
        clock=clock or Clock(),
    )


TWO_FLARES = [
    ("1577_20261123_120000.jpg", _scene(True, 1)),
    ("1577_20261123_120500.jpg", _scene(True, 2)),
]


def test_failed_state_write_is_retried_even_though_the_images_are_known(
    tmp_path: Path,
) -> None:
    repository = FakeRepository()
    processor = _processor(tmp_path, repository, '{"1577": {"plant": "LNG Canada"}}')
    processor.start()
    repository.fail_state = 1

    processor.process_batch(TWO_FLARES)
    assert repository.states["1577"]["state"] == "unknown"  # the write failed

    assert processor.process_batch(TWO_FLARES) == 0  # nothing new to process
    assert repository.states["1577"]["state"] == "on"  # but the state was retried


def test_failed_event_write_is_retried_once_without_duplicates(tmp_path: Path) -> None:
    repository = FakeRepository()
    processor = _processor(tmp_path, repository)
    processor.start()
    repository.fail_events = 1

    processor.process_batch(TWO_FLARES)
    assert repository.events == []

    processor.flush()
    processor.flush()
    assert [event["state"] for event in repository.events] == ["on"]


def test_missing_camera_survives_a_database_error_and_is_retried(
    tmp_path: Path,
) -> None:
    repository = FakeRepository()
    clock = Clock()
    processor = _processor(tmp_path, repository, '{"1577": {}}', clock)
    processor.start()
    processor.process_batch(TWO_FLARES)
    assert repository.states["1577"]["state"] == "on"

    clock.now += dt.timedelta(minutes=31)
    repository.fail_state = 1
    repository.fail_events = 1
    processor.check_missing()  # must not raise
    assert repository.states["1577"]["state"] == "on"

    processor.check_missing()
    assert repository.states["1577"]["state"] == "unknown"
    assert [event["state"] for event in repository.events] == ["on", "unknown"]


def test_restart_keeps_the_last_image_time_when_no_new_images_arrive(
    tmp_path: Path,
) -> None:
    repository = FakeRepository()
    repository.persisted = {
        "1577": {
            "camera_id": "1577",
            "state": "on",
            "since": T0,
            "last_image_at": T0,
            "last_label": "flare",
            "last_usable": True,
            "last_score": 1.0,
        }
    }
    clock = Clock()
    processor = _processor(tmp_path, repository, '{"1577": {}}', clock)
    processor.start()

    clock.now += dt.timedelta(minutes=31)
    processor.check_missing()

    state = repository.states["1577"]
    assert state["state"] == "unknown"
    assert state["last_image_at"] == T0
    assert state["last_label"] == "flare"


def test_cameras_found_in_the_database_are_followed_without_a_camera_list(
    tmp_path: Path,
) -> None:
    repository = FakeRepository()
    repository.persisted = {"1577": {"camera_id": "1577", "state": "on", "since": T0}}
    clock = Clock()
    processor = _processor(tmp_path, repository, None, clock)
    processor.start()

    clock.now += dt.timedelta(minutes=31)
    processor.check_missing()

    assert repository.states["1577"]["state"] == "unknown"
    assert repository.events[-1]["state"] == "unknown"


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


def test_report_keeps_plant_names_and_untuned_cameras_in_the_paste_ready_config(
    tmp_path: Path,
) -> None:
    keys = _write_images(tmp_path)
    store = LabelStore(tmp_path / "labels.json")
    for position, key in enumerate(keys):
        store.set_label(key, "flare" if position % 2 == 0 else "no_flare")
    base = parse_cameras(
        '{"1577": {"plant": "LNG Canada Flare"}, "1186": {"plant": "Cameron Trains 1 & 2"},'
        ' "1209": {"plant": "Cameron Train 3", "roi": [0, 0, 0.5, 0.5]}}'
    )

    report = evaluate(scan_images(tmp_path, ZoneInfo("UTC")), store, base)

    suggested = report["suggested_flare_cameras"]
    assert set(suggested) == {"1577", "1186", "1209"}
    assert suggested["1577"]["plant"] == "LNG Canada Flare"
    assert "hot_delta" in suggested["1577"]  # tuned from the labels
    assert suggested["1186"] == {"plant": "Cameron Trains 1 & 2"}  # left as it was
    assert suggested["1209"]["roi"] == [0.0, 0.0, 0.5, 0.5]


class FakeStateRepository:
    def __init__(self, last_image_at: dt.datetime | None) -> None:
        self.last_image_at = last_image_at

    def ensure_tables(self) -> None: ...

    def camera_states(self) -> list[dict[str, Any]]:
        return [
            {
                "camera_id": "1577",
                "plant": "LNG Canada Flare",
                "state": "on",
                "since": T0,
                "last_image_at": self.last_image_at,
                "last_label": "flare",
                "last_usable": True,
                "last_score": 1.0,
            }
        ]

    def camera_observations(self, since: dt.datetime) -> list[dict[str, Any]]:
        return []

    def recent_events(self, limit: int) -> list[dict[str, Any]]:
        return []


def test_api_reports_a_camera_with_no_recent_image_as_unknown() -> None:
    now = T0 + dt.timedelta(hours=2)

    def overview(last_image_at: dt.datetime | None):
        service = FlareMonitorService(
            FakeStateRepository(last_image_at),  # type: ignore[arg-type]
            missing_minutes=30,
            clock=lambda: now,
        )
        return service.overview(6).cameras[0]

    fresh = overview(now - dt.timedelta(minutes=10))
    assert fresh.state == "on" and not fresh.stale

    stale = overview(now - dt.timedelta(minutes=45))
    assert stale.state == "unknown" and stale.stale

    assert overview(None).state == "unknown"


# --- API mode ---


def _jwt(expires: dt.datetime) -> str:
    import base64
    import json

    body = base64.urlsafe_b64encode(
        json.dumps({"exp": expires.timestamp()}).encode()
    ).decode()
    return f"x.{body.rstrip('=')}.y"


class FakeWoodMac:
    """A stand-in for the WoodMac camera API, served through httpx's mock transport."""

    def __init__(self, frames: dict[int, list[dt.datetime]]) -> None:
        self.frames = frames  # API camera id -> frame times
        self.calls: list[tuple[str, str]] = []
        self.status = 200

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        self.calls.append((path, request.url.params.get("minTimestamp", "")))
        if request.url.host == "blob.test":
            return httpx.Response(200, content=_scene(True, abs(hash(path)) % 1000))
        if request.headers.get("authorization") != "Bearer good-token":
            return httpx.Response(401, json={"message": "Unauthorized"})
        if self.status != 200:
            return httpx.Response(self.status)
        if path.endswith("/cameras"):
            return httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "id": api_id,
                            "cameraName": f"Plant {api_id}",
                            "referenceImageUrl": f"https://x/reference_image_camera_{1000 + api_id}.jpg?sig=1",
                        }
                        for api_id in self.frames
                    ]
                },
            )
        api_id = int(path.split("/")[-2])
        since = dt.datetime.strptime(
            request.url.params["minTimestamp"], "%Y-%m-%dT%H:%M:%SZ"
        ).replace(tzinfo=dt.timezone.utc)
        # WoodMac answers with at most a day of frames from minTimestamp.
        data = [
            {
                "cameraId": api_id,
                "timestamp": t.isoformat(),
                "url": f"https://blob.test/irimageimages/{1000 + api_id}_{t:%Y%m%d_%H%M%S}.jpg?sig=1",
            }
            for t in self.frames[api_id]
            if since <= t < since + dt.timedelta(hours=24)
        ]
        return httpx.Response(200, json={"data": data})


class FakeTokenRepository(FakeRepository):
    def __init__(self, token: str | None, expires: dt.datetime | None) -> None:
        super().__init__()
        self.row = (
            None if token is None else {"access_token": token, "expires_at": expires}
        )

    def load_token(self) -> dict[str, Any] | None:
        return self.row


def _api_collector(
    tmp_path: Path, woodmac: FakeWoodMac, repository: FakeTokenRepository, clock: Clock
):
    settings = CollectorSettings(
        FLARE_CAMERAS='{"1001": {"plant": "Plant 1"}, "1002": {"plant": "Plant 2"}}',
        FLARE_CACHE_DIR=str(tmp_path),
        FLARE_IMAGE_TIMEZONE="UTC",
        FLARE_BACKFILL_HOURS=96,
        FLARE_HOURS_BACK=1,
    )
    processor = FlareProcessor(
        settings,
        repository,
        ThermalBlobClassifier(),
        ImageCache(tmp_path, 6),
        clock=clock,  # type: ignore[arg-type]
    )
    processor.start()
    api = WoodMacApi(
        "https://api.test/natgas/iot/v1",
        httpx.Client(transport=httpx.MockTransport(woodmac.handler)),
    )
    return ApiCollector(settings, repository, processor, api, clock=clock), processor  # type: ignore[arg-type]


def _frames(start: dt.datetime, end: dt.datetime) -> list[dt.datetime]:
    out, t = [], start
    while t < end:
        out.append(t)
        t += dt.timedelta(minutes=30)
    return out


def test_api_mode_reads_new_frames_once(tmp_path: Path) -> None:
    clock = Clock()
    woodmac = FakeWoodMac(
        {1: _frames(clock.now - dt.timedelta(minutes=50), clock.now), 2: []}
    )
    repository = FakeTokenRepository("good-token", clock.now + dt.timedelta(hours=5))
    collector, _ = _api_collector(tmp_path, woodmac, repository, clock)

    assert collector.cycle() == 2
    assert collector.cycle() == 0  # the same frames are not fetched or stored again
    assert {row["camera_id"] for row in repository.observations} == {"1001"}


def test_api_mode_backfills_a_long_gap_in_windows(tmp_path: Path) -> None:
    clock = Clock()
    start = clock.now - dt.timedelta(hours=60)
    woodmac = FakeWoodMac({1: _frames(start, clock.now), 2: []})
    repository = FakeTokenRepository("good-token", clock.now + dt.timedelta(hours=5))
    collector, processor = _api_collector(tmp_path, woodmac, repository, clock)
    processor._newest["1001"] = start  # the last frame stored before the gap

    new = collector.cycle()

    # Every frame in the 60 hours, one every 30 minutes.
    assert new == 120
    image_calls = [call for call in woodmac.calls if call[0].endswith("/images")]
    assert (
        len(image_calls) > 2
    )  # more than one request: the API only returns a day at a time


def test_api_mode_waits_for_a_usable_token(tmp_path: Path) -> None:
    clock = Clock()
    woodmac = FakeWoodMac(
        {1: _frames(clock.now - dt.timedelta(hours=1), clock.now), 2: []}
    )

    expired = FakeTokenRepository("good-token", clock.now - dt.timedelta(minutes=1))
    collector, _ = _api_collector(tmp_path, woodmac, expired, clock)
    assert collector.cycle() == 0

    missing = FakeTokenRepository(None, None)
    collector, _ = _api_collector(tmp_path, woodmac, missing, clock)
    assert collector.cycle() == 0
    assert woodmac.calls == []  # nothing was asked of WoodMac without a token


def test_api_mode_stops_using_a_token_woodmac_rejects(tmp_path: Path) -> None:
    clock = Clock()
    woodmac = FakeWoodMac(
        {1: _frames(clock.now - dt.timedelta(hours=1), clock.now), 2: []}
    )
    repository = FakeTokenRepository("revoked-token", clock.now + dt.timedelta(hours=5))
    collector, _ = _api_collector(tmp_path, woodmac, repository, clock)

    assert collector.cycle() == 0
    calls_after_first = len(woodmac.calls)
    assert collector.cycle() == 0
    assert len(woodmac.calls) == calls_after_first  # the rejected token is not retried

    repository.row = {
        "access_token": "good-token",
        "expires_at": clock.now + dt.timedelta(hours=5),
    }
    assert collector.cycle() == 2


def test_token_expiry_is_read_from_the_token() -> None:
    expires = dt.datetime(2026, 11, 27, 7, 42, 56, tzinfo=UTC)

    assert token_expiry(_jwt(expires)) == expires
    assert token_expiry("not a token") is None
