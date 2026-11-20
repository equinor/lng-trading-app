import { useEffect, useState } from "react"

type Range = [number, number]

const MIN_POINTS = 3

/** What Recharts passes to its mouse handlers; only the label under the cursor is used. */
type ChartMouse = { activeLabel?: string | number }

/**
 * Zoom for a monthly chart with `length` points. The range is a start and end index into the
 * points; drag across the chart to zoom to that period, or use the buttons to zoom and pan.
 * It resets when the number of points changes, for example when a year is switched on or off.
 */
export function useChartZoom(length: number) {
  const [range, setRange] = useState<Range | null>(null)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragTo, setDragTo] = useState<number | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset whenever the data length changes
  useEffect(() => {
    setRange(null)
    setDragFrom(null)
    setDragTo(null)
  }, [length])

  const last = Math.max(0, length - 1)
  const [start, end] = range ?? [0, last]
  const span = end - start + 1

  const show = (from: number, to: number) => {
    const a = Math.max(0, Math.min(from, to))
    const b = Math.min(last, Math.max(from, to))
    // Showing everything is the same as not being zoomed.
    setRange(a === 0 && b === last ? null : [a, b])
  }

  const zoomIn = () => {
    const next = Math.max(MIN_POINTS, Math.ceil(span / 2))
    if (next >= span) return
    const from = Math.round(start + (span - next) / 2)
    show(from, from + next - 1)
  }

  const zoomOut = () => {
    const next = Math.min(length, span * 2)
    const from = Math.round(start - (next - span) / 2)
    const clamped = Math.max(0, Math.min(from, length - next))
    show(clamped, clamped + next - 1)
  }

  const pan = (direction: -1 | 1) => {
    const step = Math.max(1, Math.round(span / 2)) * direction
    const from = Math.max(0, Math.min(start + step, length - span))
    show(from, from + span - 1)
  }

  /** Mouse handlers for the chart; `labels` are the x values of the points on screen. */
  const handlers = (labels: string[]) => {
    const indexOf = (state: ChartMouse) => {
      const index = labels.indexOf(String(state.activeLabel))
      return index >= 0 ? index : null
    }
    return {
      onMouseDown: (state: ChartMouse) => {
        const index = indexOf(state)
        setDragFrom(index)
        setDragTo(index)
      },
      onMouseMove: (state: ChartMouse) => {
        if (dragFrom === null) return
        const index = indexOf(state)
        if (index !== null) setDragTo(index)
      },
      onMouseUp: () => {
        // A click or a one-point drag is not a zoom.
        if (dragFrom !== null && dragTo !== null && dragFrom !== dragTo) {
          const a = Math.min(dragFrom, dragTo)
          const b = Math.max(dragFrom, dragTo)
          // The indexes are within the zoomed view, so they are shifted back to the full data.
          show(start + a, Math.max(start + b, start + a + MIN_POINTS - 1))
        }
        setDragFrom(null)
        setDragTo(null)
      },
    }
  }

  return {
    start,
    end,
    zoomed: range !== null,
    canZoomIn: span > MIN_POINTS,
    canPanBack: start > 0,
    canPanForward: end < last,
    zoomIn,
    zoomOut,
    pan,
    reset: () => setRange(null),
    /** The span being dragged, as indexes into the visible points. */
    selection:
      dragFrom !== null && dragTo !== null && dragFrom !== dragTo
        ? ([Math.min(dragFrom, dragTo), Math.max(dragFrom, dragTo)] as Range)
        : null,
    handlers,
  }
}

export type ChartZoom = ReturnType<typeof useChartZoom>
