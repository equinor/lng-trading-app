import { Badge } from "@/components/ui/badge"
import type {
  CameraStatus,
  CameraTimeline,
} from "@/features/flare_monitor/api"
import {
  formatAge,
  formatTime,
  LABEL_TEXT,
  STATE_CLASS,
  STATE_LABEL,
  stateText,
  tileClass,
  tileText,
} from "@/features/flare_monitor/utils"

type Props = {
  camera: CameraStatus
  timeline: CameraTimeline | undefined
  hours: number
  now: number
}

export function CameraCard({ camera, timeline, hours, now }: Props) {
  const points = timeline?.points ?? []
  return (
    <article className="flex flex-col gap-3 rounded-lg border p-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">
            {camera.plant ?? `Camera ${camera.camera_id}`}
          </h3>
          <p className="text-xs text-muted-foreground">
            Camera {camera.camera_id}
          </p>
        </div>
        <Badge className={STATE_CLASS[camera.state]}>
          {STATE_LABEL[camera.state]}
        </Badge>
      </header>

      <p className="text-xs text-muted-foreground">
        {stateText(camera)}
        {camera.since ? ` since ${formatTime(camera.since)}` : ""}.
      </p>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Last image</dt>
        <dd>
          {formatTime(camera.last_image_at)} (
          {formatAge(camera.last_image_at, now)})
        </dd>
        <dt className="text-muted-foreground">Latest reading</dt>
        <dd>
          {camera.last_label
            ? camera.last_usable === false
              ? "Obstructed or unusable image"
              : LABEL_TEXT[camera.last_label]
            : "-"}
        </dd>
      </dl>

      <div>
        <div
          className="flex h-6 items-stretch gap-px overflow-hidden rounded"
          role="img"
          aria-label={`Image readings for the last ${hours} hours`}
        >
          {points.length === 0 ? (
            <div className="flex-1 bg-muted" />
          ) : (
            points.map((point) => (
              <div
                key={point.image_ts}
                className={`min-w-px flex-1 ${tileClass(point.label, point.usable)}`}
                title={`${formatTime(point.image_ts)}: ${tileText(point.label, point.usable)}`}
              />
            ))
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Last {hours} hours, oldest on the left. One tile per image.
        </p>
      </div>
    </article>
  )
}
