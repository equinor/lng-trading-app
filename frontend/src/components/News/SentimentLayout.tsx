// frontend/src/components/News/SentimentLayout.tsx
import { type ReactNode, useRef } from "react"

import { beginResizeDrag, ResizeHandle } from "@/components/News/ResizeHandle"
import type { LayoutType, SentimentKey, SentimentSlots } from "@/services/news/news_layout"

/**
 * Renders the three sentiment panels in one of five drag-resizable arrangements.
 * The panel content itself is provided by the caller via `renderPanel`, so the
 * full and condensed pages can share this layout while rendering different cards.
 */
export function SentimentLayout(props: {
  layoutType: LayoutType
  slots: SentimentSlots
  primarySplit: number
  setPrimarySplit: (value: number) => void
  secondarySplit: number
  setSecondarySplit: (value: number) => void
  renderPanel: (key: SentimentKey, columns: number) => ReactNode
}) {
  const { layoutType, slots, primarySplit, setPrimarySplit, secondarySplit, setSecondarySplit, renderPanel } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const smallsRef = useRef<HTMLDivElement>(null)

  const panelFor = (key: SentimentKey, columns = 1) => renderPanel(key, columns)

  if (layoutType === "columns") {
    const middleWidth = Math.max(0, secondarySplit - primarySplit)
    return (
      <div ref={containerRef} className="flex items-stretch flex-1 min-h-0">
        <div className="min-w-0 min-h-0" style={{ width: `${primarySplit}%` }}>{panelFor(slots[0])}</div>
        <ResizeHandle
          orientation="vertical"
          onPointerDown={(e) => beginResizeDrag(e, containerRef.current, "x", setPrimarySplit, 15, 70)}
        />
        <div className="min-w-0 min-h-0" style={{ width: `${middleWidth}%` }}>{panelFor(slots[1])}</div>
        <ResizeHandle
          orientation="vertical"
          onPointerDown={(e) => beginResizeDrag(e, containerRef.current, "x", setSecondarySplit, primarySplit + 10, 85)}
        />
        <div className="min-w-0 min-h-0" style={{ width: `${100 - secondarySplit}%` }}>{panelFor(slots[2])}</div>
      </div>
    )
  }

  if (layoutType === "left-big" || layoutType === "right-big") {
    const smalls = (
      <div ref={smallsRef} className="flex flex-col min-w-0 min-h-0" style={{ width: `${100 - primarySplit}%` }}>
        <div className="min-h-0" style={{ height: `${secondarySplit}%` }}>{panelFor(slots[1])}</div>
        <ResizeHandle
          orientation="horizontal"
          onPointerDown={(e) => beginResizeDrag(e, smallsRef.current, "y", setSecondarySplit)}
        />
        <div className="min-h-0" style={{ height: `${100 - secondarySplit}%` }}>{panelFor(slots[2])}</div>
      </div>
    )
    const big = <div className="min-w-0 min-h-0" style={{ width: `${primarySplit}%` }}>{panelFor(slots[0])}</div>
    return (
      <div ref={containerRef} className="flex items-stretch flex-1 min-h-0">
        {layoutType === "left-big" ? (
          <>
            {big}
            <ResizeHandle
              orientation="vertical"
              onPointerDown={(e) => beginResizeDrag(e, containerRef.current, "x", setPrimarySplit)}
            />
            {smalls}
          </>
        ) : (
          <>
            {smalls}
            <ResizeHandle
              orientation="vertical"
              onPointerDown={(e) => beginResizeDrag(e, containerRef.current, "x", (v) => setPrimarySplit(100 - v))}
            />
            {big}
          </>
        )}
      </div>
    )
  }

  const wideSmalls = (
    <div ref={smallsRef} className="flex min-w-0 min-h-0 items-stretch" style={{ height: `${100 - primarySplit}%` }}>
      <div className="min-w-0 min-h-0" style={{ width: `${secondarySplit}%` }}>{panelFor(slots[1])}</div>
      <ResizeHandle
        orientation="vertical"
        onPointerDown={(e) => beginResizeDrag(e, smallsRef.current, "x", setSecondarySplit)}
      />
      <div className="min-w-0 min-h-0" style={{ width: `${100 - secondarySplit}%` }}>{panelFor(slots[2])}</div>
    </div>
  )
  const wideBig = <div className="min-h-0" style={{ height: `${primarySplit}%` }}>{panelFor(slots[0])}</div>
  return (
    <div ref={containerRef} className="flex flex-col flex-1 min-h-0">
      {layoutType === "top-big" ? (
        <>
          {wideBig}
          <ResizeHandle
            orientation="horizontal"
            onPointerDown={(e) => beginResizeDrag(e, containerRef.current, "y", setPrimarySplit)}
          />
          {wideSmalls}
        </>
      ) : (
        <>
          {wideSmalls}
          <ResizeHandle
            orientation="horizontal"
            onPointerDown={(e) => beginResizeDrag(e, containerRef.current, "y", (v) => setPrimarySplit(100 - v))}
          />
          {wideBig}
        </>
      )}
    </div>
  )
}
