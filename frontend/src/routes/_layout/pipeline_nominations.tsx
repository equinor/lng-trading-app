import { createFileRoute } from "@tanstack/react-router"

import { PipelineNominationsPage } from "@/features/pipeline_nominations/pages/PipelineNominationsPage"

export const Route = createFileRoute("/_layout/pipeline_nominations")({
  component: PipelineNominationsPage,
  head: () => ({
    meta: [{ title: "Pipeline Nominations - LNG Trading App" }],
  }),
})
