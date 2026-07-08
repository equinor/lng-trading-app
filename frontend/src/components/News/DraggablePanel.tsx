// frontend/src/components/News/DraggablePanel.tsx
import { type ReactNode, useState } from "react"
import { GripVertical } from "lucide-react"

const DRAG_MIME = "application/x-news-panel"

/**
 * Wraps a summary panel so it can be reordered by drag-and-drop. Dragging the
 * grip handle picks up the panel; dropping it on another panel asks the parent
 * to swap the two (via `onSwap`). Works for both the sentiment and grid layouts.
 */
export function DraggablePanel(props: {
  panelKey: string
  onSwap: (fromKey: string, toKey: string) => void
  children: ReactNode
}) {
  const { panelKey, onSwap, children } = props
  const [isOver, setIsOver] = useState(false)

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: this is a drop target for panel drag-and-drop; the grip button provides the accessible control
    <div
      className={`relative h-full w-full min-h-0 min-w-0 rounded-lg ${isOver ? "outline-2 outline-primary -outline-offset-2" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_MIME)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = "move"
          setIsOver(true)
        }
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return
        e.preventDefault()
        setIsOver(false)
        const fromKey = e.dataTransfer.getData(DRAG_MIME)
        if (fromKey && fromKey !== panelKey) onSwap(fromKey, panelKey)
      }}
    >
      <button
        type="button"
        aria-label="Drag to reorder panel"
        title="Drag to reorder"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_MIME, panelKey)
          e.dataTransfer.effectAllowed = "move"
        }}
        className="absolute right-1 top-1 z-10 flex h-6 w-6 cursor-grab items-center justify-center rounded bg-background/70 text-muted-foreground opacity-60 hover:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {children}
    </div>
  )
}
