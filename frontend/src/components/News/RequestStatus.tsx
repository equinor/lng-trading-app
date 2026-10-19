import { Loader2 } from "lucide-react"

export function RequestStatus({ children }: { children: React.ReactNode }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
      {children}
    </span>
  )
}
