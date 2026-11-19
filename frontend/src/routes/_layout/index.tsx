import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
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
  getMidTermCurvePrices,
  type CurvePrices,
} from "@/features/mid_term_curves/api"
import { useCurveDateRange } from "@/features/mid_term_curves/dateRange"
import { useRegisterExport } from "@/features/mid_term_curves/exportContext"

const PRICE_COLUMNS = [
  { key: "jkm", label: "JKM [ICE]", formula: "Source price for the JKM ICE curve." },
  { key: "ttf", label: "TTF [ICE]", formula: "Source price for the TTF ICE curve." },
  { key: "hh", label: "HH [ICE]", formula: "Source price for the HH ICE curve." },
  { key: "brent", label: "BRENT [ICE]", formula: "Source price for the Brent ICE curve." },
] as const
const EPA_COLUMNS = [
  { key: "epa_jkm", label: "JKM [EPA]", formula: "Quarterly EPA Asia LNG price, repeated for each month." },
  { key: "epa_ttf", label: "TTF [EPA]", formula: "Quarterly EPA TTF price, repeated for each month." },
  { key: "epa_hh", label: "HH [EPA]", formula: "Quarterly EPA US Henry Hub price, repeated for each month." },
  { key: "epa_nbp", label: "NBP [EPA]", formula: "Quarterly EPA UK NBP price, repeated for each month." },
] as const
const EPA_OIL_COLUMNS = [
  { key: "epa_brent_base", label: "Brent [EPA] Base", formula: "EPA Brent base case, USD nominal." },
  { key: "epa_brent_high", label: "Brent [EPA] High", formula: "EPA Brent high case, USD nominal." },
  { key: "epa_brent_low", label: "Brent [EPA] Low", formula: "EPA Brent low case, USD nominal." },
] as const
const OIL_SWITCHING_COLUMNS = [
  { key: "crude_17_2", label: "17.2% Crude", formula: "Brent [EPA] Base * 17.2%." },
  { key: "crude_15_5", label: "15.5% Crude", formula: "Brent [EPA] Base * 15.5%." },
  { key: "crude_14", label: "14% Crude", formula: "Brent [EPA] Base * 14%." },
  { key: "crude_12_5", label: "12.5% Crude", formula: "Brent [EPA] Base * 12.5%." },
  { key: "crude_10", label: "10% Crude", formula: "Brent [EPA] Base * 10%." },
] as const
const CUSTOM_CURVE_COLUMNS = [
  {
    key: "euro_coalswitching",
    label: "Euro Coal Switching",
    formula: "Blank; no formula has been provided.",
  },
  {
    key: "china_central_asia",
    label: "China Central Asia",
    formula: "(6.7% * Brent [EPA] Base) + 1.96",
  },
  {
    key: "china_power_of_siberia",
    label: "China Power Of Siberia",
    formula: "(3.15 / 36.6) * Brent [EPA] Base",
  },
  {
    key: "woodmac_asia_mid_term",
    label: "Woodmac Asia Mid-term",
    formula: "12.5% * Brent [EPA] Base",
  },
  {
    key: "us_marginal_des_asia_100",
    label: "US Marginal (DES Asia: 100%)",
    formula: "115% * HH [EPA] + US -> JKTC (100% contribution)",
  },
  {
    key: "us_marginal_des_asia_50",
    label: "US Marginal (DES Asia: 50%)",
    formula: "115% * HH [EPA] + US -> JKTC (50% contribution)",
  },
  {
    key: "us_marginal_des_asia_sunk",
    label: "US Marginal (DES Asia: Sunk)",
    formula: "115% * HH [EPA] + US -> JKTC (0% contribution)",
  },
] as const
const ALL_SHIPPING_COLUMNS = [
  {
    key: "spot_chartering_gea",
    label: "Long run marginal cost",
    formula: "Fixed input: $86,000.",
    currency: true,
  },
  {
    key: "us_to_jktc_100",
    label: "US -> JKTC (100% contribution)",
    formula: "(88 * $85,000 / 3,800,000) + (88 * HH [EPA] * 0.09% * 1.15)",
  },
  {
    key: "us_to_jktc_50",
    label: "US -> JKTC (50% contribution)",
    formula: "50% * (88 * $85,000 / 3,800,000) + (88 * HH [EPA] * 0.09% * 1.15)",
  },
  {
    key: "us_to_jktc_0",
    label: "US -> JKTC (0% contribution)",
    formula: "88 * HH [EPA] * 0.09% * 1.15",
  },
  {
    key: "us_to_nwe_100",
    label: "US -> NWE (100% contribution)",
    formula: "(32 * $85,000 / 3,800,000) + (32 * HH [EPA] * 0.09% * 1.15)",
  },
  {
    key: "us_to_nwe_50",
    label: "US -> NWE (50% contribution)",
    formula: "50% * (32 * $85,000 / 3,800,000) + (32 * HH [EPA] * 0.09% * 1.15)",
  },
  {
    key: "us_to_nwe_0",
    label: "US -> NWE (0% contribution)",
    formula: "32 * HH [EPA] * 0.09% * 1.15",
  },
  {
    key: "me_to_jktc_100",
    label: "ME -> JKTC (100% contribution)",
    formula: "(40 * $85,000 / 3,800,000) + (40 * HH [EPA] * 0.09% * 1.15)",
  },
  {
    key: "me_to_jktc_50",
    label: "ME -> JKTC (50% contribution)",
    formula: "50% * (40 * $85,000 / 3,800,000) + (40 * HH [EPA] * 0.09% * 1.15)",
  },
  {
    key: "me_to_jktc_0",
    label: "ME -> JKTC (0% contribution)",
    formula: "40 * HH [EPA] * 0.09% * 1.15",
  },
  {
    key: "me_to_nwe_100",
    label: "ME -> NWE (100% contribution)",
    formula: "(38 * $85,000 / 3,800,000) + (38 * HH [EPA] * 0.09% * 1.15)",
  },
  {
    key: "me_to_nwe_50",
    label: "ME -> NWE (50% contribution)",
    formula: "50% * (38 * $85,000 / 3,800,000) + (38 * HH [EPA] * 0.09% * 1.15)",
  },
  {
    key: "me_to_nwe_0",
    label: "ME -> NWE (0% contribution)",
    formula: "38 * HH [EPA] * 0.09% * 1.15",
  },
] as const
const CHARTERING_COLUMNS = ALL_SHIPPING_COLUMNS.slice(0, 1)
const SPARK_COLUMNS = ["Atlantic (Spark)", "Pacific (Spark)"] as const
const FREIGHT_COLUMNS = ALL_SHIPPING_COLUMNS.slice(1)
const ARBITRAGE_COLUMNS = [
  {
    label: "Arb Open",
    formula:
      "US -> JKTC (100% contribution) - US -> NWE (100% contribution)",
    value: (row: CurvePrices) =>
      row.us_to_jktc_100 !== null && row.us_to_nwe_100 !== null
        ? row.us_to_jktc_100 - row.us_to_nwe_100
        : null,
  },
  {
    label: "Arb Partial (50% contribution)",
    formula:
      "US -> JKTC (50% contribution) - US -> NWE (50% contribution)",
    value: (row: CurvePrices) =>
      row.us_to_jktc_50 !== null && row.us_to_nwe_50 !== null
        ? row.us_to_jktc_50 - row.us_to_nwe_50
        : null,
  },
  {
    label: "Arb Close",
    formula:
      "ME -> JKTC (100% contribution) - ME -> NWE (100% contribution)",
    value: (row: CurvePrices) =>
      row.me_to_jktc_100 !== null && row.me_to_nwe_100 !== null
        ? row.me_to_jktc_100 - row.me_to_nwe_100
        : null,
  },
] as const

