import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { DailySeries } from "@/services/pipeline_nominations/pipeline_nominations_api"
import {
  formatDay,
  pivotSeries,
} from "@/services/pipeline_nominations/pipeline_nominations_utils"

type Props = {
  title: string
  series: DailySeries[]
  colorOf: (name: string) => string
  showLegend?: boolean
}

export function FlowChart({
  title,
  series,
  colorOf,
  showLegend = false,
}: Props) {
  const data = pivotSeries(series)

  return (
    <section className="rounded-lg border p-4" aria-label={title}>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {data.length === 0 ? (
        <p className="flex h-70 items-center justify-center text-sm text-muted-foreground">
          No data for the selected filters.
        </p>
      ) : (
        <div className="text-muted-foreground">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                stroke="currentColor"
                strokeOpacity={0.15}
                vertical={false}
              />
              <XAxis
                dataKey="flow_date"
                tickFormatter={(value: string) => formatDay(value)}
                tick={{ fill: "currentColor", fontSize: 11 }}
                minTickGap={28}
              />
              <YAxis
                tick={{ fill: "currentColor", fontSize: 11 }}
                tickFormatter={(value: number) => value.toFixed(1)}
                label={{
                  value: "Sum of Vol_BCF",
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
              {showLegend && (
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  wrapperStyle={{ fontSize: 11 }}
                />
              )}
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
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
