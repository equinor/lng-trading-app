import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { RequestStatus } from "@/components/Common/RequestStatus"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { FlowChart } from "@/features/pipeline_nominations/components/FlowChart"
import { MonthlyMatrix } from "@/features/pipeline_nominations/components/MonthlyMatrix"
import { PipelineFilter } from "@/features/pipeline_nominations/components/PipelineFilter"
import { useEquinorFont } from "@/hooks/useEquinorFont"
import { getFilters, getOverview } from "@/features/pipeline_nominations/api"
import { buildColorMap, formatDay } from "@/features/pipeline_nominations/utils"

const QUERY_ROOT = "pipeline_nominations"
const FIVE_MINUTES = 5 * 60_000

export function PipelineNominationsPage() {
  useEquinorFont()

  // Empty selection means every facility and pipeline.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const selectedTokens = useMemo(() => [...selected].sort(), [selected])

  const filtersQuery = useQuery({
    queryKey: [QUERY_ROOT, "filters"],
    queryFn: getFilters,
    staleTime: 3 * FIVE_MINUTES,
  })

  const overviewQuery = useQuery({
    queryKey: [QUERY_ROOT, "overview", selectedTokens],
    queryFn: () => getOverview(selectedTokens),
    placeholderData: keepPreviousData,
    staleTime: FIVE_MINUTES,
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

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          Platts US Daily Pipeline Nominations (Monthly)
        </h1>
        <p className="text-sm text-muted-foreground">
          {latestDate ? `Data to ${formatDay(latestDate, true)}. ` : ""}
          Volumes in BCF. Leave the filter empty to include every facility.
        </p>
        {overviewQuery.isFetching && <RequestStatus>Updating...</RequestStatus>}
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

        <div className="flex min-w-0 flex-col gap-4">
          {overview ? (
            <>
              <div className="grid gap-4 xl:grid-cols-2">
                <FlowChart
                  title="Flow BCF (14 Days)"
                  series={overview.daily_14}
                  colorOf={colorOf}
                />
                <FlowChart
                  title="Flow BCF (180 Days)"
                  series={overview.daily_180}
                  colorOf={colorOf}
                  showLegend
                />
              </div>
              <section
                className="rounded-lg border p-4"
                aria-label="Nominated volume by metering station"
              >
                <h2 className="mb-2 text-sm font-semibold">
                  Nominated Volume BCF by Metering Station
                </h2>
                <MonthlyMatrix
                  table={overview.monthly}
                  latestDate={latestDate}
                />
              </section>
            </>
          ) : (
            !overviewQuery.isError && (
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 xl:grid-cols-2">
                  <Skeleton className="h-80 w-full" />
                  <Skeleton className="h-80 w-full" />
                </div>
                <Skeleton className="h-96 w-full" />
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
