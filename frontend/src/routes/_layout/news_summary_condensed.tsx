// frontend/src/routes/_layout/news_summary_condensed.tsx
import { useMemo } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"

import { LayoutSettingsButton } from "@/components/News/LayoutSettingsButton"
import { PipelineButton } from "@/components/News/PipelineButton"
import { SendEmailButton } from "@/components/News/SendEmailButton"
import { SentimentLayout } from "@/components/News/SentimentLayout"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useDateFilter } from "@/hooks/useDateFilter"
import { useEquinorFont } from "@/hooks/useEquinorFont"
import { useNewsLayout } from "@/hooks/useNewsLayout"
import { formatHtmlText } from "@/lib/utils"
import { getNews } from "@/services/news/news_api"
import { formatTime } from "@/services/news/news_utils"
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

const LAYOUT_STORAGE_KEY = "news-summary-condensed-layout-v1"

function getFavouritedNewsQueryOptions() {
  return {
    queryKey: ["news_summary_condensed", "favourited"],
    queryFn: () => getNews(500, true),
    refetchOnMount: "always" as const,
  }
}

export const Route = createFileRoute("/_layout/news_summary_condensed")({
  component: NewsSummaryCondensedRoute,
  head: () => ({
    meta: [{ title: "News Summary (Condensed) - LNG Trading App" }],
  }),
})

function PendingNewsSummaryCondensed() {
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

function NewsSummaryCondensedRoute() {
  return <NewsSummaryCondensed />
}

function NewsSummaryCondensed() {
  useEquinorFont()

  const { dateFrom, setDateFrom, dateTo, setDateTo, resetDates } = useDateFilter("news-summary-condensed", 7)

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

  if (!newsQuery.isFetchedAfterMount) {
    return <PendingNewsSummaryCondensed />
  }

  if (newsQuery.isError) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground">
        Failed to load news summary.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 h-[calc(100vh-6rem)]" style={{ fontFamily: "Equinor, Inter, sans-serif" }}>
      <div className="flex flex-wrap items-center justify-between gap-4 shrink-0">
        <h1 className="text-lg font-bold tracking-tight">
          LNG market news / sentiment (condensed)
        </h1>
        <div className="flex items-center gap-2">
          <PipelineButton />
          <div className="w-px h-5 bg-border mx-1" />
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
  const key = props.title.toLowerCase() as SentimentKey

  return (
    <Card className={`flex flex-col overflow-hidden h-full p-0 border-2 ${panelBorderClass(key)}`}>
      <div className="px-2 py-1.5 flex-1 overflow-hidden min-h-0">
        {props.rows.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">{props.emptyText}</div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="pb-1">
              <span className={`text-sm font-semibold ${panelTextClass(key)}`}>{props.title}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <div className={props.columns === 2 ? "grid grid-cols-2 gap-0.5" : "space-y-0.5"}>
                {props.rows.map((n) => {
                  const summaryText = formatHtmlText(n.paragraph_summary || n.summary || "")
                  const sourceLabel = n.source || "Unknown source"

                  return (
                    <article key={n.id} className="px-1 py-0">
                      <p className="text-base leading-6 text-muted-foreground whitespace-pre-wrap wrap-break-word">
                        <span className="font-semibold text-foreground">• {n.headline}</span>
                        {summaryText ? ` — ${summaryText}` : ""}
                        {` (source: ${sourceLabel}. ${formatTime(n.rtpTimestamp)})`}
                      </p>
                    </article>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
