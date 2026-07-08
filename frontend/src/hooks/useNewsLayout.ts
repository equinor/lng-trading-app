// frontend/src/hooks/useNewsLayout.ts
import { useEffect, useState } from "react"

import { readJson, removeKey, writeJson } from "@/lib/storage"
import {
  autoLayout,
  defaultGridRows,
  defaultGridSplits,
  defaultSplits,
  MAX_CATEGORY_SECTIONS,
  panelFromKey,
  type LayoutMode,
  type LayoutType,
  type PanelDescriptor,
  type SentimentKey,
  type SentimentSlots,
  type StoredLayout,
} from "@/services/news/news_layout"

export type UseNewsLayoutResult = {
  layoutMode: LayoutMode
  effectiveLayoutType: LayoutType
  effectiveSlots: SentimentSlots
  primarySplit: number
  setPrimarySplit: (value: number) => void
  secondarySplit: number
  setSecondarySplit: (value: number) => void
  selectLayout: (layoutType: LayoutType) => void
  setSlot: (index: number, key: SentimentKey) => void
  resetLayout: () => void
  // --- category sections + grid mode ---
  categories: string[]
  panels: PanelDescriptor[]
  isGrid: boolean
  gridRows: number[]
  rowSplits: number[]
  setRowSplits: (next: number[]) => void
  colSplits: number[][]
  setColSplits: (next: number[][]) => void
  addCategory: (value: string) => void
  removeCategory: (value: string) => void
  selectGridArrangement: (rows: number[]) => void
  swapPanels: (fromKey: string, toKey: string) => void
}

/**
 * Owns the panel layout for a News Summary page.
 *
 * With only the three sentiment panels this behaves as before (auto/custom, five
 * resizable arrangements). When up to three category sections are added it switches
 * to a resizable grid (2×2, 2+3, 3×3) with the category panels placed on top.
 */
