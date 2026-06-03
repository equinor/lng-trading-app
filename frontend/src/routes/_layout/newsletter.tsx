// frontend/src/routes/_layout/newsletter.tsx
// biome-ignore assist/source/organizeImports: keep grouped for readability
import { Suspense, useEffect, useMemo, useState } from "react"
import { createFileRoute, Link as RouterLink } from "@tanstack/react-router"
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { Bookmark, Check, Clock, ExternalLink, Filter, Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  getNews,
  isImportantStory,
  patchFavourite,
  patchClassification,
  patchRead,
  patchSentiment,
  type DbNewsRow,
  type DbSentiment,
} from "@/services/news/news_api"

// ------------------------------------------------------
// Types
// ------------------------------------------------------
type FavFilter = "All" | "Favourites" | "NotFavourites"
type ReadFilter = "All" | "Read" | "Unread"

// ------------------------------------------------------
// Constants
// ------------------------------------------------------
const REGIONS = [
  "US",
  "China",
  "Northwest Europe",
  "Asia",
  "Africa",
  "South America",
  "Japan",
  "Korea",
  "Turkey",
  "Iran",
  "US-Iran",
  "Russia-Ukraine",
  "Northeast Asia",
] as const

// ------------------------------------------------------
// Helpers
// ------------------------------------------------------
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

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function parseISO(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(+d) ? null : d
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

function getNewsQueryOptions() {
  return {
    queryKey: ["newsletter", "news"],
    queryFn: () => getNews(200, false),
  }
}

function mergePatchedArticle(
  current: DbNewsRow[] | undefined,
  patch: Partial<DbNewsRow> & Pick<DbNewsRow, "id">,
) {
  if (!current) return current
  return current.map((article) =>
    article.id === patch.id ? { ...article, ...patch } : article,
  )
}

// ------------------------------------------------------
// Route
// ------------------------------------------------------
export const Route = createFileRoute("/_layout/newsletter")({
  component: NewsletterRoute,
  head: () => ({ meta: [{ title: "Newsletter - LNG Views" }] }),
})

function PendingNewsletter() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-10 w-80" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8 space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <div className="lg:col-span-4 space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </div>
  )
}

function NewsletterRoute() {
  return (
    <Suspense fallback={<PendingNewsletter />}>
      <Newsletter />
    </Suspense>
  )
}

