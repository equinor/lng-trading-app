// frontend/src/routes/_layout/newsletter.tsx
import { Suspense, useMemo, useState } from "react"
import { createFileRoute, Link as RouterLink } from "@tanstack/react-router"
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import {
  Search,
  TrendingUp,
  Clock,
  Filter,
  ExternalLink,
  Bookmark,
  Check,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type DbSentiment = "Bullish" | "Bearish" | "Neutral" | null

type DbNewsRow = {
  article_key: string
  source: string
  external_id: string | null
  title: string
  url: string | null
  published_at: string | null // backend may return ISO string
  content: string | null

  favourited: boolean
  official_sentiment: DbSentiment
  tags: string[]
  region: string | null

  version: number
  updated_at: string | null
  updated_by: string | null
}

type NewsListResponse = {
  data: DbNewsRow[]
}

const API_V1 = "/api/v1"
const NEWS_BASE = `${API_V1}/news`

// Hardcoded tag universe for MVP (same idea as your Databricks allowed tags)
const ALLOWED_TAGS = [
  "supply",
  "demand",
  "shipping",
  "price",
  "macro",
  "geopolitics",
  "outage",
  "maintenance",
  "sanctions",
  "weather",
  "policy",
  "company",
  "project",
  "infrastructure_trade",
  "storage",
  "regas",
  "liquefaction",
] as const

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

export type NewsCategory =
  | "Top"
  | "Favourites"
  | "LNG"
  | "Macro"
  | "Geopolitics"
  | "Shipping"
  | "Company"

const TAG_TO_CATEGORY: Record<string, NewsCategory> = {
  top: "Top",
  favourites: "Favourites",
  lng: "LNG",
  macro: "Macro",
  geopolitics: "Geopolitics",
  shipping: "Shipping",
  company: "Company",
}

export function inferCategories(n: DbNewsRow): NewsCategory[] {
  const out = new Set<NewsCategory>()

  // special case: favourited => include Favourites category
  if (n.favourited) out.add("Favourites")

  for (const raw of n.tags ?? []) {
    const tag = raw.toLowerCase().trim()
    const cat = TAG_TO_CATEGORY[tag]
    if (cat) out.add(cat)
  }

  // default if nothing matched
  if (out.size === 0) out.add("LNG")

  return Array.from(out)
}

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

async function apiGetNews(limit = 200, favouritedOnly = false): Promise<DbNewsRow[]> {
  const url = new URL(NEWS_BASE, window.location.origin)
  url.searchParams.set("limit", String(limit))
  url.searchParams.set("favourited_only", favouritedOnly ? "true" : "false")
  console.log(url.toString())
  const res = await fetch(url.toString(), { method: "GET" })
  if (!res.ok) throw new Error(`GET /news failed (${res.status})`)
  const json = (await res.json()) as NewsListResponse
  return json.data ?? []
}

async function apiPatchFavourite(articleKey: string, favourited: boolean) {
  const res = await fetch(`${NEWS_BASE}/${encodeURIComponent(articleKey)}/favourite`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ favourited }),
  })
  if (!res.ok) throw new Error(`PATCH favourite failed (${res.status})`)
}

async function apiPatchSentiment(articleKey: string, official_sentiment: DbSentiment) {
  const res = await fetch(`${NEWS_BASE}/${encodeURIComponent(articleKey)}/sentiment`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ official_sentiment }),
  })
  if (!res.ok) throw new Error(`PATCH sentiment failed (${res.status})`)
}

async function apiPatchTags(articleKey: string, tags: string[], region: string | null) {
  const res = await fetch(`${NEWS_BASE}/${encodeURIComponent(articleKey)}/tags`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags, region }),
  })
  if (!res.ok) throw new Error(`PATCH tags failed (${res.status})`)
}

function getNewsQueryOptions() {
  return {
    queryKey: ["newsletter", "news"],
    queryFn: () => apiGetNews(200, false),
  }
}

