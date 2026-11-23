import { useState } from "react"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { CycleSeries } from "@/features/pipeline_nominations/api"
import {
  CHART_HEIGHT,
  cycleDays,
  cycleRowsForDay,
  formatDay,
  yAxisScale,
} from "@/features/pipeline_nominations/utils"

type Props = {
  series: CycleSeries[]
  colorOf: (name: string) => string
}

const MAX_DAYS = 5

/**
 * The nomination of each cycle for one gas day: the cycles on the x axis and a line per facility.
 * A line only joins the cycles of its own day, because each point is that cycle's final
 * nomination rather than a value that holds over time. The day can be switched.
 */
export function CycleChart({ series, colorOf }: Props) {
  const days = cycleDays(series).slice(0, MAX_DAYS)
  const [chosen, setChosen] = useState<string | null>(null)
  // The newest day until one is picked, and again if the picked day drops out of the data.
  const day = chosen && days.includes(chosen) ? chosen : (days[0] ?? null)
  const rows = day ? cycleRowsForDay(series, day) : []

  // Facilities with a value on this day, and the last cycle each has one for: where its line ends.
  const lines = series.flatMap((s) => {
    const index = rows
      .map((row) => typeof row[s.name] === "number")
      .lastIndexOf(true)
    return index >= 0
      ? [
          {
            name: s.name,
            cycle: String(rows[index].cycle),
            bcf: Number(rows[index][s.name]),
          },
        ]
      : []
  })
  const endLabels: EndLabel[] = lines.map((l) => ({
    key: l.name,
    x: l.cycle,
    value: l.bcf,
    color: colorOf(l.name),
  }))

  const axis = yAxisScale(lines.map((l) => l.bcf))
  const title = "Nomination BCF/d by cycle"

  return (
    <section className="rounded-lg border p-4" aria-label={title}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {day && (
          <Tabs value={day} onValueChange={setChosen}>
            <TabsList aria-label="Gas day">
              {days.map((d) => (
                <TabsTrigger key={d} value={d}>
                  {formatDay(d)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>
      {day && (
        <p className="mb-2 text-xs text-muted-foreground">
          Gas day {formatDay(day, true)}. The figure at the end of each line is
          its latest cycle. Cycles that have not happened yet have no point.
          Post is the figure after the gas day has ended.
        </p>
      )}
      {!day ? (
        <p className="flex h-70 items-center justify-center text-sm text-muted-foreground">
          No data for the selected filters.
        </p>
      ) : (
        <>
          <div className="text-muted-foreground">
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart
                data={rows}
                margin={{ top: 8, right: 52, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  stroke="currentColor"
                  strokeOpacity={0.15}
                  vertical={false}
                />
                <XAxis
                  dataKey="cycle"
                  interval={0}
                  tick={{ fill: "currentColor", fontSize: 11 }}
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
                {lines.map((l) => (
                  <Line
                    key={l.name}
                    type="linear"
                    dataKey={l.name}
                    stroke={colorOf(l.name)}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                ))}
                <EndLabels labels={endLabels} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ChartLegend
            items={lines.map((l) => ({ name: l.name, color: colorOf(l.name) }))}
          />
        </>
      )}
    </section>
  )
}
