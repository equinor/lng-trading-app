import type { DailySeries } from "./pipeline_nominations_api"

// Stable per-facility colours: the index comes from the full facility list, not the filtered one.
const PALETTE = [
  "#3b82f6",
  "#1d4ed8",
  "#f97316",
  "#7e22ce",
  "#ec4899",
  "#8b5cf6",
  "#eab308",
  "#ef4444",
  "#0f766e",
  "#22c55e",
]

export function buildColorMap(facilityNames: string[]): Map<string, string> {
  return new Map(
    facilityNames.map((name, index) => [name, PALETTE[index % PALETTE.length]]),
  )
}

export const formatBcf = (value: number | null) =>
  value == null ? "" : value.toFixed(2)

export const formatPct = (value: number | null) =>
  value == null ? "" : `${Math.round(value)}%`

/** Direction of a rounded percentage, so "-0.3%" shows as a neutral 0%. */
export function pctDirection(value: number | null): "up" | "down" | "flat" {
  if (value == null) return "flat"
  const rounded = Math.round(value)
  return rounded > 0 ? "up" : rounded < 0 ? "down" : "flat"
}

export function formatDay(iso: string, withYear = false) {
  const date = new Date(`${iso}T00:00:00`)
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  })
}

/** One row per day with a column per facility, the shape Recharts expects. */
export function pivotSeries(
  series: DailySeries[],
): Record<string, number | string>[] {
  const byDay = new Map<string, Record<string, number | string>>()
  for (const { name, points } of series) {
    for (const { flow_date, bcf } of points) {
      const row = byDay.get(flow_date) ?? { flow_date }
      row[name] = bcf
      byDay.set(flow_date, row)
    }
  }
  return [...byDay.values()].sort((a, b) =>
    String(a.flow_date).localeCompare(String(b.flow_date)),
  )
}
