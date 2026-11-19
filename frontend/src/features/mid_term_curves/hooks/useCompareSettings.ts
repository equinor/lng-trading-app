import { useCallback } from "react"

import {
  type CompareChartOptions,
  CUSTOM_CURVE_DEFAULT_COLOR,
  DEFAULT_CHART_OPTIONS,
  DEFAULT_CURVE_COLORS,
  DEFAULT_CURVE_IDS,
} from "@/features/mid_term_curves/compareDefaults"
import { CURVE_BY_ID } from "@/features/mid_term_curves/curves"
import { usePersistentState } from "@/features/mid_term_curves/hooks/usePersistentState"

const SELECTION_STORAGE_KEY = "mid-term-curves-compare-selection"
const CUSTOM_SELECTION_STORAGE_KEY = "mid-term-curves-compare-custom-selection"
const COLORS_STORAGE_KEY = "mid-term-curves-compare-colors"
const CHART_OPTIONS_STORAGE_KEY = "mid-term-curves-compare-options"

const isString = (value: unknown): value is string => typeof value === "string"

function parseSelection(saved: unknown): Set<string> {
  return Array.isArray(saved)
    ? new Set(
        saved.filter((id): id is string => isString(id) && CURVE_BY_ID.has(id)),
      )
    : new Set(DEFAULT_CURVE_IDS)
}

function parseCustomSelection(saved: unknown): Set<string> {
  return Array.isArray(saved) ? new Set(saved.filter(isString)) : new Set()
}

function parseColors(saved: unknown): Record<string, string> {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
    return DEFAULT_CURVE_COLORS
  }
  // Saved custom curves are keyed by their own ids, so only the colour is validated.
  return {
    ...DEFAULT_CURVE_COLORS,
    ...Object.fromEntries(
      Object.entries(saved).filter(
        ([, color]) => isString(color) && /^#[\da-f]{6}$/i.test(color),
      ),
    ),
  }
}

function parseOptions(saved: unknown): CompareChartOptions {
  if (!saved || typeof saved !== "object") return DEFAULT_CHART_OPTIONS
  const options = saved as Partial<CompareChartOptions>
  return {
    showTodayLine: options.showTodayLine ?? DEFAULT_CHART_OPTIONS.showTodayLine,
    showYearStartLines:
      options.showYearStartLines ?? DEFAULT_CHART_OPTIONS.showYearStartLines,
    shadeMode:
      options.shadeMode === "off" || options.shadeMode === "forward"
        ? options.shadeMode
        : "history",
    yMin: isString(options.yMin) ? options.yMin : "",
    yMax: isString(options.yMax) ? options.yMax : "",
    yStep: isString(options.yStep) ? options.yStep : "",
  }
}

const serializeSelection = (selection: Set<string>) => [...selection]
const asIs = <T>(value: T) => value

function withMembers(current: Set<string>, ids: string[], checked: boolean) {
  const next = new Set(current)
  for (const id of ids) {
    if (checked) next.add(id)
    else next.delete(id)
  }
  return next
}

/** The Compare curves choices: which curves are plotted, their colours and the chart options. Saved in the browser. */
export function useCompareSettings() {
  const [selectedIds, setSelectedIds] = usePersistentState(
    SELECTION_STORAGE_KEY,
    parseSelection,
    serializeSelection,
  )
  const [selectedCustomIds, setSelectedCustomIds] = usePersistentState(
    CUSTOM_SELECTION_STORAGE_KEY,
    parseCustomSelection,
    serializeSelection,
  )
  const [colors, setColors] = usePersistentState(
    COLORS_STORAGE_KEY,
    parseColors,
    asIs,
  )
  const [options, setOptions] = usePersistentState(
    CHART_OPTIONS_STORAGE_KEY,
    parseOptions,
    asIs,
  )

  const toggleCurves = useCallback(
    (ids: string[], checked: boolean) =>
      setSelectedIds((current) => withMembers(current, ids, checked)),
    [setSelectedIds],
  )
  const toggleCustomCurves = useCallback(
    (ids: string[], checked: boolean) =>
      setSelectedCustomIds((current) => withMembers(current, ids, checked)),
    [setSelectedCustomIds],
  )
  const setColor = useCallback(
    (id: string, color: string) =>
      setColors((current) => ({ ...current, [id]: color })),
    [setColors],
  )
  const setOption = useCallback(
    <K extends keyof CompareChartOptions>(
      key: K,
      value: CompareChartOptions[K],
    ) => setOptions((current) => ({ ...current, [key]: value })),
    [setOptions],
  )

  const resetCurves = useCallback(() => {
    setSelectedIds(new Set(DEFAULT_CURVE_IDS))
    setSelectedCustomIds(new Set())
    setColors(DEFAULT_CURVE_COLORS)
  }, [setSelectedIds, setSelectedCustomIds, setColors])
  const resetGraph = useCallback(
    () => setOptions(DEFAULT_CHART_OPTIONS),
    [setOptions],
  )

  const colorOf = (id: string, fallback: string = CUSTOM_CURVE_DEFAULT_COLOR) =>
    colors[id] ?? fallback

  return {
    selectedIds,
    selectedCustomIds,
    options,
    colorOf,
    toggleCurves,
    toggleCustomCurves,
    setColor,
    setOption,
    resetCurves,
    resetGraph,
  }
}