type CurveValue = (row: CurvePrices) => number | null

export type ComparisonCurve = {
  id: string
  label: string
  color: string
  value: CurveValue
}

export const CURVE_SECTIONS: {
  id: string
  label: string
  curves: ComparisonCurve[]
}[] = [
  {
    id: "ice",
    label: "ICE curves",
    curves: PRICE_COLUMNS.map((column, index) => ({
      id: `ice_${column.key}`,
      label: column.label,
      color: ["#007079", "#00a3e0", "#e4002b", "#ffb81c"][index],
      value: (row) => row[column.key],
    })),
  },
  {
    id: "epa",
    label: "EPA gas curves",
    curves: EPA_COLUMNS.map((column, index) => ({
      id: column.key,
      label: column.label,
      color: ["#005b8f", "#00a3e0", "#e4002b", "#ffb81c"][index],
      value: (row) => row[column.key],
    })),
  },
  {
    id: "epa-oil",
    label: "EPA oil curves",
    curves: EPA_OIL_COLUMNS.map((column, index) => ({
      id: column.key,
      label: column.label,
      color: ["#005b8f", "#e4002b", "#00a3e0"][index],
      value: (row) => row[column.key],
    })),
  },
  {
    id: "oil-switching",
    label: "Oil switching",
    curves: OIL_SWITCHING_COLUMNS.map((column, index) => ({
      id: column.key,
      label: column.label,
      color: ["#007079", "#00a3e0", "#e4002b", "#ffb81c", "#005b8f"][index],
      value: (row) => row[column.key],
    })),
  },
  {
    id: "custom",
    label: "Gas switching",
    curves: CUSTOM_CURVE_COLUMNS.map((column, index) => ({
      id: column.key,
      label: column.label,
      color: ["#007079", "#00a3e0", "#e4002b", "#ffb81c", "#005b8f", "#7b61a8", "#667085"][index],
      value: (row) => row[column.key],
    })),
  },
  {
    id: "chartering",
    label: "Chartering",
    curves: [
      ...CHARTERING_COLUMNS.map((column) => ({
        id: column.key,
        label: column.label,
        color: "#007079",
        value: (row: CurvePrices) => row[column.key],
      })),
      ...SPARK_COLUMNS.map((label, index) => ({
        id: `spark_${index}`,
        label,
        color: index === 0 ? "#00a3e0" : "#e4002b",
        value: () => null,
      })),
    ],
  },
  {
    id: "freight",
    label: "Freight",
    curves: FREIGHT_COLUMNS.map((column, index) => ({
      id: column.key,
      label: column.label,
      color: ["#007079", "#00a3e0", "#e4002b", "#ffb81c", "#005b8f", "#7b61a8"][index % 6],
      value: (row) => row[column.key],
    })),
  },
  {
    id: "arbitrage",
    label: "JKM vs. NWE Des.",
    curves: ARBITRAGE_COLUMNS.map((column, index) => ({
      id: `arbitrage_${index}`,
      label: column.label,
      color: ["#007079", "#00a3e0", "#e4002b"][index],
      value: column.value,
    })),
  },
]

