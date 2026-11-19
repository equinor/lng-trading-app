import { RefreshCw } from "lucide-react"

import { RequestStatus } from "@/components/Common/RequestStatus"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  CURVE_SECTIONS,
  type CurveSection,
  type SectionId,
  TABLE_SECTION_ORDER,
} from "@/features/mid_term_curves/curves"
import { useCurveDateRange } from "@/features/mid_term_curves/hooks/useCurveDateRange"
import { useRegisterExport } from "@/features/mid_term_curves/hooks/useCurveExport"
import {
  useCurvePrices,
  useRefreshCurvePrices,
} from "@/features/mid_term_curves/hooks/useMidTermCurves"
import {
  CURRENCY_FORMAT,
  PRICE_FORMAT,
  rowsInRange,
} from "@/features/mid_term_curves/utils"

type SectionStyle = {
  /** Header colours of the section. */
  tone: string
  /** Width of each column. */
  width: string
  /** What a month without a value shows. */
  empty: string
  /** A divider after the last column, or after every n-th one. */
  divider?: "last" | number
}

const NARROW = "min-w-[68px]"
const SECTION_STYLE: Record<SectionId, SectionStyle> = {
  ice: {
    tone: "bg-sky-100 text-sky-950 dark:bg-sky-950 dark:text-sky-100",
    width: NARROW,
    empty: "--",
    divider: "last",
  },
  epa: {
    tone: "bg-blue-100 text-blue-950 dark:bg-blue-950 dark:text-blue-100",
    width: NARROW,
    empty: "--",
    divider: "last",
  },
  "epa-oil": {
    tone: "bg-indigo-100 text-indigo-950 dark:bg-indigo-950 dark:text-indigo-100",
    width: NARROW,
    empty: "--",
    divider: "last",
  },
  "oil-switching": {
    tone: "bg-rose-100 text-rose-950 dark:bg-rose-950 dark:text-rose-100",
    width: NARROW,
    empty: "",
    divider: "last",
  },
  custom: {
    tone: "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100",
    width: "min-w-[84px] max-w-[110px]",
    empty: "",
  },
  arbitrage: {
    tone: "bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100",
    width: "min-w-[90px] max-w-[120px]",
    empty: "",
  },
  chartering: {
    tone: "bg-cyan-100 text-cyan-950 dark:bg-cyan-950 dark:text-cyan-100",
    width: "min-w-[82px] max-w-[108px]",
    empty: "",
    divider: "last",
  },
  freight: {
    tone: "bg-blue-100 text-blue-950 dark:bg-blue-950 dark:text-blue-100",
    width: "min-w-[82px] max-w-[108px]",
    empty: "",
    divider: 3,
  },
}

const DIVIDER = "border-r border-border"

function hasDivider(style: SectionStyle, index: number, count: number) {
  if (style.divider === "last") return index === count - 1
  return typeof style.divider === "number" && (index + 1) % style.divider === 0
}

const TABLE_SECTIONS = TABLE_SECTION_ORDER.map(
  (id) => CURVE_SECTIONS.find((section) => section.id === id) as CurveSection,
)
const TABLE_CURVES = TABLE_SECTIONS.flatMap((section) =>
  section.curves.map((curve) => ({ section, curve })),
)

/** Every curve, month by month. */
export function AvailableCurvesTab() {
  const pricesQuery = useCurvePrices()
  const refreshPrices = useRefreshCurvePrices()
  const { fromDate, toDate } = useCurveDateRange()
  const prices = pricesQuery.data
  const rows = prices ? rowsInRange(prices, fromDate, toDate) : undefined
  const updating = pricesQuery.isFetching || refreshPrices.isPending

  useRegisterExport(() => {
    if (!rows) return null
    return {
      fileName: `available_curves_${fromDate}_${toDate}`,
      sheetName: "Available curves",
      headers: [
        "Start date",
        ...TABLE_CURVES.map(
          ({ section, curve }) => `${section.label} - ${curve.label}`,
        ),
      ],
      rows: rows.map((row) => [
        row.start_date,
        ...TABLE_CURVES.map(({ curve }) => curve.value(row)),
      ]),
    }
  })

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-end gap-3">
        {updating && prices && <RequestStatus>Updating...</RequestStatus>}
        <Button
          variant="outline"
          size="icon"
          aria-label="Refresh curve prices"
          title="Refresh curve prices"
          disabled={updating}
          onClick={() => refreshPrices.mutate()}
        >
          <RefreshCw aria-hidden="true" />
        </Button>
      </div>

      {(pricesQuery.isError || refreshPrices.isError) && (
        <Alert variant="destructive">
          <AlertTitle>Could not load curve prices</AlertTitle>
          <AlertDescription>
            Check the backend and Databricks connection, then refresh.
          </AlertDescription>
        </Alert>
      )}

      {pricesQuery.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      ) : rows && rows.length > 0 ? (
        <Table
          containerClassName="min-h-0 flex-1 overflow-auto"
          className="h-full min-w-[3600px] text-xs"
        >
          <TableHeader className="sticky top-0 z-30">
            <TableRow className="h-7">
              <TableHead
                rowSpan={2}
                className="sticky left-0 z-40 h-7 border-r border-border bg-muted px-2 py-1 text-[11px] normal-case tracking-normal"
              >
                Start date
              </TableHead>
              {TABLE_SECTIONS.map((section) => (
                <TableHead
                  key={section.id}
                  colSpan={section.curves.length}
                  className={`h-7 ${DIVIDER} px-2 py-1 text-center text-[11px] normal-case tracking-normal ${SECTION_STYLE[section.id].tone}`}
                >
                  {section.label}
                </TableHead>
              ))}
            </TableRow>
            <TableRow className="min-h-12">
              {TABLE_CURVES.map(({ section, curve }) => {
                const style = SECTION_STYLE[section.id]
                const index = section.curves.indexOf(curve)
                return (
                  <TableHead
                    key={curve.id}
                    title={curve.formula}
                    className={`h-12 ${style.width} whitespace-normal px-1 py-1 text-center text-[10px] leading-tight normal-case tracking-normal ${style.tone} ${hasDivider(style, index, section.curves.length) ? DIVIDER : ""}`}
                  >
                    {curve.label}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.start_date} className="h-7">
                <TableCell className="sticky left-0 z-20 border-r border-border bg-background px-2 py-1 text-xs font-medium leading-4 tabular-nums">
                  {row.start_date}
                </TableCell>
                {TABLE_CURVES.map(({ section, curve }) => {
                  const style = SECTION_STYLE[section.id]
                  const index = section.curves.indexOf(curve)
                  const value = curve.value(row)
                  return (
                    <TableCell
                      key={curve.id}
                      title={curve.formula}
                      className={`px-2 py-1 text-right text-xs leading-4 tabular-nums ${hasDivider(style, index, section.curves.length) ? DIVIDER : ""}`}
                    >
                      {value === null
                        ? style.empty
                        : (curve.currency
                            ? CURRENCY_FORMAT
                            : PRICE_FORMAT
                          ).format(value)}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        !pricesQuery.isError && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No curve prices found.
          </p>
        )
      )}
    </div>
  )
}
