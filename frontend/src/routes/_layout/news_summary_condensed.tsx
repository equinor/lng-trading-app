import { createFileRoute } from "@tanstack/react-router"

import { NewsSummaryCondensedPage } from "@/features/news/pages/NewsSummaryCondensedPage"

export const Route = createFileRoute("/_layout/news_summary_condensed")({
  component: NewsSummaryCondensedPage,
  head: () => ({
    meta: [{ title: "News Summary (Condensed) - LNG Trading App" }],
  }),
})
