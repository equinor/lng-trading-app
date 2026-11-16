import { useQuery } from "@tanstack/react-query"
import { RefreshCw, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { LoadingButton } from "@/components/ui/loading-button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  createAiOverview,
  type Source,
} from "@/features/pipeline_nominations/api"

type Props = {
  source: Source
  /** Selected facility::pipeline tokens; empty means everything. */
  selected: string[]
}

const ONE_HOUR = 60 * 60_000
// Ticking several filter boxes in a row should make one model call, not one per click.
const FILTER_SETTLE_MS = 1000

/** The model writes "- " bullet lines after a headline; anything else is shown as a paragraph. */
function Overview({ text }: { text: string }) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  const isBullet = (line: string) => line.startsWith("- ")
  return (
    <div className="flex flex-col gap-2 text-sm">
      {lines
        .filter((line) => !isBullet(line))
        .map((line) => (
          <p key={line} className="font-medium">
            {line}
          </p>
        ))}
      <ul className="flex list-disc flex-col gap-1.5 pl-5">
        {lines.filter(isBullet).map((line) => (
          <li key={line}>{line.slice(2)}</li>
        ))}
      </ul>
    </div>
  )
}

/**
 * A model-written summary of the data in the current view. It is generated when the page loads
 * and again, once the filter settles, when the source or filter changes. The server caches each
 * summary for an hour, and Regenerate skips that cache.
 */
export function AiOverview({ source, selected }: Props) {
  const filterKey = selected.join("|")
  const [settled, setSettled] = useState({ source, key: filterKey })
  // After a source change the filter is already reset, so it is used straight away.
  const active = settled.source === source ? settled.key : filterKey
  const scope = `${source}|${active}`
  // Regenerate clicks for one scope; a non-zero count asks the server to skip its cache.
  const [forced, setForced] = useState({ scope: "", count: 0 })
  const refreshes = forced.scope === scope ? forced.count : 0

  useEffect(() => {
    const timer = setTimeout(
      () => setSettled({ source, key: filterKey }),
      FILTER_SETTLE_MS,
    )
    return () => clearTimeout(timer)
  }, [source, filterKey])

  const query = useQuery({
    queryKey: [
      "pipeline_nominations",
      "ai_overview",
      source,
      active,
      refreshes,
    ],
    queryFn: () =>
      createAiOverview(source, active ? active.split("|") : [], refreshes > 0),
    staleTime: ONE_HOUR,
    retry: false,
    refetchOnWindowFocus: false,
    // Keep the last summary on screen while the next one loads, except across a source change.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === source ? previous : undefined,
  })
  const result = query.data
  const waiting = active !== filterKey

  return (
    <section
      className="rounded-lg border p-4"
      aria-label="AI overview of pipeline nominations"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="size-4" aria-hidden="true" />
            AI overview
          </h2>
          <p className="text-xs text-muted-foreground">
            A written summary of the current view and filters, based only on the
            data on this page.
          </p>
        </div>
        <LoadingButton
          variant="outline"
          size="sm"
          loading={query.isFetching || waiting}
          onClick={() => setForced({ scope, count: refreshes + 1 })}
        >
          <RefreshCw /> Regenerate
        </LoadingButton>
      </div>

      {query.isError && (
        <Alert variant="destructive" className="mt-3">
          <AlertTitle>Could not generate the overview</AlertTitle>
          <AlertDescription>
            The model request failed. Use Regenerate to try again.
          </AlertDescription>
        </Alert>
      )}

      {query.isPending && !query.isError && (
        <output
          className="mt-3 block space-y-2"
          aria-label="Generating overview"
        >
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </output>
      )}

      {result && (
        <div className="mt-3 flex flex-col gap-2">
          <Overview text={result.text} />
          <p className="text-xs text-muted-foreground">
            AI-generated on{" "}
            {new Date(result.generated_at).toLocaleString(undefined, {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            from data to {result.latest_date}. It can make mistakes, so check
            the figures against the table and charts.
          </p>
        </div>
      )}
    </section>
  )
}
