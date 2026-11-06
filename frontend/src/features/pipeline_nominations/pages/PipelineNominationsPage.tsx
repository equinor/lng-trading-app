import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { RequestStatus } from "@/components/Common/RequestStatus"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FlowChart } from "@/features/pipeline_nominations/components/FlowChart"
import {
  type MatrixPeriod,
  NominationsMatrix,
} from "@/features/pipeline_nominations/components/NominationsMatrix"
import { PipelineFilter } from "@/features/pipeline_nominations/components/PipelineFilter"
import { useEquinorFont } from "@/hooks/useEquinorFont"
import {
  getFilters,
  getOverview,
  type Source,
} from "@/features/pipeline_nominations/api"
import {
  buildColorMap,
  formatCycleX,
  formatDay,
  fromCycles,
  fromDaily,
} from "@/features/pipeline_nominations/utils"

const QUERY_ROOT = "pipeline_nominations"
const FIVE_MINUTES = 5 * 60_000
const ONE_HOUR = 60 * 60_000

const PERIOD_SUBTITLE: Record<MatrixPeriod, string> = {
  month: "Monthly totals and change on the previous month.",
  day: "Daily volumes for the last 14 days and change on the previous day.",
  cycle:
    "Final nomination of each cycle (Timely, Evening, ID1 to ID3) for the last 3 gas days. The % is the change on the previous cycle of the same day. Refreshed every hour.",
}

const SOURCES: Record<
  Source,
  { label: string; title: string; description: string }
> = {
  woodmac: {
    label: "WoodMac Genscape",
    title: "WoodMac Genscape US Daily Pipeline Nominations (Monthly)",
    description:
      "WoodMac Genscape nominations to LNG plants. The monthly and daily views use the latest cycle of each day.",
  },
  platts: {
    label: "Platts",
    title: "Platts US Daily Pipeline Nominations (Monthly)",
    description: "Platts pipeline nominations to LNG plants.",
  },
}

export function PipelineNominationsPage() {
  useEquinorFont()

  const [source, setSource] = useState<Source>("woodmac")
  // Empty selection means every facility and pipeline.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const selectedTokens = useMemo(() => [...selected].sort(), [selected])
  const [period, setPeriod] = useState<MatrixPeriod>("month")

  // Pipeline names differ between providers, so a selection only makes sense for one source.
  const changeSource = (next: Source) => {
    setSource(next)
    setSelected(new Set())
    // The cycle view only exists for WoodMac.
    if (next === "platts") setPeriod((p) => (p === "cycle" ? "day" : p))
  }

  const filtersQuery = useQuery({
    queryKey: [QUERY_ROOT, "filters", source],
    queryFn: () => getFilters(source),
    staleTime: 3 * FIVE_MINUTES,
  })

  const overviewQuery = useQuery({
    queryKey: [QUERY_ROOT, "overview", source, selectedTokens],
    queryFn: () => getOverview(source, selectedTokens),
    // Keep the old data while filters change, but not when the source changes.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === source ? previous : undefined,
    staleTime: FIVE_MINUTES,
    // WoodMac cycle data is refreshed hourly, so keep an open page up to date.
    refetchInterval: source === "woodmac" ? ONE_HOUR : false,
  })

  const facilities = useMemo(
    () => filtersQuery.data?.facilities ?? [],
    [filtersQuery.data],
  )
  const colors = useMemo(
    () => buildColorMap(facilities.map((f) => f.name)),
    [facilities],
  )
  const colorOf = (name: string) => colors.get(name) ?? "#888888"

  const overview = overviewQuery.data
  const latestDate =
    overview?.latest_date ?? filtersQuery.data?.latest_date ?? null
  const hasCycles = source === "woodmac"
  const tables = overview && {
    month: overview.monthly_table,
    day: overview.daily_table,
    cycle: overview.cycle_table,
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{SOURCES[source].title}</h1>
          <p className="text-sm text-muted-foreground">
            {latestDate ? `Data to ${formatDay(latestDate, true)}. ` : ""}
            Volumes in BCF. {SOURCES[source].description} Leave the filter empty to
            include every facility.
          </p>
          {overviewQuery.isFetching && (
            <RequestStatus>Updating...</RequestStatus>
          )}
        </div>
        <Tabs
          value={source}
          onValueChange={(value) => changeSource(value as Source)}
        >
          <TabsList aria-label="Data source">
            {(Object.keys(SOURCES) as Source[]).map((key) => (
              <TabsTrigger key={key} value={key}>
                {SOURCES[key].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      {(overviewQuery.isError || filtersQuery.isError) && (
        <Alert variant="destructive">
          <AlertTitle>Could not load pipeline nominations</AlertTitle>
          <AlertDescription>
            Check the backend and Databricks connection, then reload the page.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="h-fit rounded-lg border p-4">
          {filtersQuery.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : (
            <PipelineFilter
              facilities={facilities}
              selected={selected}
              onChange={setSelected}
              colorOf={colorOf}
            />
          )}
        </aside>

        <div className="min-w-0">
          {overview ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <FlowChart
                title="Flow BCF (14 Days)"
                series={fromDaily(overview.daily_14)}
                colorOf={colorOf}
              />
              <FlowChart
                title="Flow BCF (180 Days)"
                series={fromDaily(overview.daily_180)}
                colorOf={colorOf}
                showLegend
              />
              {hasCycles && (
                <div className="xl:col-span-2">
                  <FlowChart
                    title="Final nomination by cycle (last 7 gas days)"
                    series={fromCycles(overview.cycle_series)}
                    colorOf={colorOf}
                    step
                    formatTick={formatCycleX}
                    formatLabel={formatCycleX}
                  />
                </div>
              )}
            </div>
          ) : (
            !overviewQuery.isError && (
              <div className="grid gap-4 xl:grid-cols-2">
                <Skeleton className="h-80 w-full" />
                <Skeleton className="h-80 w-full" />
              </div>
            )
          )}
        </div>
      </div>

      {/* Outside the filter grid so the matrix spans the full page width. */}
      {overview ? (
        <section
          className="rounded-lg border p-4"
          aria-label="Nominated volume by metering station"
        >
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">
                Nominated Volume BCF by Metering Station
              </h2>
              <p className="text-xs text-muted-foreground">
                {PERIOD_SUBTITLE[period]}
              </p>
            </div>
            <Tabs
              value={period}
              onValueChange={(value) => setPeriod(value as MatrixPeriod)}
            >
              <TabsList aria-label="Table period">
                <TabsTrigger value="month">Month on month</TabsTrigger>
                <TabsTrigger value="day">Day on day</TabsTrigger>
                {hasCycles && (
                  <TabsTrigger value="cycle">By cycle</TabsTrigger>
                )}
              </TabsList>
            </Tabs>
          </div>
          <NominationsMatrix
            table={tables?.[period] ?? overview.monthly_table}
            period={period}
            latestDate={latestDate}
          />
        </section>
      ) : (
        !overviewQuery.isError && <Skeleton className="h-96 w-full" />
      )}
    </div>
  )
}
