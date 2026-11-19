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

import type { CurvePrices } from "@/features/mid_term_curves/api"
import type { CompareChartOptions } from "@/features/mid_term_curves/compareDefaults"
import { computeYAxis, formatMonth } from "@/features/mid_term_curves/utils"

export type PlottedCurve = {
  id: string
  label: string
  color: string
  value: (row: CurvePrices) => number | null
}

type Props = {
  rows: CurvePrices[]
  curves: PlottedCurve[]
  options: CompareChartOptions
  fromDate: string
  toDate: string
}

const TODAY_COLOR = "#e4002b"

function localTodayTimestamp() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return Date.parse(`${now.getFullYear()}-${month}-${day}T00:00:00Z`)
}

export function CompareChart({
  rows,
  curves,
  options,
  fromDate,
  toDate,
}: Props) {
  const { showTodayLine, showYearStartLines, shadeMode, yMin, yMax, yStep } =
    options

  const rangeStart = Date.parse(`${fromDate}T00:00:00Z`)
  const rangeEnd = Date.parse(`${toDate}T00:00:00Z`)
  const today = localTodayTimestamp()
  const todayInRange = today >= rangeStart && today <= rangeEnd
  const historyShadeEnd = Math.min(today, rangeEnd)
  const forwardShadeStart = Math.max(today, rangeStart)

  const firstYear = rows[0] ? Number(rows[0].start_date.slice(0, 4)) : 0
  const lastYear = rows.length
    ? Number(rows[rows.length - 1].start_date.slice(0, 4))
    : -1
  const yearStarts = Array.from(
    { length: Math.max(0, lastYear - firstYear + 1) },
    (_, index) => Date.UTC(firstYear + index, 0, 1),
  ).filter((timestamp) => timestamp >= rangeStart && timestamp <= rangeEnd)

  const data = rows.map((row) => {
    const point: Record<string, number | null> = {
      date: Date.parse(`${row.start_date}T00:00:00Z`),
    }
    for (const curve of curves) point[curve.id] = curve.value(row)
    return point
  })
  const plottedValues = data.flatMap((point) =>
    curves
      .map((curve) => point[curve.id])
      .filter((value): value is number => typeof value === "number"),
  )
  const yAxis = computeYAxis(plottedValues, yMin, yMax, yStep)

  return (
    <div className="min-h-0 flex-1 text-muted-foreground">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
        >
          {shadeMode === "history" && historyShadeEnd > rangeStart && (
            <ReferenceArea
              x1={rangeStart}
              x2={historyShadeEnd}
              fill="var(--muted-foreground)"
              fillOpacity={0.12}
              stroke="none"
            />
          )}
          {shadeMode === "forward" && forwardShadeStart < rangeEnd && (
            <ReferenceArea
              x1={forwardShadeStart}
              x2={rangeEnd}
              fill="var(--muted-foreground)"
              fillOpacity={0.12}
              stroke="none"
            />
          )}
          <CartesianGrid
            stroke="currentColor"
            strokeOpacity={0.15}
            vertical={false}
          />
          <XAxis
            dataKey="date"
            type="number"
            scale="time"
            domain={[rangeStart, rangeEnd]}
            allowDataOverflow
            tickFormatter={formatMonth}
            tick={{ fill: "currentColor", fontSize: 11 }}
            minTickGap={28}
          />
          <YAxis
            domain={yAxis.domain}
            ticks={yAxis.ticks}
            allowDataOverflow={yAxis.clipToLimits}
            tick={{ fill: "currentColor", fontSize: 11 }}
            tickFormatter={(value: number) => value.toFixed(2)}
            width={80}
            label={{
              value: "USD / mmbtu",
              angle: -90,
              position: "insideLeft",
              style: {
                textAnchor: "middle",
                fill: "currentColor",
                fontSize: 12,
              },
            }}
          />
          <Tooltip
            labelFormatter={(value) =>
              new Date(Number(value)).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
                timeZone: "UTC",
              })
            }
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
          {showTodayLine && todayInRange && (
            <ReferenceLine
              x={today}
              stroke={TODAY_COLOR}
              strokeWidth={2}
              strokeDasharray="5 3"
              label={{
                value: "Today",
                position: "insideTopRight",
                fill: TODAY_COLOR,
                fontSize: 10,
              }}
            />
          )}
          {showYearStartLines &&
            yearStarts.map((timestamp) => (
              <ReferenceLine
                key={timestamp}
                x={timestamp}
                stroke="var(--muted-foreground)"
                strokeOpacity={0.55}
                strokeDasharray="2 3"
              />
            ))}
          {curves.map((curve) => (
            <Line
              key={curve.id}
              type="monotone"
              dataKey={curve.id}
              name={curve.label}
              stroke={curve.color}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
