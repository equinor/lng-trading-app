import type { ReactNode } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { ChartLegend } from "@/components/Common/ChartLegend"
import { type EndLabel, EndLabels } from "@/components/Common/EndLabels"
import {
  CHART_HEIGHT,
  type ChartSeries,
  formatDay,
  pivotSeries,
  yAxisScale,
} from "@/features/pipeline_nominations/utils"

type Props = {
  title: string
  series: ChartSeries[]
  colorOf: (name: string) => string
  showLegend?: boolean
  /** Shown beside the title, for example a window switch. */
  actions?: ReactNode
}

export function FlowChart({
  title,
  series,
  colorOf,
  showLegend = false,
  actions,
}: Props) {
  const data = pivotSeries(series)
  const latestDay = data.length ? String(data[data.length - 1].x) : null
  const axis = yAxisScale(series.flatMap((s) => s.points.map((p) => p.bcf)))
  // The newest point of each line, written at the tail end of the line.
  const endLabels: EndLabel[] = series.flatMap((s) => {
    const last = s.points.reduce<ChartSeries["points"][number] | null>(
      (best, p) => (!best || p.x > best.x ? p : best),
      null,
    )
    return last
      ? [{ key: s.name, x: last.x, value: last.bcf, color: colorOf(s.name) }]
      : []
  })

  return (
    <section className="rounded-lg border p-4" aria-label={title}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {actions}
      </div>
      {latestDay && (
        <p className="mb-2 text-xs text-muted-foreground">
          The figure at the end of each line is its latest value (to{" "}
          {formatDay(latestDay, true)}).
        </p>
      )}
      {data.length === 0 ? (
        <p className="flex h-70 items-center justify-center text-sm text-muted-foreground">
          No data for the selected filters.
        </p>
      ) : (
        <>
          <div className="text-muted-foreground">
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart
                data={data}
                margin={{ top: 8, right: 52, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  stroke="currentColor"
                  strokeOpacity={0.15}
                  vertical={false}
                />
                <XAxis
                  dataKey="x"
                  tickFormatter={(x: string) => formatDay(x)}
                  tick={{ fill: "currentColor", fontSize: 11 }}
                  minTickGap={28}
                />
                <YAxis
                  domain={[0, axis.max]}
                  ticks={axis.ticks}
                  interval={0}
                  tick={{ fill: "currentColor", fontSize: 11 }}
                  tickFormatter={axis.format}
                  label={{
                    value: "BCF/d",
                    angle: -90,
                    position: "insideLeft",
                    fill: "currentColor",
                    fontSize: 11,
                  }}
                  width={56}
                />
                <Tooltip
                  labelFormatter={(value) => formatDay(String(value), true)}
                  formatter={(value) =>
                    typeof value === "number" ? value.toFixed(2) : value
                  }
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--foreground)",
                    fontSize: 12,
                  }}
                />
                {series.map((s) => (
                  <Line
                    key={s.name}
                    type="monotone"
                    dataKey={s.name}
                    stroke={colorOf(s.name)}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
                <EndLabels labels={endLabels} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {showLegend && (
            <ChartLegend
              items={series.map((s) => ({
                name: s.name,
                color: colorOf(s.name),
              }))}
            />
          )}
        </>
      )}
    </section>
  )
}
