import { createFileRoute } from "@tanstack/react-router"

import { NewsPage } from "@/features/news/pages/NewsPage"

export const Route = createFileRoute("/_layout/news")({
  component: NewsPage,
  head: () => ({ meta: [{ title: "News - LNG Trading App" }] }),
})
