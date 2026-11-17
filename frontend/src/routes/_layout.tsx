import { lazy, Suspense, useState } from "react"
import { Download } from "lucide-react"
import { toast } from "sonner"
import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"

import { Footer } from "@/components/Common/Footer"
import AppSidebar from "@/components/Sidebar/AppSidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getMidTermCurvePrices } from "@/features/mid_term_curves/api"
import { CurveDateRangeContext } from "@/features/mid_term_curves/dateRange"
import {
  CurveExportContext,
  type TabExporter,
} from "@/features/mid_term_curves/exportContext"
import { downloadCsv, downloadXlsx } from "@/features/mid_term_curves/exportFiles"
import { isLoggedIn } from "@/hooks/useAuth"

const CompareCurves = lazy(() =>
  import("@/features/mid_term_curves/CompareCurves").then((module) => ({
    default: module.CompareCurves,
  })),
)
const CustomCurveBuilder = lazy(() =>
  import("@/features/mid_term_curves/CurveBuilder").then((module) => ({
    default: module.CurveBuilder,
  })),
)
const CurveBuilder = lazy(() =>
  import("@/features/mid_term_curves/CurveBuilder").then((module) => ({
    default: module.CurveBuilder,
  })),
)

export const Route = createFileRoute("/_layout")({
  component: Layout,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({
        to: "/",
      })
    }
  },
})

function Layout() {
  const [fromDate, setFromDate] = useState("2026-01-01")
  const [toDate, setToDate] = useState("2035-12-31")
  const [exporter, setExporter] = useState<TabExporter | null>(null)
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const isNewsSummaryRoute = pathname === "/news_summary" || pathname === "/news_summary_condensed"
  const isCurveBuilderRoute = pathname === "/"
  const isWideRoute = isNewsSummaryRoute || pathname === "/pipeline_nominations" || isCurveBuilderRoute
  const pricesQuery = useQuery({
    queryKey: ["mid_term_curves", "prices"],
    queryFn: getMidTermCurvePrices,
    staleTime: 15 * 60_000,
    enabled: isCurveBuilderRoute,
  })
  const minDate = pricesQuery.data?.[0]?.start_date ?? ""
  const dateRange = { fromDate, toDate, minDate, setFromDate, setToDate }

  const runExport = async (format: "xlsx" | "csv") => {
    const table = exporter?.get()
    if (!table || table.rows.length === 0) {
      toast.info("Nothing to export for the current tab and date range.")
      return
    }
    try {
      if (format === "csv") downloadCsv(table)
      else await downloadXlsx(table)
    } catch {
      toast.error("Export failed.")
    }
  }

  return (
    <SidebarProvider
      className={isCurveBuilderRoute ? "h-svh min-h-0 overflow-hidden" : undefined}
    >
      <AppSidebar />
      <SidebarInset className="min-h-0 min-w-0">
        {isCurveBuilderRoute ? (
          <CurveDateRangeContext.Provider value={dateRange}>
           <CurveExportContext.Provider value={setExporter}>
            <Tabs defaultValue="curve-builder" className="flex min-h-0 flex-1 flex-col gap-0">
              <header className="sticky top-0 z-10 flex shrink-0 flex-wrap items-end justify-between gap-2 border-b px-4 py-2">
                <div className="flex flex-col items-start gap-2">
                  <h1 className="text-lg font-semibold">Mid-term Curve Builder</h1>
                  <TabsList aria-label="Mid-term curve views">
                    <TabsTrigger
                      value="curve-builder"
                      className="text-xs"
                      style={{ fontSize: "12px" }}
                    >
                      Curve builder
                    </TabsTrigger>
                    <TabsTrigger
                      value="compare-curves"
                      className="text-xs"
                      style={{ fontSize: "12px" }}
                    >
                      Compare curves
                    </TabsTrigger>
                    <TabsTrigger
                      value="available"
                      className="text-xs"
                      style={{ fontSize: "12px" }}
                    >
                      Available curves
                    </TabsTrigger>
                  </TabsList>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs">
                      <span>From</span>
                      <Input
                        aria-label="From date"
                        type="date"
                        className="h-8 w-36 text-xs"
                        value={fromDate}
                        min={minDate || undefined}
                        onChange={(event) => setFromDate(event.target.value)}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <span>To</span>
                      <Input
                        aria-label="To date"
                        type="date"
                        className="h-8 w-36 text-xs"
                        value={toDate}
                        min={minDate || undefined}
                        onChange={(event) => setToDate(event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!exporter}
                      onClick={() => runExport("xlsx")}
                    >
                      <Download className="size-3.5" />
                      Excel
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!exporter}
                      onClick={() => runExport("csv")}
                    >
                      <Download className="size-3.5" />
                      CSV
                    </Button>
                  </div>
                </div>
              </header>
              <main className="min-h-0 flex-1 overflow-hidden p-4">
                <div className="mx-auto h-full min-h-0 w-full max-w-none">
                  <TabsContent
                    value="curve-builder"
                    className="m-0 flex h-full min-h-0 flex-col"
                  >
                    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading curve builder...</p>}>
                      <CustomCurveBuilder />
                    </Suspense>
                  </TabsContent>
                  <TabsContent
                    value="compare-curves"
                    className="m-0 flex h-full min-h-0 flex-col"
                  >
                    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading comparison tools...</p>}>
                      <CompareCurves />
                    </Suspense>
                  </TabsContent>
                  <TabsContent
                    value="available"
                    className="m-0 flex h-full min-h-0 flex-col"
                  >
                    <Outlet />
                  </TabsContent>
                </div>
              </main>
            </Tabs>
           </CurveExportContext.Provider>
          </CurveDateRangeContext.Provider>
        ) : (
          <main
            className={`min-h-0 flex-1 ${isNewsSummaryRoute ? "overflow-hidden p-4" : "p-6 md:p-8"}`}
          >
            <div className={`mx-auto h-full min-h-0 w-full ${isWideRoute ? "max-w-none" : "max-w-7xl"}`}>
              <Outlet />
            </div>
          </main>
        )}
        {!isNewsSummaryRoute && !isCurveBuilderRoute && <Footer />}
      </SidebarInset>
    </SidebarProvider>
  )
}

export default Layout
