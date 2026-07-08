// frontend/src/components/News/LayoutSettingsButton.tsx
import { useState } from "react"
import { LayoutGrid, Plus, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
import {
  categoryTitle,
  gridArrangementsFor,
  LAYOUT_OPTIONS,
  MAX_CATEGORY_SECTIONS,
  type LayoutType,
  type SentimentKey,
  type SentimentSlots,
} from "@/services/news/news_layout"

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

function GridArrangementIcon({ rows }: { rows: number[] }) {
  const cell = "rounded-sm bg-current/70"
  let offset = 0
  return (
    <div className="flex h-7 w-10 flex-col gap-0.5">
      {rows.map((cols) => {
        const rowStart = offset
        const cellIds = Array.from({ length: cols }, (_, c) => rowStart + c)
        offset += cols
        return (
          <div key={`row-${rowStart}`} className="flex flex-1 gap-0.5">
            {cellIds.map((id) => (
              <div key={`cell-${id}`} className={`${cell} flex-1`} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function sameRows(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

export function LayoutSettingsButton(props: {
  layoutType: LayoutType
  slots: SentimentSlots
  isCustom: boolean
  onSelectLayout: (layoutType: LayoutType) => void
  onSetSlot: (index: number, key: SentimentKey) => void
  onReset: () => void
  availableCategories: string[]
  categories: string[]
  onAddCategory: (value: string) => void
  onRemoveCategory: (value: string) => void
  isGrid: boolean
  gridRows: number[]
  onSelectGridArrangement: (rows: number[]) => void
}) {
  const [open, setOpen] = useState(false)
  const isColumns = props.layoutType === "columns"
  const slotLabels = isColumns
    ? ["Left column", "Middle column", "Right column"]
    : ["Large panel", "Small panel 1", "Small panel 2"]
  const sentiments: SentimentKey[] = ["bullish", "bearish", "neutral"]

  const sectionCount = 3 + props.categories.length
  const gridArrangements = gridArrangementsFor(sectionCount)
  const addableCategories = props.availableCategories.filter((c) => !props.categories.includes(c))
  const atMax = props.categories.length >= MAX_CATEGORY_SECTIONS

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
            Arrange the sentiment panels and optionally add up to {MAX_CATEGORY_SECTIONS} category sections on top.
            Drag any panel by its grip handle to rearrange it.
            {props.isCustom
              ? " Your selection is saved on this device."
              : " Currently following the automatic (dominant sentiment) layout."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <p className="mb-2 text-sm font-medium">
              Category sections
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                ({props.categories.length}/{MAX_CATEGORY_SECTIONS})
              </span>
            </p>
            {props.categories.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {props.categories.map((value) => (
                  <Badge key={`sel-${value}`} variant="secondary" className="gap-1 pr-1">
                    {categoryTitle(value)}
                    <button
                      type="button"
                      aria-label={`Remove ${categoryTitle(value)}`}
                      className="ml-0.5 rounded-full px-0.5 hover:bg-muted-foreground/20"
                      onClick={() => props.onRemoveCategory(value)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            {addableCategories.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {props.availableCategories.length === 0
                  ? "No categories found on favourited articles."
                  : "All available categories added."}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {addableCategories.map((value) => (
                  <Button
                    key={`add-${value}`}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1"
                    disabled={atMax}
                    onClick={() => props.onAddCategory(value)}
                  >
                    <Plus className="h-3 w-3" />
                    {categoryTitle(value)}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Arrangement</p>
            {props.isGrid ? (
              <div className="grid grid-cols-5 gap-2">
                {gridArrangements.map((rows) => {
                  const active = sameRows(props.gridRows, rows)
                  return (
                    <button
                      key={`grid-${rows.join("-")}`}
                      type="button"
                      aria-label={`Grid ${rows.join("+")}`}
                      title={`Grid ${rows.join("+")}`}
                      onClick={() => props.onSelectGridArrangement(rows)}
                      className={`flex items-center justify-center rounded-md border p-2 ${active ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground hover:bg-muted"}`}
                    >
                      <GridArrangementIcon rows={rows} />
                    </button>
                  )
                })}
              </div>
            ) : (
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
            )}
          </div>

          {!props.isGrid && (
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
          )}
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
