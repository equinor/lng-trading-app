import { Skeleton } from "@/components/ui/skeleton"
import {
  CompareChart,
  type PlottedCurve,
} from "@/features/mid_term_curves/components/CompareChart"
import { CompareChartToolbar } from "@/features/mid_term_curves/components/CompareChartToolbar"
import { CompareCurveSelector } from "@/features/mid_term_curves/components/CompareCurveSelector"
import { CURVE_SECTIONS } from "@/features/mid_term_curves/curves"
import { useCompareSettings } from "@/features/mid_term_curves/hooks/useCompareSettings"
import { useCurveDateRange } from "@/features/mid_term_curves/hooks/useCurveDateRange"
import { useRegisterExport } from "@/features/mid_term_curves/hooks/useCurveExport"
import {
  useCurvePrices,
  useSavedCurves,
} from "@/features/mid_term_curves/hooks/useMidTermCurves"
import {
  averageCurveValue,
  groupSavedCurves,
  isRangeInvalid,
  rowsInRange,
} from "@/features/mid_term_curves/utils"

const MESSAGE_CLASS = "flex min-h-0 flex-1 items-center justify-center text-sm"

export function CompareCurvesTab() {
  const pricesQuery = useCurvePrices()
  const savedQuery = useSavedCurves()
  const settings = useCompareSettings()
  const { selectedIds, selectedCustomIds, options, colorOf } = settings
  const { fromDate, toDate } = useCurveDateRange()

  const invalidRange = isRangeInvalid(fromDate, toDate)
  const rows = rowsInRange(pricesQuery.data ?? [], fromDate, toDate)
  const savedCurves = groupSavedCurves(savedQuery.data ?? [])

  const standardCurves: PlottedCurve[] = CURVE_SECTIONS.flatMap(
    (section) => section.curves,
  )
    .filter((curve) => selectedIds.has(curve.id))
    .map((curve) => ({
      id: curve.id,
      label: curve.label,
      color: colorOf(curve.id, curve.color),
      value: curve.value,
    }))
  const customCurves: PlottedCurve[] = savedCurves
    .filter((curve) => selectedCustomIds.has(curve.id))
    .map((curve) => {
      const monthByDate = new Map(
        curve.months.map((month) => [month.month, month]),
      )
      return {
        id: `custom_${curve.id}`,
        label: curve.name,
        color: colorOf(curve.id),
        value: (row) => {
          const month = monthByDate.get(row.start_date)
          return month
            ? averageCurveValue(row, [month.curve_1_id, month.curve_2_id])
            : null
        },
      }
    })
  const plottedCurves = [...standardCurves, ...customCurves].filter((curve) =>
    rows.some((row) => curve.value(row) !== null),
  )

  useRegisterExport(() => ({
    fileName: `compare_curves_${fromDate}_${toDate}`,
    sheetName: "Compare curves",
    headers: ["Start date", ...plottedCurves.map((curve) => curve.label)],
    rows: rows.map((row) => [
      row.start_date,
      ...plottedCurves.map((curve) => curve.value(row) ?? null),
    ]),
  }))

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <CompareCurveSelector
        settings={settings}
        savedCurves={savedCurves}
        savedCurvesLoading={savedQuery.isPending}
      />

      <section
        className="flex min-h-0 min-w-0 flex-col"
        aria-label="Curve comparison chart"
      >
        <CompareChartToolbar
          options={options}
          onChange={settings.setOption}
          onReset={settings.resetGraph}
        />

        {pricesQuery.isPending || savedQuery.isPending ? (
          <Skeleton className="min-h-0 flex-1" />
        ) : pricesQuery.isError || savedQuery.isError ? (
          <p className={`${MESSAGE_CLASS} text-destructive`}>
            Could not load curve prices.
          </p>
        ) : invalidRange ? (
          <p className={`${MESSAGE_CLASS} text-muted-foreground`}>
            Choose a From date before the To date.
          </p>
        ) : plottedCurves.length === 0 ? (
          <p className={`${MESSAGE_CLASS} text-muted-foreground`}>
            Select one or more curves with available data to plot them.
          </p>
        ) : (
          <CompareChart
            rows={rows}
            curves={plottedCurves}
            options={options}
            fromDate={fromDate}
            toDate={toDate}
          />
        )}
      </section>
    </div>
  )
}
