import { createFileRoute, redirect } from "@tanstack/react-router"

// Legacy URL: the condensed summary is now the default News tab.
export const Route = createFileRoute("/_layout/news_summary_condensed")({
  beforeLoad: () => {
    throw redirect({ to: "/news", replace: true })
  },
})
