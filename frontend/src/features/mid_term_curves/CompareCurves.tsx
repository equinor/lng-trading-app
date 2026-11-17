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
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChevronDown, RotateCcw } from "lucide-react"
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
const PALETTE_OPEN_STORAGE_KEY = "mid-term-curves-compare-palette-open"
const CUSTOM_CURVE_DEFAULT_COLOR = "#ff1243"
const DEFAULT_CURVE_IDS = ["ice_jkm", "ice_ttf", "ice_hh", "crude_17_2"]
const AVAILABLE_CURVE_IDS = new Set(
  CURVE_SECTIONS.flatMap((section) => section.curves.map((curve) => curve.id)),
)
const COLOR_PALETTE = [
  {
    label: "Primary colours",
    colors: [
      { name: "Equinor red", value: "#ff1243" },
      { name: "Light blue", value: "#ddf4f8" },
      { name: "Light green", value: "#e4f6e8" },
      { name: "Light peach", value: "#ffeadb" },
      { name: "Navy", value: "#243746" },
      { name: "Teal", value: "#007079" },
      { name: "Burgundy", value: "#810024" },
      { name: "Purple", value: "#7b61a8" },
    ],
  },
  {
    label: "Other colours",
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
    ],
  },
]

type CompareChartOptions = {
  showTodayLine: boolean
  showYearStartLines: boolean
  shadeMode: "off" | "history" | "forward"
}

const DEFAULT_CHART_OPTIONS: CompareChartOptions = {
  showTodayLine: true,
  showYearStartLines: true,
  shadeMode: "history",
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

function readPaletteOpen(): boolean {
  if (typeof window === "undefined") return true
  try {
    return readJson<boolean>(window.localStorage, PALETTE_OPEN_STORAGE_KEY) !== false
  } catch {
    return true
  }
}

function readCurveColors(): Record<string, string> {
  if (typeof window === "undefined") return {}
  try {
    const saved = readJson<Record<string, string>>(window.localStorage, COLORS_STORAGE_KEY)
    if (!saved) return {}
    // Saved custom curves are keyed by their own ids, so only the colour is validated.
    return Object.fromEntries(
      Object.entries(saved).filter(([, color]) => /^#[\da-f]{6}$/i.test(color)),
    )
  } catch {
    return {}
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
  const [paletteOpen, setPaletteOpen] = useState(readPaletteOpen)
  const [chartOptions, setChartOptions] = useState<CompareChartOptions>(readChartOptions)
  const { showTodayLine, showYearStartLines, shadeMode } = chartOptions
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
      writeJson(window.localStorage, PALETTE_OPEN_STORAGE_KEY, paletteOpen)
    } catch {
      // Storage is best-effort; the palette state remains usable in memory.
    }
  }, [paletteOpen])

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

  const resetComparison = () => {
    setSelectedIds(new Set(DEFAULT_CURVE_IDS))
    setSelectedCustomIds(new Set())
    setColorOverrides({})
    setChartOptions(DEFAULT_CHART_OPTIONS)
  }

  const applyPaletteColor = (color: string) => {
    setColorOverrides((current) => {
      const next = { ...current }
      for (const id of [...selectedIds, ...selectedCustomIds]) {
        next[id] = color
      }
      return next
    })
  }

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-b pb-3 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-3">
        <div className="mb-2 shrink-0 space-y-0.5 border-b border-border pb-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold">Color palette</h2>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-6"
              aria-label={paletteOpen ? "Collapse color palette" : "Expand color palette"}
              aria-expanded={paletteOpen}
              aria-controls="curve-color-palette"
              title={paletteOpen ? "Collapse color palette" : "Expand color palette"}
              onClick={() => setPaletteOpen((open) => !open)}
            >
              <ChevronDown
                aria-hidden="true"
                className={`transition-transform ${paletteOpen ? "" : "-rotate-90"}`}
              />
            </Button>
          </div>
          {paletteOpen && (
            <div id="curve-color-palette" className="space-y-0.5">
              {COLOR_PALETTE.map((section) => (
                <div key={section.label} role="group" aria-label={section.label}>
                  <p className="mb-0.5 text-[10px] leading-4 text-muted-foreground">
                    {section.label}
                  </p>
                  <div className="grid grid-cols-8 gap-x-1 gap-y-0.5">
                    {section.colors.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        aria-label={`Apply ${color.name} to selected curves`}
                        title={`${color.name}${selectedIds.size + selectedCustomIds.size ? " · Apply to selected curves" : " · Select a curve first"}`}
                        disabled={selectedIds.size + selectedCustomIds.size === 0}
                        onClick={() => applyPaletteColor(color.value)}
                        className="size-5 rounded-sm border border-border transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45"
                        style={{ backgroundColor: color.value }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
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
                <label
                  className="relative size-4 shrink-0 cursor-pointer rounded-sm"
                  title={`Set ${curve.label} line color`}
                >
                  <input
                    aria-label={`Color for custom curve ${curve.label}`}
                    type="color"
                    value={curve.color}
                    className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                    onChange={(event) =>
                      setColorOverrides((current) => ({
                        ...current,
                        [curve.id]: event.target.value,
                      }))
                    }
                  />
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-sm border border-border"
                    style={{ backgroundColor: curve.color }}
                  />
                </label>
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
                      <label
                        className="relative size-4 shrink-0 cursor-pointer rounded-sm"
                        title={`Set ${curve.label} line color`}
                      >
                        <input
                          aria-label={`Color for ${curve.label}`}
                          type="color"
                          value={color}
                          className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                          onChange={(event) =>
                            setColorOverrides((current) => ({
                              ...current,
                              [curve.id]: event.target.value,
                            }))
                          }
                        />
                        <span
                          aria-hidden="true"
                          className="absolute inset-0 rounded-sm border border-border"
                          style={{ backgroundColor: color }}
                        />
                      </label>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col" aria-label="Curve comparison chart">
        <div className="mb-3 flex shrink-0 flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Curve comparison</h2>
            <p className="text-xs text-muted-foreground">
              {plottedCurves.length} curves plotted across {filteredRows.length} dates
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetComparison}
              title="Reset colors, curve selections, markers, and shading"
            >
              <RotateCcw aria-hidden="true" />
              Reset
            </Button>
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
                  tick={{ fill: "currentColor", fontSize: 11 }}
                  tickFormatter={(value: number) => value.toFixed(2)}
                  width={64}
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