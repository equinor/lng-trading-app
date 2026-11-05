import { createFileRoute } from "@tanstack/react-router"

import { NewsletterPage } from "@/features/news/pages/NewsletterPage"

export const Route = createFileRoute("/_layout/newsletter")({
  component: NewsletterPage,
  head: () => ({ meta: [{ title: "Newsletter - LNG Trading App" }] }),
})
