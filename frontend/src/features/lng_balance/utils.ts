import type { FilterNode } from "@/features/lng_balance/api"

export type Unit = "cargoes" | "kt"

export const UNIT_LABEL: Record<Unit, string> = {
  cargoes: "# cargoes",
  kt: "kt",
}

export const SUPPLY_COLOR = "#dc2626"
export const DEMAND_COLOR = "#16a34a"
export const NET_COLOR = "#2563eb"

// Colours for the older forecasts compared with the current one, in the order they were added.
export const FORECAST_COLORS = [
  "#f59e0b",
  "#a855f7",
  "#14b8a6",
  "#ec4899",
  "#84cc16",
  "#06b6d4",
  "#f97316",
  "#8b5cf6",
  "#10b981",
  "#e11d48",
  "#0ea5e9",
  "#eab308",
]

export const MAX_COMPARED = FORECAST_COLORS.length

export const formatDate = (iso: string) =>
  parseMonth(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })

/** Quick picks for comparing forecasts, as days before the newest forecast. */
export const FORECAST_PRESETS = [
  { label: "1 week ago", days: 7 },
  { label: "1 month ago", days: 30 },
  { label: "3 months ago", days: 91 },
  { label: "6 months ago", days: 182 },
  { label: "1 year ago", days: 365 },
]

/** The newest available forecast date on or before `days` before the newest date, if any. */
export function presetDate(available: string[], days: number): string | null {
  if (available.length === 0) return null
  const target = parseMonth(available[0])
  target.setDate(target.getDate() - days)
  const iso = [
    target.getFullYear(),
    String(target.getMonth() + 1).padStart(2, "0"),
    String(target.getDate()).padStart(2, "0"),
  ].join("-")
  // Dates are newest first and ISO strings sort the same as the dates.
  return available.find((d) => d <= iso) ?? null
}

export const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--foreground)",
  fontSize: 12,
}

export const formatValue = (value: number) =>
  Math.round(value).toLocaleString(undefined, { maximumFractionDigits: 0 })

export const parseMonth = (iso: string) => new Date(`${iso}T00:00:00`)

export const formatMonth = (iso: string) =>
  parseMonth(iso).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  })

/** Every country (leaf) under a node. */
export function leaves(node: FilterNode): string[] {
  return node.children.length ? node.children.flatMap(leaves) : [node.name]
}

/** Net short cell colours: red for short, green for long, stronger the larger the value. */
export function netShade(value: number, max: number) {
  if (!max) return {}
  const strength = Math.min(Math.abs(value) / max, 1)
  const alpha = 0.1 + 0.8 * strength
  const rgb = value < 0 ? "220, 38, 38" : "22, 163, 74"
  return {
    backgroundColor: `rgba(${rgb}, ${alpha.toFixed(2)})`,
    color: alpha > 0.55 ? "#ffffff" : undefined,
  }
}

/** Round tick values covering `values`, about `target` of them, for a fine y axis. */
export function axisTicks(values: number[], target = 7) {
  const finite = values.filter(Number.isFinite)
  if (finite.length === 0) return { ticks: [0, 1], min: 0, max: 1 }
  const low = Math.min(...finite)
  const high = Math.max(...finite)
  const raw = (high - low) / target || 1
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normal = raw / magnitude
  const step =
    (normal <= 1
      ? 1
      : normal <= 2
        ? 2
        : normal <= 2.5
          ? 2.5
          : normal <= 5
            ? 5
            : 10) * magnitude
  const min = Math.floor(low / step) * step
  const max = Math.ceil(high / step) * step
  const ticks: number[] = []
  for (let value = min; value <= max + step / 2; value += step) {
    ticks.push(Number(value.toFixed(6)))
  }
  return { ticks, min, max }
}

/** Month ticks that get sparser as more years are shown: yearly, half-yearly or quarterly. */
export function monthTicks(months: string[], yearCount: number) {
  const every = yearCount > 6 ? 12 : yearCount > 2 ? 6 : 3
  return {
    every,
    ticks: months.filter((m) => parseMonth(m).getMonth() % every === 0),
  }
}

export function formatMonthTick(iso: string, every: number) {
  const date = parseMonth(iso)
  return every === 12
    ? String(date.getFullYear())
    : date.toLocaleDateString(undefined, { month: "short", year: "2-digit" })
}
