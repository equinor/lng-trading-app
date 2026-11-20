import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"

import { RequestStatus } from "@/components/Common/RequestStatus"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getFilters,
  getForecastDates,
  getForecastLines,
  getOverview,
} from "@/features/lng_balance/api"
import { BalanceFilter } from "@/features/lng_balance/components/BalanceFilter"
import { ForecastBadge } from "@/features/lng_balance/components/ForecastBadge"
import { ForecastPicker } from "@/features/lng_balance/components/ForecastPicker"
import { ForecastSelector } from "@/features/lng_balance/components/ForecastSelector"
import { NetShortChart } from "@/features/lng_balance/components/NetShortChart"
import { NetShortTable } from "@/features/lng_balance/components/NetShortTable"
import { SupplyDemandChart } from "@/features/lng_balance/components/SupplyDemandChart"
import {
  formatMonth,
  parseMonth,
  UNIT_LABEL,
  type Unit,
} from "@/features/lng_balance/utils"
import { useEquinorFont } from "@/hooks/useEquinorFont"
import { cn } from "@/lib/utils"

const QUERY_ROOT = "lng_balance"
const FIVE_MINUTES = 5 * 60_000
// The years shown until the user picks their own.
const DEFAULT_FIRST_YEAR = 2020
const DEFAULT_LAST_YEAR = 2030

