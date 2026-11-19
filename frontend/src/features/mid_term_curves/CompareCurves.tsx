import { useEffect, useState } from "react"
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

import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RotateCcw } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  getMidTermCurvePrices,
  getSavedCustomCurves,
  type CurvePrices,
  type SavedCustomCurveMonth,
} from "@/features/mid_term_curves/api"
import { CURVE_SECTIONS } from "@/routes/_layout/index"
import { useCurveDateRange } from "@/features/mid_term_curves/dateRange"
import { useRegisterExport } from "@/features/mid_term_curves/exportContext"
import { useQuery } from "@tanstack/react-query"
import { readJson, writeJson } from "@/lib/storage"

const SELECTION_STORAGE_KEY = "mid-term-curves-compare-selection"
const CUSTOM_SELECTION_STORAGE_KEY = "mid-term-curves-compare-custom-selection"
const COLORS_STORAGE_KEY = "mid-term-curves-compare-colors"
const CHART_OPTIONS_STORAGE_KEY = "mid-term-curves-compare-options"
const CUSTOM_CURVE_DEFAULT_COLOR = "#ff1243"
const DEFAULT_CURVE_IDS = [
  "epa_jkm",
  "epa_ttf",
  "epa_hh",
  "us_marginal_des_asia_100",
  "us_marginal_des_asia_50",
  "us_marginal_des_asia_sunk",
]
const DEFAULT_CURVE_COLORS: Record<string, string> = {
  crude_17_2: "#000000",
  crude_15_5: "#666666",
  crude_14: "#888888",
  crude_12_5: "#aaaaaa",
  crude_10: "#cccccc",
  ice_jkm: "#007f63",
  ice_hh: "#f79b18",
  ice_ttf: "#36b37e",
  ice_brent: "#000000",
  epa_jkm: "#ff1243",
  epa_ttf: "#ffc2cc",
  epa_nbp: "#ffd34d",
  epa_hh: "#ffb81c",
  us_to_jktc_100: "#369fd0",
  us_to_jktc_50: "#369fd0",
  us_to_jktc_0: "#369fd0",
  us_to_nwe_100: "#369fd0",
  us_to_nwe_50: "#369fd0",
  us_to_nwe_0: "#369fd0",
  me_to_jktc_100: "#369fd0",
  me_to_jktc_50: "#369fd0",
  me_to_jktc_0: "#369fd0",
  me_to_nwe_100: "#369fd0",
  me_to_nwe_50: "#369fd0",
  me_to_nwe_0: "#369fd0",
  spot_chartering_gea: "#36b37e",
  spark_0: "#36b37e",
  spark_1: "#36b37e",
  arbitrage_0: "#ffd34d",
  arbitrage_1: "#ffd34d",
  arbitrage_2: "#ffd34d",
  euro_coalswitching: "#7b61a8",
  china_central_asia: "#7b61a8",
  china_power_of_siberia: "#7b61a8",
  woodmac_asia_mid_term: "#7b61a8",
  us_marginal_des_asia_100: "#fff4cc",
  us_marginal_des_asia_50: "#ffe69a",
  us_marginal_des_asia_sunk: "#ffd34d",
}
const AVAILABLE_CURVE_IDS = new Set(
  CURVE_SECTIONS.flatMap((section) => section.curves.map((curve) => curve.id)),
)
const COLOR_PALETTE = [
  {
    label: "Colours",
    colors: [
      { name: "Black", value: "#000000" },
      { name: "Charcoal", value: "#252525" },
      { name: "Dark gray", value: "#454545" },
      { name: "Gray", value: "#666666" },
      { name: "Medium gray", value: "#888888" },
      { name: "Light gray", value: "#aaaaaa" },
      { name: "Pale gray", value: "#cccccc" },
      { name: "Near white", value: "#eeeeee" },
      { name: "Midnight blue", value: "#073b59" },
      { name: "Navy blue", value: "#0b5b84" },
      { name: "Deep blue", value: "#187eae" },
      { name: "Blue", value: "#369fd0" },
      { name: "Sky blue", value: "#69bce0" },
      { name: "Light blue", value: "#9bd4ec" },
      { name: "Pale blue", value: "#c7e6f5" },
      { name: "Ice blue", value: "#e6f4ff" },
      { name: "Burnt orange", value: "#8f3d00" },
      { name: "Deep orange", value: "#bd5200" },
      { name: "Orange", value: "#eb7600" },
      { name: "Amber", value: "#f79b18" },
      { name: "Gold", value: "#ffb81c" },
      { name: "Yellow", value: "#ffd34d" },
      { name: "Light yellow", value: "#ffe69a" },
      { name: "Pale yellow", value: "#fff4cc" },
      { name: "Dark red", value: "#690014" },
      { name: "Deep red", value: "#8c001c" },
      { name: "Red", value: "#b00028" },
      { name: "Crimson", value: "#d90035" },
      { name: "Bright red", value: "#ff1243" },
      { name: "Coral red", value: "#ff536f" },
      { name: "Light red", value: "#ff8799" },
      { name: "Pale red", value: "#ffc2cc" },
      { name: "Dark green", value: "#003d32" },
      { name: "Forest green", value: "#005c4b" },
      { name: "Deep green", value: "#007f63" },
      { name: "Green", value: "#009b70" },
      { name: "Bright green", value: "#36b37e" },
      { name: "Light green", value: "#6fcf97" },
      { name: "Pale green", value: "#a5e2bb" },
      { name: "Mint", value: "#d7f2e0" },
      { name: "Deep purple", value: "#2e1a47" },
      { name: "Dark purple", value: "#4a2c7a" },
      { name: "Purple", value: "#6b3fa0" },
      { name: "Medium purple", value: "#7b61a8" },
      { name: "Violet", value: "#9b72cf" },
      { name: "Light purple", value: "#b79ae0" },
      { name: "Lavender", value: "#d4c3ee" },
      { name: "Pale lavender", value: "#ece4f7" },
    ],
  },
]

