import { GitCompareArrows, X } from "lucide-react"

import {
  FORECAST_COLORS,
  FORECAST_PRESETS,
  formatDate,
  MAX_COMPARED,
  presetDate,
} from "@/features/lng_balance/utils"
import { cn } from "@/lib/utils"

type Props = {
  /** Every date a forecast was created on, newest first. */
  available: string[]
  /** The forecast dates drawn on the chart, in the order they were added. */
  selected: string[]
  onChange: (next: string[]) => void
}

/** Adds older forecasts to the net short chart, from quick picks or any available date. */
export function ForecastPicker({ available, selected, onChange }: Props) {
  const toggle = (date: string) =>
    onChange(
      selected.includes(date)
        ? selected.filter((d) => d !== date)
        : [...selected, date],
    )
  const full = selected.length >= MAX_COMPARED
  const oldest = available[available.length - 1]
  const newest = available[0]

  return (
    <div className="mb-3 flex flex-col gap-2 rounded-md border-2 border-primary/50 bg-primary/5 p-3">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <GitCompareArrows className="size-4" aria-hidden="true" />
          Compare with other forecasts
        </h3>
        <p className="text-xs text-muted-foreground">
          Add lines for the net short as it was forecast on other dates, to see
          how the short has moved. They are drawn over the forecast shown for
          the page, which is the blue line.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">
          Add the forecast from
        </span>
        {FORECAST_PRESETS.map((preset) => {
          const date = presetDate(available, preset.days)
          const active = date !== null && selected.includes(date)
          return (
            <button
              key={preset.label}
              type="button"
              disabled={date === null || (full && !active)}
              aria-pressed={active}
              title={date ? formatDate(date) : "No forecast that old"}
              onClick={() => date && toggle(date)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs transition-colors disabled:opacity-40",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
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
            max={newest}
            disabled={full}
            // A forecast exists for every day in the range; the newest earlier date is used otherwise.
            onChange={(e) => {
              const picked = available.find((d) => d <= e.target.value)
              if (picked && !selected.includes(picked)) toggle(picked)
              e.target.value = ""
            }}
            className="rounded-md border bg-background px-1.5 py-0.5 text-xs text-foreground disabled:opacity-40"
          />
        </label>
      </div>
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((date, index) => (
            <li
              key={date}
              className="flex items-center gap-1.5 rounded-full border py-0.5 pr-1 pl-2 text-xs"
            >
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full"
                style={{ background: FORECAST_COLORS[index] }}
              />
              {formatDate(date)}
              <button
                type="button"
                aria-label={`Remove forecast from ${formatDate(date)}`}
                onClick={() => toggle(date)}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => onChange([])}
              className="px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
