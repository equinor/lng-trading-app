// frontend/src/routes/_layout/news_summary.tsx
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ExternalLink, LayoutGrid, Mail } from "lucide-react"

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

function clampPercent(value: number, min = 25, max = 75): number {
  return Math.min(max, Math.max(min, value))
}

function beginResizeDrag(
  event: ReactPointerEvent<HTMLElement>,
  container: HTMLElement | null,
  axis: "x" | "y",
  setPercent: (value: number) => void,
  minPercent = 25,
  maxPercent = 75,
) {
  if (!container) return
  event.preventDefault()

  const rect = container.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return

  const previousUserSelect = document.body.style.userSelect
  const previousCursor = document.body.style.cursor
  document.body.style.userSelect = "none"
  document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize"

  const update = (clientX: number, clientY: number) => {
    const raw = axis === "x"
      ? ((clientX - rect.left) / rect.width) * 100
      : ((clientY - rect.top) / rect.height) * 100
    setPercent(clampPercent(raw, minPercent, maxPercent))
  }

  update(event.clientX, event.clientY)

  const onMove = (moveEvent: PointerEvent) => {
    update(moveEvent.clientX, moveEvent.clientY)
  }

  const onUp = () => {
    window.removeEventListener("pointermove", onMove)
    document.body.style.userSelect = previousUserSelect
    document.body.style.cursor = previousCursor
  }

  window.addEventListener("pointermove", onMove)
  window.addEventListener("pointerup", onUp, { once: true })
}

type LayoutType = "left-big" | "right-big" | "top-big" | "bottom-big" | "columns"
type LayoutMode = "auto" | "custom"
type SentimentSlots = [SentimentKey, SentimentKey, SentimentKey]
type StoredLayout = {
  mode: LayoutMode
  layoutType: LayoutType
  slots: SentimentSlots
  primarySplit: number
  secondarySplit: number
}

const LAYOUT_STORAGE_KEY = "news-summary-layout-v1"

const SENTIMENT_TITLES: Record<SentimentKey, "Bullish" | "Bearish" | "Neutral"> = {
  bullish: "Bullish",
  bearish: "Bearish",
  neutral: "Neutral",
}

const LAYOUT_OPTIONS: { type: LayoutType; label: string }[] = [
  { type: "left-big", label: "Large left + two right" },
  { type: "right-big", label: "Large right + two left" },
  { type: "top-big", label: "Wide top + two bottom" },
  { type: "bottom-big", label: "Wide bottom + two top" },
  { type: "columns", label: "Three columns" },
]

function autoLayout(dominant: SentimentKey): { layoutType: LayoutType; slots: SentimentSlots } {
  if (dominant === "bullish") return { layoutType: "left-big", slots: ["bullish", "bearish", "neutral"] }
  if (dominant === "bearish") return { layoutType: "right-big", slots: ["bearish", "bullish", "neutral"] }
  return { layoutType: "bottom-big", slots: ["neutral", "bullish", "bearish"] }
}

function defaultSplits(layoutType: LayoutType): { primary: number; secondary: number } {
  if (layoutType === "columns") return { primary: 33.34, secondary: 66.67 }
  return { primary: 56, secondary: 50 }
}

function LayoutIcon({ type }: { type: LayoutType }) {
  const cell = "rounded-sm bg-current/70"
  if (type === "left-big") {
    return (
      <div className="flex h-7 w-10 gap-0.5">
        <div className={`${cell} flex-[1.4]`} />
        <div className="flex flex-1 flex-col gap-0.5">
          <div className={`${cell} flex-1`} />
          <div className={`${cell} flex-1`} />
        </div>
      </div>
    )
  }
  if (type === "right-big") {
    return (
      <div className="flex h-7 w-10 gap-0.5">
        <div className="flex flex-1 flex-col gap-0.5">
          <div className={`${cell} flex-1`} />
          <div className={`${cell} flex-1`} />
        </div>
        <div className={`${cell} flex-[1.4]`} />
      </div>
    )
  }
  if (type === "top-big") {
    return (
      <div className="flex h-7 w-10 flex-col gap-0.5">
        <div className={`${cell} flex-[1.4]`} />
        <div className="flex flex-1 gap-0.5">
          <div className={`${cell} flex-1`} />
          <div className={`${cell} flex-1`} />
        </div>
      </div>
    )
  }
  if (type === "bottom-big") {
    return (
      <div className="flex h-7 w-10 flex-col gap-0.5">
        <div className="flex flex-1 gap-0.5">
          <div className={`${cell} flex-1`} />
          <div className={`${cell} flex-1`} />
        </div>
        <div className={`${cell} flex-[1.4]`} />
      </div>
    )
  }
  return (
    <div className="flex h-7 w-10 gap-0.5">
      <div className={`${cell} flex-1`} />
      <div className={`${cell} flex-1`} />
      <div className={`${cell} flex-1`} />
    </div>
  )
}

