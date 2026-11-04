from __future__ import annotations

import threading
import time
from collections.abc import Callable, Iterable
from typing import Any, Generic, TypeVar

T = TypeVar("T")


class TTLCache(Generic[T]):
    """Thread-safe single-value cache; the loader runs under the lock so concurrent misses load once."""

    def __init__(self, ttl: float) -> None:
        self._ttl = ttl
        self._value: T | None = None
        self._ts = 0.0
        self._lock = threading.Lock()

    def get_or_load(self, loader: Callable[[], T]) -> T:
        with self._lock:
            if self._value is not None and (time.monotonic() - self._ts) < self._ttl:
                return self._value
            self._value = loader()
            self._ts = time.monotonic()
            return self._value

    def patch(self, mutate: Callable[[T], None]) -> None:
        """Mutate the cached value in place, if one is present."""
        with self._lock:
            if self._value is not None:
                mutate(self._value)

    def invalidate(self) -> None:
        with self._lock:
            self._value = None
            self._ts = 0.0


class PendingOverrides:
    """Optimistic per-article field updates, shown until the background write lands."""

    def __init__(self, ttl: float) -> None:
        self._ttl = ttl
        self._items: dict[int, tuple[dict[str, Any], float]] = {}
        self._lock = threading.Lock()

    def _prune(self, now: float) -> None:
        stale = [k for k, (_, ts) in self._items.items() if (now - ts) > self._ttl]
        for key in stale:
            del self._items[key]

    def set(self, article_id: int, updates: dict[str, Any]) -> None:
        with self._lock:
            now = time.monotonic()
            self._prune(now)
            current = dict(self._items[article_id][0]) if article_id in self._items else {}
            current.update(updates)
            self._items[article_id] = (current, now)

    def clear(self, article_id: int, fields: Iterable[str]) -> None:
        with self._lock:
            entry = self._items.get(article_id)
            if not entry:
                return
            cleared = set(fields)
            updates = {k: v for k, v in entry[0].items() if k not in cleared}
            if updates:
                self._items[article_id] = (updates, time.monotonic())
            else:
                del self._items[article_id]

    def apply(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Return rows with overrides applied; untouched rows are returned as-is."""
        with self._lock:
            self._prune(time.monotonic())
            if not self._items:
                return rows
            return [
                {**row, **self._items[row["id"]][0]} if row.get("id") in self._items else row
                for row in rows
            ]
