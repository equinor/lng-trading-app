// frontend/src/routes/_layout/news_summary.tsx
import { useEffect, useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ExternalLink, Mail } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { formatHtmlText } from "@/lib/utils"
import { getNews, sendEmailSummary, type DbNewsRow } from "@/services/news/news_api"
import { formatTime, readTimeMinFromContent, cleanTagValue } from "@/services/news/news_utils"
import { useDateFilter } from "@/hooks/useDateFilter"

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

function panelBorderClass(key: SentimentKey) {
  if (key === "bullish") return "border-green-600 dark:border-green-400"
  if (key === "bearish") return "border-red-600 dark:border-red-400"
  return "border-blue-600 dark:border-blue-400"
}

function panelTextClass(key: SentimentKey) {
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

  const { dateFrom, setDateFrom, dateTo, setDateTo, resetDates } = useDateFilter("news-summary", 7)

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

    const sortWithinBucket = (a: DbNewsRow, b: DbNewsRow) =>
      toTimestampMillis(b.rtpTimestamp) - toTimestampMillis(a.rtpTimestamp)

    const bullishSorted = [...bullish].sort(sortWithinBucket)
    const bearishSorted = [...bearish].sort(sortWithinBucket)
    const neutralSorted = [...neutral].sort(sortWithinBucket)

    return { bullish: bullishSorted, bearish: bearishSorted, neutral: neutralSorted }
  }, [data, dateFrom, dateTo])

  const dominant: SentimentKey = grouped.bullish.length >= grouped.bearish.length && grouped.bullish.length >= grouped.neutral.length
    ? "bullish"
    : grouped.bearish.length >= grouped.neutral.length
      ? "bearish"
      : "neutral"

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

      {dominant === "neutral" && (
        <>
          {/* Top: Bullish + Bearish side by side */}
          <div className="flex gap-2 flex-1 min-h-0">
            <div className="flex-1 min-w-0">
              <SentimentPanel title="Bullish" rows={grouped.bullish} emptyText={panelEmptyText("bullish")} columns={1} />
            </div>
            <div className="flex-1 min-w-0">
              <SentimentPanel title="Bearish" rows={grouped.bearish} emptyText={panelEmptyText("bearish")} columns={1} />
            </div>
          </div>
          {/* Bottom: Neutral full-width, 2-col */}
          <div className="shrink-0">
            <SentimentPanel title="Neutral" rows={grouped.neutral} emptyText={panelEmptyText("neutral")} columns={2} />
          </div>
        </>
      )}

      {dominant === "bullish" && (
        <div className="flex gap-2 flex-1 min-h-0">
          {/* Left: Bullish full height */}
          <div className="flex-1 min-w-0">
            <SentimentPanel title="Bullish" rows={grouped.bullish} emptyText={panelEmptyText("bullish")} columns={1} />
          </div>
          {/* Right: Bearish top + Neutral bottom */}
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <div className="flex-1 min-h-0">
              <SentimentPanel title="Bearish" rows={grouped.bearish} emptyText={panelEmptyText("bearish")} columns={1} />
            </div>
            <div className="flex-1 min-h-0">
              <SentimentPanel title="Neutral" rows={grouped.neutral} emptyText={panelEmptyText("neutral")} columns={1} />
            </div>
          </div>
        </div>
      )}

      {dominant === "bearish" && (
        <div className="flex gap-2 flex-1 min-h-0">
          {/* Left: Bullish top + Neutral bottom */}
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <div className="flex-1 min-h-0">
              <SentimentPanel title="Bullish" rows={grouped.bullish} emptyText={panelEmptyText("bullish")} columns={1} />
            </div>
            <div className="flex-1 min-h-0">
              <SentimentPanel title="Neutral" rows={grouped.neutral} emptyText={panelEmptyText("neutral")} columns={1} />
            </div>
          </div>
          {/* Right: Bearish full height */}
          <div className="flex-1 min-w-0">
            <SentimentPanel title="Bearish" rows={grouped.bearish} emptyText={panelEmptyText("bearish")} columns={1} />
          </div>
        </div>
      )}
    </div>
  )
}

function SendEmailButton({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const DEFAULT_RECIPIENTS = ["csee@equinor.com"]
  const [open, setOpen] = useState(false)
  const [recipients, setRecipients] = useState<string[]>(DEFAULT_RECIPIENTS)
  const [newEmail, setNewEmail] = useState("")
  const [sending, setSending] = useState(false)

  const addRecipient = () => {
    const trimmed = newEmail.trim().toLowerCase()
    if (trimmed && trimmed.includes("@") && !recipients.includes(trimmed)) {
      setRecipients([...recipients, trimmed])
      setNewEmail("")
    }
  }

  const removeRecipient = (email: string) => {
    setRecipients(recipients.filter((r) => r !== email))
  }

  const handleSend = async () => {
    if (recipients.length === 0) return
    setSending(true)
    try {
      for (const recipient of recipients) {
        await sendEmailSummary(recipient, dateFrom || undefined, dateTo || undefined)
      }
      setOpen(false)
    } catch {
      // Could show error toast
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5">
          <Mail className="h-3.5 w-3.5" />
          Email
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send News Summary</DialogTitle>
          <DialogDescription>
            Email the current sentiment summary to the recipients below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex flex-wrap gap-1.5">
            {recipients.map((email) => (
              <Badge key={email} variant="secondary" className="gap-1 pr-1">
                {email}
                <button
                  type="button"
                  className="ml-1 rounded-full hover:bg-muted-foreground/20 px-1 text-xs"
                  onClick={() => removeRecipient(email)}
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="Add recipient..."
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="h-9"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRecipient() } }}
            />
            <Button type="button" variant="secondary" size="sm" className="h-9" onClick={addRecipient} disabled={!newEmail.trim()}>
              Add
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" onClick={handleSend} disabled={sending || recipients.length === 0}>
            {sending ? "Sending..." : `Send to ${recipients.length} recipient${recipients.length !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
          <>
            <div className="pb-1">
              <span className={`text-sm font-semibold ${panelTextClass(key)}`}>{props.title}</span>
            </div>
            <div className={props.columns === 2 ? "grid grid-cols-2 gap-1.5" : "space-y-1.5"}>
              {visibleRows.map((n) => (
                <article key={n.id} className="rounded border px-2 py-1 overflow-hidden">
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
                      {n.summary && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {formatHtmlText(n.summary)}
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
          </>
        )}
      </div>
    </Card>
  )
}