export function useNewsLayout(storageKey: string, dominant: SentimentKey): UseNewsLayoutResult {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("auto")
  const [layoutType, setLayoutType] = useState<LayoutType>("left-big")
  const [slots, setSlots] = useState<SentimentSlots>(["bullish", "bearish", "neutral"])
  const [primarySplit, setPrimarySplit] = useState(56)
  const [secondarySplit, setSecondarySplit] = useState(50)

  const [categories, setCategories] = useState<string[]>([])
  const [gridRows, setGridRows] = useState<number[]>([])
  const [gridOrder, setGridOrder] = useState<string[]>([])
  const [rowSplits, setRowSplits] = useState<number[]>([])
  const [colSplits, setColSplits] = useState<number[][]>([])

  // Load a previously persisted custom layout on mount.
  useEffect(() => {
    const parsed = readJson<Partial<StoredLayout>>(sessionStorage, storageKey)
    if (!parsed || parsed.mode !== "custom") return

    setLayoutMode("custom")
    if (parsed.layoutType) setLayoutType(parsed.layoutType)
    if (Array.isArray(parsed.slots) && parsed.slots.length === 3) {
      setSlots(parsed.slots as SentimentSlots)
    }
    if (typeof parsed.primarySplit === "number") setPrimarySplit(parsed.primarySplit)
    if (typeof parsed.secondarySplit === "number") setSecondarySplit(parsed.secondarySplit)

    const cats = Array.isArray(parsed.categories)
      ? parsed.categories.filter((c): c is string => typeof c === "string").slice(0, MAX_CATEGORY_SECTIONS)
      : []
    if (cats.length > 0) {
      const count = 3 + cats.length
      const rows =
        Array.isArray(parsed.gridRows) && parsed.gridRows.reduce((s, n) => s + n, 0) === count
          ? parsed.gridRows
          : defaultGridRows(count)
      const defaults = defaultGridSplits(rows)
      const sentimentOrder =
        Array.isArray(parsed.slots) && parsed.slots.length === 3
          ? (parsed.slots as SentimentSlots)
          : (["bullish", "bearish", "neutral"] as SentimentSlots)
      const defaultOrder = [...cats.map((v) => `cat:${v}`), ...sentimentOrder]
      const storedOrder = parsed.gridOrder
      const order =
        Array.isArray(storedOrder) &&
        storedOrder.length === defaultOrder.length &&
        defaultOrder.every((k) => storedOrder.includes(k))
          ? storedOrder
          : defaultOrder
      setCategories(cats)
      setGridRows(rows)
      setGridOrder(order)
      setRowSplits(
        Array.isArray(parsed.rowSplits) && parsed.rowSplits.length === rows.length
          ? parsed.rowSplits
          : defaults.rowSplits,
      )
      setColSplits(
        Array.isArray(parsed.colSplits) && parsed.colSplits.length === rows.length
          ? parsed.colSplits
          : defaults.colSplits,
      )
    }
  }, [storageKey])

  // Persist the custom layout, or clear it when reverting to automatic.
  useEffect(() => {
    if (layoutMode !== "custom") {
      removeKey(sessionStorage, storageKey)
      return
    }
    const payload: StoredLayout = {
      mode: "custom",
      layoutType,
      slots,
      primarySplit,
      secondarySplit,
      categories,
      gridRows,
      gridOrder,
      rowSplits,
      colSplits,
    }
    writeJson(sessionStorage, storageKey, payload)
  }, [storageKey, layoutMode, layoutType, slots, primarySplit, secondarySplit, categories, gridRows, gridOrder, rowSplits, colSplits])

  const auto = autoLayout(dominant)
  const effectiveLayoutType: LayoutType = layoutMode === "custom" ? layoutType : auto.layoutType
  const effectiveSlots: SentimentSlots = layoutMode === "custom" ? slots : auto.slots

  const isGrid = categories.length > 0
  const panels: PanelDescriptor[] = isGrid
    ? gridOrder.map(panelFromKey)
    : effectiveSlots.map((key) => ({ kind: "sentiment", key }) as PanelDescriptor)

  const buildGridOrder = (cats: string[]) => [...cats.map((v) => `cat:${v}`), ...slots]

  const applyGridForCount = (count: number) => {
    const rows = defaultGridRows(count)
    const defaults = defaultGridSplits(rows)
    setGridRows(rows)
    setRowSplits(defaults.rowSplits)
    setColSplits(defaults.colSplits)
  }

  const selectLayout = (next: LayoutType) => {
    setLayoutMode("custom")
    setLayoutType(next)
    const d = defaultSplits(next)
    setPrimarySplit(d.primary)
    setSecondarySplit(d.secondary)
  }

  const setSlot = (index: number, key: SentimentKey) => {
    setLayoutMode("custom")
    setSlots((prev) => {
      const current = prev[index]
      const next = [...prev] as SentimentSlots
      const otherIndex = next.findIndex((k, i) => i !== index && k === key)
      next[index] = key
      if (otherIndex !== -1) next[otherIndex] = current
      return next
    })
  }

  const addCategory = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    if (categories.includes(trimmed) || categories.length >= MAX_CATEGORY_SECTIONS) return
    const nextCategories = [...categories, trimmed]
    setLayoutMode("custom")
    setCategories(nextCategories)
    setGridOrder(buildGridOrder(nextCategories))
    applyGridForCount(3 + nextCategories.length)
  }

  const removeCategory = (value: string) => {
    if (!categories.includes(value)) return
    const nextCategories = categories.filter((c) => c !== value)
    setCategories(nextCategories)
    if (nextCategories.length > 0) {
      setGridOrder(buildGridOrder(nextCategories))
      applyGridForCount(3 + nextCategories.length)
    } else {
      setGridRows([])
      setGridOrder([])
      setRowSplits([])
      setColSplits([])
    }
  }

  const selectGridArrangement = (rows: number[]) => {
    setLayoutMode("custom")
    setGridRows(rows)
    const defaults = defaultGridSplits(rows)
    setRowSplits(defaults.rowSplits)
    setColSplits(defaults.colSplits)
  }

  const swapPanels = (fromKey: string, toKey: string) => {
    if (fromKey === toKey) return
    setLayoutMode("custom")
    if (isGrid) {
      setGridOrder((prev) => {
        const i = prev.indexOf(fromKey)
        const j = prev.indexOf(toKey)
        if (i < 0 || j < 0) return prev
        const next = [...prev]
        ;[next[i], next[j]] = [next[j], next[i]]
        return next
      })
    } else {
      setSlots((prev) => {
        const i = prev.indexOf(fromKey as SentimentKey)
        const j = prev.indexOf(toKey as SentimentKey)
        if (i < 0 || j < 0) return prev
        const next = [...prev] as SentimentSlots
        ;[next[i], next[j]] = [next[j], next[i]]
        return next
      })
    }
  }

  const resetLayout = () => {
    setLayoutMode("auto")
    setCategories([])
    setGridRows([])
    setGridOrder([])
    setRowSplits([])
    setColSplits([])
    const d = defaultSplits(auto.layoutType)
    setPrimarySplit(d.primary)
    setSecondarySplit(d.secondary)
  }

  return {
    layoutMode,
    effectiveLayoutType,
    effectiveSlots,
    primarySplit,
    setPrimarySplit,
    secondarySplit,
    setSecondarySplit,
    selectLayout,
    setSlot,
    resetLayout,
    categories,
    panels,
    isGrid,
    gridRows,
    rowSplits,
    setRowSplits,
    colSplits,
    setColSplits,
    addCategory,
    removeCategory,
    selectGridArrangement,
    swapPanels,
  }
}
