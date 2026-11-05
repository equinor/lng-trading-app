from __future__ import annotations

from typing import Any


def normalize_multi(value: Any) -> list[str]:
    """Normalize a value that may be a list, JSON string, or CSV into a list of trimmed strings."""
    import json

    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]

    text = str(value).strip()
    if not text:
        return []

    if text.startswith("[") and text.endswith("]"):
        try:
            loaded = json.loads(text)
            if isinstance(loaded, list):
                return [str(item).strip() for item in loaded if str(item).strip()]
        except json.JSONDecodeError:
            pass

    return [item.strip() for item in text.split(",") if item.strip()]
