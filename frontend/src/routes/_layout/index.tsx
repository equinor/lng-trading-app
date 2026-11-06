import { createFileRoute } from "@tanstack/react-router"
import { ArrowDownRight, ArrowUpRight, Database, Droplets, Factory } from "lucide-react"
import { useState, type ReactNode } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
  head: () => ({
    meta: [
      {
        title: "LNG Supply & Demand",
      },
    ],
  }),
})

type MarketMonth = {
  month: string
  supply: number
  demand: number
}

const marketData: MarketMonth[] = [
  { month: "Jan", supply: 37.2, demand: 39.1 },
  { month: "Feb", supply: 35.8, demand: 37.4 },
  { month: "Mar", supply: 38.6, demand: 39.3 },
  { month: "Apr", supply: 39.4, demand: 38.7 },
  { month: "May", supply: 40.1, demand: 39.8 },
  { month: "Jun", supply: 39.2, demand: 41.1 },
  { month: "Jul", supply: 40.7, demand: 42.8 },
  { month: "Aug", supply: 41.9, demand: 43.2 },
  { month: "Sep", supply: 40.5, demand: 42.1 },
  { month: "Oct", supply: 42.3, demand: 41.6 },
  { month: "Nov", supply: 41.4, demand: 42.7 },
  { month: "Dec", supply: 40.3, demand: 41.4 },
]

const ranges = [3, 6, 12] as const

