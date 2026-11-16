import type { CycleSeries, DailySeries } from "./api"

/** A line per facility; `x` is a day (YYYY-MM-DD). */
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

/** The gas days present in the cycle data, newest first. */
export const cycleDays = (series: CycleSeries[]): string[] =>
  [...new Set(series.flatMap((s) => s.points.map((p) => p.gas_day)))]
    .sort()
    .reverse()

/**
 * One gas day's nomination of each cycle: one row per cycle and one column per facility. A
 * facility has no value for cycles that have not happened yet.
 */
export function cycleRowsForDay(
  series: CycleSeries[],
  day: string,
): Record<string, number | string>[] {
  return CYCLES.map(({ code, label }) => {
    const row: Record<string, number | string> = { cycle: label }
    for (const { name, points } of series) {
      const point = points.find((p) => p.gas_day === day && p.cycle === code)
      if (point) row[name] = point.bcf
    }
    return row
  })
}

/** Both charts share this height so they line up side by side. */
export const CHART_HEIGHT = 460

/**
 * Y axis from zero with a tick every 0.25 to 1 BCF/d, depending on the range, so the lines have
 * a fine grid to read against.
 */
export function yAxisScale(values: number[]): {
  ticks: number[]
  max: number
  format: (value: number) => string
} {
  const peak = Math.max(0, ...values)
  const step = peak <= 2 ? 0.25 : peak <= 6 ? 0.5 : 1
  const max = Math.max(step, Math.ceil(peak / step) * step)
  const count = Math.round(max / step)
  return {
    ticks: Array.from({ length: count + 1 }, (_, i) => i * step),
    max,
    format: (value) => value.toFixed(step < 0.5 ? 2 : 1),
  }
}

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
