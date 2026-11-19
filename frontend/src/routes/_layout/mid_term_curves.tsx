import { createFileRoute } from "@tanstack/react-router"

import { MidTermCurvesPage } from "@/features/mid_term_curves/pages/MidTermCurvesPage"

export const Route = createFileRoute("/_layout/mid_term_curves")({
  component: MidTermCurvesPage,
  head: () => ({
    meta: [{ title: "Mid-term Curve Builder - LNG Trading App" }],
  }),
})
