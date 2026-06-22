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

type NewsListResponse = { data: DbNewsRow[] }

export async function getNews(limit = 200, favouritedOnly = false): Promise<DbNewsRow[]> {
  const res = await apiRequest<NewsListResponse>(NEWS_BASE, {
    query: {
      limit: String(limit),
      favourited_only: favouritedOnly ? "true" : "false",
    },
  })
  return res.data ?? []
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

export async function sendEmailSummary(recipient: string, dateFrom?: string, dateTo?: string) {
  return apiRequest<{ ok: boolean; message: string }>(`${NEWS_BASE}email-summary`, {
    method: "POST",
    body: { recipient, date_from: dateFrom || null, date_to: dateTo || null },
  })
}
