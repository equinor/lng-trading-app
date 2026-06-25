// frontend/src/components/News/PipelineButton.tsx
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Play, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import useCustomToast from "@/hooks/useCustomToast"
import { getPipelineLastRun, triggerPipeline } from "@/services/news/news_api"

function formatLastRun(iso: string | null): string {
  if (!iso) return "never"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "unknown"
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function PipelineButton({ withRunButton = false }: { withRunButton?: boolean } = {}) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [confirming, setConfirming] = useState(false)

  const lastRunQuery = useQuery({
    queryKey: ["pipeline", "last-run"],
    queryFn: getPipelineLastRun,
    // Don't poll while idle. While a run is in progress, poll until it finishes
    // so the status updates one final time once the job terminates.
    refetchInterval: (query) => {
      const state = query.state.data?.state
      return state === "RUNNING" || state === "PENDING" ? 10_000 : false
    },
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })

  const triggerMutation = useMutation({
    mutationFn: triggerPipeline,
    onSuccess: () => {
      showSuccessToast("Pipeline run started.")
      queryClient.invalidateQueries({ queryKey: ["pipeline", "last-run"] })
    },
    onError: () => {
      showErrorToast("Failed to start the pipeline.")
    },
    onSettled: () => {
      setConfirming(false)
    },
  })

  const lastRun = lastRunQuery.data
  const isRunning = lastRun?.state === "RUNNING" || lastRun?.state === "PENDING"
  const lastRunLabel = formatLastRun(lastRun?.start_time ?? null)

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        Updated as of: <span className="font-medium text-foreground">{lastRunLabel}</span>
        {isRunning ? " (running…)" : ""}
      </span>
      {withRunButton ? (
        <Button
          type="button"
          variant={confirming ? "destructive" : "outline"}
          size="sm"
          className="h-9 gap-1.5"
          disabled={triggerMutation.isPending || isRunning}
          onClick={() => {
            if (confirming) {
              triggerMutation.mutate()
            } else {
              setConfirming(true)
            }
          }}
          onBlur={() => setConfirming(false)}
        >
          {triggerMutation.isPending ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {confirming ? "Confirm run" : "Run pipeline"}
        </Button>
      ) : null}
    </div>
  )
}