const PRICE_FORMAT = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const CURRENCY_FORMAT = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const GROUP_COLOR = {
  ice: "bg-sky-100 text-sky-950 dark:bg-sky-950 dark:text-sky-100",
  epa: "bg-blue-100 text-blue-950 dark:bg-blue-950 dark:text-blue-100",
  epaOil: "bg-indigo-100 text-indigo-950 dark:bg-indigo-950 dark:text-indigo-100",
  oil: "bg-rose-100 text-rose-950 dark:bg-rose-950 dark:text-rose-100",
  chartering: "bg-cyan-100 text-cyan-950 dark:bg-cyan-950 dark:text-cyan-100",
  freight: "bg-blue-100 text-blue-950 dark:bg-blue-950 dark:text-blue-100",
  custom: "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100",
  arbitrage: "bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100",
} as const

export const Route = createFileRoute("/_layout/")({
  component: CurveBuilder,
  head: () => ({
    meta: [
      {
        title: "Mid-term Curve Builder - LNG Trading App",
      },
    ],
  }),
})

function CurveBuilder() {
  const pricesQuery = useQuery({
    queryKey: ["mid_term_curves", "prices"],
    queryFn: getMidTermCurvePrices,
    staleTime: 15 * 60_000,
  })
  const prices = pricesQuery.data
  const { fromDate, toDate } = useCurveDateRange()
  const filteredPrices = prices?.filter(
    (row) => row.start_date >= fromDate && row.start_date <= toDate,
  )

  useRegisterExport(() => {
    if (!filteredPrices) return null
    const order = ["ice", "epa", "epa-oil", "oil-switching", "custom", "arbitrage", "chartering", "freight"]
    const curves = order.flatMap((id) => {
      const section = CURVE_SECTIONS.find((item) => item.id === id)
      return (section?.curves ?? []).map((curve) => ({
        header: `${section?.label} - ${curve.label}`,
        curve,
      }))
    })
    return {
      fileName: `available_curves_${fromDate}_${toDate}`,
      sheetName: "Available curves",
      headers: ["Start date", ...curves.map((item) => item.header)],
      rows: filteredPrices.map((row) => [
        row.start_date,
        ...curves.map(({ curve }) => curve.value(row) ?? null),
      ]),
    }
  })

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-end gap-3">
        {pricesQuery.isFetching && prices && <RequestStatus>Updating...</RequestStatus>}
        <Button
          variant="outline"
          size="icon"
          aria-label="Refresh curve prices"
          title="Refresh curve prices"
          disabled={pricesQuery.isFetching}
          onClick={() => pricesQuery.refetch()}
        >
          <RefreshCw aria-hidden="true" />
        </Button>
      </div>

      {pricesQuery.isError && (
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
      ) : filteredPrices && filteredPrices.length > 0 ? (
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
              <TableHead
                colSpan={PRICE_COLUMNS.length}
                className={`h-7 border-r border-border px-2 py-1 text-center text-[11px] normal-case tracking-normal ${GROUP_COLOR.ice}`}
              >
                ICE curves
              </TableHead>
              <TableHead
                colSpan={EPA_COLUMNS.length}
                className={`h-7 border-r border-border px-2 py-1 text-center text-[11px] normal-case tracking-normal ${GROUP_COLOR.epa}`}
              >
                EPA gas curves
              </TableHead>
              <TableHead
                colSpan={EPA_OIL_COLUMNS.length}
                className={`h-7 border-r border-border px-2 py-1 text-center text-[11px] normal-case tracking-normal ${GROUP_COLOR.epaOil}`}
              >
                EPA oil curves
              </TableHead>
              <TableHead
                colSpan={OIL_SWITCHING_COLUMNS.length}
                className={`h-7 border-r border-border px-2 py-1 text-center text-[11px] normal-case tracking-normal ${GROUP_COLOR.oil}`}
              >
                Oil switching
              </TableHead>
              <TableHead
                colSpan={CUSTOM_CURVE_COLUMNS.length}
                className={`h-7 border-r border-border px-2 py-1 text-center text-[11px] normal-case tracking-normal ${GROUP_COLOR.custom}`}
              >
                Gas switching
              </TableHead>
              <TableHead
                colSpan={ARBITRAGE_COLUMNS.length}
                className={`h-7 border-r border-border px-2 py-1 text-center text-[11px] normal-case tracking-normal ${GROUP_COLOR.arbitrage}`}
              >
                JKM vs. NWE Des.
              </TableHead>
              <TableHead
                colSpan={CHARTERING_COLUMNS.length + SPARK_COLUMNS.length}
                className={`h-7 border-r border-border px-2 py-1 text-center text-[11px] normal-case tracking-normal ${GROUP_COLOR.chartering}`}
              >
                Chartering
              </TableHead>
              <TableHead
                colSpan={FREIGHT_COLUMNS.length}
                className={`h-7 border-r border-border px-2 py-1 text-center text-[11px] normal-case tracking-normal ${GROUP_COLOR.freight}`}
              >
                Freight
              </TableHead>
            </TableRow>
            <TableRow className="min-h-12">
              {PRICE_COLUMNS.map((column) => (
                <TableHead
                  key={column.key}
                  title={column.formula}
                  className={`h-12 min-w-[68px] whitespace-normal px-1 py-1 text-center text-[10px] leading-tight normal-case tracking-normal ${GROUP_COLOR.ice} ${column.key === "brent" ? "border-r border-border" : ""}`}
                >
                  {column.label}
                </TableHead>
              ))}
              {EPA_COLUMNS.map((column) => (
                <TableHead
                  key={column.key}
                  title={column.formula}
                  className={`h-12 min-w-[68px] whitespace-normal px-1 py-1 text-center text-[10px] leading-tight normal-case tracking-normal ${GROUP_COLOR.epa} ${column.key === "epa_nbp" ? "border-r border-border" : ""}`}
                >
                  {column.label}
                </TableHead>
              ))}
              {EPA_OIL_COLUMNS.map((column) => (
                <TableHead
                  key={column.key}
                  title={column.formula}
                  className={`h-12 min-w-[68px] whitespace-normal px-1 py-1 text-center text-[10px] leading-tight normal-case tracking-normal ${GROUP_COLOR.epaOil} ${column.key === "epa_brent_low" ? "border-r border-border" : ""}`}
                >
                  {column.label}
                </TableHead>
              ))}
              {OIL_SWITCHING_COLUMNS.map((column) => (
                <TableHead
                  key={column.key}
                  title={column.formula}
                  className={`h-12 min-w-[68px] whitespace-normal px-1 py-1 text-center text-[10px] leading-tight normal-case tracking-normal ${GROUP_COLOR.oil} ${column.key === "crude_10" ? "border-r border-border" : ""}`}
                >
                  {column.label}
                </TableHead>
              ))}
              {CUSTOM_CURVE_COLUMNS.map((column) => (
                <TableHead
                  key={column.key}
                  title={column.formula}
                  className={`h-12 min-w-[84px] max-w-[110px] whitespace-normal px-1 py-1 text-center text-[10px] leading-tight normal-case tracking-normal ${GROUP_COLOR.custom}`}
                >
                  {column.label}
                </TableHead>
              ))}
              {ARBITRAGE_COLUMNS.map((column) => (
                <TableHead
                  key={column.label}
                  title={column.formula}
                  className={`h-12 min-w-[90px] max-w-[120px] whitespace-normal px-1 py-1 text-center text-[10px] leading-tight normal-case tracking-normal ${GROUP_COLOR.arbitrage}`}
                >
                  {column.label}
                </TableHead>
              ))}
              {CHARTERING_COLUMNS.map((column) => (
                <TableHead
                  key={column.key}
                  title={column.formula}
                  className={`h-12 min-w-[82px] max-w-[108px] whitespace-normal px-1 py-1 text-center text-[10px] leading-tight normal-case tracking-normal ${GROUP_COLOR.chartering}`}
                >
                  {column.label}
                </TableHead>
              ))}
              {SPARK_COLUMNS.map((column) => (
                <TableHead
                  key={column}
                  title="Blank; value not provided yet."
                  className={`h-12 min-w-[82px] max-w-[108px] whitespace-normal px-1 py-1 text-center text-[10px] leading-tight normal-case tracking-normal ${GROUP_COLOR.chartering} ${column === "Pacific (Spark)" ? "border-r border-border" : ""}`}
                >
                  {column}
                </TableHead>
              ))}
              {FREIGHT_COLUMNS.map((column, index) => (
                <TableHead
                  key={column.key}
                  title={column.formula}
                  className={`h-12 min-w-[82px] max-w-[108px] whitespace-normal px-1 py-1 text-center text-[10px] leading-tight normal-case tracking-normal ${GROUP_COLOR.freight} ${(index + 1) % 3 === 0 ? "border-r border-border" : ""}`}
                >
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPrices.map((row) => (
              <TableRow key={row.start_date} className="h-7">
                <TableCell className="sticky left-0 z-20 border-r border-border bg-background px-2 py-1 text-xs font-medium leading-4 tabular-nums">
                  {row.start_date}
                </TableCell>
                {PRICE_COLUMNS.map((column) => {
                  const value = row[column.key as keyof CurvePrices]
                  return (
                    <TableCell
                      key={column.key}
                      title={column.formula}
                      className={`px-2 py-1 text-right text-xs leading-4 tabular-nums ${column.key === "brent" ? "border-r border-border" : ""}`}
                    >
                      {typeof value === "number" ? PRICE_FORMAT.format(value) : "--"}
                    </TableCell>
                  )
                })}
                {EPA_COLUMNS.map((column) => {
                  const value = row[column.key]
                  return (
                    <TableCell
                      key={column.key}
                      title={column.formula}
                      className={`px-2 py-1 text-right text-xs leading-4 tabular-nums ${column.key === "epa_nbp" ? "border-r border-border" : ""}`}
                    >
                      {typeof value === "number" ? PRICE_FORMAT.format(value) : "--"}
                    </TableCell>
                  )
                })}
                {EPA_OIL_COLUMNS.map((column) => {
                  const value = row[column.key]
                  return (
                    <TableCell
                      key={column.key}
                      title={column.formula}
                      className={`px-2 py-1 text-right text-xs leading-4 tabular-nums ${column.key === "epa_brent_low" ? "border-r border-border" : ""}`}
                    >
                      {typeof value === "number" ? PRICE_FORMAT.format(value) : "--"}
                    </TableCell>
                  )
                })}
                {OIL_SWITCHING_COLUMNS.map((column) => (
                  <TableCell
                  key={column.key}
                    title={column.formula}
                    className={`px-2 py-1 text-right text-xs leading-4 tabular-nums ${column.key === "crude_10" ? "border-r border-border" : ""}`}
                >
                  {typeof row[column.key] === "number"
                    ? PRICE_FORMAT.format(row[column.key] as number)
                    : ""}
                </TableCell>
              ))}
              {CUSTOM_CURVE_COLUMNS.map((column) => (
                <TableCell
                  key={column.key}
                  title={column.formula}
                  className="px-2 py-1 text-right text-xs leading-4 tabular-nums"
                >
                  {typeof row[column.key] === "number"
                    ? PRICE_FORMAT.format(row[column.key] as number)
                    : ""}
                </TableCell>
              ))}
              {ARBITRAGE_COLUMNS.map((column) => {
                const value = column.value(row)
                return (
                  <TableCell
                    key={column.label}
                    title={column.formula}
                    className="px-2 py-1 text-right text-xs leading-4 tabular-nums"
                  >
                    {value === null ? "" : PRICE_FORMAT.format(value)}
                  </TableCell>
                )
              })}
              {CHARTERING_COLUMNS.map((column) => (
                <TableCell
                  key={column.key}
                  title={column.formula}
                  className="px-2 py-1 text-right text-xs leading-4 tabular-nums"
                >
                  {typeof row[column.key] === "number"
                    ? (column.key === "spot_chartering_gea"
                        ? CURRENCY_FORMAT
                        : PRICE_FORMAT
                      ).format(
                        row[column.key] as number,
                      )
                    : ""}
                </TableCell>
              ))}
              {SPARK_COLUMNS.map((column) => (
                <TableCell
                  key={column}
                  title="Blank; value not provided yet."
                  className={`px-2 py-1 text-right text-xs leading-4 tabular-nums ${column === "Pacific (Spark)" ? "border-r border-border" : ""}`}
                />
              ))}
              {FREIGHT_COLUMNS.map((column, index) => (
                <TableCell
                  key={column.key}
                  title={column.formula}
                  className={`px-2 py-1 text-right text-xs leading-4 tabular-nums ${(index + 1) % 3 === 0 ? "border-r border-border" : ""}`}
                >
                  {typeof row[column.key] === "number"
                    ? PRICE_FORMAT.format(row[column.key] as number)
                    : ""}
                </TableCell>
              ))}
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