function Dashboard() {
  const [range, setRange] = useState<(typeof ranges)[number]>(12)
  const [activeMonth, setActiveMonth] = useState(marketData.length - 1)
  const visibleData = marketData.slice(-range)
  const selectedData = marketData[activeMonth]
  const balance = selectedData.supply - selectedData.demand
  const chartWidth = 900
  const chartHeight = 340
  const chartLeft = 58
  const chartRight = 876
  const chartTop = 24
  const chartBottom = 284
  const minValue = 30
  const maxValue = 50
  const yTicks = [30, 35, 40, 45, 50]
  const x = (index: number) =>
    chartLeft +
    (visibleData.length === 1
      ? 0
      : (index / (visibleData.length - 1)) * (chartRight - chartLeft))
  const y = (value: number) =>
    chartBottom - ((value - minValue) / (maxValue - minValue)) * (chartBottom - chartTop)
  const linePath = (key: "supply" | "demand") =>
    visibleData
      .map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(point[key])}`)
      .join(" ")
  const latest = marketData[marketData.length - 1]
  const latestBalance = latest.supply - latest.demand
  const visibleStartIndex = marketData.length - visibleData.length

  const handleRangeChange = (nextRange: (typeof ranges)[number]) => {
    setRange(nextRange)
    setActiveMonth(marketData.length - 1)
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            <span className="size-2 rounded-full bg-primary" />
            LNG market overview
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Supply &amp; demand</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Global LNG market balance · monthly outlook for 2025
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <Database className="size-3.5 text-primary" />
          Illustrative mock data
        </div>
      </header>

      <section aria-label="Latest market figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Global supply"
          value={latest.supply}
          month={latest.month}
          icon={<Factory className="size-4" />}
          color="text-primary"
        />
        <MetricCard
          label="Global demand"
          value={latest.demand}
          month={latest.month}
          icon={<Droplets className="size-4" />}
          color="text-sky-400"
        />
        <Card className="gap-0 py-0">
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Market balance</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">
                {latestBalance > 0 ? "+" : ""}
                {latestBalance.toFixed(1)}
                <span className="ml-1.5 text-sm font-normal text-muted-foreground">Mt</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {latestBalance >= 0 ? "Surplus" : "Deficit"} · {latest.month} 2025
              </p>
            </div>
            <span
              className={`rounded-lg bg-secondary p-2.5 ${
                latestBalance >= 0 ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {latestBalance >= 0 ? (
                <ArrowUpRight className="size-4" />
              ) : (
                <ArrowDownRight className="size-4" />
              )}
            </span>
          </CardContent>
        </Card>
      </section>

      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-col gap-4 border-b px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <CardTitle className="text-base">Monthly volumes</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Supply and demand, in million tonnes (Mt)
            </p>
          </div>
          <div
            aria-label="Chart time range"
            className="inline-flex w-fit rounded-lg border bg-secondary/60 p-1"
            role="group"
          >
            {ranges.map((months) => (
              <button
                aria-pressed={range === months}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  range === months
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                key={months}
                onClick={() => handleRangeChange(months)}
                type="button"
              >
                {months}M
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-5 pt-4 sm:px-6">
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <span className="h-0.5 w-4 rounded-full bg-primary" />
              Supply
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-0.5 w-4 rounded-full bg-sky-400" />
              Demand
            </span>
            <span className="ml-auto tabular-nums">
              {selectedData.month} 2025 balance{" "}
              <strong className={balance >= 0 ? "text-emerald-400" : "text-amber-400"}>
                {balance > 0 ? "+" : ""}
                {balance.toFixed(1)} Mt
              </strong>
            </span>
          </div>
          <div className="w-full overflow-x-auto">
            <svg
              aria-label={`Monthly LNG supply and demand chart. ${visibleData
                .map(
                  (point) =>
                    `${point.month}: supply ${point.supply} million tonnes, demand ${point.demand} million tonnes`,
                )
                .join("; ")}`}
              className="block h-auto min-w-[560px] w-full"
              role="group"
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            >
              <defs>
                <linearGradient id="supply-area" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {yTicks.map((tick) => (
                <g key={tick}>
                  <line
                    className="stroke-border"
                    strokeDasharray={tick === minValue ? undefined : "4 6"}
                    strokeWidth="1"
                    x1={chartLeft}
                    x2={chartRight}
                    y1={y(tick)}
                    y2={y(tick)}
                  />
                  <text
                    className="fill-muted-foreground"
                    fontSize="11"
                    textAnchor="end"
                    x={chartLeft - 12}
                    y={y(tick) + 4}
                  >
                    {tick}
                  </text>
                </g>
              ))}
              <path
                d={`${linePath("supply")} L ${x(visibleData.length - 1)} ${chartBottom} L ${x(0)} ${chartBottom} Z`}
                fill="url(#supply-area)"
              />
              <path
                d={linePath("supply")}
                fill="none"
                stroke="var(--primary)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
              />
              <path
                d={linePath("demand")}
                fill="none"
                stroke="oklch(0.72 0.12 230)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
              />
              {visibleData.map((point, index) => {
                const monthIndex = visibleStartIndex + index
                const isActive = monthIndex === activeMonth

                return (
                  <g key={point.month}>
                    <circle
                      cx={x(index)}
                      cy={y(point.supply)}
                      fill="var(--primary)"
                      r={isActive ? 5 : 3.5}
                      stroke="var(--card)"
                      strokeWidth="2"
                    >
                      <title>{`${point.month} supply: ${point.supply} Mt`}</title>
                    </circle>
                    <circle
                      cx={x(index)}
                      cy={y(point.demand)}
                      fill="oklch(0.72 0.12 230)"
                      r={isActive ? 5 : 3.5}
                      stroke="var(--card)"
                      strokeWidth="2"
                    >
                      <title>{`${point.month} demand: ${point.demand} Mt`}</title>
                    </circle>
                  </g>
                )
              })}
              {visibleData.map((point, index) => (
                <text
                  className="fill-muted-foreground"
                  fontSize="11"
                  key={point.month}
                  textAnchor="middle"
                  x={x(index)}
                  y={chartBottom + 25}
                >
                  {point.month}
                </text>
              ))}
              {visibleData.map((point, index) => {
                const monthIndex = visibleStartIndex + index
                const hitAreaWidth = (chartRight - chartLeft) / visibleData.length

                return (
                  <rect
                    aria-label={`${point.month} 2025: supply ${point.supply} Mt, demand ${point.demand} Mt`}
                    className="focus-visible:fill-foreground/5 focus-visible:outline-none"
                    fill="transparent"
                    height={chartBottom - chartTop}
                    key={`focus-${point.month}`}
                    onFocus={() => setActiveMonth(monthIndex)}
                    onMouseEnter={() => setActiveMonth(monthIndex)}
                    role="button"
                    tabIndex={0}
                    width={hitAreaWidth}
                    x={x(index) - hitAreaWidth / 2}
                    y={chartTop}
                  />
                )
              })}
            </svg>
          </div>
          <div className="mt-3 flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
            <span>2025 monthly data · illustrative only</span>
            <span className="tabular-nums">
              {selectedData.month}: {selectedData.supply.toFixed(1)} Mt supply /{" "}
              {selectedData.demand.toFixed(1)} Mt demand
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

type MetricCardProps = {
  label: string
  value: number
  month: string
  icon: ReactNode
  color: string
}

function MetricCard({ label, value, month, icon, color }: MetricCardProps) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">
            {value.toFixed(1)}
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">Mt</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{month} 2025</p>
        </div>
        <span className={`rounded-lg bg-secondary p-2.5 ${color}`}>{icon}</span>
      </CardContent>
    </Card>
  )
}
