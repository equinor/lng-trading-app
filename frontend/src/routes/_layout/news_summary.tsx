// frontend/src/routes/_layout/news_summary.tsx
import { Suspense, useMemo } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"
import { ExternalLink } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { getNews, type DbNewsRow, type DbSentiment } from "@/services/news/news_api"

type SentimentKey = "bullish" | "bearish" | "neutral"
type RowWithReadTime = DbNewsRow & { readTimeMin: number }
type GroupedRows = Record<SentimentKey, RowWithReadTime[]>

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

function formatSentimentLabel(sentiment: DbSentiment) {
  if (!sentiment) return null
  return sentiment.charAt(0).toUpperCase() + sentiment.slice(1)
}

function getFavouritedNewsQueryOptions() {
  return {
    queryKey: ["news_summary", "favourited"],
    queryFn: () => getNews(500, true),
  }
}

function getDominantSentiment(grouped: GroupedRows): SentimentKey {
  const ordered: SentimentKey[] = ["bullish", "bearish", "neutral"]
  let dominant: SentimentKey = "bullish"
  for (const key of ordered) {
    if (grouped[key].length > grouped[dominant].length) dominant = key
  }
  return dominant
}

function panelLayoutClass(key: SentimentKey, dominant: SentimentKey) {
  if (dominant === "bullish") {
    if (key === "bullish") return "xl:col-start-1 xl:row-start-1 xl:row-span-2"
    if (key === "bearish") return "xl:col-start-2 xl:row-start-1"
    return "xl:col-start-2 xl:row-start-2"
  }

  if (dominant === "bearish") {
    if (key === "bearish") return "xl:col-start-2 xl:row-start-1 xl:row-span-2"
    if (key === "bullish") return "xl:col-start-1 xl:row-start-1"
    return "xl:col-start-1 xl:row-start-2"
  }

  if (key === "neutral") return "xl:col-start-1 xl:row-start-2 xl:col-span-2"
  if (key === "bullish") return "xl:col-start-1 xl:row-start-1"
  return "xl:col-start-2 xl:row-start-1"
}

function panelTitle(key: SentimentKey) {
  if (key === "bullish") return "Bullish"
  if (key === "bearish") return "Bearish"
  return "Neutral"
}

function panelBadgeVariant(key: SentimentKey): "default" | "destructive" | "secondary" {
  if (key === "bullish") return "default"
  if (key === "bearish") return "destructive"
  return "secondary"
}

function panelEmptyText(key: SentimentKey) {
  if (key === "bullish") return "No favourited bullish articles."
  if (key === "bearish") return "No favourited bearish articles."
  return "No favourited neutral articles."
}

export const Route = createFileRoute("/_layout/news_summary")({
  component: NewsSummaryRoute,
  head: () => ({
    meta: [{ title: "News Summary - LNG Views" }],
  }),
})

function PendingNewsSummary() {
  return (
    <div className="flex h-[calc(100vh-170px)] min-h-0 flex-col gap-4 overflow-hidden">
      <div className="space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-130" />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-2 xl:grid-rows-2">
        <Skeleton className="h-full w-full xl:col-start-1 xl:row-start-1 xl:row-span-2" />
        <Skeleton className="h-full w-full xl:col-start-2 xl:row-start-1" />
        <Skeleton className="h-full w-full xl:col-start-2 xl:row-start-2" />
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

  const grouped = useMemo<GroupedRows>(() => {
    const fav = (data ?? []).filter((x) => x.favourited)

    const bullish: RowWithReadTime[] = []
    const bearish: RowWithReadTime[] = []
    const neutral: RowWithReadTime[] = []

    for (const n of fav) {
      const row = { ...n, readTimeMin: readTimeMinFromContent(n.body) }
      if (row.official_sentiment === "bullish") bullish.push(row)
      else if (row.official_sentiment === "bearish") bearish.push(row)
      else neutral.push(row)
    }

    const sortDesc = (a: DbNewsRow, b: DbNewsRow) =>
      +new Date(b.rtpTimestamp ?? 0) - +new Date(a.rtpTimestamp ?? 0)

    bullish.sort(sortDesc)
    bearish.sort(sortDesc)
    neutral.sort(sortDesc)

    return { bullish, bearish, neutral }
  }, [data])

  const dominant = useMemo(() => getDominantSentiment(grouped), [grouped])
  const keys: SentimentKey[] = ["bullish", "bearish", "neutral"]

  return (
    <div className="flex h-[calc(100vh-170px)] min-h-0 flex-col gap-4 overflow-hidden">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">News Summary</h1>
        <p className="text-muted-foreground">
          Largest section auto-expands based on favourited volume. Dominant: {panelTitle(dominant)}.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-2 xl:grid-rows-2">
        {keys.map((key) => (
          <div key={key} className={panelLayoutClass(key, dominant)}>
            <SentimentPanel
              title={panelTitle(key)}
              badgeVariant={panelBadgeVariant(key)}
              rows={grouped[key]}
              emptyText={panelEmptyText(key)}
              isPrimary={key === dominant}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function SentimentPanel(props: {
  title: "Bullish" | "Bearish" | "Neutral"
  badgeVariant: "default" | "destructive" | "secondary"
  rows: RowWithReadTime[]
  emptyText: string
  isPrimary: boolean
}) {
  const maxVisible = props.isPrimary ? 8 : 4
  const visibleRows = props.rows.slice(0, maxVisible)
  const hiddenCount = Math.max(0, props.rows.length - visibleRows.length)

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{props.title}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{props.rows.length}</Badge>
            <Badge variant={props.badgeVariant}>{props.title}</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 overflow-hidden pt-0">
        {visibleRows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{props.emptyText}</div>
        ) : (
          <div className="space-y-2">
            {visibleRows.map((n) => (
              <article key={n.id} className="rounded-md border px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">Favourited</Badge>

                      {n.official_sentiment && (
                        <Badge
                          variant={
                            n.official_sentiment === "bullish"
                              ? "default"
                              : n.official_sentiment === "bearish"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {formatSentimentLabel(n.official_sentiment)}
                        </Badge>
                      )}

                      <span className="text-xs text-muted-foreground wrap-break-word">
                        {n.source} • {formatTime(n.rtpTimestamp)} • {n.readTimeMin} min
                      </span>
                    </div>

                    <h2 className="text-sm font-semibold leading-snug wrap-break-word">{n.headline}</h2>

                    {n.body && (
                      <p
                        className={`text-xs text-muted-foreground wrap-break-word ${
                          props.isPrimary ? "line-clamp-2" : "line-clamp-1"
                        }`}
                      >
                        {n.body}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {n.region.map((region) => (
                        <Badge key={`region-${n.id}-${region}`} variant="secondary">
                          {region}
                        </Badge>
                      ))}
                      {n.category.map((category) => (
                        <Badge key={`category-${n.id}-${category}`} variant="outline">
                          {category}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Open"
                      onClick={() => {
                        if (n.documentUrl) window.open(n.documentUrl, "_blank", "noopener,noreferrer")
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </article>
            ))}

            {hiddenCount > 0 && (
              <div className="px-1 text-xs text-muted-foreground">+{hiddenCount} more in {props.title}</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
