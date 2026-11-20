import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react"

import type { ChartZoom } from "@/features/lng_balance/hooks/useChartZoom"
import { cn } from "@/lib/utils"

const BUTTON =
  "inline-flex size-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"

/** Zoom and pan buttons for a chart using `useChartZoom`. */
export function ZoomControls({
  zoom,
  className,
}: {
  zoom: ChartZoom
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button
        type="button"
        className={BUTTON}
        aria-label="Pan back"
        title="Earlier"
        disabled={!zoom.canPanBack}
        onClick={() => zoom.pan(-1)}
      >
        <ChevronLeft className="size-4" />
      </button>
      <button
        type="button"
        className={BUTTON}
        aria-label="Pan forward"
        title="Later"
        disabled={!zoom.canPanForward}
        onClick={() => zoom.pan(1)}
      >
        <ChevronRight className="size-4" />
      </button>
      <button
        type="button"
        className={BUTTON}
        aria-label="Zoom in"
        title="Zoom in"
        disabled={!zoom.canZoomIn}
        onClick={zoom.zoomIn}
      >
        <ZoomIn className="size-4" />
      </button>
      <button
        type="button"
        className={BUTTON}
        aria-label="Zoom out"
        title="Zoom out"
        disabled={!zoom.zoomed}
        onClick={zoom.zoomOut}
      >
        <ZoomOut className="size-4" />
      </button>
      <button
        type="button"
        className={cn(BUTTON, "w-auto gap-1 px-2 text-xs")}
        title="Show the whole period"
        disabled={!zoom.zoomed}
        onClick={zoom.reset}
      >
        <RotateCcw className="size-3.5" />
        Reset
      </button>
    </div>
  )
}
