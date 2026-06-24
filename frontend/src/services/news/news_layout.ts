// frontend/src/services/news/news_layout.ts
//
// Pure data + presentation helpers shared by the News Summary pages.
// No React, no DOM — just types, constants and functions so they are easy to
// reuse and test.

import type { DbNewsRow } from "./news_api"
import { readTimeMinFromContent } from "./news_utils"

export type SentimentKey = "bullish" | "bearish" | "neutral"
export type RowWithReadTime = DbNewsRow & { readTimeMin: number }
export type GroupedRows = Record<SentimentKey, RowWithReadTime[]>

export type LayoutType = "left-big" | "right-big" | "top-big" | "bottom-big" | "columns"
export type LayoutMode = "auto" | "custom"
export type SentimentSlots = [SentimentKey, SentimentKey, SentimentKey]

export type StoredLayout = {
  mode: LayoutMode
  layoutType: LayoutType
  slots: SentimentSlots
  primarySplit: number
  secondarySplit: number
}

export const SENTIMENT_TITLES: Record<SentimentKey, "Bullish" | "Bearish" | "Neutral"> = {
  bullish: "Bullish",
  bearish: "Bearish",
  neutral: "Neutral",
}

export const LAYOUT_OPTIONS: { type: LayoutType; label: string }[] = [
  { type: "left-big", label: "Large left + two right" },
  { type: "right-big", label: "Large right + two left" },
  { type: "top-big", label: "Wide top + two bottom" },
  { type: "bottom-big", label: "Wide bottom + two top" },
  { type: "columns", label: "Three columns" },
]

export function panelBorderClass(key: SentimentKey): string {
  if (key === "bullish") return "border-green-600 dark:border-green-400"
  if (key === "bearish") return "border-red-600 dark:border-red-400"
  return "border-blue-600 dark:border-blue-400"
}

export function panelTextClass(key: SentimentKey): string {
  if (key === "bullish") return "text-green-700 dark:text-green-400"
  if (key === "bearish") return "text-red-700 dark:text-red-400"
  return "text-blue-700 dark:text-blue-400"
}

export function panelEmptyText(key: SentimentKey): string {
  if (key === "bullish") return "No favourited bullish articles."
  if (key === "bearish") return "No favourited bearish articles."
  return "No favourited neutral articles."
}

export function clampPercent(value: number, min = 25, max = 75): number {
  return Math.min(max, Math.max(min, value))
}

export function autoLayout(dominant: SentimentKey): { layoutType: LayoutType; slots: SentimentSlots } {
  if (dominant === "bullish") return { layoutType: "left-big", slots: ["bullish", "bearish", "neutral"] }
  if (dominant === "bearish") return { layoutType: "right-big", slots: ["bearish", "bullish", "neutral"] }
  return { layoutType: "bottom-big", slots: ["neutral", "bullish", "bearish"] }
}

export function defaultSplits(layoutType: LayoutType): { primary: number; secondary: number } {
  if (layoutType === "columns") return { primary: 33.34, secondary: 66.67 }
  return { primary: 56, secondary: 50 }
}

export function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (value == null) return false
  if (typeof value === "number") return value !== 0
  const text = String(value).trim().toLowerCase()
  return ["true", "1", "yes", "y", "t"].includes(text)
}

export function toTimestampMillis(value: string | null | undefined): number {
  if (!value) return 0
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? t : 0
}

/** Filter favourited rows by an optional date range, group by sentiment and sort newest-first. */
export function groupNews(
  rows: DbNewsRow[] | undefined,
  dateFrom: string,
  dateTo: string,
): GroupedRows {
  let fav = (rows ?? []).filter((x) => toBool(x.favourited))

  if (dateFrom || dateTo) {
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null
    fav = fav.filter((x) => {
      const t = toTimestampMillis(x.rtpTimestamp)
      if (!t) return false
      if (from && t < from) return false
      if (to && t > to) return false
      return true
    })
  }

  const bullish: RowWithReadTime[] = []
  const bearish: RowWithReadTime[] = []
  const neutral: RowWithReadTime[] = []

  for (const n of fav) {
    const row = { ...n, readTimeMin: readTimeMinFromContent(n.body) }
    if (row.official_sentiment === "bullish") bullish.push(row)
    else if (row.official_sentiment === "bearish") bearish.push(row)
    else neutral.push(row)
  }

  const sortNewestFirst = (a: DbNewsRow, b: DbNewsRow) =>
    toTimestampMillis(b.rtpTimestamp) - toTimestampMillis(a.rtpTimestamp)

  return {
    bullish: [...bullish].sort(sortNewestFirst),
    bearish: [...bearish].sort(sortNewestFirst),
    neutral: [...neutral].sort(sortNewestFirst),
  }
}

/** The sentiment with the most articles (ties favour bullish, then bearish). */
export function dominantSentiment(grouped: GroupedRows): SentimentKey {
  if (grouped.bullish.length >= grouped.bearish.length && grouped.bullish.length >= grouped.neutral.length) {
    return "bullish"
  }
  return grouped.bearish.length >= grouped.neutral.length ? "bearish" : "neutral"
}
