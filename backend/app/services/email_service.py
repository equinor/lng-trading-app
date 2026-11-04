from __future__ import annotations

from datetime import datetime
from typing import Any

from app.utils import render_email_template

SENTIMENT_COLORS = {
    "bullish": "#16a34a",
    "bearish": "#dc2626",
    "neutral": "#2563eb",
}

# Cycled through for the optional category sections shown above the sentiment ones.
CATEGORY_COLORS = ["#7c3aed", "#0891b2", "#d97706"]
_MAX_CATEGORY_SECTIONS = 3


def _day_start_ms(day: str | None) -> float | None:
    return datetime.strptime(day, "%Y-%m-%d").timestamp() * 1000 if day else None


def _day_end_ms(day: str | None) -> float | None:
    return (datetime.strptime(day, "%Y-%m-%d").timestamp() + 86399) * 1000 if day else None


def _to_ms(ts: Any) -> float:
    if isinstance(ts, datetime):
        return ts.timestamp() * 1000
    if isinstance(ts, str):
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() * 1000
        except ValueError:
            return 0
    return float(ts)


def _in_range(row: dict, from_ts: float | None, to_ts: float | None) -> bool:
    ts = row.get("rtpTimestamp")
    if not ts:
        return True
    ts_ms = _to_ms(ts)
    return not ((from_ts and ts_ms < from_ts) or (to_ts and ts_ms > to_ts))


def _format_ts(ts: str | datetime | None) -> str:
    if not ts:
        return ""
    if isinstance(ts, str):
        try:
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            return ts
    return ts.strftime("%d %b, %I:%M %p")


def _article(row: dict) -> dict:
    return {
        "headline": row.get("headline", ""),
        "summary": row.get("paragraph_summary") or row.get("summary", ""),
        "source": row.get("source", ""),
        "timestamp": _format_ts(row.get("rtpTimestamp")),
        "url": row.get("documentUrl"),
        "regions": row.get("region", []) or [],
        "categories": row.get("category", []) or [],
    }


def _date_range_label(date_from: str | None, date_to: str | None) -> str:
    if date_from and date_to:
        return f"{date_from} to {date_to}"
    if date_from:
        return f"From {date_from}"
    if date_to:
        return f"Up to {date_to}"
    return "All dates"


def build_summary_html(
    favourites: list[dict],
    *,
    date_from: str | None,
    date_to: str | None,
    categories: list[str],
) -> str:
    """Render the favourites-by-sentiment email, with optional category sections on top."""
    from_ts, to_ts = _day_start_ms(date_from), _day_end_ms(date_to)
    rows = [r for r in favourites if r.get("favourited") and _in_range(r, from_ts, to_ts)]

    sections: list[dict] = [
        {
            "title": category,
            "color": CATEGORY_COLORS[index % len(CATEGORY_COLORS)],
            "articles": [_article(r) for r in rows if category in (r.get("category") or [])],
        }
        for index, category in enumerate(categories[:_MAX_CATEGORY_SECTIONS])
        if category
    ]
    for sentiment, color in SENTIMENT_COLORS.items():
        sections.append(
            {
                "title": sentiment.capitalize(),
                "color": color,
                "articles": [
                    _article(r)
                    for r in rows
                    if str(r.get("official_sentiment") or "").lower() == sentiment
                ],
            }
        )

    return render_email_template(
        template_name="news_summary.html",
        context={"sections": sections, "date_range": _date_range_label(date_from, date_to)},
    )
