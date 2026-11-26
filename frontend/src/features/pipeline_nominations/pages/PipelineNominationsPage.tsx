import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { RequestStatus } from "@/components/Common/RequestStatus"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getFilters, getOverview } from "@/features/pipeline_nominations/api"
import { AiOverview } from "@/features/pipeline_nominations/components/AiOverview"
import { CycleChart } from "@/features/pipeline_nominations/components/CycleChart"
import { FlowChart } from "@/features/pipeline_nominations/components/FlowChart"
import {
  type MatrixPeriod,
  NominationsMatrix,
} from "@/features/pipeline_nominations/components/NominationsMatrix"
import { PipelineFilter } from "@/features/pipeline_nominations/components/PipelineFilter"
import {
  buildColorMap,
  formatDay,
  fromDaily,
} from "@/features/pipeline_nominations/utils"
import { useEquinorFont } from "@/hooks/useEquinorFont"

const QUERY_ROOT = "pipeline_nominations"

type FlowWindow = "14" | "180"
const FIVE_MINUTES = 5 * 60_000
const ONE_HOUR = 60 * 60_000

const TITLE = "US Daily Pipeline Nominations (Monthly)"
const DESCRIPTION =
  "Pipeline nominations to LNG plants from the gold feedgas tracking table: WoodMac Genscape for most plants, and Platts for Costa Azul and LNG Canada, whose cycles are inferred from publish time. US plants are listed first, with LNG Canada and Costa Azul in a separate Non-US group with its own subtotal. The monthly and daily views use the latest cycle of each day."

const PERIOD_SUBTITLE: Record<MatrixPeriod, string> = {
  day: "Daily volumes for the last 14 days and change on the previous day. Newest on the left.",
  cycle:
    "Final nomination of each cycle (Timely, Evening, ID1 to ID3, then Post once the gas day is over) for the last 3 gas days. The % is the change on the previous published cycle, skipping cycles with no value and carrying on from the day before. Newest on the left. Refreshed every hour.",
  month:
    "Average daily volume of each month and change on the previous month. Newest on the left.",
}

export function PipelineNominationsPage() {
  useEquinorFont()

  // Empty selection means every facility and pipeline.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const selectedTokens = useMemo(() => [...selected].sort(), [selected])
  const [period, setPeriod] = useState<MatrixPeriod>("day")
  const [flowWindow, setFlowWindow] = useState<FlowWindow>("14")

  const filtersQuery = useQuery({
    queryKey: [QUERY_ROOT, "filters"],
    queryFn: getFilters,
    staleTime: 3 * FIVE_MINUTES,
  })

  const overviewQuery = useQuery({
    queryKey: [QUERY_ROOT, "overview", selectedTokens],
    queryFn: () => getOverview(selectedTokens),
    // Keep the old data while the filter changes.
    placeholderData: (previous) => previous,
    staleTime: FIVE_MINUTES,
    // Cycle data is refreshed hourly, so keep an open page up to date.
    refetchInterval: ONE_HOUR,
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
  const tables = overview && {
    month: overview.monthly_table,
    day: overview.daily_table,
    cycle: overview.cycle_table,
  }
  // Facilities without cycle data (Costa Azul, LNG Canada) stay in the cycle table, greyed out.
  const noCycleData = useMemo(() => {
    if (!overview) return []
    const withCycles = new Set(
      overview.cycle_table.facilities.map((f) => f.name),
    )
    return overview.daily_table.facilities.filter(
      (f) => !withCycles.has(f.name),
    )
  }, [overview])

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{TITLE}</h1>
          <p className="text-sm text-muted-foreground">
            {latestDate ? `Data to ${formatDay(latestDate, true)}. ` : ""}
            Volumes in BCF per day. {DESCRIPTION} Leave the filter empty to
            include every facility.
          </p>
          {overviewQuery.isFetching && (
            <RequestStatus>Updating...</RequestStatus>
          )}
        </div>
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

        {/* The table comes first as the main view, with the charts below it. */}
        <div className="flex min-w-0 flex-col gap-4">
          <AiOverview selected={selectedTokens} />
          {overview ? (
            <section
              className="rounded-lg border p-4"
              aria-label="Nominated volume by metering station"
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">
                    Nominated Volume BCF/d by Metering Station
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
                    <TabsTrigger value="day">Day on day</TabsTrigger>
                    <TabsTrigger value="cycle">By cycle</TabsTrigger>
                    <TabsTrigger value="month">Month on month</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <NominationsMatrix
                table={tables?.[period] ?? overview.monthly_table}
                period={period}
                latestDate={latestDate}
                unavailable={period === "cycle" ? noCycleData : undefined}
                unavailableReason="No cycle data for this facility"
              />
            </section>
          ) : (
            !overviewQuery.isError && <Skeleton className="h-96 w-full" />
          )}

          {overview ? (
            <div className="grid items-start gap-4 xl:grid-cols-2">
              <FlowChart
                title="Flow BCF/d"
                series={fromDaily(
                  flowWindow === "14" ? overview.daily_14 : overview.daily_180,
                )}
                colorOf={colorOf}
                showLegend
                actions={
                  <Tabs
                    value={flowWindow}
                    onValueChange={(value) =>
                      setFlowWindow(value as FlowWindow)
                    }
                  >
                    <TabsList aria-label="Flow chart window">
                      <TabsTrigger value="14">14 days</TabsTrigger>
                      <TabsTrigger value="180">180 days</TabsTrigger>
                    </TabsList>
                  </Tabs>
                }
              />
              <CycleChart series={overview.cycle_series} colorOf={colorOf} />
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
    </div>
  )
}
