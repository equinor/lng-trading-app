// frontend/src/components/News/ResizeHandle.tsx
import type { PointerEvent as ReactPointerEvent } from "react"

import { clampPercent } from "@/services/news/news_layout"

/**
 * Starts a pointer drag that reports the cursor position within `container`
 * as a percentage along the given axis, clamped to [minPercent, maxPercent].
 */
export function beginResizeDrag(
  event: ReactPointerEvent<HTMLElement>,
  container: HTMLElement | null,
  axis: "x" | "y",
  setPercent: (value: number) => void,
  minPercent = 25,
  maxPercent = 75,
) {
  if (!container) return
  event.preventDefault()

  const rect = container.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return

  const previousUserSelect = document.body.style.userSelect
  const previousCursor = document.body.style.cursor
  document.body.style.userSelect = "none"
  document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize"

  const update = (clientX: number, clientY: number) => {
    const raw = axis === "x"
      ? ((clientX - rect.left) / rect.width) * 100
      : ((clientY - rect.top) / rect.height) * 100
    setPercent(clampPercent(raw, minPercent, maxPercent))
  }

  update(event.clientX, event.clientY)

  const onMove = (moveEvent: PointerEvent) => {
    update(moveEvent.clientX, moveEvent.clientY)
  }

  const onUp = () => {
    window.removeEventListener("pointermove", onMove)
    document.body.style.userSelect = previousUserSelect
    document.body.style.cursor = previousCursor
  }

  window.addEventListener("pointermove", onMove)
  window.addEventListener("pointerup", onUp, { once: true })
}

/**
 * Drags the divider at `index` within a list of cell sizes (percentages summing
 * to 100). Only the two cells adjacent to the divider are resized; their combined
 * size is preserved so the rest of the grid stays fixed.
 */
export function beginArraySplitDrag(
  event: ReactPointerEvent<HTMLElement>,
  container: HTMLElement | null,
  axis: "x" | "y",
  index: number,
  splits: number[],
  setSplits: (next: number[]) => void,
  minPercent = 10,
) {
  if (!container) return
  event.preventDefault()

  const rect = container.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return

  const start = splits.slice(0, index).reduce((sum, v) => sum + v, 0)
  const pairTotal = splits[index] + splits[index + 1]

  const previousUserSelect = document.body.style.userSelect
  const previousCursor = document.body.style.cursor
  document.body.style.userSelect = "none"
  document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize"

  const update = (clientX: number, clientY: number) => {
    const raw = axis === "x"
      ? ((clientX - rect.left) / rect.width) * 100
      : ((clientY - rect.top) / rect.height) * 100
    const first = Math.min(pairTotal - minPercent, Math.max(minPercent, raw - start))
    const next = [...splits]
    next[index] = first
    next[index + 1] = pairTotal - first
    setSplits(next)
  }

  update(event.clientX, event.clientY)

  const onMove = (moveEvent: PointerEvent) => {
    update(moveEvent.clientX, moveEvent.clientY)
  }

  const onUp = () => {
    window.removeEventListener("pointermove", onMove)
    document.body.style.userSelect = previousUserSelect
    document.body.style.cursor = previousCursor
  }

  window.addEventListener("pointermove", onMove)
  window.addEventListener("pointerup", onUp, { once: true })
}

export function ResizeHandle(props: {
  orientation: "vertical" | "horizontal"
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  if (props.orientation === "vertical") {
    return (
      <button
        type="button"
        aria-label="Resize columns"
        onPointerDown={props.onPointerDown}
        className="mx-1 w-1.5 shrink-0 rounded bg-border/80 hover:bg-border cursor-col-resize"
      />
    )
  }

  return (
    <button
      type="button"
      aria-label="Resize rows"
      onPointerDown={props.onPointerDown}
      className="my-1 h-1.5 shrink-0 rounded bg-border/80 hover:bg-border cursor-row-resize"
    />
  )
}
