import type { ReactNode } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { ChartLegend } from "@/components/Common/ChartLegend"
import { type EndLabel, EndLabels } from "@/components/Common/EndLabels"
import type { ForecastLine, MonthPoint } from "@/features/lng_balance/api"
import { ForecastBadge } from "@/features/lng_balance/components/ForecastBadge"
import { ZoomControls } from "@/features/lng_balance/components/ZoomControls"
import { useChartZoom } from "@/features/lng_balance/hooks/useChartZoom"
import {
  axisTicks,
  DEMAND_COLOR,
  FORECAST_COLORS,
  formatDate,
  formatMonth,
  formatMonthTick,
  formatValue,
  monthTicks,
  NET_COLOR,
  parseMonth,
  SUPPLY_COLOR,
  TOOLTIP_STYLE,
  UNIT_LABEL,
  type Unit,
} from "@/features/lng_balance/utils"

type Props = {
  months: MonthPoint[]
  unit: Unit
  forecastFrom: string | null
  /** Older forecasts to draw next to the current one, in the order they were added. */
  forecasts: ForecastLine[]
  /** The year chips in use, so forecast lines cover the same period as the current line. */
  years: Set<number>
  /** The control for choosing earlier forecasts, shown above the chart. */
  picker: ReactNode
  /** True while forecasts were asked for but have not arrived. */
  loadingForecasts: boolean
  /** Forecast the blue line is built from, and whether that is the latest one. */
  shownForecast: string | null
  isLatest: boolean
}

const HEIGHT = 340
const CURRENT = "net"
const keyOf = (date: string) => `f_${date}`

/**
 * Monthly net short (supply minus demand), with the worst and best months marked. Forecasts made
 * on earlier dates can be added as extra lines, to see how the short has moved between forecasts.
 */
export function NetShortChart({
  months,
  unit,
  forecastFrom,
  forecasts,
  years,
  picker,
  loadingForecasts,
  shownForecast,
  isLatest,
}: Props) {
  const title = `Net short (${UNIT_LABEL[unit]})`
  const zoom = useChartZoom(months.length)
  const lines = forecasts.map((line, index) => ({
    ...line,
    key: keyOf(line.forecast_date),
    color: FORECAST_COLORS[index % FORECAST_COLORS.length],
    months: line.months.filter((p) =>
      years.has(parseMonth(p.month).getFullYear()),
    ),
  }))

  const data = months
    .map((m) => {
      const row: Record<string, number | string> = {
        x: m.month,
        [CURRENT]: m.supply[unit] - m.demand[unit],
      }
      for (const line of lines) {
        const point = line.months.find((p) => p.month === m.month)
        if (point) row[line.key] = point.net[unit]
      }
      return row
    })
    .slice(zoom.start, zoom.end + 1)
  const xs = data.map((d) => String(d.x))
  const values = data.map((d) => Number(d[CURRENT]))
  // The axis, the worst and best lines and the labels all follow what is on screen.
  const axis = axisTicks(
    data.flatMap((d) =>
      Object.entries(d)
        .filter(([k]) => k !== "x")
        .map(([, v]) => Number(v)),
    ),
  )
  const { ticks, every } = monthTicks(xs)
  const worst = Math.min(...values)
  const best = Math.max(...values)
  const worstIndex = values.indexOf(worst)
  const bestIndex = values.indexOf(best)
  const lastX = data.length ? String(data[data.length - 1].x) : ""
  // The last month gets the end label, so it is skipped when it is also the best or worst month.
  const labelled = (index: number) =>
    (index === worstIndex || index === bestIndex) && index !== data.length - 1
  const forecastStart = forecastFrom
    ? (data.find((d) => String(d.x) >= forecastFrom)?.x ?? null)
    : null

  // Each line gets its value at the month where it ends.
  const endLabels: EndLabel[] = []
  if (data.length) {
    endLabels.push({
      key: CURRENT,
      x: lastX,
      value: values[values.length - 1],
      color: NET_COLOR,
    })
    for (const line of lines) {
      const end = line.months[line.months.length - 1]
      if (end && xs.includes(end.month)) {
        endLabels.push({
          key: line.key,
          x: end.month,
          value: end.net[unit],
          color: line.color,
        })
      }
    }
  }

  const names: Record<string, string> = {
    [CURRENT]: isLatest
      ? `Latest forecast${shownForecast ? ` (${formatDate(shownForecast)})` : ""}`
      : `Forecast of ${shownForecast ? formatDate(shownForecast) : ""}`,
  }
  for (const line of lines) {
    names[line.key] = `Forecast of ${formatDate(line.forecast_date)}`
  }

  return (
    <section className="rounded-lg border p-4" aria-label={title}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <ForecastBadge date={shownForecast} latest={isLatest} />
      </div>
      <p className="mb-2 min-h-12 text-xs text-muted-foreground">
        Supply minus demand, so a negative figure is a shortfall. The blue line
        is the forecast shown for the whole page, and its dashed lines mark its
        worst and best months on screen. Drag across the chart to zoom in.
      </p>
      <ZoomControls zoom={zoom} className="mb-2" />
      {loadingForecasts && (
        <p className="mb-2 text-xs text-muted-foreground">
          Loading forecasts...
        </p>
      )}
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
                    x1={String(forecastStart)}
                    x2={lastX}
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
                <ReferenceLine
                  y={0}
                  stroke="currentColor"
                  strokeOpacity={0.4}
                />
                <ReferenceLine
                  y={worst}
                  stroke={SUPPLY_COLOR}
                  strokeDasharray="4 4"
                />
                <ReferenceLine
                  y={best}
                  stroke={DEMAND_COLOR}
                  strokeDasharray="4 4"
                />
                <Tooltip
                  labelFormatter={(x) => formatMonth(String(x))}
                  formatter={(value, name) => [
                    formatValue(Number(value)),
                    names[String(name)] ?? String(name),
                  ]}
                  contentStyle={TOOLTIP_STYLE}
                />
                {lines.map((line) => (
                  <Line
                    key={line.key}
                    dataKey={line.key}
                    type="monotone"
                    stroke={line.color}
                    strokeWidth={1.75}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
                <Line
                  dataKey={CURRENT}
                  type="monotone"
                  stroke={NET_COLOR}
                  strokeWidth={2.5}
                  dot={zoom.zoomed && data.length <= 36 ? { r: 2.5 } : false}
                  isAnimationActive={false}
                  label={({ x, y, value, index }) =>
                    labelled(Number(index)) ? (
                      <text
                        key={index}
                        x={x}
                        y={Number(y) + (index === worstIndex ? -8 : 16)}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight={600}
                        fill="var(--foreground)"
                        stroke="var(--background)"
                        strokeWidth={3}
                        paintOrder="stroke"
                      >
                        {formatValue(Number(value))}
                      </text>
                    ) : (
                      <g key={index} />
                    )
                  }
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
              { name: names[CURRENT], color: NET_COLOR },
              ...lines.map((l) => ({ name: names[l.key], color: l.color })),
            ]}
          />
        </>
      )}
      <div className="mt-3">{picker}</div>
    </section>
  )
}
