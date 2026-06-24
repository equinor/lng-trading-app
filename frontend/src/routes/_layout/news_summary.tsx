// frontend/src/routes/_layout/news_summary.tsx
import { useMemo } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ExternalLink } from "lucide-react"

import { LayoutSettingsButton } from "@/components/News/LayoutSettingsButton"
import { SendEmailButton } from "@/components/News/SendEmailButton"
import { SentimentLayout } from "@/components/News/SentimentLayout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useDateFilter } from "@/hooks/useDateFilter"
import { useEquinorFont } from "@/hooks/useEquinorFont"
import { useNewsLayout } from "@/hooks/useNewsLayout"
import { formatHtmlText } from "@/lib/utils"
import { getNews } from "@/services/news/news_api"
import { cleanTagValue, formatTime } from "@/services/news/news_utils"
import {
  dominantSentiment,
  groupNews,
  panelBorderClass,
  panelEmptyText,
  panelTextClass,
  SENTIMENT_TITLES,
  type RowWithReadTime,
  type SentimentKey,
} from "@/services/news/news_layout"

const LAYOUT_STORAGE_KEY = "news-summary-layout-v1"

function getFavouritedNewsQueryOptions() {
  return {
    queryKey: ["news_summary", "favourited"],
    queryFn: () => getNews(500, true),
    refetchOnMount: "always" as const,
  }
}

export const Route = createFileRoute("/_layout/news_summary")({
  component: NewsSummaryRoute,
  head: () => ({
    meta: [{ title: "News Summary - LNG Trading App" }],
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
  useEquinorFont()

  const { dateFrom, setDateFrom, dateTo, setDateTo, resetDates } = useDateFilter("news-summary", 7)

  const newsQuery = useQuery(getFavouritedNewsQueryOptions())
  const data = newsQuery.data

  const grouped = useMemo(() => groupNews(data, dateFrom, dateTo), [data, dateFrom, dateTo])
  const dominant = dominantSentiment(grouped)

  const layout = useNewsLayout(LAYOUT_STORAGE_KEY, dominant)
  const {
    effectiveLayoutType,
    effectiveSlots,
    layoutMode,
    primarySplit,
    setPrimarySplit,
    secondarySplit,
    setSecondarySplit,
  } = layout

  const renderPanel = (key: SentimentKey, columns: number) => (
    <SentimentPanel
      title={SENTIMENT_TITLES[key]}
      rows={grouped[key]}
      emptyText={panelEmptyText(key)}
      columns={columns}
    />
  )

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

  return (
    <div className="flex flex-col gap-2 h-[calc(100vh-6rem)]" style={{ fontFamily: "Inter, sans-serif" }}>
      <div className="flex flex-wrap items-center justify-between gap-4 shrink-0">
        <h1 className="text-lg font-bold tracking-tight" style={{ fontFamily: "Equinor, Inter, sans-serif" }}>LNG market news / sentiment </h1>
        <div className="flex items-center gap-2">
          <LayoutSettingsButton
            layoutType={effectiveLayoutType}
            slots={effectiveSlots}
            isCustom={layoutMode === "custom"}
            onSelectLayout={layout.selectLayout}
            onSetSlot={layout.setSlot}
            onReset={layout.resetLayout}
          />
          <SendEmailButton dateFrom={dateFrom} dateTo={dateTo} />
          <div className="w-px h-5 bg-border mx-1" />
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
              resetDates()
            }}
          >
            Reset
          </Button>
        </div>
      </div>

      <SentimentLayout
        layoutType={effectiveLayoutType}
        slots={effectiveSlots}
        primarySplit={primarySplit}
        setPrimarySplit={setPrimarySplit}
        secondarySplit={secondarySplit}
        setSecondarySplit={setSecondarySplit}
        renderPanel={renderPanel}
      />
    </div>
  )
}

function SentimentPanel(props: {
  title: "Bullish" | "Bearish" | "Neutral"
  rows: RowWithReadTime[]
  emptyText: string
  columns: number
}) {
  const visibleRows = props.rows
  const key = props.title.toLowerCase() as SentimentKey

  return (
    <Card className={`flex flex-col overflow-hidden h-full p-0 border-2 ${panelBorderClass(key)}`}>
      <div className="px-2 py-1.5 flex-1 overflow-hidden min-h-0">
        {visibleRows.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">{props.emptyText}</div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="pb-1">
              <span className={`text-sm font-semibold ${panelTextClass(key)}`}>{props.title}</span>
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              <div className={props.columns === 2 ? "grid grid-cols-2 gap-1.5" : "space-y-1.5"}>
              {visibleRows.map((n) => (
                <article key={n.id} className="rounded border px-2 py-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[11px] text-muted-foreground" style={{ fontFamily: "Inter, sans-serif" }}>
                          {n.source} • {formatTime(n.rtpTimestamp)}
                        </span>
                        {n.region.map((region) => (
                          <Badge key={`region-${n.id}-${region}`} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {cleanTagValue(region)}
                          </Badge>
                        ))}
                        {n.category.map((category) => (
                          <Badge key={`category-${n.id}-${category}`} variant="outline" className="text-[10px] px-1.5 py-0">
                            {cleanTagValue(category)}
                          </Badge>
                        ))}
                      </div>
                      <h2 className="text-sm font-semibold leading-snug line-clamp-1" style={{ fontFamily: "Equinor, Inter, sans-serif" }}>{n.headline}</h2>
                      {(n.paragraph_summary || n.summary) && (
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap wrap-break-word">
                          {formatHtmlText(n.paragraph_summary || n.summary || "")}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-6 w-6"
                      title="Open"
                      onClick={() => {
                        if (n.documentUrl) window.open(n.documentUrl, "_blank", "noopener,noreferrer")
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </article>
              ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
