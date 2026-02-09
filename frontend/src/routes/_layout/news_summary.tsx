// frontend/src/routes/_layout/news_summary.tsx
import { Suspense, useMemo } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"
import { ExternalLink, Bookmark } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

type DbSentiment = "Bullish" | "Bearish" | "Neutral" | null

type DbNewsRow = {
  article_key: string
  source: string
  external_id: string | null
  title: string
  url: string | null
  published_at: string | null
  content: string | null

  favourited: boolean
  official_sentiment: DbSentiment
  tags: string[]
  region: string | null

  version: number
  updated_at: string | null
  updated_by: string | null
}

type NewsListResponse = { data: DbNewsRow[] }

const API_V1 = "/api/v1"
const NEWS_BASE = `${API_V1}/news`

function formatTime(iso: string | null) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(+d)) return "—"
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function readTimeMinFromContent(content: string | null) {
  if (!content) return 2
  const words = content.trim().split(/\s+/).filter(Boolean).length
  return Math.max(2, Math.min(10, Math.round(words / 220)))
}

async function apiGetNews(limit = 500, favouritedOnly = true): Promise<DbNewsRow[]> {
  const url = new URL(NEWS_BASE, window.location.origin)
  url.searchParams.set("limit", String(limit))
  url.searchParams.set("favourited_only", favouritedOnly ? "true" : "false")
  const res = await fetch(url.toString(), { method: "GET" })
  if (!res.ok) throw new Error(`GET /news failed (${res.status})`)
  const json = (await res.json()) as NewsListResponse
  return json.data ?? []
}

function getFavouritedNewsQueryOptions() {
  return {
    queryKey: ["news_summary", "favourited"],
    queryFn: () => apiGetNews(500, true),
  }
}

export const Route = createFileRoute("/_layout/news_summary")({
  component: NewsSummaryRoute,
  head: () => ({
    meta: [{ title: "News Summary - LNG Views" }],
  }),
})

function PendingNewsSummary() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-[520px]" />
      </div>

      <div className="grid grid-rows-2 gap-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-[420px] w-full" />
          <Skeleton className="h-[420px] w-full" />
        </div>
        <Skeleton className="h-[420px] w-full" />
      </div>
    </div>
  )
}

function NewsSummaryRoute() {
  return (
    <Suspense fallback={<PendingNewsSummary />}>
      <NewsSummary />
    </Suspense>
  )
}

function NewsSummary() {
  const { data } = useSuspenseQuery(getFavouritedNewsQueryOptions())

  const grouped = useMemo(() => {
    const fav = (data ?? []).filter((x) => x.favourited)

    const bullish: Array<DbNewsRow & { readTimeMin: number }> = []
    const bearish: Array<DbNewsRow & { readTimeMin: number }> = []
    const neutral: Array<DbNewsRow & { readTimeMin: number }> = []

    for (const n of fav) {
      const row = { ...n, readTimeMin: readTimeMinFromContent(n.content) }
      if (row.official_sentiment === "Bullish") bullish.push(row)
      else if (row.official_sentiment === "Bearish") bearish.push(row)
      else neutral.push(row) // Neutral or null => neutral bucket for summary page
    }

    const sortDesc = (a: DbNewsRow, b: DbNewsRow) =>
      +new Date(b.published_at ?? 0) - +new Date(a.published_at ?? 0)

    bullish.sort(sortDesc)
    bearish.sort(sortDesc)
    neutral.sort(sortDesc)

    return { bullish, bearish, neutral }
  }, [data])

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">News Summary</h1>
        <p className="text-muted-foreground">
          Favourited-only view split by sentiment: Bullish / Bearish (top) and Neutral (bottom).
        </p>
      </div>

      {/* Layout: top half split into 2 columns with a vertical separator; bottom half full-width */}
      <div className="grid grid-rows-2 gap-6 min-h-[calc(100vh-220px)]">
        {/* TOP HALF */}
        <div className="relative grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Bullish */}
          <SentimentPanel
            title="Bullish"
            badgeVariant="default"
            rows={grouped.bullish}
            emptyText="No favourited bullish articles."
          />

          {/* Bearish */}
          <SentimentPanel
            title="Bearish"
            badgeVariant="destructive"
            rows={grouped.bearish}
            emptyText="No favourited bearish articles."
          />

          {/* Vertical separator only for top half (hidden on mobile) */}
          <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-border lg:block" />
        </div>

        {/* BOTTOM HALF */}
        <SentimentPanel
          title="Neutral"
          badgeVariant="secondary"
          rows={grouped.neutral}
          emptyText="No favourited neutral articles."
        />
      </div>
    </div>
  )
}

function SentimentPanel(props: {
  title: "Bullish" | "Bearish" | "Neutral"
  badgeVariant: "default" | "destructive" | "secondary"
  rows: Array<DbNewsRow & { readTimeMin: number }>
  emptyText: string
}) {
  return (
    <Card className="overflow-hidden min-h-0">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{props.title}</CardTitle>
          <Badge variant={props.badgeVariant}>{props.title}</Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-0 min-h-0">
        {props.rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">{props.emptyText}</div>
        ) : (
          <div className="divide-y">
            {props.rows.map((n) => (
              <article key={n.article_key} className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Favourites</Badge>

                      {n.official_sentiment && (
                        <Badge
                          variant={
                            n.official_sentiment === "Bullish"
                              ? "default"
                              : n.official_sentiment === "Bearish"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {n.official_sentiment}
                        </Badge>
                      )}

                      {n.region && <Badge variant="secondary">{n.region}</Badge>}

                      <span className="text-xs text-muted-foreground">
                        {n.source} • {formatTime(n.published_at)} • {n.readTimeMin} min
                      </span>
                    </div>

                    <h2 className="text-base font-semibold leading-snug">{n.title}</h2>

                    {n.content && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{n.content}</p>
                    )}

                    {(n.tags?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {n.tags.map((t) => (
                          <Badge key={t} variant="outline" className="text-xs">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <Button type="button" size="sm" variant="secondary" disabled>
                        <Bookmark className="h-4 w-4 mr-2" />
                        Favourited
                      </Button>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Open"
                      onClick={() => {
                        if (n.url) window.open(n.url, "_blank", "noopener,noreferrer")
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
