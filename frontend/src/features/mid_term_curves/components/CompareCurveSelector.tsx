import { RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { CurveColorPicker } from "@/features/mid_term_curves/components/CurveColorPicker"
import { CURVE_SECTIONS } from "@/features/mid_term_curves/curves"
import type { useCompareSettings } from "@/features/mid_term_curves/hooks/useCompareSettings"
import type { SavedCurve } from "@/features/mid_term_curves/utils"

type Settings = ReturnType<typeof useCompareSettings>

type Props = {
  settings: Settings
  savedCurves: SavedCurve[]
  savedCurvesLoading: boolean
}

/** Left-hand list of the curves that can be plotted, with a colour for each. */
export function CompareCurveSelector({
  settings,
  savedCurves,
  savedCurvesLoading,
}: Props) {
  const {
    selectedIds,
    selectedCustomIds,
    colorOf,
    toggleCurves,
    toggleCustomCurves,
    setColor,
    resetCurves,
  } = settings
  const savedIds = savedCurves.map((curve) => curve.id)
  const selectedSavedCount = savedIds.filter((id) =>
    selectedCustomIds.has(id),
  ).length

  return (
    <aside className="flex min-h-0 flex-col border-b pb-3 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-3">
      <div className="mb-2 shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={resetCurves}
          title="Restore the default curve selection and colors"
        >
          <RotateCcw aria-hidden="true" />
          Reset curves
        </Button>
      </div>
      <fieldset
        aria-label="Custom Curves"
        className="mb-2 min-w-0 space-y-0 border-b border-border pb-2"
      >
        <div className="flex w-full items-center gap-2 py-0 text-xs font-semibold">
          <Checkbox
            aria-label="Select all Custom Curves"
            checked={
              selectedSavedCount === 0
                ? false
                : selectedSavedCount === savedIds.length
                  ? true
                  : "indeterminate"
            }
            disabled={savedIds.length === 0}
            onCheckedChange={(checked) =>
              toggleCustomCurves(savedIds, checked === true)
            }
          />
          <span>Custom Curves</span>
          <span className="ml-auto font-normal text-muted-foreground">
            {selectedSavedCount}/{savedIds.length}
          </span>
        </div>
        {savedCurvesLoading ? (
          <p className="px-1 py-1 text-xs text-muted-foreground">
            Loading saved curves...
          </p>
        ) : savedCurves.length === 0 ? (
          <p className="px-1 py-1 text-xs text-muted-foreground">
            No saved curves yet.
          </p>
        ) : (
          savedCurves.map((curve) => (
            <CurveRow
              key={curve.id}
              label={curve.name}
              ariaLabel={`Select custom curve ${curve.name}`}
              checked={selectedCustomIds.has(curve.id)}
              color={colorOf(curve.id)}
              onCheckedChange={(checked) =>
                toggleCustomCurves([curve.id], checked)
              }
              onColorChange={(value) => setColor(curve.id, value)}
            />
          ))
        )}
      </fieldset>
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <h2 className="text-sm font-semibold">Standard Curves</h2>
        <span className="text-xs text-muted-foreground">
          {selectedIds.size} selected
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        {CURVE_SECTIONS.map((section, index) => {
          const ids = section.curves.map((curve) => curve.id)
          const selectedInSection = ids.filter((id) =>
            selectedIds.has(id),
          ).length
          return (
            <fieldset
              key={section.id}
              aria-label={section.label}
              className={
                index === 0
                  ? "min-w-0 space-y-0"
                  : "min-w-0 space-y-0 border-t border-border pt-2"
              }
            >
              <div className="flex w-full items-center gap-2 py-0 text-xs font-semibold">
                <Checkbox
                  aria-label={`Select all ${section.label}`}
                  checked={
                    selectedInSection === 0
                      ? false
                      : selectedInSection === ids.length
                        ? true
                        : "indeterminate"
                  }
                  onCheckedChange={(checked) =>
                    toggleCurves(ids, checked === true)
                  }
                />
                <span>{section.label}</span>
                <span className="ml-auto font-normal text-muted-foreground">
                  {selectedInSection}/{ids.length}
                </span>
              </div>
              {section.curves.map((curve) => (
                <CurveRow
                  key={curve.id}
                  label={curve.label}
                  ariaLabel={`Select ${curve.label}`}
                  checked={selectedIds.has(curve.id)}
                  color={colorOf(curve.id, curve.color)}
                  onCheckedChange={(checked) =>
                    toggleCurves([curve.id], checked)
                  }
                  onColorChange={(value) => setColor(curve.id, value)}
                />
              ))}
            </fieldset>
          )
        })}
      </div>
    </aside>
  )
}

function CurveRow({
  label,
  ariaLabel,
  checked,
  color,
  onCheckedChange,
  onColorChange,
}: {
  label: string
  ariaLabel: string
  checked: boolean
  color: string
  onCheckedChange: (checked: boolean) => void
  onColorChange: (color: string) => void
}) {
  return (
    <div className="flex min-h-5 items-center gap-2 rounded-sm px-1 py-0 text-xs hover:bg-muted/60">
      <Checkbox
        aria-label={ariaLabel}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span className="min-w-0 flex-1 leading-tight">{label}</span>
      <CurveColorPicker label={label} color={color} onChange={onColorChange} />
    </div>
  )
}
