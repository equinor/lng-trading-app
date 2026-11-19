import type {
  CurvePrices,
  SavedCustomCurveMonth,
} from "@/features/mid_term_curves/api"
import { CURVE_BY_ID } from "@/features/mid_term_curves/curves"

export const PRICE_FORMAT = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
export const CURRENCY_FORMAT = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  timeZone: "UTC",
})
const TIMESTAMP_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})

/** "Jan 2026" from an ISO date (2026-01-01) or a UTC timestamp. */
export function formatMonth(value: string | number): string {
  return MONTH_FORMAT.format(
    typeof value === "string"
      ? new Date(`${value}T00:00:00Z`)
      : new Date(value),
  )
}

export function formatTimestamp(value: string): string {
  return TIMESTAMP_FORMAT.format(new Date(value))
}

export function isRangeInvalid(fromDate: string, toDate: string): boolean {
  return Boolean(fromDate && toDate && fromDate > toDate)
}

/** Months between the two dates (inclusive); none when the range is backwards. */
export function rowsInRange(
  rows: CurvePrices[],
  fromDate: string,
  toDate: string,
): CurvePrices[] {
  if (isRangeInvalid(fromDate, toDate)) return []
  return rows.filter(
    (row) => row.start_date >= fromDate && row.start_date <= toDate,
  )
}

/** A saved custom curve: one row per month in the backend, grouped back into one curve. */
export type SavedCurve = {
  id: string
  name: string
  createdBy: string
  createdAt: string
  modifiedAt: string
  months: SavedCustomCurveMonth[]
}

export function groupSavedCurves(rows: SavedCustomCurveMonth[]): SavedCurve[] {
  const grouped = new Map<string, SavedCustomCurveMonth[]>()
  for (const row of rows) {
    const months = grouped.get(row.curve_id) ?? []
    months.push(row)
    grouped.set(row.curve_id, months)
  }
  return [...grouped.entries()].map(([id, months]) => ({
    id,
    name: months[0]?.curve_name ?? "Untitled curve",
    createdBy: months[0]?.created_by ?? "",
    createdAt: months[0]?.created_at ?? "",
    modifiedAt: months.reduce(
      (latest, month) =>
        month.modified_at > latest ? month.modified_at : latest,
      months[0]?.modified_at ?? "",
    ),
    months,
  }))
}

/** Average of the chosen standard curves for one month; blank when none has a value. */
export function averageCurveValue(
  row: CurvePrices | undefined,
  curveIds: (string | null)[],
): number | null {
  if (!row) return null
  const values = curveIds
    .map((id) => (id ? (CURVE_BY_ID.get(id)?.value(row) ?? null) : null))
    .filter((value): value is number => value !== null)
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null
}

/** The average of a month's chosen curves, and that average as a percentage of EPA Brent base. */
export function summarizeMonth(
  row: CurvePrices | undefined,
  curveIds: (string | null)[],
): { average: number | null; brentPercent: number | null } {
  const average = averageCurveValue(row, curveIds)
  const brent = row?.epa_brent_base
  return {
    average,
    brentPercent: average !== null && brent ? (average / brent) * 100 : null,
  }
}

/** Blank or non-numeric axis input means automatic. */
export function parseAxisNumber(value: string): number | null {
  if (value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export type YAxisSettings = {
  domain: [number | "auto", number | "auto"]
  ticks: number[] | undefined
  /** Keep lines that leave the chosen limits instead of rescaling the axis. */
  clipToLimits: boolean
}

/** Y axis limits and tick marks from the Y min / Y max / Y step inputs and the plotted values. */
export function computeYAxis(
  dataValues: number[],
  yMin: string,
  yMax: string,
  yStep: string,
): YAxisSettings {
  const minValue = parseAxisNumber(yMin)
  const maxValue = parseAxisNumber(yMax)
  const stepValue = parseAxisNumber(yStep)
  // A min at or above the max is ignored.
  const validLimits =
    minValue === null || maxValue === null || minValue < maxValue
  const step = stepValue !== null && stepValue > 0 ? stepValue : null

  const dataMin = dataValues.length ? Math.min(...dataValues) : 0
  const dataMax = dataValues.length ? Math.max(...dataValues) : 0
  const low =
    validLimits && minValue !== null
      ? minValue
      : step
        ? Math.floor(dataMin / step) * step
        : null
  const high =
    validLimits && maxValue !== null
      ? maxValue
      : step
        ? Math.ceil(dataMax / step) * step
        : null

  const tickCount =
    step && low !== null && high !== null
      ? Math.floor((high - low) / step + 1e-9) + 1
      : 0
  const ticks =
    step && low !== null && tickCount > 1 && tickCount <= 200
      ? Array.from({ length: tickCount }, (_, index) =>
          Number((low + index * step).toFixed(6)),
        )
      : undefined

  return {
    domain: [
      validLimits && minValue !== null ? minValue : ticks ? ticks[0] : "auto",
      validLimits && maxValue !== null
        ? maxValue
        : ticks
          ? Math.max(ticks[ticks.length - 1], dataMax)
          : "auto",
    ],
    ticks,
    clipToLimits: validLimits && (minValue !== null || maxValue !== null),
  }
}
