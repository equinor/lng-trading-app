// frontend/src/services/news/news_layout.ts
//
// Pure data + presentation helpers shared by the News Summary pages.
// No React, no DOM — just types, constants and functions so they are easy to
// reuse and test.

import type { DbNewsRow } from "./news_api"
import { cleanTagValue, readTimeMinFromContent } from "./news_utils"

export type SentimentKey = "bullish" | "bearish" | "neutral"
export type RowWithReadTime = DbNewsRow & { readTimeMin: number }
export type GroupedRows = Record<SentimentKey, RowWithReadTime[]>

export type LayoutType = "left-big" | "right-big" | "top-big" | "bottom-big" | "columns"
export type LayoutMode = "auto" | "custom"
export type SentimentSlots = [SentimentKey, SentimentKey, SentimentKey]

/** A panel in a summary layout: either a sentiment bucket or a category bucket. */
export type PanelDescriptor =
  | { kind: "sentiment"; key: SentimentKey }
  | { kind: "category"; value: string }

/** Stable string identity for a panel (used for drag-and-drop and React keys). */
export function panelKeyOf(panel: PanelDescriptor): string {
  return panel.kind === "sentiment" ? panel.key : `cat:${panel.value}`
}

/** Reconstruct a panel descriptor from its key. */
export function panelFromKey(key: string): PanelDescriptor {
  return key.startsWith("cat:")
    ? { kind: "category", value: key.slice(4) }
    : { kind: "sentiment", key: key as SentimentKey }
}

/** Maximum number of extra category sections a user may add on top of the 3 sentiment sections. */
export const MAX_CATEGORY_SECTIONS = 3

export type StoredLayout = {
  mode: LayoutMode
  layoutType: LayoutType
  slots: SentimentSlots
  primarySplit: number
  secondarySplit: number
  categories?: string[]
  gridRows?: number[]
  gridOrder?: string[]
  rowSplits?: number[]
  colSplits?: number[][]
}

// --- Category panel presentation ---------------------------------------------

const CATEGORY_PANEL_STYLES: { border: string; text: string }[] = [
  { border: "border-violet-600 dark:border-violet-400", text: "text-violet-700 dark:text-violet-400" },
  { border: "border-cyan-600 dark:border-cyan-400", text: "text-cyan-700 dark:text-cyan-400" },
  { border: "border-amber-600 dark:border-amber-400", text: "text-amber-700 dark:text-amber-400" },
]

export function categoryBorderClass(index: number): string {
  return CATEGORY_PANEL_STYLES[index % CATEGORY_PANEL_STYLES.length].border
}

export function categoryTextClass(index: number): string {
  return CATEGORY_PANEL_STYLES[index % CATEGORY_PANEL_STYLES.length].text
}

export function categoryTitle(value: string): string {
  return cleanTagValue(value)
}

// --- Grid arrangements for 4-6 panels ----------------------------------------

/** Row shapes (panels per row) available for a given total panel count. */
export function gridArrangementsFor(count: number): number[][] {
  if (count === 4) return [[2, 2]]
  if (count === 5) return [[2, 3], [3, 2]]
  if (count === 6) return [[3, 3], [2, 2, 2]]
  return [[count]]
}

export function defaultGridRows(count: number): number[] {
  return gridArrangementsFor(count)[0]
}

/** Even splits (percentages summing to 100) for `n` cells. */
export function evenSplits(n: number): number[] {
  if (n <= 0) return []
  return Array.from({ length: n }, () => 100 / n)
}

/** Default row heights + per-row column widths for a grid arrangement. */
export function defaultGridSplits(rows: number[]): { rowSplits: number[]; colSplits: number[][] } {
  return {
    rowSplits: evenSplits(rows.length),
    colSplits: rows.map((cols) => evenSplits(cols)),
  }
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

/** Filter favourited rows by an optional date range. */
export function filterFavourited(
  rows: DbNewsRow[] | undefined,
  dateFrom: string,
  dateTo: string,
): DbNewsRow[] {
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

  return fav
}

const sortNewestFirst = (a: DbNewsRow, b: DbNewsRow) =>
  toTimestampMillis(b.rtpTimestamp) - toTimestampMillis(a.rtpTimestamp)

/** Filter favourited rows by an optional date range, group by sentiment and sort newest-first. */
export function groupNews(
  rows: DbNewsRow[] | undefined,
  dateFrom: string,
  dateTo: string,
): GroupedRows {
  const fav = filterFavourited(rows, dateFrom, dateTo)

  const bullish: RowWithReadTime[] = []
  const bearish: RowWithReadTime[] = []
  const neutral: RowWithReadTime[] = []

  for (const n of fav) {
    const row = { ...n, readTimeMin: readTimeMinFromContent(n.body) }
    if (row.official_sentiment === "bullish") bullish.push(row)
    else if (row.official_sentiment === "bearish") bearish.push(row)
    else neutral.push(row)
  }

  return {
    bullish: [...bullish].sort(sortNewestFirst),
    bearish: [...bearish].sort(sortNewestFirst),
    neutral: [...neutral].sort(sortNewestFirst),
  }
}

/** Favourited articles tagged with `category`, newest-first. */
export function groupByCategory(
  rows: DbNewsRow[] | undefined,
  dateFrom: string,
  dateTo: string,
  category: string,
): RowWithReadTime[] {
  const fav = filterFavourited(rows, dateFrom, dateTo)
  return fav
    .filter((n) => (n.category ?? []).includes(category))
    .map((n) => ({ ...n, readTimeMin: readTimeMinFromContent(n.body) }))
    .sort(sortNewestFirst)
}

/** Distinct category values present across favourited rows, sorted alphabetically. */
export function availableCategories(rows: DbNewsRow[] | undefined): string[] {
  const seen = new Set<string>()
  for (const n of (rows ?? []).filter((x) => toBool(x.favourited))) {
    for (const c of n.category ?? []) {
      const value = String(c).trim()
      if (value) seen.add(value)
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b))
}

/** The sentiment with the most articles (ties favour bullish, then bearish). */
export function dominantSentiment(grouped: GroupedRows): SentimentKey {
  if (grouped.bullish.length >= grouped.bearish.length && grouped.bullish.length >= grouped.neutral.length) {
    return "bullish"
  }
  return grouped.bearish.length >= grouped.neutral.length ? "bearish" : "neutral"
}
