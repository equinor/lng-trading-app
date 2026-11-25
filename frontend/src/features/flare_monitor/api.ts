import { apiRequest } from "@/services/api_client"

const BASE = "/api/v1/flare-monitor"

// "unknown" covers obstructed cameras and missing images. It never means off.
export type FlareState = "on" | "off" | "unknown"
// What a single image looked like.
export type FlareLabel = "flare" | "no_flare" | "uncertain"

export type CameraStatus = {
  camera_id: string
  plant: string | null
  state: FlareState
  // No image has arrived recently, so the state is shown as unknown.
  stale: boolean
  since: string | null
  last_image_at: string | null
  last_label: FlareLabel | null
  last_usable: boolean | null
  last_score: number | null
}

export type ObservationPoint = {
  image_ts: string
  label: FlareLabel
  usable: boolean
  score: number | null
}

export type CameraTimeline = { camera_id: string; points: ObservationPoint[] }

export type FlareEvent = {
  camera_id: string
  plant: string | null
  event_ts: string
  previous_state: FlareState
  state: FlareState
  // A real on/off change, as opposed to losing or regaining sight of the flare.
  alert: boolean
  reason: string
}

export type OverviewResponse = {
  hours: number
  cameras: CameraStatus[]
  timelines: CameraTimeline[]
  events: FlareEvent[]
}

export function getOverview(hours: number) {
  return apiRequest<OverviewResponse>(`${BASE}/overview`, {
    query: { hours: String(hours) },
  })
}
