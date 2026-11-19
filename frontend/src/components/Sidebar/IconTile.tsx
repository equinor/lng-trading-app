import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export type IconTone = "neutral" | "amber" | "sky" | "teal" | "emerald" | "rose" | "violet" | "indigo"

// Full class names are listed so Tailwind can detect them.
const TONE_CLASSES: Record<IconTone, string> = {
  neutral: "bg-black/10 text-black dark:bg-white/15 dark:text-white",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  sky: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  teal: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  indigo: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
}

export function IconTile({ icon: Icon, tone }: { icon: LucideIcon; tone: IconTone }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md",
        TONE_CLASSES[tone],
      )}
    >
      <Icon className="size-3.5" strokeWidth={2} />
    </span>
  )
}
