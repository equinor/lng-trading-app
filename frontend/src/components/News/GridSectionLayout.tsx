// frontend/src/components/News/GridSectionLayout.tsx
import { type ReactNode, useRef } from "react"

import { DraggablePanel } from "@/components/News/DraggablePanel"
import { beginArraySplitDrag, ResizeHandle } from "@/components/News/ResizeHandle"
import { type PanelDescriptor, panelKeyOf } from "@/services/news/news_layout"

/**
 * Renders 4–6 panels in a resizable row/column grid (e.g. 2×2, 2+3, 3×3).
 * `rows` gives the number of panels per row; `rowSplits` are the row heights
 * and `colSplits[r]` the column widths within row r (all percentages of 100).
 * Dividers between rows and between columns are drag-resizable.
 */
export function GridSectionLayout(props: {
  panels: PanelDescriptor[]
  rows: number[]
  rowSplits: number[]
  setRowSplits: (next: number[]) => void
  colSplits: number[][]
  setColSplits: (next: number[][]) => void
  onSwap: (fromKey: string, toKey: string) => void
  renderPanel: (panel: PanelDescriptor, columns: number) => ReactNode
}) {
  const { panels, rows, rowSplits, setRowSplits, colSplits, setColSplits, onSwap, renderPanel } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])

  // Walk the flat panel list row by row.
  let cursor = 0

  const setColSplitForRow = (rowIndex: number) => (next: number[]) => {
    const copy = colSplits.map((r) => [...r])
    copy[rowIndex] = next
    setColSplits(copy)
  }

  return (
    <div ref={containerRef} className="flex flex-col flex-1 min-h-0">
      {rows.map((cols, rowIndex) => {
        const start = cursor
        cursor += cols
        const rowPanels = panels.slice(start, start + cols)
        const widths = colSplits[rowIndex] ?? []
        const rowKey = rowPanels.map(panelKeyOf).join("|")

        const rowNode = (
          <div
            key={`row-${rowKey}`}
            ref={(el) => {
              rowRefs.current[rowIndex] = el
            }}
            className="flex items-stretch min-w-0 min-h-0"
            style={{ height: `${rowSplits[rowIndex] ?? 100 / rows.length}%` }}
          >
            {rowPanels.map((panel, colIndex) => (
              <div key={panelKeyOf(panel)} className="contents">
                <div
                  className="min-w-0 min-h-0"
                  style={{ width: `${widths[colIndex] ?? 100 / cols}%` }}
                >
                  <DraggablePanel panelKey={panelKeyOf(panel)} onSwap={onSwap}>
                    {renderPanel(panel, 1)}
                  </DraggablePanel>
                </div>
                {colIndex < rowPanels.length - 1 && (
                  <ResizeHandle
                    orientation="vertical"
                    onPointerDown={(e) =>
                      beginArraySplitDrag(
                        e,
                        rowRefs.current[rowIndex],
                        "x",
                        colIndex,
                        widths,
                        setColSplitForRow(rowIndex),
                      )
                    }
                  />
                )}
              </div>
            ))}
          </div>
        )

        return (
          <div key={`rowgroup-${rowKey}`} className="contents">
            {rowNode}
            {rowIndex < rows.length - 1 && (
              <ResizeHandle
                orientation="horizontal"
                onPointerDown={(e) =>
                  beginArraySplitDrag(e, containerRef.current, "y", rowIndex, rowSplits, setRowSplits)
                }
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
