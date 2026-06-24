// frontend/src/components/News/LayoutSettingsButton.tsx
import { useState } from "react"
import { LayoutGrid } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { LAYOUT_OPTIONS, type LayoutType, type SentimentKey, type SentimentSlots } from "@/services/news/news_layout"

function LayoutIcon({ type }: { type: LayoutType }) {
  const cell = "rounded-sm bg-current/70"
  if (type === "left-big") {
    return (
      <div className="flex h-7 w-10 gap-0.5">
        <div className={`${cell} flex-[1.4]`} />
        <div className="flex flex-1 flex-col gap-0.5">
          <div className={`${cell} flex-1`} />
          <div className={`${cell} flex-1`} />
        </div>
      </div>
    )
  }
  if (type === "right-big") {
    return (
      <div className="flex h-7 w-10 gap-0.5">
        <div className="flex flex-1 flex-col gap-0.5">
          <div className={`${cell} flex-1`} />
          <div className={`${cell} flex-1`} />
        </div>
        <div className={`${cell} flex-[1.4]`} />
      </div>
    )
  }
  if (type === "top-big") {
    return (
      <div className="flex h-7 w-10 flex-col gap-0.5">
        <div className={`${cell} flex-[1.4]`} />
        <div className="flex flex-1 gap-0.5">
          <div className={`${cell} flex-1`} />
          <div className={`${cell} flex-1`} />
        </div>
      </div>
    )
  }
  if (type === "bottom-big") {
    return (
      <div className="flex h-7 w-10 flex-col gap-0.5">
        <div className="flex flex-1 gap-0.5">
          <div className={`${cell} flex-1`} />
          <div className={`${cell} flex-1`} />
        </div>
        <div className={`${cell} flex-[1.4]`} />
      </div>
    )
  }
  return (
    <div className="flex h-7 w-10 gap-0.5">
      <div className={`${cell} flex-1`} />
      <div className={`${cell} flex-1`} />
      <div className={`${cell} flex-1`} />
    </div>
  )
}

export function LayoutSettingsButton(props: {
  layoutType: LayoutType
  slots: SentimentSlots
  isCustom: boolean
  onSelectLayout: (layoutType: LayoutType) => void
  onSetSlot: (index: number, key: SentimentKey) => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  const isColumns = props.layoutType === "columns"
  const slotLabels = isColumns
    ? ["Left column", "Middle column", "Right column"]
    : ["Large panel", "Small panel 1", "Small panel 2"]
  const sentiments: SentimentKey[] = ["bullish", "bearish", "neutral"]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5">
          <LayoutGrid className="h-3.5 w-3.5" />
          Layout
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Customise layout</DialogTitle>
          <DialogDescription>
            Choose how the sentiment panels are arranged and which sentiment appears in each position.
            {props.isCustom
              ? " Your selection is saved on this device."
              : " Currently following the automatic (dominant sentiment) layout."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <p className="mb-2 text-sm font-medium">Arrangement</p>
            <div className="grid grid-cols-5 gap-2">
              {LAYOUT_OPTIONS.map((opt) => {
                const active = props.layoutType === opt.type
                return (
                  <button
                    key={opt.type}
                    type="button"
                    aria-label={opt.label}
                    title={opt.label}
                    onClick={() => props.onSelectLayout(opt.type)}
                    className={`flex items-center justify-center rounded-md border p-2 ${active ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground hover:bg-muted"}`}
                  >
                    <LayoutIcon type={opt.type} />
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Panel assignment</p>
            <div className="space-y-2">
              {slotLabels.map((label, index) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <div className="flex gap-1">
                    {sentiments.map((key) => {
                      const active = props.slots[index] === key
                      return (
                        <Button
                          key={key}
                          type="button"
                          size="sm"
                          variant={active ? "default" : "outline"}
                          className="h-8 capitalize"
                          onClick={() => props.onSetSlot(index, key)}
                        >
                          {key}
                        </Button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => props.onReset()}>
            Reset to automatic
          </Button>
          <Button type="button" onClick={() => setOpen(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
