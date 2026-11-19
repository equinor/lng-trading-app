import { Clock } from "lucide-react"

import { formatDate } from "@/features/lng_balance/utils"
import { cn } from "@/lib/utils"

/**
 * Says which forecast a figure comes from. The latest forecast is blue; an older one is amber, so
 * it is obvious when the page is not showing the newest numbers.
 */
export function ForecastBadge({
  date,
  latest = true,
  className,
}: {
  date: string | null | undefined
  latest?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        latest
          ? "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400"
          : "border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400",
        className,
      )}
      title={
        latest
          ? "Built from the most recent forecast."
          : "Built from an older forecast: actuals before that date, that forecast after it."
      }
    >
      <Clock className="size-3" aria-hidden="true" />
      {latest ? "Latest forecast" : "Forecast of"}
      {date ? `: ${formatDate(date)}` : ""}
    </span>
  )
}
