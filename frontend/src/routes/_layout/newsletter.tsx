import { createFileRoute, redirect } from "@tanstack/react-router"

// Legacy URL: the newsletter now lives as a tab under /news.
export const Route = createFileRoute("/_layout/newsletter")({
  beforeLoad: () => {
    throw redirect({ to: "/news/newsletter", replace: true })
  },
})
