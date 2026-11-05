import { Minus, Plus } from "lucide-react"
import { Fragment, useState } from "react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type {
  MonthCell,
  MonthlyTable,
} from "@/services/pipeline_nominations/pipeline_nominations_api"
import {
  formatBcf,
  formatDay,
  formatPct,
  pctDirection,
} from "@/services/pipeline_nominations/pipeline_nominations_utils"

type Props = {
  table: MonthlyTable
  latestDate: string | null
}

const PCT_COLOR = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-red-600 dark:text-red-400",
  flat: "text-muted-foreground",
}

const CELL = "px-2 py-1 text-right tabular-nums"
const HEAD = "h-8 px-2 text-center normal-case"

function CellPair({
  cell,
  partial,
  bold,
}: {
  cell: MonthCell | undefined
  partial: boolean
  bold?: boolean
}) {
  return (
    <>
      <TableCell
        className={cn(
          CELL,
          bold && "font-semibold",
          partial && "italic text-muted-foreground",
        )}
      >
        {formatBcf(cell?.bcf ?? null)}
      </TableCell>
      <TableCell
        className={cn(
          CELL,
          "text-xs",
          partial
            ? "italic text-muted-foreground"
            : PCT_COLOR[pctDirection(cell?.mom_pct ?? null)],
        )}
      >
        {formatPct(cell?.mom_pct ?? null)}
      </TableCell>
    </>
  )
}

export function MonthlyMatrix({ table, latestDate }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const { months } = table

  const toggle = (name: string) => {
    const next = new Set(collapsed)
    if (!next.delete(name)) next.add(name)
    setCollapsed(next)
  }

  const yearGroups = months.reduce<{ year: number; count: number }[]>(
    (groups, month) => {
      const last = groups[groups.length - 1]
      if (last?.year === month.year) last.count += 1
      else groups.push({ year: month.year, count: 1 })
      return groups
    },
    [],
  )

  if (table.facilities.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No data for the selected filters.
      </p>
    )
  }

  const hasPartial = months.some((m) => m.partial)

  return (
    <div className="flex flex-col gap-2">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead
              rowSpan={3}
              className="sticky left-0 z-10 min-w-60 bg-muted px-2 text-left normal-case"
            >
              Facility / pipeline
            </TableHead>
            {yearGroups.map((group) => (
              <TableHead
                key={group.year}
                colSpan={group.count * 2}
                className={cn(HEAD, "border-l")}
              >
                {group.year}
              </TableHead>
            ))}
          </TableRow>
          <TableRow>
            {months.map((month) => (
              <TableHead
                key={month.key}
                colSpan={2}
                className={cn(HEAD, "border-l", month.partial && "italic")}
                title={
                  month.partial && latestDate
                    ? `Partial month: data to ${formatDay(latestDate, true)}`
                    : undefined
                }
              >
                {month.label}
                {month.partial ? "*" : ""}
              </TableHead>
            ))}
          </TableRow>
          <TableRow>
            {months.map((month) => (
              <Fragment key={month.key}>
                <TableHead className={cn(HEAD, "border-l font-normal")}>
                  Vol_BCF
                </TableHead>
                <TableHead className={cn(HEAD, "font-normal")}>%</TableHead>
              </Fragment>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.facilities.map((facility) => {
            const isCollapsed = collapsed.has(facility.name)
            return (
              <Fragment key={facility.name}>
                <TableRow className="bg-muted/60 font-semibold">
                  <TableCell className="sticky left-0 z-10 bg-muted px-2 py-1">
                    <button
                      type="button"
                      className="mr-2 inline-flex size-4 items-center justify-center rounded-sm border align-middle"
                      aria-expanded={!isCollapsed}
                      aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${facility.name}`}
                      onClick={() => toggle(facility.name)}
                    >
                      {isCollapsed ? (
                        <Plus className="size-3" />
                      ) : (
                        <Minus className="size-3" />
                      )}
                    </button>
                    {facility.name}
                  </TableCell>
                  {months.map((month, i) => (
                    <CellPair
                      key={month.key}
                      cell={facility.cells[i]}
                      partial={month.partial}
                      bold
                    />
                  ))}
                </TableRow>
                {!isCollapsed &&
                  facility.pipelines.map((pipeline) => (
                    <TableRow key={pipeline.name}>
                      <TableCell className="sticky left-0 z-10 bg-background py-1 pr-2 pl-9 font-normal">
                        {pipeline.name}
                      </TableCell>
                      {months.map((month, i) => (
                        <CellPair
                          key={month.key}
                          cell={pipeline.cells[i]}
                          partial={month.partial}
                        />
                      ))}
                    </TableRow>
                  ))}
              </Fragment>
            )
          })}
          <TableRow className="bg-muted/60 font-semibold">
            <TableCell className="sticky left-0 z-10 bg-muted px-2 py-1">
              Total
            </TableCell>
            {months.map((month, i) => (
              <CellPair
                key={month.key}
                cell={table.total[i]}
                partial={month.partial}
                bold
              />
            ))}
          </TableRow>
        </TableBody>
      </Table>
      {hasPartial && latestDate && (
        <p className="text-xs text-muted-foreground">
          * Data runs to {formatDay(latestDate, true)}, so the latest month is
          incomplete and its % change is against a full month.
        </p>
      )}
    </div>
  )
}
