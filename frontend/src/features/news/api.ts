import { apiRequest } from "@/services/api_client"

const API_V1 = "/api/v1"
const NEWS_BASE = `${API_V1}/news/`

export type DbSentiment = "bullish" | "bearish" | "neutral" | null

export type DbNewsRow = {
  id: number
  source_id: string
  category: string[]
  region: string[]
  summary: string | null
  paragraph_summary: string | null
  headline: string
  body: string | null
  favourited: boolean
  read: boolean
  official_sentiment: DbSentiment
  source: string | null
  updatedDate: string | null
  rtpTimestamp: string | null
  publishedChannel: string | null
  importantStory: string | null
  documentUrl: string | null
}

type NewsPatchResponse = {
  ok: boolean
  data: Partial<DbNewsRow> & Pick<DbNewsRow, "id">
}

export function isImportantStory(value: string | null): boolean {
  if (!value) return false
  return ["true", "1", "yes", "y", "important"].includes(value.trim().toLowerCase())
}

type NewsListResponse = { data: DbNewsRow[]; total?: number; limit?: number; offset?: number }

export async function getNews(limit = 200, favouritedOnly = false): Promise<DbNewsRow[]> {
  const res = await apiRequest<NewsListResponse>(NEWS_BASE, {
    query: {
      limit: String(limit),
      favourited_only: favouritedOnly ? "true" : "false",
    },
  })
  return res.data ?? []
}

export type NewsPage = { data: DbNewsRow[]; total: number; limit: number; offset: number }

/** Paginated news fetch. `offset`/`limit` map to the backend's offset pagination. */
export async function getNewsPage(limit = 25, offset = 0, favouritedOnly = false): Promise<NewsPage> {
  const res = await apiRequest<NewsListResponse>(NEWS_BASE, {
    query: {
      limit: String(limit),
      offset: String(offset),
      favourited_only: favouritedOnly ? "true" : "false",
    },
  })
  const data = res.data ?? []
  return {
    data,
    total: res.total ?? data.length,
    limit: res.limit ?? limit,
    offset: res.offset ?? offset,
  }
}

export type NewsFeedParams = {
  limit?: number
  offset?: number
  q?: string
  favourited?: boolean | null
  read?: boolean | null
  sentiment?: "bullish" | "bearish" | "neutral" | null
  categories?: string[]
  regions?: string[]
  regionNone?: boolean
  dateFrom?: string
  dateTo?: string
  sort?: "default" | "newest"
}

/** Server-side filtered + paginated news feed (used by the Newsletter page). */
export async function getNewsFeed(params: NewsFeedParams): Promise<NewsPage> {
  const limit = params.limit ?? 25
  const offset = params.offset ?? 0
  const query: Record<string, string> = {
    limit: String(limit),
    offset: String(offset),
    sort: params.sort ?? "default",
  }
  if (params.q) query.q = params.q
  if (params.favourited != null) query.favourited = params.favourited ? "true" : "false"
  if (params.read != null) query.read = params.read ? "true" : "false"
  if (params.sentiment) query.sentiment = params.sentiment
  if (params.categories?.length) query.categories = params.categories.join("|")
  if (params.regions?.length) query.regions = params.regions.join("|")
  if (params.regionNone) query.region_none = "true"
  if (params.dateFrom) query.date_from = params.dateFrom
  if (params.dateTo) query.date_to = params.dateTo

  const res = await apiRequest<NewsListResponse>(NEWS_BASE, { query })
  const data = res.data ?? []
  return {
    data,
    total: res.total ?? data.length,
    limit: res.limit ?? limit,
    offset: res.offset ?? offset,
  }
}

export type NewsFacets = { categories: string[]; regions: string[] }

/** Distinct category/region values for the filter dropdowns. */
export async function getFacets(): Promise<NewsFacets> {
  return apiRequest<NewsFacets>(`${NEWS_BASE}facets`)
}

export async function patchFavourite(articleId: number, favourited: boolean) {
  const res = await apiRequest<NewsPatchResponse>(`${NEWS_BASE}${encodeURIComponent(String(articleId))}/favourite`, {
    method: "PATCH",
    body: { favourited },
  })
  return res.data
}

export async function patchRead(articleId: number, read: boolean) {
  const res = await apiRequest<NewsPatchResponse>(`${NEWS_BASE}${encodeURIComponent(String(articleId))}/read`, {
    method: "PATCH",
    body: { read },
  })
  return res.data
}

export async function patchSentiment(articleId: number, official_sentiment: DbSentiment) {
  const res = await apiRequest<NewsPatchResponse>(`${NEWS_BASE}${encodeURIComponent(String(articleId))}/sentiment`, {
    method: "PATCH",
    body: { official_sentiment },
  })
  return res.data
}

export async function patchClassification(articleId: number, category: string[], region: string[]) {
  const res = await apiRequest<NewsPatchResponse>(`${NEWS_BASE}${encodeURIComponent(String(articleId))}/classification`, {
    method: "PATCH",
    body: { category, region },
  })
  return res.data
}

export async function sendEmailSummary(
  recipient: string,
  dateFrom?: string,
  dateTo?: string,
  categories: string[] = [],
) {
  return apiRequest<{ ok: boolean; message: string }>(`${NEWS_BASE}email-summary`, {
    method: "POST",
    body: { recipient, date_from: dateFrom || null, date_to: dateTo || null, categories },
  })
}

export type PipelineRunInfo = {
  configured: boolean
  run_id: number | null
  state: string | null
  result: string | null
  start_time: string | null
  end_time: string | null
  run_url: string | null
}

export async function getPipelineLastRun(): Promise<PipelineRunInfo> {
  return apiRequest<PipelineRunInfo>(`${NEWS_BASE}pipeline/last-run`)
}

export async function triggerPipeline() {
  return apiRequest<{ ok: boolean; run_id: number | null }>(`${NEWS_BASE}pipeline/trigger`, {
    method: "POST",
  })
}

