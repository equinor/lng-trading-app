// frontend/src/routes/_layout/news_summary.tsx
import { useEffect, useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ExternalLink } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { formatHtmlText } from "@/lib/utils"
import { getNews, isImportantStory, type DbNewsRow } from "@/services/news/news_api"
import { formatTime, readTimeMinFromContent, cleanTagValue } from "@/services/news/news_utils"

type SentimentKey = "bullish" | "bearish" | "neutral"
type RowWithReadTime = DbNewsRow & { readTimeMin: number }
type GroupedRows = Record<SentimentKey, RowWithReadTime[]>

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (value == null) return false
  if (typeof value === "number") return value !== 0
  const text = String(value).trim().toLowerCase()
  return ["true", "1", "yes", "y", "t"].includes(text)
}

function toTimestampMillis(value: string | null | undefined): number {
  if (!value) return 0
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? t : 0
}

function getFavouritedNewsQueryOptions() {
  return {
    queryKey: ["news_summary", "favourited"],
    queryFn: () => getNews(500, true),
    refetchOnMount: "always" as const,
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

function panelAccentClass(key: SentimentKey) {
  if (key === "bullish") return "text-green-700 dark:text-green-400"
  if (key === "bearish") return "text-red-700 dark:text-red-400"
  return "text-blue-700 dark:text-blue-400"
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
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-130" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:grid-rows-2">
        <Skeleton className="h-full w-full xl:col-start-1 xl:row-start-1 xl:row-span-2" />
        <Skeleton className="h-full w-full xl:col-start-2 xl:row-start-1" />
        <Skeleton className="h-full w-full xl:col-start-2 xl:row-start-2" />
      </div>
    </div>
  )
}

function NewsSummaryRoute() {
  return <NewsSummary />
}

function NewsSummary() {
  useEffect(() => {
    const href = "https://cdn.eds.equinor.com/font/eds-uprights-vf.css"
    const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`)

    if (existing) return

    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = href
    document.head.appendChild(link)

    return () => {
      link.remove()
    }
  }, [])

  const defaultDateFrom = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  }, [])
  const [dateFrom, setDateFrom] = useState(defaultDateFrom)
  const [dateTo, setDateTo] = useState("")

  const newsQuery = useQuery(getFavouritedNewsQueryOptions())
  const data = newsQuery.data

  const grouped = useMemo<GroupedRows>(() => {
    let fav = (data ?? []).filter((x) => toBool(x.favourited))

    // Date filter
    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null
      const to = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null
      fav = fav.filter((x) => {
        const t = toTimestampMillis(x.rtpTimestamp)
        if (!t) return false
        if (from && t < from) return false
        if (to && t > to) return false
        return true
      })
    }

    const bullish: RowWithReadTime[] = []
    const bearish: RowWithReadTime[] = []
    const neutral: RowWithReadTime[] = []

    for (const n of fav) {
      const row = { ...n, readTimeMin: readTimeMinFromContent(n.body) }
      if (row.official_sentiment === "bullish") bullish.push(row)
      else if (row.official_sentiment === "bearish") bearish.push(row)
      else neutral.push(row)
    }

    const sortWithinBucket = (a: DbNewsRow, b: DbNewsRow) => {
      const importantRankA = isImportantStory(a.importantStory) ? 1 : 0
      const importantRankB = isImportantStory(b.importantStory) ? 1 : 0
      if (importantRankA !== importantRankB) return importantRankB - importantRankA

      return toTimestampMillis(b.rtpTimestamp) - toTimestampMillis(a.rtpTimestamp)
    }

    const bullishSorted = [...bullish].sort(sortWithinBucket)
    const bearishSorted = [...bearish].sort(sortWithinBucket)
    const neutralSorted = [...neutral].sort(sortWithinBucket)

    return { bullish: bullishSorted, bearish: bearishSorted, neutral: neutralSorted }
  }, [data, dateFrom, dateTo])

  const dominant = useMemo(() => getDominantSentiment(grouped), [grouped])

  // Prevent outdated cached content from flashing before a fresh GET returns.
  if (!newsQuery.isFetchedAfterMount) {
    return <PendingNewsSummary />
  }

  if (newsQuery.isError) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground">
        Failed to load news summary.
      </div>
    )
  }

  const keys: SentimentKey[] = ["bullish", "bearish", "neutral"]

  return (
    <div className="flex flex-col gap-4" style={{ fontFamily: "Inter, sans-serif" }}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-lg font-bold tracking-tight" style={{ fontFamily: "Equinor, Inter, sans-serif" }}>LNG market news / sentiment </h1>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 w-37.5"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 w-37.5"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9"
            onClick={() => {
              setDateFrom(defaultDateFrom)
              setDateTo("")
            }}
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:grid-rows-2">
        {keys.map((key) => (
          <div key={key} className={panelLayoutClass(key, dominant)}>
            <SentimentPanel
              title={panelTitle(key)}
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
  rows: RowWithReadTime[]
  emptyText: string
  isPrimary: boolean
}) {
  const visibleRows = props.rows
  const bodyClamp = props.rows.length <= 1 ? "" : props.isPrimary ? "line-clamp-2" : "line-clamp-1"

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle
            className={`text-base ${panelAccentClass(props.title.toLowerCase() as SentimentKey)}`}
            style={{ fontFamily: "Equinor, Inter, sans-serif" }}
          >
            {props.title}
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {visibleRows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{props.emptyText}</div>
        ) : (
          <div className="space-y-2">
            {visibleRows.map((n) => (
              <article key={n.id} className="rounded-md border px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground wrap-break-word" style={{ fontFamily: "Inter, sans-serif" }}>
                        {n.source} • {formatTime(n.rtpTimestamp)}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 pl-3">
                            {n.region.map((region) => (
                                <Badge key={`region-${n.id}-${region}`} variant="secondary">
                                {cleanTagValue(region)}
                                </Badge>
                            ))}
                            {n.category.map((category) => (
                                <Badge key={`category-${n.id}-${category}`} variant="outline">
                                {cleanTagValue(category)}
                                </Badge>
                            ))}
                            
                        </div>
                    </div>

                    <h2 className="text-sm font-semibold leading-snug wrap-break-word" style={{ fontFamily: "Equinor, Inter, sans-serif" }}>{n.headline}</h2>

                    {n.summary && (
                      <p className={`text-xs text-muted-foreground wrap-break-word ${bodyClamp}`}>
                        {formatHtmlText(n.summary)}
                      </p>
                    )}

                    {/* <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {n.region.map((region) => (
                        <Badge key={`region-${n.id}-${region}`} variant="secondary">
                          {cleanTagValue(region)}
                        </Badge>
                      ))}
                      {n.category.map((category) => (
                        <Badge key={`category-${n.id}-${category}`} variant="outline">
                          {cleanTagValue(category)}
                        </Badge>
                      ))}
                    </div> */}
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
          </div>
        )}
      </CardContent>
    </Card>
  )
}
