import { createFileRoute } from "@tanstack/react-router"

import { LngBalancePage } from "@/features/lng_balance/pages/LngBalancePage"

export const Route = createFileRoute("/_layout/lng_balance")({
  component: LngBalancePage,
  head: () => ({
    meta: [{ title: "LNG Balance - LNG Trading App" }],
  }),
})
