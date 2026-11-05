import { createFileRoute } from "@tanstack/react-router"

import { NewsSummaryPage } from "@/features/news/pages/NewsSummaryPage"

export const Route = createFileRoute("/_layout/news_summary")({
  component: NewsSummaryPage,
  head: () => ({
    meta: [{ title: "News Summary - LNG Trading App" }],
  }),
})
