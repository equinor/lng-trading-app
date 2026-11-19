import { lazy, Suspense, useState } from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AvailableCurvesTab } from "@/features/mid_term_curves/components/AvailableCurvesTab"
import { DateRangeFilter } from "@/features/mid_term_curves/components/DateRangeFilter"
import { ExportButtons } from "@/features/mid_term_curves/components/ExportButtons"
import { CurveDateRangeContext } from "@/features/mid_term_curves/hooks/useCurveDateRange"
import {
  CurveExportContext,
  type TabExporter,
} from "@/features/mid_term_curves/hooks/useCurveExport"
import { useCurvePrices } from "@/features/mid_term_curves/hooks/useMidTermCurves"
import { readString, writeString } from "@/lib/storage"

// Both tabs bring in a lot of code (the chart, the editable table), so they load on first use.
const CurveBuilderTab = lazy(() =>
  import("@/features/mid_term_curves/components/CurveBuilderTab").then(
    (module) => ({
      default: module.CurveBuilderTab,
    }),
  ),
)
const CompareCurvesTab = lazy(() =>
  import("@/features/mid_term_curves/components/CompareCurvesTab").then(
    (module) => ({
      default: module.CompareCurvesTab,
    }),
  ),
)

const ACTIVE_TAB_STORAGE_KEY = "mid-term-curves-active-tab"
const TABS = [
  { value: "curve-builder", label: "Curve builder" },
  { value: "compare-curves", label: "Compare curves" },
  { value: "available", label: "Available curves" },
]
const DEFAULT_FROM_DATE = "2026-01-01"
const DEFAULT_TO_DATE = "2050-12-31"

function readActiveTab() {
  const saved = readString(window.localStorage, ACTIVE_TAB_STORAGE_KEY)
  return TABS.some((tab) => tab.value === saved)
    ? (saved as string)
    : TABS[0].value
}

function TabLoading({ children }: { children: string }) {
  return <p className="p-4 text-sm text-muted-foreground">{children}</p>
}

export function MidTermCurvesPage() {
  const [fromDate, setFromDate] = useState(DEFAULT_FROM_DATE)
  const [toDate, setToDate] = useState(DEFAULT_TO_DATE)
  const [exporter, setExporter] = useState<TabExporter | null>(null)
  const [activeTab, setActiveTab] = useState(readActiveTab)
  const pricesQuery = useCurvePrices()
  const minDate = pricesQuery.data?.[0]?.start_date ?? ""
  const dateRange = { fromDate, toDate, minDate, setFromDate, setToDate }

  return (
    <CurveDateRangeContext.Provider value={dateRange}>
      <CurveExportContext.Provider value={setExporter}>
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            setActiveTab(value)
            writeString(window.localStorage, ACTIVE_TAB_STORAGE_KEY, value)
          }}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <header className="sticky top-0 z-10 flex shrink-0 flex-wrap items-end justify-between gap-2 border-b px-4 py-2">
            <div className="flex flex-col items-start gap-2">
              <h1 className="text-lg font-semibold">Mid-term Curve Builder</h1>
              <TabsList aria-label="Mid-term curve views">
                {TABS.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="text-xs"
                    style={{ fontSize: "12px" }}
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <div className="flex flex-col items-end gap-2">
              <DateRangeFilter {...dateRange} />
              <ExportButtons exporter={exporter} />
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-hidden p-4">
            <div className="mx-auto h-full min-h-0 w-full max-w-none">
              <TabsContent
                value="curve-builder"
                className="m-0 flex h-full min-h-0 flex-col"
              >
                <Suspense
                  fallback={<TabLoading>Loading curve builder...</TabLoading>}
                >
                  <CurveBuilderTab />
                </Suspense>
              </TabsContent>
              <TabsContent
                value="compare-curves"
                className="m-0 flex h-full min-h-0 flex-col"
              >
                <Suspense
                  fallback={
                    <TabLoading>Loading comparison tools...</TabLoading>
                  }
                >
                  <CompareCurvesTab />
                </Suspense>
              </TabsContent>
              <TabsContent
                value="available"
                className="m-0 flex h-full min-h-0 flex-col"
              >
                <AvailableCurvesTab />
              </TabsContent>
            </div>
          </main>
        </Tabs>
      </CurveExportContext.Provider>
    </CurveDateRangeContext.Provider>
  )
}
