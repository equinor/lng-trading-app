# backend/app/services/news_query.py
"""Shared server-side filtering, sorting and pagination for the news feed.

Operates on already-normalized row dicts (category/region as lists) so both the
mock and Databricks repositories can reuse identical semantics — matching what
the Newsletter page used to do on the client.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class NewsFilters:
    q: str | None = None
    favourited: bool | None = None
    read: bool | None = None
    sentiment: str | None = None  # bullish | bearish | neutral
    categories: list[str] = field(default_factory=list)
    regions: list[str] = field(default_factory=list)
    region_none: bool = False  # include articles with no region
    date_from: str | None = None  # YYYY-MM-DD
    date_to: str | None = None  # YYYY-MM-DD
    sort: str = "default"  # default | newest


_TRUTHY = {"true", "1", "yes", "y", "t", "important"}


def clean_tag(value: object) -> str:
    """Mirror the frontend cleanTagValue: strip brackets/quotes and trim."""
    text = str(value or "").strip()
    if not text:
        return ""
    text = text.lstrip("[").rstrip("]")
    text = text.strip("'\"")
    return text.strip()


def _truthy(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value).strip().lower() in _TRUTHY


def _to_millis(value: object) -> float:
    if not value:
        return 0.0
    if isinstance(value, datetime):
        return value.timestamp() * 1000
    text = str(value)
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp() * 1000
    except (ValueError, TypeError):
        return 0.0


def _clean_list(values: object) -> list[str]:
    if not isinstance(values, list):
        values = [] if values in (None, "") else [values]
    return [clean_tag(v) for v in values if clean_tag(v)]


def _matches(row: dict, f: NewsFilters) -> bool:
    if f.favourited is not None and _truthy(row.get("favourited")) != f.favourited:
        return False
    if f.read is not None and _truthy(row.get("read")) != f.read:
        return False
    if f.sentiment and (str(row.get("official_sentiment") or "").lower() != f.sentiment.lower()):
        return False

    categories = _clean_list(row.get("category"))
    regions = _clean_list(row.get("region"))
    categories_lower = {c.lower() for c in categories}
    regions_lower = {r.lower() for r in regions}

    if f.categories:
        wanted = {c.lower() for c in f.categories}
        if not (wanted & categories_lower):
            return False

    if f.regions or f.region_none:
        wanted = {r.lower() for r in f.regions}
        region_ok = bool(wanted & regions_lower)
        none_ok = f.region_none and not regions
        if not (region_ok or none_ok):
            return False

    if f.date_from or f.date_to:
        from_ts = datetime.strptime(f.date_from, "%Y-%m-%d").timestamp() * 1000 if f.date_from else None
        to_ts = (datetime.strptime(f.date_to, "%Y-%m-%d").timestamp() + 86399) * 1000 if f.date_to else None
        ts = _to_millis(row.get("rtpTimestamp"))
        if not ts:
            return False
        if from_ts and ts < from_ts:
            return False
        if to_ts and ts > to_ts:
            return False

    if f.q:
        needle = f.q.strip().lower()
        haystack = " ".join(
            [str(row.get("headline") or ""), str(row.get("source") or ""), *regions, *categories]
        ).lower()
        if needle not in haystack:
            return False

    return True


def _sort_rows(rows: list[dict], sort: str) -> list[dict]:
    if sort == "newest":
        return sorted(rows, key=lambda r: _to_millis(r.get("rtpTimestamp")), reverse=True)

    # default: unread first, each group ordered important-then-newest
    def important_then_newest(r: dict) -> tuple[int, float]:
        return (1 if _truthy(r.get("importantStory")) else 0, _to_millis(r.get("rtpTimestamp")))

    unread = sorted(
        (r for r in rows if not _truthy(r.get("read"))), key=important_then_newest, reverse=True
    )
    read = sorted(
        (r for r in rows if _truthy(r.get("read"))), key=important_then_newest, reverse=True
    )
    return [*unread, *read]


def filter_sort_paginate(
    rows: list[dict], filters: NewsFilters, limit: int, offset: int
) -> tuple[list[dict], int]:
    matched = [r for r in rows if _matches(r, filters)]
    total = len(matched)
    ordered = _sort_rows(matched, filters.sort)
    start = max(0, offset)
    return ordered[start : start + max(1, limit)], total


def facets(rows: list[dict]) -> dict[str, list[str]]:
    categories: set[str] = set()
    regions: set[str] = set()
    for row in rows:
        for c in _clean_list(row.get("category")):
            categories.add(c)
        for r in _clean_list(row.get("region")):
            regions.add(r)
    return {
        "categories": sorted(categories, key=str.lower),
        "regions": sorted(regions, key=str.lower),
    }
