import { createFileRoute } from "@tanstack/react-router"

import { FlareMonitorPage } from "@/features/flare_monitor/pages/FlareMonitorPage"

export const Route = createFileRoute("/_layout/flare_monitor")({
  component: FlareMonitorPage,
  head: () => ({
    meta: [{ title: "Flare Monitor - LNG Trading App" }],
  }),
})