// ------------------------------------------------------
// Main
// ------------------------------------------------------
function Newsletter() {
  const { data } = useSuspenseQuery(getNewsQueryOptions())
  const qc = useQueryClient()
  const [expandedArticleId, setExpandedArticleId] = useState<number | null>(null)

  // UI state
  const [query, setQuery] = useState("")
  const [sentiment, setSentiment] = useState<"All" | "Bullish" | "Bearish" | "Neutral">("All")

  // Filters
  const [favFilter, setFavFilter] = useState<FavFilter>("All")
  const [readFilter, setReadFilter] = useState<ReadFilter>("All")
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]) // [] = all
  const [regionFilter, setRegionFilter] = useState<string[]>([]) // [] = all
  const [dateFrom, setDateFrom] = useState("") // YYYY-MM-DD
  const [dateTo, setDateTo] = useState("") // YYYY-MM-DD

  // Derived data
  const categoryUniverse = useMemo(() => {
    const set = new Set<string>()
    for (const n of data ?? []) {
      for (const category of n.category ?? []) {
        const value = category.trim()
        if (value) set.add(value)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [data])

  const regionUniverse = useMemo(() => {
    const set = new Set<string>(REGIONS)
    for (const n of data ?? []) {
      for (const region of n.region ?? []) {
        const value = region.trim()
        if (value) set.add(value)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [data])

  const normalized = useMemo(() => {
    return (data ?? []).map((n) => ({
      ...n,
      readTimeMin: readTimeMinFromContent(n.body),
      category_norm: (n.category ?? []).map((x) => x.trim()).filter(Boolean),
      region_norm: (n.region ?? []).map((x) => x.trim()).filter(Boolean),
      important_story: isImportantStory(n.importantStory),
    }))
  }, [data])

  // Mutations
  const favouriteMutation = useMutation({
    mutationFn: (p: { id: number; favourited: boolean }) => patchFavourite(p.id, p.favourited),
    onSuccess: async (updatedArticle) => {
      qc.setQueryData<DbNewsRow[]>(["newsletter", "news"], (current) =>
        mergePatchedArticle(current, updatedArticle),
      )
    },
  })

  const sentimentMutation = useMutation({
    mutationFn: (p: { id: number; official_sentiment: DbSentiment }) =>
      patchSentiment(p.id, p.official_sentiment),
    onSuccess: async (updatedArticle) => {
      qc.setQueryData<DbNewsRow[]>(["newsletter", "news"], (current) =>
        mergePatchedArticle(current, updatedArticle),
      )
    },
  })

  const classificationMutation = useMutation({
    mutationFn: (p: { id: number; category: string[]; region: string[] }) =>
      patchClassification(p.id, p.category, p.region),
    onSuccess: async (updatedArticle) => {
      qc.setQueryData<DbNewsRow[]>(["newsletter", "news"], (current) =>
        mergePatchedArticle(current, updatedArticle),
      )
    },
  })

  const readMutation = useMutation({
    mutationFn: (p: { id: number; read: boolean }) => patchRead(p.id, p.read),
    onSuccess: async (updatedArticle) => {
      qc.setQueryData<DbNewsRow[]>(["newsletter", "news"], (current) =>
        mergePatchedArticle(current, updatedArticle),
      )
    },
  })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let rows = [...normalized]

    // Favourites tri-state
    if (favFilter === "Favourites") rows = rows.filter((x) => x.favourited)
    if (favFilter === "NotFavourites") rows = rows.filter((x) => !x.favourited)

    // Read tri-state
    if (readFilter === "Read") rows = rows.filter((x) => x.read)
    if (readFilter === "Unread") rows = rows.filter((x) => !x.read)

    // Category multi-select
    if (categoryFilter.length > 0) {
      rows = rows.filter((x) => categoryFilter.some((selected) => x.category_norm.includes(selected)))
    }

    // Region multi-select: includes "__none__" special
    if (regionFilter.length > 0) {
      rows = rows.filter((x) => {
        const hasNone = regionFilter.includes("__none__")
        const regionVals = regionFilter.filter((r) => r !== "__none__")
        const regionOk = regionVals.some((selected) => x.region_norm.includes(selected))
        const noneOk = x.region_norm.length === 0 && hasNone
        return regionOk || noneOk
      })
    }

    // Sentiment filter
    if (sentiment !== "All") rows = rows.filter((x) => x.official_sentiment === sentiment.toLowerCase())

    // Date range filter
    if (dateFrom || dateTo) {
      const from = dateFrom ? startOfDay(new Date(`${dateFrom}T00:00:00`)) : null
      const to = dateTo ? endOfDay(new Date(`${dateTo}T00:00:00`)) : null

      rows = rows.filter((x) => {
        const d = parseISO(x.rtpTimestamp)
        if (!d) return false
        if (from && d < from) return false
        if (to && d > to) return false
        return true
      })
    }

    // Search
    if (q) {
      rows = rows.filter((x) => {
        const hay = [
          x.headline,
          x.source ?? "",
          ...x.region_norm,
          ...x.category_norm,
        ]
          .join(" ")
          .toLowerCase()
        return hay.includes(q)
      })
    }

    rows.sort((a, b) => {
      if (a.important_story !== b.important_story) {
        return a.important_story ? -1 : 1
      }
      return +new Date(b.rtpTimestamp ?? 0) - +new Date(a.rtpTimestamp ?? 0)
    })
    return rows
  }, [normalized, query, favFilter, readFilter, categoryFilter, regionFilter, sentiment, dateFrom, dateTo])

  const feed = useMemo(() => filtered.slice(0, 40), [filtered])

  return (
    <div className="flex flex-col gap-6">
      {/* Title */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Newsletter</h1>
        <p className="text-muted-foreground">
          Live analyst feed (MVP) — favourites, official sentiment, category, region.
        </p>
      </div>

      {/* Bloomberg-ish filter toolbar */}
      <div className="rounded-lg border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex flex-col gap-3 p-3">
          {/* Row 1 */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[260px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search headline, source, category, region..."
                className="h-9 pl-9"
              />
            </div>

            <div className="hidden md:block h-6 w-px bg-border" />

            {/* Favourites */}
            <Select value={favFilter} onValueChange={(v) => setFavFilter(v as FavFilter)}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="Favourites" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All</SelectItem>
                <SelectItem value="Favourites">Favourites</SelectItem>
                <SelectItem value="NotFavourites">No favourites</SelectItem>
              </SelectContent>
            </Select>

            {/* Read status */}
            <Select value={readFilter} onValueChange={(v) => setReadFilter(v as ReadFilter)}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Read status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All</SelectItem>
                <SelectItem value="Read">Read</SelectItem>
                <SelectItem value="Unread">Unread</SelectItem>
              </SelectContent>
            </Select>

            {/* Category multi-select */}
            <div className="w-[220px]">
              <MultiSelectPopover
                label="Category"
                options={categoryUniverse}
                value={categoryFilter}
                onChange={setCategoryFilter}
                emptyLabel="All categories"
              />
            </div>

            {/* Region multi-select */}
            <div className="w-[220px]">
              <MultiSelectPopover
                label="Region"
                options={["__none__", ...regionUniverse]}
                value={regionFilter}
                onChange={setRegionFilter}
                emptyLabel="All regions"
                renderOption={(o) => (o === "__none__" ? "No region" : o)}
              />
            </div>

            <div className="hidden md:block h-6 w-px bg-border" />

            {/* Date range */}
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 w-[150px]"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 w-[150px]"
              />
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9"
              onClick={() => {
                setQuery("")
                setSentiment("All")
                setFavFilter("All")
                setReadFilter("All")
                setCategoryFilter([])
                setRegionFilter([])
                setDateFrom("")
                setDateTo("")
              }}
            >
              Reset
            </Button>
          </div>

          {/* Row 2: sentiment pills */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 text-xs text-muted-foreground mr-1">
              <Filter className="h-4 w-4" />
              Sentiment
            </div>

            {(["All", "Bullish", "Bearish", "Neutral"] as const).map((s) => (
              <Button
                key={s}
                type="button"
                variant={sentiment === s ? "default" : "secondary"}
                size="sm"
                className="h-8"
                onClick={() => setSentiment(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Main feed */}
        <div className="lg:col-span-8 space-y-4">
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Live Feed</CardTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  From backend (mock now, Databricks later)
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              {feed.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No matching stories.
                </div>
              ) : (
                <div className="divide-y">
                  {feed.map((n) => (
                    <article key={n.id} className="py-4">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2">
                        <div className="min-w-0 space-y-2">
                          {/* Meta row */}
                          <div className="flex flex-wrap items-center gap-2">
                            {n.important_story && <Badge variant="default">Important</Badge>}

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

                            {n.region_norm.map((region) => (
                              <Badge key={`region-${n.id}-${region}`} variant="secondary">
                                {region}
                              </Badge>
                            ))}
                            {n.category_norm.map((category) => (
                              <Badge key={`category-${n.id}-${category}`} variant="outline">
                                {category}
                              </Badge>
                            ))}

                            <span className="text-xs text-muted-foreground">
                              {n.source} • {formatTime(n.rtpTimestamp)} • {readTimeMinFromContent(n.body)} min
                            </span>
                          </div>

                          <button
                            type="button"
                            className="text-left"
                            onClick={() => setExpandedArticleId((current) => (current === n.id ? null : n.id))}
                          >
                            <h2 className="text-base font-semibold leading-snug hover:underline">{n.headline}</h2>
                          </button>

                          {n.summary && (
                            <p className="text-sm text-muted-foreground line-clamp-2">{n.summary}</p>
                          )}

                          {expandedArticleId === n.id && n.body && (
                            <div className="rounded-md border bg-muted/30 p-3">
                              <p className="text-sm text-foreground whitespace-pre-wrap">{n.body}</p>
                            </div>
                          )}

                        </div>

                        {/* Open */}
                        <div className="flex shrink-0 items-center gap-2 self-start">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedArticleId((current) => (current === n.id ? null : n.id))}
                          >
                            {expandedArticleId === n.id ? "Hide body" : "Show body"}
                          </Button>

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

                        {/* Analyst controls */}
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={n.favourited ? "default" : "secondary"}
                            onClick={() => {
                              if (favouriteMutation.isPending) return
                              favouriteMutation.mutate({
                                id: n.id,
                                favourited: !n.favourited,
                              })
                            }}
                          >
                            <Bookmark className="h-4 w-4 mr-2" />
                            {n.favourited ? "Favourited" : "Favourite"}
                          </Button>

                          {/* sentiment toggles (NOTE: clearing won't work until backend accepts null) */}
                          <div className="inline-flex items-center gap-1">
                            {(["bullish", "neutral", "bearish"] as const).map((s) => {
                              const active = n.official_sentiment === s
                              return (
                                <Button
                                  key={s}
                                  type="button"
                                  size="sm"
                                  variant={active ? "default" : "secondary"}
                                  onClick={() => {
                                    if (sentimentMutation.isPending) return
                                    sentimentMutation.mutate({
                                      id: n.id,
                                      official_sentiment: active ? null : s,
                                    })
                                  }}
                                >
                                  {formatSentimentLabel(s)}
                                  {active && <Check className="h-4 w-4 ml-2" />}
                                </Button>
                              )
                            })}
                          </div>

                          <CategoryPicker
                            allCategories={categoryUniverse}
                            current={n.category_norm}
                            onApply={(next) => {
                              if (classificationMutation.isPending) return
                              classificationMutation.mutate({
                                id: n.id,
                                category: next,
                                region: n.region_norm,
                              })
                            }}
                          />

                          <RegionPicker
                            options={regionUniverse}
                            value={n.region_norm}
                            onChange={(nextRegion) => {
                              if (classificationMutation.isPending) return
                              classificationMutation.mutate({
                                id: n.id,
                                category: n.category_norm,
                                region: nextRegion,
                              })
                            }}
                          />
                        </div>

                        <div className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground self-start justify-self-end">
                          <span className="whitespace-nowrap">{n.read ? "Read" : "Unread"}</span>
                          <Checkbox
                            checked={n.read}
                            disabled={readMutation.isPending}
                            onCheckedChange={(checked) => {
                              if (readMutation.isPending) return
                              readMutation.mutate({
                                id: n.id,
                                read: checked === true,
                              })
                            }}
                            aria-label="Toggle read status"
                          />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-col gap-2 text-sm">
                <RouterLink
                  to="/news_summary"
                  className="rounded-md border px-3 py-2 hover:bg-muted transition-colors"
                >
                  News Summary
                </RouterLink>

                <RouterLink
                  to="/newsletter"
                  className="rounded-md border px-3 py-2 hover:bg-muted transition-colors"
                >
                  Newsletter (this page)
                </RouterLink>

                <div className="text-xs text-muted-foreground pt-2">
                  When Databricks is ready, only backend changes; UI stays.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------
// Components
// ------------------------------------------------------
function CategoryPicker(props: {
  allCategories: string[]
  current: string[]
  onApply: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(props.current)

  useEffect(() => {
    if (!open) setDraft(props.current)
  }, [open, props.current])

  const toggle = (value: string) => {
    setDraft((prev) => {
      const has = prev.includes(value)
      return has ? prev.filter((x) => x !== value) : [...prev, value]
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
        Category ({props.current.length})
      </Button>

      {open && (
        <div className="rounded-md border bg-background p-2 shadow-sm max-w-[520px]">
          <div className="flex flex-wrap gap-2">
            {props.allCategories.map((category) => {
              const active = draft.includes(category)
              return (
                <Button
                  key={category}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "secondary"}
                  onClick={() => toggle(category)}
                >
                  {category}
                </Button>
              )
            })}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setDraft([])}>
              Clear
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                props.onApply(draft)
                setOpen(false)
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function RegionPicker(props: {
  options: string[]
  value: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(props.value)

  useEffect(() => {
    if (!open) setDraft(props.value)
  }, [open, props.value])

  const toggle = (value: string) => {
    setDraft((prev) => {
      const has = prev.includes(value)
      return has ? prev.filter((x) => x !== value) : [...prev, value]
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
        Region ({props.value.length})
      </Button>

      {open && (
        <div className="rounded-md border bg-background p-2 shadow-sm max-w-[520px]">
          <div className="flex flex-wrap gap-2">
            {props.options.map((region) => {
              const active = draft.includes(region)
              return (
                <Button
                  key={region}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "secondary"}
                  onClick={() => toggle(region)}
                >
                  {region}
                </Button>
              )
            })}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setDraft([])}>
              Clear
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                props.onChange(draft)
                setOpen(false)
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function MultiSelectPopover(props: {
  label: string
  options: readonly string[] | string[]
  value: string[]
  onChange: (next: string[]) => void
  emptyLabel?: string
  renderOption?: (opt: string) => string
}) {
  const { label, options, value, onChange, emptyLabel = "All", renderOption } = props

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(value)

  useEffect(() => {
    if (!open) setDraft(value)
  }, [open, value])

  const toggle = (opt: string) => {
    setDraft((prev) => {
      const has = prev.includes(opt)
      return has ? prev.filter((x) => x !== opt) : [...prev, opt]
    })
  }

  const title = value.length === 0 ? emptyLabel : `${value.length} selected`

  return (
    <div className="relative">
      <Button
        type="button"
        variant="secondary"
        className="h-9 w-full justify-between"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="truncate font-medium">{title}</span>
      </Button>

      {open && (
        <div className="absolute z-50 mt-2 w-full rounded-md border bg-background p-2 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {options.map((opt) => {
              const active = draft.includes(opt)
              const text = renderOption ? renderOption(opt) : opt
              return (
                <Button
                  key={opt}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "secondary"}
                  onClick={() => toggle(opt)}
                >
                  {text}
                </Button>
              )
            })}
          </div>

          <div className="flex items-center justify-between pt-3">
            <Button type="button" size="sm" variant="secondary" onClick={() => setDraft([])}>
              Clear
            </Button>

            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onChange(draft)
                  setOpen(false)
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