type CompareChartOptions = {
  showTodayLine: boolean
  showYearStartLines: boolean
  shadeMode: "off" | "history" | "forward"
  yMin: string
  yMax: string
  yStep: string
}

const DEFAULT_CHART_OPTIONS: CompareChartOptions = {
  showTodayLine: true,
  showYearStartLines: true,
  shadeMode: "history",
  yMin: "",
  yMax: "",
  yStep: "",
}

// Blank or non-numeric input means automatic.
function parseAxisNumber(value: string): number | null {
  if (value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readCurveSelection(): Set<string> {
  if (typeof window === "undefined") return new Set(DEFAULT_CURVE_IDS)
  try {
    const saved = readJson<string[]>(window.localStorage, SELECTION_STORAGE_KEY)
    return saved === null
      ? new Set(DEFAULT_CURVE_IDS)
      : new Set(saved.filter((id) => AVAILABLE_CURVE_IDS.has(id)))
  } catch {
    return new Set(DEFAULT_CURVE_IDS)
  }
}

function readCustomCurveSelection(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    return new Set(
      readJson<string[]>(window.localStorage, CUSTOM_SELECTION_STORAGE_KEY) ?? [],
    )
  } catch {
    return new Set()
  }
}

function readCurveColors(): Record<string, string> {
  if (typeof window === "undefined") return DEFAULT_CURVE_COLORS
  try {
    const saved = readJson<Record<string, string>>(window.localStorage, COLORS_STORAGE_KEY)
    if (!saved) return DEFAULT_CURVE_COLORS
    // Saved custom curves are keyed by their own ids, so only the colour is validated.
    return {
      ...DEFAULT_CURVE_COLORS,
      ...Object.fromEntries(
        Object.entries(saved).filter(([, color]) => /^#[\da-f]{6}$/i.test(color)),
      ),
    }
  } catch {
    return DEFAULT_CURVE_COLORS
  }
}

function readChartOptions(): CompareChartOptions {
  if (typeof window === "undefined") return DEFAULT_CHART_OPTIONS
  try {
    const saved = readJson<Partial<CompareChartOptions>>(
      window.localStorage,
      CHART_OPTIONS_STORAGE_KEY,
    )
    if (!saved) return DEFAULT_CHART_OPTIONS
    return {
      showTodayLine: saved.showTodayLine ?? DEFAULT_CHART_OPTIONS.showTodayLine,
      showYearStartLines:
        saved.showYearStartLines ?? DEFAULT_CHART_OPTIONS.showYearStartLines,
      shadeMode:
        saved.shadeMode === "off" || saved.shadeMode === "forward"
          ? saved.shadeMode
          : "history",
      yMin: typeof saved.yMin === "string" ? saved.yMin : "",
      yMax: typeof saved.yMax === "string" ? saved.yMax : "",
      yStep: typeof saved.yStep === "string" ? saved.yStep : "",
    }
  } catch {
    return DEFAULT_CHART_OPTIONS
  }
}

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

function formatMonth(value: number) {
  return DATE_FORMAT.format(new Date(value))
}

const PALETTE_COLORS = COLOR_PALETTE.flatMap((section) => section.colors)

function CurveColorPicker({
  label,
  color,
  onChange,
}: {
  label: string
  color: string
  onChange: (value: string) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Color for ${label}`}
          title={`Set ${label} line color`}
          className="size-4 shrink-0 cursor-pointer rounded-sm border border-border"
          style={{ backgroundColor: color }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto p-2">
        <div className="grid grid-cols-8 gap-1">
          {PALETTE_COLORS.map((swatch) => (
            <DropdownMenuItem
              key={swatch.value}
              aria-label={swatch.name}
              title={swatch.name}
              onSelect={() => onChange(swatch.value)}
              className="size-5 min-h-0 rounded-sm border border-border p-0 data-[highlighted]:ring-2 data-[highlighted]:ring-ring"
              style={{ backgroundColor: swatch.value }}
            />
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function CompareCurves() {
  const pricesQuery = useQuery({
    queryKey: ["mid_term_curves", "prices"],
    queryFn: getMidTermCurvePrices,
    staleTime: 15 * 60_000,
  })
  const savedCurvesQuery = useQuery({
    queryKey: ["mid_term_curves", "custom-curves"],
    queryFn: getSavedCustomCurves,
    staleTime: 30_000,
  })
  const rows = pricesQuery.data ?? []
  const savedMonths = savedCurvesQuery.data ?? []
  const [selectedIds, setSelectedIds] = useState<Set<string>>(readCurveSelection)
  const [selectedCustomIds, setSelectedCustomIds] = useState<Set<string>>(readCustomCurveSelection)
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>(readCurveColors)
  const [chartOptions, setChartOptions] = useState<CompareChartOptions>(readChartOptions)
  const { showTodayLine, showYearStartLines, shadeMode, yMin, yMax, yStep } = chartOptions
  const { fromDate, toDate } = useCurveDateRange()

  useEffect(() => {
    try {
      writeJson(window.localStorage, SELECTION_STORAGE_KEY, [...selectedIds])
    } catch {
      // Storage is best-effort; the current selection remains usable in memory.
    }
  }, [selectedIds])

  useEffect(() => {
    try {
      writeJson(window.localStorage, CUSTOM_SELECTION_STORAGE_KEY, [...selectedCustomIds])
    } catch {
      // Storage is best-effort; current custom selections remain usable in memory.
    }
  }, [selectedCustomIds])

  useEffect(() => {
    try {
      writeJson(window.localStorage, COLORS_STORAGE_KEY, colorOverrides)
    } catch {
      // Storage is best-effort; current curve colors remain usable in memory.
    }
  }, [colorOverrides])

  useEffect(() => {
    try {
      writeJson(window.localStorage, CHART_OPTIONS_STORAGE_KEY, chartOptions)
    } catch {
      // Storage is best-effort; the current chart settings remain usable in memory.
    }
  }, [chartOptions])

  const invalidRange = Boolean(fromDate && toDate && fromDate > toDate)
  const filteredRows = invalidRange
    ? []
    : rows.filter(
        (row) => row.start_date >= fromDate && row.start_date <= toDate,
      )
  const standardCurveCatalog = CURVE_SECTIONS.flatMap((section) => section.curves)
  const curveById = new Map(standardCurveCatalog.map((curve) => [curve.id, curve]))
  const savedCurveGroups = Array.from(
    savedMonths.reduce((groups, month) => {
      const months = groups.get(month.curve_id) ?? []
      months.push(month)
      groups.set(month.curve_id, months)
      return groups
    }, new Map<string, SavedCustomCurveMonth[]>()),
    ([id, months]) => {
      const monthByDate = new Map(months.map((month) => [month.month, month]))
      return {
        id,
        label: months[0]?.curve_name ?? "Untitled curve",
        color: colorOverrides[id] ?? CUSTOM_CURVE_DEFAULT_COLOR,
        value: (row: CurvePrices) => {
          const month = monthByDate.get(row.start_date)
          if (!month) return null
          const values = [month.curve_1_id, month.curve_2_id]
            .map((curveId) =>
              curveId ? curveById.get(curveId)?.value(row) ?? null : null,
            )
            .filter((value): value is number => value !== null)
          return values.length
            ? values.reduce((sum, value) => sum + value, 0) / values.length
            : null
        },
      }
    },
  )
  const selectedStandardCurves = standardCurveCatalog.filter((curve) =>
    selectedIds.has(curve.id),
  )
  const selectedCustomCurves = savedCurveGroups
    .filter((curve) => selectedCustomIds.has(curve.id))
    .map((curve) => ({
      id: `custom_${curve.id}`,
      label: curve.label,
      color: curve.color,
      value: curve.value,
    }))
  const selectedCurves = [
    ...selectedStandardCurves,
    ...selectedCustomCurves,
  ]
  const plottedCurves = selectedCurves.filter((curve) =>
    filteredRows.some((row) => curve.value(row) !== null),
  )
  const rangeStart = Date.parse(`${fromDate}T00:00:00Z`)
  const rangeEnd = Date.parse(`${toDate}T00:00:00Z`)
  const currentDate = new Date()
  const todayDate = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`
  const todayTimestamp = Date.parse(`${todayDate}T00:00:00Z`)
  const todayInRange = todayTimestamp >= rangeStart && todayTimestamp <= rangeEnd
  const historyShadeEnd = Math.min(todayTimestamp, rangeEnd)
  const forwardShadeStart = Math.max(todayTimestamp, rangeStart)
  const firstYear = filteredRows[0]
    ? Number(filteredRows[0].start_date.slice(0, 4))
    : 0
  const lastYear = filteredRows[filteredRows.length - 1]
    ? Number(filteredRows[filteredRows.length - 1].start_date.slice(0, 4))
    : -1
  const yearStartTimestamps = Array.from(
    { length: Math.max(0, lastYear - firstYear + 1) },
    (_, index) => Date.UTC(firstYear + index, 0, 1),
  ).filter((timestamp) => timestamp >= rangeStart && timestamp <= rangeEnd)
  const chartData = filteredRows.map((row) => {
    const point: Record<string, string | number | null> = {
      date: Date.parse(`${row.start_date}T00:00:00Z`),
    }
    for (const curve of plottedCurves) {
      point[curve.id] = curve.value(row)
    }
    return point
  })
  const yMinValue = parseAxisNumber(yMin)
  const yMaxValue = parseAxisNumber(yMax)
  const yStepValue = parseAxisNumber(yStep)
  const validYLimits =
    yMinValue === null || yMaxValue === null || yMinValue < yMaxValue
  const dataValues = chartData.flatMap((point) =>
    plottedCurves.map((curve) => point[curve.id]).filter((v): v is number => typeof v === "number"),
  )
  const dataMin = dataValues.length ? Math.min(...dataValues) : 0
  const dataMax = dataValues.length ? Math.max(...dataValues) : 0
  const axisLow =
    validYLimits && yMinValue !== null
      ? yMinValue
      : yStepValue && yStepValue > 0
        ? Math.floor(dataMin / yStepValue) * yStepValue
        : null
  const axisHigh =
    validYLimits && yMaxValue !== null
      ? yMaxValue
      : yStepValue && yStepValue > 0
        ? Math.ceil(dataMax / yStepValue) * yStepValue
        : null
  const tickCount =
    yStepValue && yStepValue > 0 && axisLow !== null && axisHigh !== null
      ? Math.floor((axisHigh - axisLow) / yStepValue + 1e-9) + 1
      : 0
  const yTicks =
    tickCount > 1 && tickCount <= 200 && yStepValue && axisLow !== null
      ? Array.from({ length: tickCount }, (_, index) =>
          Number((axisLow + index * yStepValue).toFixed(6)),
        )
      : undefined
  const yDomain: [number | "auto", number | "auto"] = [
    validYLimits && yMinValue !== null ? yMinValue : yTicks ? yTicks[0] : "auto",
    validYLimits && yMaxValue !== null
      ? yMaxValue
      : yTicks
        ? Math.max(yTicks[yTicks.length - 1], dataMax)
        : "auto",
  ]

  useRegisterExport(() => ({
    fileName: `compare_curves_${fromDate}_${toDate}`,
    sheetName: "Compare curves",
    headers: ["Start date", ...plottedCurves.map((curve) => curve.label)],
    rows: filteredRows.map((row) => [
      row.start_date,
      ...plottedCurves.map((curve) => curve.value(row) ?? null),
    ]),
  }))

  const toggleCurve = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggleSection = (sectionId: string, checked: boolean) => {
    const section = CURVE_SECTIONS.find((candidate) => candidate.id === sectionId)
    if (!section) return
    setSelectedIds((current) => {
      const next = new Set(current)
      for (const curve of section.curves) {
        if (checked) next.add(curve.id)
        else next.delete(curve.id)
      }
      return next
    })
  }

  const toggleCustomCurve = (id: string, checked: boolean) => {
    setSelectedCustomIds((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggleAllCustomCurves = (checked: boolean) => {
    setSelectedCustomIds((current) => {
      const next = new Set(current)
      for (const curve of savedCurveGroups) {
        if (checked) next.add(curve.id)
        else next.delete(curve.id)
      }
      return next
    })
  }

  const resetCurves = () => {
    setSelectedIds(new Set(DEFAULT_CURVE_IDS))
    setSelectedCustomIds(new Set())
    setColorOverrides(DEFAULT_CURVE_COLORS)
  }

  const resetGraph = () => setChartOptions(DEFAULT_CHART_OPTIONS)

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-b pb-3 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-3">
        <div className="mb-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetCurves}
            title="Restore the default curve selection and colors"
          >
            <RotateCcw aria-hidden="true" />
            Reset curves
          </Button>
        </div>
        <div
          role="group"
          aria-label="Custom Curves"
          className="mb-2 space-y-0 border-b border-border pb-2"
        >
          <div className="flex w-full items-center gap-2 py-0 text-xs font-semibold">
            <Checkbox
              aria-label="Select all Custom Curves"
              checked={
                savedCurveGroups.length === 0 || selectedCustomIds.size === 0
                  ? false
                  : savedCurveGroups.every((curve) => selectedCustomIds.has(curve.id))
                    ? true
                    : "indeterminate"
              }
              disabled={savedCurveGroups.length === 0}
              onCheckedChange={(checked) => toggleAllCustomCurves(checked === true)}
            />
            <span>Custom Curves</span>
            <span className="ml-auto font-normal text-muted-foreground">
              {savedCurveGroups.filter((curve) => selectedCustomIds.has(curve.id)).length}/{savedCurveGroups.length}
            </span>
          </div>
          {savedCurvesQuery.isPending ? (
            <p className="px-1 py-1 text-xs text-muted-foreground">Loading saved curves...</p>
          ) : savedCurveGroups.length === 0 ? (
            <p className="px-1 py-1 text-xs text-muted-foreground">
              No saved curves yet.
            </p>
          ) : (
            savedCurveGroups.map((curve) => (
              <div
                key={curve.id}
                className="flex min-h-5 items-center gap-2 rounded-sm px-1 py-0 text-xs hover:bg-muted/60"
              >
                <Checkbox
                  aria-label={`Select custom curve ${curve.label}`}
                  checked={selectedCustomIds.has(curve.id)}
                  onCheckedChange={(checked) =>
                    toggleCustomCurve(curve.id, checked === true)
                  }
                />
                <span className="min-w-0 flex-1 leading-tight">{curve.label}</span>
                <CurveColorPicker
                  label={curve.label}
                  color={curve.color}
                  onChange={(value) =>
                    setColorOverrides((current) => ({ ...current, [curve.id]: value }))
                  }
                />
              </div>
            ))
          )}
        </div>
        <div className="mb-2 flex shrink-0 items-center justify-between">
          <h2 className="text-sm font-semibold">Standard Curves</h2>
          <span className="text-xs text-muted-foreground">
            {selectedIds.size} selected
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-2">
          {CURVE_SECTIONS.map((section, index) => {
            const selectedInSection = section.curves.filter((curve) =>
              selectedIds.has(curve.id),
            ).length
            const sectionChecked =
              selectedInSection === 0
                ? false
                : selectedInSection === section.curves.length
                  ? true
                  : "indeterminate"

            return (
              <div
                key={section.id}
                role="group"
                aria-label={section.label}
                className={index === 0 ? "space-y-0" : "space-y-0 border-t border-border pt-2"}
              >
                <div className="flex w-full items-center gap-2 py-0 text-xs font-semibold">
                  <Checkbox
                    aria-label={`Select all ${section.label}`}
                    checked={sectionChecked}
                    onCheckedChange={(checked) =>
                      toggleSection(section.id, checked === true)
                    }
                  />
                  <span>{section.label}</span>
                  <span className="ml-auto font-normal text-muted-foreground">
                    {selectedInSection}/{section.curves.length}
                  </span>
                </div>
                {section.curves.map((curve) => {
                  const color = colorOverrides[curve.id] ?? curve.color
                  return (
                    <div
                      key={curve.id}
                      className="flex min-h-5 items-center gap-2 rounded-sm px-1 py-0 text-xs hover:bg-muted/60"
                    >
                      <Checkbox
                        aria-label={`Select ${curve.label}`}
                        checked={selectedIds.has(curve.id)}
                        onCheckedChange={(checked) =>
                          toggleCurve(curve.id, checked === true)
                        }
                      />
                      <span className="min-w-0 flex-1 leading-tight">
                        {curve.label}
                      </span>
                      <CurveColorPicker
                        label={curve.label}
                        color={color}
                        onChange={(value) =>
                          setColorOverrides((current) => ({ ...current, [curve.id]: value }))
                        }
                      />
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col" aria-label="Curve comparison chart">
        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetGraph}
              title="Restore the default Y axis, Today, Years, and shading"
            >
              <RotateCcw aria-hidden="true" />
              Reset graph
            </Button>
            {(
              [
                { key: "yMin", label: "Y min", value: yMin },
                { key: "yMax", label: "Y max", value: yMax },
                { key: "yStep", label: "Y step", value: yStep },
              ] as const
            ).map((field) => (
              <label key={field.key} className="flex items-center gap-1.5 text-xs">
                <span>{field.label}</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={field.key === "yStep" ? 0 : undefined}
                  placeholder="Auto"
                  value={field.value}
                  onChange={(event) =>
                    setChartOptions((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                  className="h-8 w-20 px-2 text-xs"
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <Checkbox
                checked={showTodayLine}
                onCheckedChange={(checked) =>
                  setChartOptions((current) => ({
                    ...current,
                    showTodayLine: checked === true,
                  }))
                }
              />
              <span>Today</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <Checkbox
                checked={showYearStartLines}
                onCheckedChange={(checked) =>
                  setChartOptions((current) => ({
                    ...current,
                    showYearStartLines: checked === true,
                  }))
                }
              />
              <span>Years</span>
            </label>
            <Tabs
              value={shadeMode}
              onValueChange={(value) =>
                setChartOptions((current) => ({
                  ...current,
                  shadeMode: value as CompareChartOptions["shadeMode"],
                }))
              }
            >
              <TabsList aria-label="Shade date range" className="h-8">
                <TabsTrigger value="off" className="px-2 text-xs">No shade</TabsTrigger>
                <TabsTrigger value="history" className="px-2 text-xs">History</TabsTrigger>
                <TabsTrigger value="forward" className="px-2 text-xs">Forward</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {pricesQuery.isPending || savedCurvesQuery.isPending ? (
          <Skeleton className="min-h-0 flex-1" />
        ) : pricesQuery.isError || savedCurvesQuery.isError ? (
          <p className="flex min-h-0 flex-1 items-center justify-center text-sm text-destructive">
            Could not load curve prices.
          </p>
        ) : invalidRange ? (
          <p className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
            Choose a From date before the To date.
          </p>
        ) : plottedCurves.length === 0 ? (
          <p className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
            Select one or more curves with available data to plot them.
          </p>
        ) : (
          <div className="min-h-0 flex-1 text-muted-foreground">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
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
                  domain={yDomain}
                  ticks={yTicks}
                  allowDataOverflow={validYLimits && (yMinValue !== null || yMaxValue !== null)}
                  tick={{ fill: "currentColor", fontSize: 11 }}
                  tickFormatter={(value: number) => value.toFixed(2)}
                  width={80}
                  label={{
                    value: "USD / mmbtu",
                    angle: -90,
                    position: "insideLeft",
                    style: { textAnchor: "middle", fill: "currentColor", fontSize: 12 },
                  }}
                />
                <Tooltip
                  labelFormatter={(value) =>
                    new Date(Number(value)).toLocaleDateString(
                      undefined,
                      { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" },
                    )
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
                    x={todayTimestamp}
                    stroke="#e4002b"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    label={{ value: "Today", position: "insideTopRight", fill: "#e4002b", fontSize: 10 }}
                  />
                )}
                {showYearStartLines &&
                  yearStartTimestamps.map((timestamp) => (
                    <ReferenceLine
                      key={timestamp}
                      x={timestamp}
                      stroke="var(--muted-foreground)"
                      strokeOpacity={0.55}
                      strokeDasharray="2 3"
                    />
                  ))}
                {plottedCurves.map((curve) => (
                  <Line
                    key={curve.id}
                    type="monotone"
                    dataKey={curve.id}
                    name={curve.label}
                    stroke={colorOverrides[curve.id] ?? curve.color}
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
    </div>
  )
}