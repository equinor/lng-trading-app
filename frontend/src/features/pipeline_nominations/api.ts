import { apiRequest } from "@/services/api_client"

const BASE = "/api/v1/pipeline-nominations"

export type FacilityFilter = { name: string; pipelines: string[] }
export type FiltersResponse = {
  latest_date: string | null
  facilities: FacilityFilter[]
}

export type DailyPoint = { flow_date: string; bcf: number }
export type DailySeries = { name: string; points: DailyPoint[] }

export type MonthMeta = {
  key: string
  year: number
  month: number
  label: string
  partial: boolean
}
export type MonthCell = { bcf: number | null; mom_pct: number | null }
export type PipelineRow = { name: string; cells: MonthCell[] }
export type FacilityRow = {
  name: string
  cells: MonthCell[]
  pipelines: PipelineRow[]
}
export type MonthlyTable = {
  months: MonthMeta[]
  facilities: FacilityRow[]
  total: MonthCell[]
}

export type OverviewResponse = {
  latest_date: string | null
  daily_14: DailySeries[]
  daily_180: DailySeries[]
  monthly: MonthlyTable
}

// Backend pairs are "facility::pipeline", joined with "|".
export const selectionToken = (facility: string, pipeline: string) =>
  `${facility}::${pipeline}`

export function getFilters(): Promise<FiltersResponse> {
  return apiRequest<FiltersResponse>(`${BASE}/filters`)
}

/** An empty selection means all facilities and pipelines. */
export function getOverview(selected: string[]): Promise<OverviewResponse> {
  return apiRequest<OverviewResponse>(`${BASE}/overview`, {
    query: selected.length ? { selected: selected.join("|") } : undefined,
  })
}
