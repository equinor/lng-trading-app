"""Label flare camera images and check the rule against your labels.

    cd backend
    uv run --group collector python -m app.features.flare_monitor.labelling serve
    uv run --group collector python -m app.features.flare_monitor.labelling report

Both default to the images in ../woodmac_images and write ../flare_labels.json.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from zoneinfo import ZoneInfo

from app.features.flare_monitor.labelling.evaluate import evaluate
from app.features.flare_monitor.labelling.images import scan_images
from app.features.flare_monitor.labelling.server import LabellingApp, serve
from app.features.flare_monitor.labelling.store import LabelStore


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "command", choices=["serve", "report"], nargs="?", default="serve"
    )
    parser.add_argument("--images", type=Path, default=Path("../woodmac_images"))
    parser.add_argument("--labels", type=Path, default=Path("../flare_labels.json"))
    parser.add_argument(
        "--timezone", default="America/New_York", help="time zone of the file names"
    )
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    tz = ZoneInfo(args.timezone)
    images = scan_images(args.images, tz)
    if not images:
        raise SystemExit(f"No camera images found under {args.images.resolve()}")
    store = LabelStore(args.labels)

    if args.command == "serve":
        serve(LabellingApp(lambda: scan_images(args.images, tz), store), args.port)
        return

    result = evaluate(images, store)
    for camera in result["cameras"]:
        print(  # noqa: T201
            f"Camera {camera['camera_id']}: {camera['labelled']} labelled "
            f"({camera['flare']} flare, {camera['no_flare']} no flare, "
            f"{camera['unusable']} unusable), rule agrees {camera['accuracy']:.0%}; "
            f"missed flares {camera['missed_flares']}, false flares {camera['false_flares']}, "
            f"uncertain {camera['uncertain']}"
        )
        if not camera["enough_labels"]:
            print("  Too few labels for this to mean much (aim for 30 or more).")  # noqa: T201
        suggestion = camera["suggestion"]
        if suggestion:
            print(  # noqa: T201
                f"  Best thresholds: hot_delta={suggestion['hot_delta']:.0f}, "
                f"min_pixels={suggestion['min_pixels']}, "
                f"max_clear_pixels={suggestion['max_clear_pixels']} "
                f"-> {suggestion['accuracy']:.0%}"
            )
        elif camera.get("note"):
            print(f"  {camera['note']}")  # noqa: T201
    print("\nFLARE_CAMERAS suggestion:")  # noqa: T201
    print(json.dumps(result["suggested_flare_cameras"]))  # noqa: T201


if __name__ == "__main__":
    main()
