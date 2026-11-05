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
import type {
  MatrixCell,
  MatrixTable,
} from "@/features/pipeline_nominations/api"
import {
  formatBcf,
  formatDay,
  formatPct,
  pctDirection,
} from "@/features/pipeline_nominations/utils"
import { cn } from "@/lib/utils"

export type MatrixPeriod = "month" | "day"

type Props = {
  table: MatrixTable
  period: MatrixPeriod
  latestDate: string | null
}

// The header stays "%" so the columns keep their narrow width; the page subtitle and tooltip say which period.
const CHANGE_HEADER: Record<MatrixPeriod, { label: string; title: string }> = {
  month: { label: "%", title: "Change against the previous month" },
  day: { label: "%", title: "Change against the previous day" },
}

const PCT_COLOR = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-red-600 dark:text-red-400",
  flat: "text-muted-foreground",
}

const CELL = "px-1 py-1 text-right tabular-nums"
const HEAD = "h-8 px-1 text-center normal-case"

function CellPair({
  cell,
  partial,
  bold,
}: {
  cell: MatrixCell | undefined
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
            : PCT_COLOR[pctDirection(cell?.change_pct ?? null)],
        )}
      >
        {formatPct(cell?.change_pct ?? null)}
      </TableCell>
    </>
  )
}

export function NominationsMatrix({ table, period, latestDate }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const { columns } = table
  const change = CHANGE_HEADER[period]

  const toggle = (name: string) => {
    const next = new Set(collapsed)
    if (!next.delete(name)) next.add(name)
    setCollapsed(next)
  }

  // Consecutive columns that share a group (a year for months, a month for days) get one header.
  const groups = columns.reduce<{ group: string; count: number }[]>(
    (acc, column) => {
      const last = acc[acc.length - 1]
      if (last?.group === column.group) last.count += 1
      else acc.push({ group: column.group, count: 1 })
      return acc
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

  const hasPartial = columns.some((c) => c.partial)

  return (
    <div className="flex flex-col gap-2">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead
              rowSpan={3}
              className="sticky left-0 z-10 w-52 min-w-52 bg-muted px-2 text-left normal-case"
            >
              Facility / pipeline
            </TableHead>
            {groups.map((group) => (
              <TableHead
                key={group.group}
                colSpan={group.count * 2}
                className={cn(HEAD, "border-l")}
              >
                {group.group}
              </TableHead>
            ))}
          </TableRow>
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column.key}
                colSpan={2}
                className={cn(HEAD, "border-l", column.partial && "italic")}
                title={
                  column.partial && latestDate
                    ? `Partial month: data to ${formatDay(latestDate, true)}`
                    : undefined
                }
              >
                {column.label}
                {column.partial ? "*" : ""}
              </TableHead>
            ))}
          </TableRow>
          <TableRow>
            {columns.map((column) => (
              <Fragment key={column.key}>
                <TableHead className={cn(HEAD, "border-l font-normal")}>
                  Vol_BCF
                </TableHead>
                <TableHead
                  className={cn(HEAD, "font-normal")}
                  title={change.title}
                >
                  {change.label}
                </TableHead>
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
                  {columns.map((column, i) => (
                    <CellPair
                      key={column.key}
                      cell={facility.cells[i]}
                      partial={column.partial}
                      bold
                    />
                  ))}
                </TableRow>
                {!isCollapsed &&
                  facility.pipelines.map((pipeline) => (
                    <TableRow key={pipeline.name}>
                      <TableCell className="sticky left-0 z-10 max-w-52 bg-background py-1 pr-2 pl-9 font-normal whitespace-normal">
                        {pipeline.name}
                      </TableCell>
                      {columns.map((column, i) => (
                        <CellPair
                          key={column.key}
                          cell={pipeline.cells[i]}
                          partial={column.partial}
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
            {columns.map((column, i) => (
              <CellPair
                key={column.key}
                cell={table.total[i]}
                partial={column.partial}
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