function LayoutSettingsButton(props: {
  layoutType: LayoutType
  slots: SentimentSlots
  isCustom: boolean
  onSelectLayout: (lt: LayoutType) => void
  onSetSlot: (index: number, key: SentimentKey) => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  const isColumns = props.layoutType === "columns"
  const slotLabels = isColumns
    ? ["Left column", "Middle column", "Right column"]
    : ["Large panel", "Small panel 1", "Small panel 2"]
  const sentiments: SentimentKey[] = ["bullish", "bearish", "neutral"]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5">
          <LayoutGrid className="h-3.5 w-3.5" />
          Layout
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Customise layout</DialogTitle>
          <DialogDescription>
            Choose how the sentiment panels are arranged and which sentiment appears in each position.
            {props.isCustom
              ? " Your selection is saved on this device."
              : " Currently following the automatic (dominant sentiment) layout."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <p className="mb-2 text-sm font-medium">Arrangement</p>
            <div className="grid grid-cols-5 gap-2">
              {LAYOUT_OPTIONS.map((opt) => {
                const active = props.layoutType === opt.type
                return (
                  <button
                    key={opt.type}
                    type="button"
                    aria-label={opt.label}
                    title={opt.label}
                    onClick={() => props.onSelectLayout(opt.type)}
                    className={`flex items-center justify-center rounded-md border p-2 ${active ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground hover:bg-muted"}`}
                  >
                    <LayoutIcon type={opt.type} />
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Panel assignment</p>
            <div className="space-y-2">
              {slotLabels.map((label, index) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <div className="flex gap-1">
                    {sentiments.map((key) => {
                      const active = props.slots[index] === key
                      return (
                        <Button
                          key={key}
                          type="button"
                          size="sm"
                          variant={active ? "default" : "outline"}
                          className="h-8 capitalize"
                          onClick={() => props.onSetSlot(index, key)}
                        >
                          {key}
                        </Button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => props.onReset()}>
            Reset to automatic
          </Button>
          <Button type="button" onClick={() => setOpen(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SentimentLayout(props: {
  layoutType: LayoutType
  slots: SentimentSlots
  grouped: GroupedRows
  primarySplit: number
  setPrimarySplit: (v: number) => void
  secondarySplit: number
  setSecondarySplit: (v: number) => void
}) {
  const { layoutType, slots, grouped, primarySplit, setPrimarySplit, secondarySplit, setSecondarySplit } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const smallsRef = useRef<HTMLDivElement>(null)

  const panelFor = (key: SentimentKey, columns = 1) => (
    <SentimentPanel title={SENTIMENT_TITLES[key]} rows={grouped[key]} emptyText={panelEmptyText(key)} columns={columns} />
  )

  if (layoutType === "columns") {
    const middleWidth = Math.max(0, secondarySplit - primarySplit)
    return (
      <div ref={containerRef} className="flex items-stretch flex-1 min-h-0">
        <div className="min-w-0 min-h-0" style={{ width: `${primarySplit}%` }}>{panelFor(slots[0])}</div>
        <ResizeHandle
          orientation="vertical"
          onPointerDown={(e) => beginResizeDrag(e, containerRef.current, "x", setPrimarySplit, 15, 70)}
        />
        <div className="min-w-0 min-h-0" style={{ width: `${middleWidth}%` }}>{panelFor(slots[1])}</div>
        <ResizeHandle
          orientation="vertical"
          onPointerDown={(e) => beginResizeDrag(e, containerRef.current, "x", setSecondarySplit, primarySplit + 10, 85)}
        />
        <div className="min-w-0 min-h-0" style={{ width: `${100 - secondarySplit}%` }}>{panelFor(slots[2])}</div>
      </div>
    )
  }

  if (layoutType === "left-big" || layoutType === "right-big") {
    const smalls = (
      <div ref={smallsRef} className="flex flex-col min-w-0 min-h-0" style={{ width: `${100 - primarySplit}%` }}>
        <div className="min-h-0" style={{ height: `${secondarySplit}%` }}>{panelFor(slots[1])}</div>
        <ResizeHandle
          orientation="horizontal"
          onPointerDown={(e) => beginResizeDrag(e, smallsRef.current, "y", setSecondarySplit)}
        />
        <div className="min-h-0" style={{ height: `${100 - secondarySplit}%` }}>{panelFor(slots[2])}</div>
      </div>
    )
    const big = <div className="min-w-0 min-h-0" style={{ width: `${primarySplit}%` }}>{panelFor(slots[0])}</div>
    return (
      <div ref={containerRef} className="flex items-stretch flex-1 min-h-0">
        {layoutType === "left-big" ? (
          <>
            {big}
            <ResizeHandle
              orientation="vertical"
              onPointerDown={(e) => beginResizeDrag(e, containerRef.current, "x", setPrimarySplit)}
            />
            {smalls}
          </>
        ) : (
          <>
            {smalls}
            <ResizeHandle
              orientation="vertical"
              onPointerDown={(e) => beginResizeDrag(e, containerRef.current, "x", (v) => setPrimarySplit(100 - v))}
            />
            {big}
          </>
        )}
      </div>
    )
  }

  const wideSmalls = (
    <div ref={smallsRef} className="flex min-w-0 min-h-0 items-stretch" style={{ height: `${100 - primarySplit}%` }}>
      <div className="min-w-0 min-h-0" style={{ width: `${secondarySplit}%` }}>{panelFor(slots[1])}</div>
      <ResizeHandle
        orientation="vertical"
        onPointerDown={(e) => beginResizeDrag(e, smallsRef.current, "x", setSecondarySplit)}
      />
      <div className="min-w-0 min-h-0" style={{ width: `${100 - secondarySplit}%` }}>{panelFor(slots[2])}</div>
    </div>
  )
  const wideBig = <div className="min-h-0" style={{ height: `${primarySplit}%` }}>{panelFor(slots[0])}</div>
  return (
    <div ref={containerRef} className="flex flex-col flex-1 min-h-0">
      {layoutType === "top-big" ? (
        <>
          {wideBig}
          <ResizeHandle
            orientation="horizontal"
            onPointerDown={(e) => beginResizeDrag(e, containerRef.current, "y", setPrimarySplit)}
          />
          {wideSmalls}
        </>
      ) : (
        <>
          {wideSmalls}
          <ResizeHandle
            orientation="horizontal"
            onPointerDown={(e) => beginResizeDrag(e, containerRef.current, "y", (v) => setPrimarySplit(100 - v))}
          />
          {wideBig}
        </>
      )}
    </div>
  )
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

  const [layoutMode, setLayoutMode] = useState<LayoutMode>("auto")
  const [layoutType, setLayoutType] = useState<LayoutType>("left-big")
  const [slots, setSlots] = useState<SentimentSlots>(["bullish", "bearish", "neutral"])
  const [primarySplit, setPrimarySplit] = useState(56)
  const [secondarySplit, setSecondarySplit] = useState(50)

  // Load a previously persisted custom layout on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<StoredLayout>
      if (parsed.mode !== "custom") return
      setLayoutMode("custom")
      if (parsed.layoutType) setLayoutType(parsed.layoutType)
      if (Array.isArray(parsed.slots) && parsed.slots.length === 3) {
        setSlots(parsed.slots as SentimentSlots)
      }
      if (typeof parsed.primarySplit === "number") setPrimarySplit(parsed.primarySplit)
      if (typeof parsed.secondarySplit === "number") setSecondarySplit(parsed.secondarySplit)
    } catch {
      // Ignore malformed persisted state.
    }
  }, [])

  // Persist the custom layout, or clear it when reverting to automatic.
  useEffect(() => {
    try {
      if (layoutMode !== "custom") {
        localStorage.removeItem(LAYOUT_STORAGE_KEY)
        return
      }
      const payload: StoredLayout = { mode: "custom", layoutType, slots, primarySplit, secondarySplit }
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // Ignore storage failures.
    }
  }, [layoutMode, layoutType, slots, primarySplit, secondarySplit])

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

  const auto = autoLayout(dominant)
  const effectiveLayoutType: LayoutType = layoutMode === "custom" ? layoutType : auto.layoutType
  const effectiveSlots: SentimentSlots = layoutMode === "custom" ? slots : auto.slots

  const handleSelectLayout = (lt: LayoutType) => {
    setLayoutMode("custom")
    setLayoutType(lt)
    const d = defaultSplits(lt)
    setPrimarySplit(d.primary)
    setSecondarySplit(d.secondary)
  }

  const handleSetSlot = (index: number, key: SentimentKey) => {
    setLayoutMode("custom")
    setSlots((prev) => {
      const current = prev[index]
      const next = [...prev] as SentimentSlots
      const otherIndex = next.findIndex((k, i) => i !== index && k === key)
      next[index] = key
      if (otherIndex !== -1) next[otherIndex] = current
      return next
    })
  }

  const handleResetLayout = () => {
    setLayoutMode("auto")
    const d = defaultSplits(auto.layoutType)
    setPrimarySplit(d.primary)
    setSecondarySplit(d.secondary)
  }

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
            onSelectLayout={handleSelectLayout}
            onSetSlot={handleSetSlot}
            onReset={handleResetLayout}
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
        grouped={grouped}
        primarySplit={primarySplit}
        setPrimarySplit={setPrimarySplit}
        secondarySplit={secondarySplit}
        setSecondarySplit={setSecondarySplit}
      />
    </div>
  )
}

function ResizeHandle(props: {
  orientation: "vertical" | "horizontal"
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  if (props.orientation === "vertical") {
    return (
      <button
        type="button"
        aria-label="Resize columns"
        onPointerDown={props.onPointerDown}
        className="mx-1 w-1.5 shrink-0 rounded bg-border/80 hover:bg-border cursor-col-resize"
      />
    )
  }

  return (
    <button
      type="button"
      aria-label="Resize rows"
      onPointerDown={props.onPointerDown}
      className="my-1 h-1.5 shrink-0 rounded bg-border/80 hover:bg-border cursor-row-resize"
    />
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
    if (trimmed?.includes("@") && !recipients.includes(trimmed)) {
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
