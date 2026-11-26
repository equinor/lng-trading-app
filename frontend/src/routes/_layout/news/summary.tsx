import { createFileRoute, Navigate } from "@tanstack/react-router"

import { NEWS_PATHS } from "@/features/news/pages/NewsPage"
import { NewsSummaryPage } from "@/features/news/pages/NewsSummaryPage"
import useAuth from "@/hooks/useAuth"

/** The editable summary is for group admins only; everyone else lands on the condensed view. */
function AdminNewsSummary() {
  const { user } = useAuth()
  if (!user) return null
  if (!user.is_admin) return <Navigate to={NEWS_PATHS.condensed} replace />
  return <NewsSummaryPage />
}

export const Route = createFileRoute("/_layout/news/summary")({
  component: AdminNewsSummary,
  head: () => ({
    meta: [{ title: "News Summary - LNG Trading App" }],
  }),
})
