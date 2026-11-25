from __future__ import annotations

import json
import threading
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from app.features.flare_monitor.collector.classifier import (
    CameraConfig,
    ThermalBlobClassifier,
)
from app.features.flare_monitor.labelling.evaluate import camera_config, evaluate
from app.features.flare_monitor.labelling.images import LabelImage
from app.features.flare_monitor.labelling.store import LabelStore

INDEX = Path(__file__).with_name("index.html")


class LabellingApp:
    def __init__(
        self,
        scan: Callable[[], list[LabelImage]],
        store: LabelStore,
        base: dict[str, CameraConfig] | None = None,
    ) -> None:
        self._scan = scan
        self.images: dict[str, LabelImage] = {}
        self.ordered: list[LabelImage] = []
        self.refresh()
        self.store = store
        # The cameras as configured today (FLARE_CAMERAS), which the report builds on.
        self.base = base or {}
        self.classifier = ThermalBlobClassifier()
        self._lock = threading.Lock()

    def refresh(self) -> None:
        """Look at the image folder again, so deleted or newly fetched images are picked up."""
        self.ordered = self._scan()
        self.images = {image.key: image for image in self.ordered}

    def state(self) -> dict[str, Any]:
        self.refresh()
        full = CameraConfig().roi
        regions = {}
        for camera_id in {*self.base, *self.store.cameras}:
            roi = camera_config(camera_id, self.store, self.base).roi
            if roi != full:
                regions[camera_id] = {"roi": list(roi)}
        return {
            "images": [
                {
                    "key": image.key,
                    "camera": image.camera_id,
                    "taken_at": image.taken_at.isoformat(),
                    "label": self.store.labels.get(image.key),
                }
                for image in self.ordered
            ],
            "cameras": regions,
        }

    def guess(self, key: str) -> dict[str, Any]:
        image = self.images[key]
        config = camera_config(image.camera_id, self.store, self.base)
        result = self.classifier.classify(image.path.read_bytes(), config)
        return {
            "label": result.label.value if result.usable else "unusable",
            "hot_pixels": result.hot_pixels,
            "peak_delta": result.peak_delta,
        }

    def report(self) -> dict[str, Any]:
        with self._lock:
            return evaluate(self.ordered, self.store, self.base)


def make_handler(app: LabellingApp) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
            return

        def _send(self, status: int, body: bytes, content_type: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _json(self, payload: Any, status: int = 200) -> None:
            self._send(status, json.dumps(payload).encode("utf-8"), "application/json")

        def do_GET(self) -> None:  # noqa: N802
            url = urlparse(self.path)
            key = parse_qs(url.query).get("key", [""])[0]
            try:
                if url.path == "/":
                    self._send(200, INDEX.read_bytes(), "text/html; charset=utf-8")
                elif url.path == "/api/state":
                    self._json(app.state())
                elif url.path == "/api/report":
                    self._json(app.report())
                elif url.path == "/api/guess" and key in app.images:
                    self._json(app.guess(key))
                elif url.path == "/image" and key in app.images:
                    self._send(200, app.images[key].path.read_bytes(), "image/jpeg")
                else:
                    self._json({"error": "not found"}, 404)
            except Exception as error:
                self._json({"error": str(error)}, 500)

        def do_POST(self) -> None:  # noqa: N802
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length) or b"{}")
                if self.path == "/api/label" and body.get("key") in app.images:
                    app.store.set_label(body["key"], body.get("label"))
                elif self.path == "/api/roi" and body.get("camera"):
                    app.store.set_roi(str(body["camera"]), body.get("roi"))
                else:
                    self._json({"error": "not found"}, 404)
                    return
                self._json({"ok": True})
            except (ValueError, KeyError, TypeError) as error:
                self._json({"error": str(error)}, 400)

    return Handler


def serve(app: LabellingApp, port: int) -> None:
    # Only reachable from this machine.
    server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(app))
    print(f"Labelling tool: http://127.0.0.1:{port}  (Ctrl+C to stop)")  # noqa: T201
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
