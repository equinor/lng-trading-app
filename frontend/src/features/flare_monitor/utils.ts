import type { CameraStatus, FlareEvent, FlareLabel, FlareState } from "./api"

export const STATE_LABEL: Record<FlareState, string> = {
  on: "Flaring",
  off: "Not flaring",
  unknown: "Unknown",
}

export const STATE_CLASS: Record<FlareState, string> = {
  on: "border-transparent bg-orange-500 text-white",
  off: "border-transparent bg-emerald-600 text-white",
  unknown: "border-transparent bg-amber-100 text-amber-900",
}

export const LABEL_TEXT: Record<FlareLabel, string> = {
  flare: "Flare detected",
  no_flare: "No flare detected",
  uncertain: "Uncertain",
}

// Image tiles in the timeline. Unusable images are unknown, never "no flare".
export function tileClass(label: FlareLabel, usable: boolean): string {
  if (!usable) return "bg-amber-300"
  if (label === "flare") return "bg-orange-500"
  if (label === "no_flare") return "bg-emerald-500"
  return "bg-slate-400"
}

export function tileText(label: FlareLabel, usable: boolean): string {
  return usable ? LABEL_TEXT[label] : "Obstructed or unusable image"
}

export function stateText(camera: CameraStatus): string {
  if (camera.state === "unknown") {
    return "Obstructed, no recent image or not yet confirmed"
  }
  return camera.state === "on" ? "Flare confirmed on" : "Confirmed off"
}

export function eventTitle(event: FlareEvent): string {
  if (event.alert) {
    return event.state === "on" ? "Flare started" : "Flare stopped"
  }
  return event.state === "unknown"
    ? "Lost sight of flare"
    : "Flare state confirmed"
}

export function formatTime(value: string | null): string {
  if (!value) return "-"
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatAge(value: string | null, now: number): string {
  if (!value) return "no image yet"
  const minutes = Math.max(
    0,
    Math.round((now - new Date(value).getTime()) / 60_000),
  )
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${minutes % 60} min ago`
}
