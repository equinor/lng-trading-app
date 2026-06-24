// frontend/src/hooks/useNewsLayout.ts
import { useEffect, useState } from "react"

import { readJson, removeKey, writeJson } from "@/lib/storage"
import {
  autoLayout,
  defaultSplits,
  type LayoutMode,
  type LayoutType,
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
}

/**
 * Owns the sentiment-panel layout for a News Summary page.
 *
 * Behaviour:
 * - Defaults to "auto" mode, deriving the arrangement from the dominant sentiment.
 * - Once the user customises the arrangement or panel assignment it switches to
 *   "custom" mode and is persisted to localStorage under `storageKey`.
 * - Reverting to automatic clears the persisted value.
 */
export function useNewsLayout(storageKey: string, dominant: SentimentKey): UseNewsLayoutResult {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("auto")
  const [layoutType, setLayoutType] = useState<LayoutType>("left-big")
  const [slots, setSlots] = useState<SentimentSlots>(["bullish", "bearish", "neutral"])
  const [primarySplit, setPrimarySplit] = useState(56)
  const [secondarySplit, setSecondarySplit] = useState(50)

  // Load a previously persisted custom layout on mount.
  useEffect(() => {
    const parsed = readJson<Partial<StoredLayout>>(localStorage, storageKey)
    if (!parsed || parsed.mode !== "custom") return

    setLayoutMode("custom")
    if (parsed.layoutType) setLayoutType(parsed.layoutType)
    if (Array.isArray(parsed.slots) && parsed.slots.length === 3) {
      setSlots(parsed.slots as SentimentSlots)
    }
    if (typeof parsed.primarySplit === "number") setPrimarySplit(parsed.primarySplit)
    if (typeof parsed.secondarySplit === "number") setSecondarySplit(parsed.secondarySplit)
  }, [storageKey])

  // Persist the custom layout, or clear it when reverting to automatic.
  useEffect(() => {
    if (layoutMode !== "custom") {
      removeKey(localStorage, storageKey)
      return
    }
    const payload: StoredLayout = { mode: "custom", layoutType, slots, primarySplit, secondarySplit }
    writeJson(localStorage, storageKey, payload)
  }, [storageKey, layoutMode, layoutType, slots, primarySplit, secondarySplit])

  const auto = autoLayout(dominant)
  const effectiveLayoutType: LayoutType = layoutMode === "custom" ? layoutType : auto.layoutType
  const effectiveSlots: SentimentSlots = layoutMode === "custom" ? slots : auto.slots

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

  const resetLayout = () => {
    setLayoutMode("auto")
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
  }
}
