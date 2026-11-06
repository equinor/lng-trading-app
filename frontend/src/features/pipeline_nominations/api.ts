import { apiRequest } from "@/services/api_client"

const BASE = "/api/v1/pipeline-nominations"

export type FacilityFilter = { name: string; pipelines: string[] }
export type FiltersResponse = {
  latest_date: string | null
  facilities: FacilityFilter[]
}

export type DailyPoint = { flow_date: string; bcf: number }
export type DailySeries = { name: string; points: DailyPoint[] }

export type CyclePoint = { gas_day: string; cycle: string; bcf: number }
export type CycleSeries = { name: string; points: CyclePoint[] }

export type ColumnMeta = {
  key: string
  group: string
  label: string
  partial: boolean
}
export type MatrixCell = {
  bcf: number | null
  change_pct: number | null
  // Cycle view: not published in this cycle, so the previous cycle's value is shown.
  carried: boolean
}
export type PipelineRow = { name: string; cells: MatrixCell[] }
export type FacilityRow = {
  name: string
  cells: MatrixCell[]
  pipelines: PipelineRow[]
}
export type MatrixTable = {
  columns: ColumnMeta[]
  facilities: FacilityRow[]
  total: MatrixCell[]
}

export type OverviewResponse = {
  latest_date: string | null
  daily_14: DailySeries[]
  daily_180: DailySeries[]
  monthly_table: MatrixTable
  daily_table: MatrixTable
  // Empty for the platts source.
  cycle_series: CycleSeries[]
  cycle_table: MatrixTable
}

export type Source = "platts" | "woodmac"

// Backend pairs are "facility::pipeline", joined with "|".
export const selectionToken = (facility: string, pipeline: string) =>
  `${facility}::${pipeline}`

export function getFilters(source: Source): Promise<FiltersResponse> {
  return apiRequest<FiltersResponse>(`${BASE}/filters`, { query: { source } })
}

/** An empty selection means all facilities and pipelines. */
export function getOverview(
  source: Source,
  selected: string[],
): Promise<OverviewResponse> {
  return apiRequest<OverviewResponse>(`${BASE}/overview`, {
    query: { source, ...(selected.length ? { selected: selected.join("|") } : {}) },
  })
}
