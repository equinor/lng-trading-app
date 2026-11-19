import { Minus, Plus } from "lucide-react"
import { Fragment, useMemo, useState } from "react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  Measure,
  MonthPoint,
  QuarterRow,
  YearRow,
} from "@/features/lng_balance/api"
import {
  DEMAND_COLOR,
  formatValue,
  netShade,
  parseMonth,
  SUPPLY_COLOR,
  UNIT_LABEL,
  type Unit,
} from "@/features/lng_balance/utils"
import { cn } from "@/lib/utils"

type Props = {
  rows: YearRow[]
  /** Monthly figures for the same years, shown when a quarter is expanded. */
  months: MonthPoint[]
  unit: Unit
}

const NUM = "px-2 py-1.5 text-right tabular-nums"

const yearKey = (year: number) => String(year)
const quarterKey = (year: number, quarter: number) => `${year}-Q${quarter}`

/** Supply, demand and net short by year; a year expands into quarters and a quarter into months. */
export function NetShortTable({ rows, months, unit }: Props) {
  // Everything starts collapsed, showing only the year totals.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const monthsByQuarter = useMemo(() => {
    const grouped = new Map<string, (MonthPoint & { net: Measure })[]>()
    for (const m of months) {
      const date = parseMonth(m.month)
      const key = quarterKey(
        date.getFullYear(),
        Math.floor(date.getMonth() / 3) + 1,
      )
      const net = {
        cargoes: m.supply.cargoes - m.demand.cargoes,
        kt: m.supply.kt - m.demand.kt,
      }
      grouped.set(key, [...(grouped.get(key) ?? []), { ...m, net }])
    }
    return grouped
  }, [months])

  // Shading is scaled within each level, since a year is about four quarters and twelve months.
  const { yearMax, quarterMax, monthMax } = useMemo(
    () => ({
      yearMax: Math.max(0, ...rows.map((r) => Math.abs(r.net[unit]))),
      quarterMax: Math.max(
        0,
        ...rows.flatMap((r) => r.quarters.map((q) => Math.abs(q.net[unit]))),
      ),
      monthMax: Math.max(
        0,
        ...months.map((m) => Math.abs(m.supply[unit] - m.demand[unit])),
      ),
    }),
    [rows, months, unit],
  )

  const toggle = (key: string) => {
    const next = new Set(expanded)
    if (!next.delete(key)) next.add(key)
    setExpanded(next)
  }

  const body = rows.flatMap((row) => {
    const items: (
      | { kind: "year"; row: YearRow }
      | { kind: "quarter"; year: number; quarter: QuarterRow }
      | { kind: "month"; month: MonthPoint & { net: Measure } }
    )[] = [{ kind: "year", row }]
    if (!expanded.has(yearKey(row.year))) return items
    for (const quarter of row.quarters) {
      items.push({ kind: "quarter", year: row.year, quarter })
      if (expanded.has(quarterKey(row.year, quarter.quarter))) {
        for (const month of monthsByQuarter.get(
          quarterKey(row.year, quarter.quarter),
        ) ?? []) {
          items.push({ kind: "month", month })
        }
      }
    }
    return items
  })

  const cells = (
    supply: Measure,
    demand: Measure,
    net: Measure,
    max: number,
    bold: boolean,
  ) => (
    <>
      <TableCell
        className={cn(NUM, bold && "font-semibold")}
        style={{ color: SUPPLY_COLOR }}
      >
        {formatValue(supply[unit])}
      </TableCell>
      <TableCell
        className={cn(NUM, bold && "font-semibold")}
        style={{ color: DEMAND_COLOR }}
      >
        {formatValue(demand[unit])}
      </TableCell>
      <TableCell
        className={cn(NUM, "font-semibold")}
        style={netShade(net[unit], max)}
      >
        {formatValue(net[unit])}
      </TableCell>
    </>
  )

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Select at least one year.
      </p>
    )
  }

  return (
    <Table className="text-sm">
      <TableHeader>
        <TableRow className="border-b-2">
          <TableHead className="h-8 px-2 text-left normal-case">Year</TableHead>
          <TableHead className="h-8 px-2 text-right normal-case">
            Supply
          </TableHead>
          <TableHead className="h-8 px-2 text-right normal-case">
            Demand
          </TableHead>
          <TableHead className="h-8 px-2 text-right normal-case">
            Net
            <span className="block text-[10px] font-normal">
              {UNIT_LABEL[unit]}
            </span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {body.map((item, index) => {
          const zebra = index % 2 === 0 ? "bg-background" : "bg-muted"
          if (item.kind === "month") {
            const m = item.month
            return (
              <TableRow key={m.month} className={zebra}>
                <TableCell className="py-1.5 pr-2 pl-16 text-xs">
                  {parseMonth(m.month).toLocaleDateString(undefined, {
                    month: "short",
                  })}
                </TableCell>
                {cells(m.supply, m.demand, m.net, monthMax, false)}
              </TableRow>
            )
          }
          if (item.kind === "quarter") {
            const q = item.quarter
            const key = quarterKey(item.year, q.quarter)
            const open = expanded.has(key)
            return (
              <TableRow key={key} className={zebra}>
                <TableCell className="py-1.5 pr-2 pl-6 text-xs">
                  <button
                    type="button"
                    className="mr-2 inline-flex size-3.5 items-center justify-center rounded-sm border align-middle"
                    aria-expanded={open}
                    aria-label={`${open ? "Collapse" : "Expand"} ${item.year} Qtr ${q.quarter}`}
                    onClick={() => toggle(key)}
                  >
                    {open ? (
                      <Minus className="size-2.5" />
                    ) : (
                      <Plus className="size-2.5" />
                    )}
                  </button>
                  Qtr {q.quarter}
                </TableCell>
                {cells(q.supply, q.demand, q.net, quarterMax, false)}
              </TableRow>
            )
          }
          const { row } = item
          const open = expanded.has(yearKey(row.year))
          return (
            <Fragment key={row.year}>
              <TableRow className={cn(zebra, "font-semibold")}>
                <TableCell className="px-2 py-1.5">
                  <button
                    type="button"
                    className="mr-2 inline-flex size-4 items-center justify-center rounded-sm border align-middle"
                    aria-expanded={open}
                    aria-label={`${open ? "Collapse" : "Expand"} ${row.year}`}
                    onClick={() => toggle(yearKey(row.year))}
                  >
                    {open ? (
                      <Minus className="size-3" />
                    ) : (
                      <Plus className="size-3" />
                    )}
                  </button>
                  {row.year}
                </TableCell>
                {cells(row.supply, row.demand, row.net, yearMax, true)}
              </TableRow>
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}
