import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { RequestStatus } from "@/components/Common/RequestStatus"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { getOverview } from "@/features/flare_monitor/api"
import { CameraCard } from "@/features/flare_monitor/components/CameraCard"
import {
  eventTitle,
  formatTime,
  STATE_CLASS,
  STATE_LABEL,
} from "@/features/flare_monitor/utils"
import { useEquinorFont } from "@/hooks/useEquinorFont"

const HOURS = 6
const ONE_MINUTE = 60_000

export function FlareMonitorPage() {
  useEquinorFont()

  const query = useQuery({
    queryKey: ["flare_monitor", "overview", HOURS],
    queryFn: () => getOverview(HOURS),
    staleTime: ONE_MINUTE,
    refetchInterval: ONE_MINUTE,
  })

  const data = query.data
  const timelines = useMemo(
    () => new Map((data?.timelines ?? []).map((t) => [t.camera_id, t])),
    [data],
  )
  const now = query.dataUpdatedAt || Date.now()

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">LNG Plant Flare Monitor</h1>
        <p className="text-sm text-muted-foreground">
          Flare status from the WoodMac thermal cameras, classified every few
          minutes. "Not flaring" needs several clear images in a row, because
          one clear image is an observation and not proof the flare is off. An
          obstructed camera or a missing image shows as Unknown, never as Not
          flaring.
        </p>
        {query.isFetching && <RequestStatus>Updating...</RequestStatus>}
      </header>

      {query.isError && (
        <Alert variant="destructive">
          <AlertTitle>Could not load the flare monitor</AlertTitle>
          <AlertDescription>
            Check the backend and Databricks connection, then reload the page.
          </AlertDescription>
        </Alert>
      )}

      {query.isPending && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      )}

      {data && data.cameras.length === 0 && (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">
          No cameras reported yet. Cameras appear here once the collector has
          processed their first image.
        </p>
      )}

      {data && data.cameras.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.cameras.map((camera) => (
            <CameraCard
              key={camera.camera_id}
              camera={camera}
              timeline={timelines.get(camera.camera_id)}
              hours={data.hours}
              now={now}
            />
          ))}
        </div>
      )}

      {data && data.events.length > 0 && (
        <section className="rounded-lg border p-4" aria-label="Recent changes">
          <h2 className="mb-3 text-sm font-semibold">Recent changes</h2>
          <ul className="divide-y text-sm">
            {data.events.map((event) => (
              <li
                key={`${event.camera_id}-${event.event_ts}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
              >
                <span className="w-32 shrink-0 text-xs text-muted-foreground">
                  {formatTime(event.event_ts)}
                </span>
                <span className="font-medium">
                  {event.plant ?? `Camera ${event.camera_id}`}
                </span>
                <Badge className={STATE_CLASS[event.state]}>
                  {STATE_LABEL[event.state]}
                </Badge>
                <span className="text-muted-foreground">
                  {eventTitle(event)}
                  {event.alert ? "" : ` (${event.reason})`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
