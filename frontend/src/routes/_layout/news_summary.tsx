import { createFileRoute, redirect } from "@tanstack/react-router"

// Legacy URL: the editable summary now lives as an admin-only tab under /news.
export const Route = createFileRoute("/_layout/news_summary")({
  beforeLoad: () => {
    throw redirect({ to: "/news/summary", replace: true })
  },
})
