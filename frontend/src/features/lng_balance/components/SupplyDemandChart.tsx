import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { ChartLegend } from "@/components/Common/ChartLegend"
import { type EndLabel, EndLabels } from "@/components/Common/EndLabels"
import type { MonthPoint } from "@/features/lng_balance/api"
import { ForecastBadge } from "@/features/lng_balance/components/ForecastBadge"
import { ZoomControls } from "@/features/lng_balance/components/ZoomControls"
import { useChartZoom } from "@/features/lng_balance/hooks/useChartZoom"
import {
  axisTicks,
  DEMAND_COLOR,
  formatMonth,
  formatMonthTick,
  formatValue,
  monthTicks,
  SUPPLY_COLOR,
  TOOLTIP_STYLE,
  UNIT_LABEL,
  type Unit,
} from "@/features/lng_balance/utils"

type Props = {
  months: MonthPoint[]
  unit: Unit
  forecastFrom: string | null
  /** Forecast the chart is built from, and whether that is the latest one, for the badge. */
  shownForecast: string | null
  isLatest: boolean
}

const HEIGHT = 340

/** Monthly supply and demand, with the forecast period shaded. Drag across it to zoom. */
export function SupplyDemandChart({
  months,
  unit,
  forecastFrom,
  shownForecast,
  isLatest,
}: Props) {
  const title = `Supply and Demand (${UNIT_LABEL[unit]})`
  const zoom = useChartZoom(months.length)
  const data = months
    .map((m) => ({
      x: m.month,
      supply: m.supply[unit],
      demand: m.demand[unit],
    }))
    .slice(zoom.start, zoom.end + 1)
  const xs = data.map((d) => d.x)
  // The axis fits what is on screen, so zooming in shows the detail.
  const axis = axisTicks(data.flatMap((d) => [d.supply, d.demand]))
  const { ticks, every } = monthTicks(xs)
  const last = data[data.length - 1]
  const forecastStart = forecastFrom
    ? (data.find((d) => d.x >= forecastFrom)?.x ?? null)
    : null
  const endLabels: EndLabel[] = last
    ? [
        { key: "Supply", x: last.x, value: last.supply, color: SUPPLY_COLOR },
        { key: "Demand", x: last.x, value: last.demand, color: DEMAND_COLOR },
      ]
    : []

  return (
    <section className="rounded-lg border p-4" aria-label={title}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <ForecastBadge date={shownForecast} latest={isLatest} />
      </div>
      <p className="mb-2 min-h-12 text-xs text-muted-foreground">
        Monthly totals. The shaded area is the forecast; before it the figures
        are actuals. Drag across the chart to zoom in.
      </p>
      <ZoomControls zoom={zoom} className="mb-2" />
      {data.length === 0 ? (
        <p className="flex h-70 items-center justify-center text-sm text-muted-foreground">
          Select at least one year.
        </p>
      ) : (
        <>
          <div className="select-none text-muted-foreground">
            <ResponsiveContainer width="100%" height={HEIGHT}>
              <LineChart
                data={data}
                margin={{ top: 8, right: 52, bottom: 0, left: 0 }}
                {...zoom.handlers(xs)}
              >
                <CartesianGrid
                  stroke="currentColor"
                  strokeOpacity={0.15}
                  vertical={false}
                />
                {forecastStart && (
                  <ReferenceArea
                    x1={forecastStart}
                    x2={last.x}
                    fill="currentColor"
                    fillOpacity={0.07}
                    ifOverflow="hidden"
                  />
                )}
                <XAxis
                  dataKey="x"
                  ticks={ticks}
                  tickFormatter={(x: string) => formatMonthTick(x, every)}
                  tick={{ fill: "currentColor", fontSize: 11 }}
                />
                <YAxis
                  domain={[axis.min, axis.max]}
                  ticks={axis.ticks}
                  interval={0}
                  tick={{ fill: "currentColor", fontSize: 11 }}
                  tickFormatter={formatValue}
                  width={56}
                />
                <Tooltip
                  labelFormatter={(x) => formatMonth(String(x))}
                  formatter={(value, name) => [
                    formatValue(Number(value)),
                    name === "supply" ? "Supply" : "Demand",
                  ]}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Line
                  dataKey="demand"
                  type="monotone"
                  stroke={DEMAND_COLOR}
                  strokeWidth={2}
                  dot={zoom.zoomed && data.length <= 36 ? { r: 2.5 } : false}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="supply"
                  type="monotone"
                  stroke={SUPPLY_COLOR}
                  strokeWidth={2}
                  dot={zoom.zoomed && data.length <= 36 ? { r: 2.5 } : false}
                  isAnimationActive={false}
                />
                {zoom.selection && (
                  <ReferenceArea
                    x1={xs[zoom.selection[0]]}
                    x2={xs[zoom.selection[1]]}
                    fill="currentColor"
                    fillOpacity={0.2}
                  />
                )}
                <EndLabels labels={endLabels} format={formatValue} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ChartLegend
            items={[
              { name: "Demand", color: DEMAND_COLOR },
              { name: "Supply", color: SUPPLY_COLOR },
            ]}
          />
        </>
      )}
    </section>
  )
}