export const Route = createFileRoute("/_layout/newsletter")({
  component: NewsletterRoute,
  head: () => ({
    meta: [{ title: "Newsletter - LNG Views" }],
  }),
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

function Newsletter() {
  const { data } = useSuspenseQuery(getNewsQueryOptions())
  const qc = useQueryClient()

  const [tab, setTab] = useState<NewsCategory>("Top")
  const [query, setQuery] = useState("")
  const [sentiment, setSentiment] = useState<"All" | "Bullish" | "Bearish" | "Neutral">("All")

  const categories: NewsCategory[] = useMemo(
    () => ["Top", "Favourites", "LNG", "Macro", "Geopolitics", "Shipping", "Company"],
    []
  )

  const favouriteMutation = useMutation({
    mutationFn: async (p: { article_key: string; favourited: boolean }) =>
      apiPatchFavourite(p.article_key, p.favourited),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["newsletter", "news"] })
    },
  })

  const sentimentMutation = useMutation({
    mutationFn: async (p: { article_key: string; official_sentiment: DbSentiment }) =>
      apiPatchSentiment(p.article_key, p.official_sentiment),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["newsletter", "news"] })
    },
  })

  const tagsMutation = useMutation({
    mutationFn: async (p: { article_key: string; tags: string[]; region: string | null }) =>
      apiPatchTags(p.article_key, p.tags, p.region),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["newsletter", "news"] })
    },
  })

  const normalized = useMemo(() => {
    return (data ?? []).map((n) => ({
      ...n,
      category: inferCategories(n),
      readTimeMin: readTimeMinFromContent(n.content),
    }))
  }, [data])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let rows = [...normalized]

    if (tab === "Favourites") rows = rows.filter((x) => x.favourited)
    else if (tab !== "Top") rows = rows.filter((x) => tab in x.category)

    if (sentiment !== "All") rows = rows.filter((x) => x.official_sentiment === sentiment)

    if (q) {
      rows = rows.filter((x) => {
        const hay = [
          x.title,
          x.source,
          x.region ?? "",
          ...(x.tags ?? []),
        ]
          .join(" ")
          .toLowerCase()
        return hay.includes(q)
      })
    }

    rows.sort((a, b) => +new Date(b.published_at ?? 0) - +new Date(a.published_at ?? 0))
    return rows
  }, [normalized, query, sentiment, tab])

  const topStories = useMemo(() => filtered.slice(0, 4), [filtered])
  const feed = useMemo(() => filtered.slice(0, 20), [filtered])

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Newsletter</h1>
          <p className="text-muted-foreground">
            Live analyst feed (MVP) — favourites, official sentiment, tags, region.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 md:w-[520px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search headlines, tags, region..."
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <div className="inline-flex items-center gap-2 text-muted-foreground">
              <Filter className="h-4 w-4" />
              Sentiment
            </div>

            {(["All", "Bullish", "Bearish", "Neutral"] as const).map((s) => (
              <Button
                key={s}
                type="button"
                variant={sentiment === s ? "default" : "secondary"}
                size="sm"
                onClick={() => setSentiment(s)}
              >
                {s === "All" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs + Layout */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as NewsCategory)}>
        <TabsList className="flex flex-wrap justify-start">
          {categories.map((c) => (
            <TabsTrigger key={c} value={c}>
              {c}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tab} className="mt-6">
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
                        <article key={n.article_key} className="py-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{n.category}</Badge>

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

                              <h2 className="text-base font-semibold leading-snug">
                                {n.title}
                              </h2>

                              {n.content && (
                                <p className="text-sm text-muted-foreground line-clamp-2">
                                  {n.content}
                                </p>
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

                              {/* Analyst controls */}
                              <div className="flex flex-wrap items-center gap-2 pt-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={n.favourited ? "default" : "secondary"}
                                  onClick={() => {
                                    if (favouriteMutation.isPending) return
                                    favouriteMutation.mutate({
                                      article_key: n.article_key,
                                      favourited: !n.favourited,
                                    })
                                  }}
                                >
                                  <Bookmark className="h-4 w-4 mr-2" />
                                  {n.favourited ? "Favourited" : "Favourite"}
                                </Button>

                                <div className="inline-flex items-center gap-1">
                                  {(["Bullish", "Neutral", "Bearish"] as const).map((s) => (
                                    <Button
                                      key={s}
                                      type="button"
                                      size="sm"
                                      variant={n.official_sentiment === s ? "default" : "secondary"}
                                      onClick={() => {
                                        if (sentimentMutation.isPending) return
                                        sentimentMutation.mutate({
                                          article_key: n.article_key,
                                          official_sentiment: s,
                                        })
                                      }}
                                    >
                                      {s}
                                      {n.official_sentiment === s && (
                                        <Check className="h-4 w-4 ml-2" />
                                      )}
                                    </Button>
                                  ))}

                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={n.official_sentiment === null ? "default" : "secondary"}
                                    onClick={() => {
                                      if (sentimentMutation.isPending) return
                                      sentimentMutation.mutate({
                                        article_key: n.article_key,
                                        official_sentiment: null,
                                      })
                                    }}
                                  >
                                    clear
                                  </Button>
                                </div>

                                <TagPicker
                                  current={n.tags ?? []}
                                  onApply={(next) => {
                                    if (tagsMutation.isPending) return
                                    tagsMutation.mutate({
                                      article_key: n.article_key,
                                      tags: next,
                                      region: n.region ?? null,
                                    })
                                  }}
                                />

                                <RegionPicker
                                  value={n.region ?? null}
                                  onChange={(nextRegion) => {
                                    if (tagsMutation.isPending) return
                                    tagsMutation.mutate({
                                      article_key: n.article_key,
                                      tags: n.tags ?? [],
                                      region: nextRegion,
                                    })
                                  }}
                                />
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
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-4 space-y-4">
              {/* <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Top Stories</CardTitle>
                    <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <TrendingUp className="h-4 w-4" />
                      Newest
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {topStories.map((n, idx) => (
                      <div key={n.article_key} className="space-y-2">
                        <div className="flex items-start gap-3">
                          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-xs font-semibold">
                            {idx + 1}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {n.category}
                              </Badge>
                              {n.official_sentiment && (
                                <span className="text-xs text-muted-foreground">
                                  {n.official_sentiment}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-sm font-medium leading-snug">
                              {n.title}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatTime(n.published_at)} • {n.readTimeMin} min
                            </div>
                          </div>
                        </div>
                        {idx !== topStories.length - 1 && <Separator />}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card> */}

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
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TagPicker(props: { current: string[]; onApply: (next: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(props.current)

  // keep draft in sync when list updates after refetch
  if (!open && draft.join("|") !== props.current.join("|")) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    // (We intentionally do this only when closed; avoids annoying overwrites.)
    setDraft(props.current)
  }

  const toggle = (t: string) => {
    setDraft((prev) => {
      const has = prev.includes(t)
      const next = has ? prev.filter((x) => x !== t) : [...prev, t]
      // enforce up to 3 tags
      return next.slice(0, 3)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
        Tags ({props.current.length}/3)
      </Button>
      {open && (
        <div className="rounded-md border bg-background p-2 shadow-sm max-w-[520px]">
          <div className="flex flex-wrap gap-2">
            {ALLOWED_TAGS.map((t) => {
              const active = draft.includes(t)
              return (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "secondary"}
                  onClick={() => toggle(t)}
                >
                  {t}
                </Button>
              )
            })}
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
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

function RegionPicker(props: { value: string | null; onChange: (next: string | null) => void }) {
  return (
    <div className="min-w-[220px]">
      <Select
        value={props.value ?? "__none__"}
        onValueChange={(v) => props.onChange(v === "__none__" ? null : v)}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Region" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">No region</SelectItem>
          {REGIONS.map((r) => (
            <SelectItem key={r} value={r}>
              {r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