export function LngBalancePage() {
  useEquinorFont()

  // Empty selections mean every country.
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [destination, setDestination] = useState<Set<string>>(new Set())
  const loadingTokens = useMemo(() => [...loading].sort(), [loading])
  const destinationTokens = useMemo(
    () => [...destination].sort(),
    [destination],
  )
  const [unit, setUnit] = useState<Unit>("cargoes")
  // Null until the user picks years, so the default follows the years in the data.
  const [pickedYears, setPickedYears] = useState<Set<number> | null>(null)
  // The one forecast the table and charts show; null means the latest.
  const [forecastDate, setForecastDate] = useState<string | null>(null)
  // Dates of other forecasts drawn as extra lines on the net short chart, in the order added.
  const [forecastDates, setForecastDates] = useState<string[]>([])

  const filtersQuery = useQuery({
    queryKey: [QUERY_ROOT, "filters"],
    queryFn: getFilters,
    staleTime: 3 * FIVE_MINUTES,
  })
  const datesQuery = useQuery({
    queryKey: [QUERY_ROOT, "forecast_dates"],
    queryFn: getForecastDates,
    staleTime: 12 * FIVE_MINUTES,
  })
  const forecastsQuery = useQuery({
    queryKey: [
      QUERY_ROOT,
      "forecast_lines",
      forecastDates,
      loadingTokens,
      destinationTokens,
    ],
    queryFn: () =>
      getForecastLines(forecastDates, loadingTokens, destinationTokens),
    enabled: forecastDates.length > 0,
    placeholderData: (previous) => previous,
    staleTime: FIVE_MINUTES,
  })
  const overviewQuery = useQuery({
    queryKey: [
      QUERY_ROOT,
      "overview",
      loadingTokens,
      destinationTokens,
      forecastDate,
    ],
    queryFn: () => getOverview(loadingTokens, destinationTokens, forecastDate),
    // Keep the old data on screen while a filter change loads.
    placeholderData: (previous) => previous,
    staleTime: FIVE_MINUTES,
  })

  const overview = overviewQuery.data
  const allYears = overview?.years ?? []
  const years = useMemo(() => {
    if (pickedYears) return pickedYears
    const defaults = allYears.filter(
      (y) => y >= DEFAULT_FIRST_YEAR && y <= DEFAULT_LAST_YEAR,
    )
    return new Set(defaults.length ? defaults : allYears)
  }, [pickedYears, allYears])

  const toggleYear = (year: number) => {
    const next = new Set(years)
    if (!next.delete(year)) next.add(year)
    setPickedYears(next)
  }

  const tableRows = useMemo(
    () => overview?.table.filter((r) => years.has(r.year)) ?? [],
    [overview, years],
  )
  // Only dates still selected, in the order they were added, so each keeps its colour.
  const forecastLines = useMemo(() => {
    const byDate = new Map(
      (forecastsQuery.data?.lines ?? []).map((l) => [l.forecast_date, l]),
    )
    return forecastDates.flatMap((d) => byDate.get(d) ?? [])
  }, [forecastsQuery.data, forecastDates])
  const months = useMemo(
    () =>
      overview?.months.filter((m) =>
        years.has(parseMonth(m.month).getFullYear()),
      ) ?? [],
    [overview, years],
  )

  const availableForecasts = datesQuery.data?.dates ?? []
  const isLatest = forecastDate === null
  // The forecast the page shows, for the badges and the chart legend.
  const shownForecast = forecastDate ?? availableForecasts[0] ?? null

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">LNG Balance Model</h1>
            <ForecastBadge
              date={shownForecast}
              latest={isLatest}
              className="text-xs"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Net short is supply minus demand, so a negative figure is a
            shortfall. Loading source filters supply and destination filters
            demand. Leave a filter empty to include every country.
            {overview?.forecast_from
              ? ` Forecast from ${formatMonth(overview.forecast_from)}; earlier months are actuals.`
              : ""}
          </p>
          {overviewQuery.isFetching && (
            <RequestStatus>Updating...</RequestStatus>
          )}
        </div>
        <Tabs value={unit} onValueChange={(value) => setUnit(value as Unit)}>
          <TabsList aria-label="Unit">
            <TabsTrigger value="cargoes">Cargoes</TabsTrigger>
            <TabsTrigger value="kt">kt</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      {(overviewQuery.isError || filtersQuery.isError) && (
        <Alert variant="destructive">
          <AlertTitle>Could not load the LNG balance</AlertTitle>
          <AlertDescription>
            Check the backend and Databricks connection, then reload the page.
          </AlertDescription>
        </Alert>
      )}

      <ForecastSelector
        available={availableForecasts}
        selected={forecastDate}
        onChange={setForecastDate}
      />

      <fieldset className="flex flex-wrap items-center gap-1.5">
        <legend className="sr-only">Years</legend>
        <span className="mr-1 text-xs text-muted-foreground">Year</span>
        {allYears.map((year) => (
          <button
            key={year}
            type="button"
            aria-pressed={years.has(year)}
            onClick={() => toggleYear(year)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs tabular-nums transition-colors",
              years.has(year)
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-muted",
            )}
          >
            {year}
          </button>
        ))}
        {allYears.length > 0 && (
          <button
            type="button"
            onClick={() => setPickedYears(new Set(allYears))}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            All
          </button>
        )}
      </fieldset>

      {/* Filters stacked on the left; on the right the two charts side by side with the table under both. */}
      <div className="grid items-start gap-4 xl:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-1">
          <aside className="h-fit rounded-lg border p-4">
            {filtersQuery.isPending ? (
              <FilterSkeleton />
            ) : (
              <BalanceFilter
                title="Loading Source"
                titleClassName="text-red-600"
                nodes={filtersQuery.data?.loading ?? []}
                selected={loading}
                onChange={setLoading}
              />
            )}
          </aside>
          <aside className="h-fit rounded-lg border p-4">
            {filtersQuery.isPending ? (
              <FilterSkeleton />
            ) : (
              <BalanceFilter
                title="Destination"
                titleClassName="text-green-600"
                nodes={filtersQuery.data?.destination ?? []}
                selected={destination}
                onChange={setDestination}
              />
            )}
          </aside>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            {overview ? (
              <>
                <SupplyDemandChart
                  months={months}
                  unit={unit}
                  forecastFrom={overview.forecast_from}
                  shownForecast={shownForecast}
                  isLatest={isLatest}
                />
                <NetShortChart
                  months={months}
                  unit={unit}
                  forecastFrom={overview.forecast_from}
                  shownForecast={shownForecast}
                  isLatest={isLatest}
                  forecasts={forecastLines}
                  years={years}
                  loadingForecasts={forecastsQuery.isFetching}
                  picker={
                    <ForecastPicker
                      available={availableForecasts}
                      selected={forecastDates}
                      onChange={setForecastDates}
                    />
                  }
                />
              </>
            ) : (
              !overviewQuery.isError && (
                <>
                  <Skeleton className="h-80 w-full" />
                  <Skeleton className="h-80 w-full" />
                </>
              )
            )}
          </div>

          <section
            className="min-w-0 rounded-lg border p-4"
            aria-label={`Net short (${UNIT_LABEL[unit]}) by period`}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">
                Net short table ({UNIT_LABEL[unit]})
              </h2>
              <ForecastBadge date={shownForecast} latest={isLatest} />
            </div>
            {overview ? (
              <NetShortTable rows={tableRows} months={months} unit={unit} />
            ) : (
              !overviewQuery.isError && <Skeleton className="h-96 w-full" />
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function FilterSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
    </div>
  )
}
