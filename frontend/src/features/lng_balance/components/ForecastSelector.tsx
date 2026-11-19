import { GitCompareArrows } from "lucide-react"

import { ForecastBadge } from "@/features/lng_balance/components/ForecastBadge"
import { FORECAST_PRESETS, presetDate } from "@/features/lng_balance/utils"
import { cn } from "@/lib/utils"

type Props = {
  /** Every date a forecast was created on, newest first. */
  available: string[]
  /** The forecast the whole page shows; null means the latest. */
  selected: string | null
  onChange: (next: string | null) => void
}

/** Chooses the one forecast that the table, the charts and the main net short line show. */
export function ForecastSelector({ available, selected, onChange }: Props) {
  const latest = available[0] ?? null
  const shown = selected ?? latest
  const oldest = available[available.length - 1]

  const chip = (label: string, date: string | null, title?: string) => {
    // A pick equal to the newest date is the same as "Latest".
    const target = date === latest ? null : date
    const active = target === selected
    return (
      <button
        key={label}
        type="button"
        aria-pressed={active}
        title={title}
        onClick={() => onChange(target)}
        className={cn(
          "rounded-md border px-2.5 py-1 text-xs transition-colors",
          active
            ? "border-primary bg-primary text-primary-foreground"
            : "hover:bg-muted",
        )}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border-2 border-primary/50 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <GitCompareArrows className="size-4" aria-hidden="true" />
          Forecast shown
        </h2>
        <ForecastBadge date={shown} latest={selected === null} />
      </div>
      <p className="text-xs text-muted-foreground">
        The table and both charts show this one forecast. Dates before it are
        actuals, and dates after it are that forecast. To lay several forecasts
        over each other, use Compare on the net short chart.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {chip("Latest", null, latest ?? undefined)}
        {FORECAST_PRESETS.map((preset) => {
          const date = presetDate(available, preset.days)
          return date ? (
            chip(preset.label, date, date)
          ) : (
            <button
              key={preset.label}
              type="button"
              disabled
              title="No forecast that old"
              className="rounded-md border px-2.5 py-1 text-xs opacity-40"
            >
              {preset.label}
            </button>
          )
        })}
        <label className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          or pick a date
          <input
            type="date"
            min={oldest}
            max={latest ?? undefined}
            value={selected ?? ""}
            onChange={(e) => {
              if (!e.target.value) return onChange(null)
              // A forecast exists for every day in range; otherwise the newest earlier one is used.
              const picked = available.find((d) => d <= e.target.value)
              if (picked) onChange(picked === latest ? null : picked)
            }}
            className="rounded-md border bg-background px-1.5 py-0.5 text-xs text-foreground"
          />
        </label>
      </div>
    </div>
  )
}
