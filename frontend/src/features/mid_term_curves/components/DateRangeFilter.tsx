import { Input } from "@/components/ui/input"
import type { CurveDateRange } from "@/features/mid_term_curves/hooks/useCurveDateRange"

export function DateRangeFilter({
  fromDate,
  toDate,
  minDate,
  setFromDate,
  setToDate,
}: CurveDateRange) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 text-xs">
        <label htmlFor="mid-term-curves-from-date">From</label>
        <Input
          id="mid-term-curves-from-date"
          type="date"
          className="h-8 w-36 text-xs"
          value={fromDate}
          min={minDate || undefined}
          onChange={(event) => setFromDate(event.target.value)}
        />
      </div>
      <div className="flex items-center gap-2 text-xs">
        <label htmlFor="mid-term-curves-to-date">To</label>
        <Input
          id="mid-term-curves-to-date"
          type="date"
          className="h-8 w-36 text-xs"
          value={toDate}
          min={minDate || undefined}
          onChange={(event) => setToDate(event.target.value)}
        />
      </div>
    </div>
  )
}
