import { apiRequest } from "@/services/api_client"

const BASE = "/api/v1/lng-balance"

export type FilterNode = { name: string; children: FilterNode[] }
export type FiltersResponse = {
  loading: FilterNode[]
  destination: FilterNode[]
}

export type Measure = { cargoes: number; kt: number }
export type MonthPoint = { month: string; supply: Measure; demand: Measure }
export type QuarterRow = {
  quarter: number
  supply: Measure
  demand: Measure
  // Supply minus demand, negative when short.
  net: Measure
}
export type YearRow = {
  year: number
  supply: Measure
  demand: Measure
  net: Measure
  quarters: QuarterRow[]
}
export type OverviewResponse = {
  years: number[]
  // First month with model (forecast) rows; earlier months are actuals.
  forecast_from: string | null
  months: MonthPoint[]
  table: YearRow[]
}

export type ForecastLine = {
  forecast_date: string
  // Supply minus demand as it was forecast on forecast_date.
  months: { month: string; net: Measure }[]
}

// Country names contain commas, so the backend lists are joined with "|".
const join = (names: string[]) => names.join("|")

export function getFilters(): Promise<FiltersResponse> {
  return apiRequest<FiltersResponse>(`${BASE}/filters`)
}

/** Dates on which a forecast was created, newest first. */
export function getForecastDates(): Promise<{ dates: string[] }> {
  return apiRequest<{ dates: string[] }>(`${BASE}/forecast-dates`)
}

/** Net short by month as forecast on each date; the country filters work as in getOverview. */
export function getForecastLines(
  dates: string[],
  loading: string[],
  destination: string[],
): Promise<{ lines: ForecastLine[] }> {
  return apiRequest<{ lines: ForecastLine[] }>(`${BASE}/forecast-lines`, {
    query: {
      dates: join(dates),
      ...(loading.length ? { loading: join(loading) } : {}),
      ...(destination.length ? { destination: join(destination) } : {}),
    },
  })
}

/**
 * Loading source filters supply and destination filters demand; an empty list means all.
 * With `forecastDate` the balance is shown as it was forecast on that date, otherwise the latest.
 */
export function getOverview(
  loading: string[],
  destination: string[],
  forecastDate: string | null = null,
): Promise<OverviewResponse> {
  return apiRequest<OverviewResponse>(`${BASE}/overview`, {
    query: {
      ...(loading.length ? { loading: join(loading) } : {}),
      ...(destination.length ? { destination: join(destination) } : {}),
      ...(forecastDate ? { forecast_date: forecastDate } : {}),
    },
  })
}
