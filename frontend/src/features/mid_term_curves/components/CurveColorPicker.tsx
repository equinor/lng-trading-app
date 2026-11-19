import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PALETTE_COLORS } from "@/features/mid_term_curves/palette"

export function CurveColorPicker({
  label,
  color,
  onChange,
}: {
  label: string
  color: string
  onChange: (value: string) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Color for ${label}`}
          title={`Set ${label} line color`}
          className="size-4 shrink-0 cursor-pointer rounded-sm border border-border"
          style={{ backgroundColor: color }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto p-2">
        <div className="grid grid-cols-8 gap-1">
          {PALETTE_COLORS.map((swatch) => (
            <DropdownMenuItem
              key={swatch.value}
              aria-label={swatch.name}
              title={swatch.name}
              onSelect={() => onChange(swatch.value)}
              className="size-5 min-h-0 rounded-sm border border-border p-0 data-[highlighted]:ring-2 data-[highlighted]:ring-ring"
              style={{ backgroundColor: swatch.value }}
            />
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
