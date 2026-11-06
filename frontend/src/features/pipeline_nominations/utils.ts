import type { CycleSeries, DailySeries } from "./api"

/** A line per facility; `x` is a day (YYYY-MM-DD) or a day and cycle ("YYYY-MM-DD|2"). */
export type ChartSeries = {
  name: string
  points: { x: string; bcf: number }[]
}

export const fromDaily = (series: DailySeries[]): ChartSeries[] =>
  series.map((s) => ({
    name: s.name,
    points: s.points.map((p) => ({ x: p.flow_date, bcf: p.bcf })),
  }))

// Nomination cycles in the order they happen within a gas day.
const CYCLES = [
  { code: "TI", label: "Timely" },
  { code: "EV", label: "Evening" },
  { code: "I1", label: "ID1" },
  { code: "I2", label: "ID2" },
  { code: "I3", label: "ID3" },
]

export const fromCycles = (series: CycleSeries[]): ChartSeries[] =>
  series.map((s) => ({
    name: s.name,
    points: s.points.map((p) => ({
      x: `${p.gas_day}|${CYCLES.findIndex((c) => c.code === p.cycle) + 1}`,
      bcf: p.bcf,
    })),
  }))

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

/** Axis text for a cycle point, for example "4 Nov ID1". */
export function formatCycleX(x: string) {
  const [day, order] = x.split("|")
  return `${formatDay(day)} ${CYCLES[Number(order) - 1]?.label ?? ""}`
}

/** One row per x value with a column per facility, the shape Recharts expects. */
export function pivotSeries(
  series: ChartSeries[],
): Record<string, number | string>[] {
  const byX = new Map<string, Record<string, number | string>>()
  for (const { name, points } of series) {
    for (const { x, bcf } of points) {
      const row = byX.get(x) ?? { x }
      row[name] = bcf
      byX.set(x, row)
    }
  }
  return [...byX.values()].sort((a, b) =>
    String(a.x).localeCompare(String(b.x)),
  )
}
