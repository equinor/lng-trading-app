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
  FacilityRow,
  MatrixCell,
  MatrixTable,
  PipelineRow,
  Region,
} from "@/features/pipeline_nominations/api"
import {
  formatBcf,
  formatDay,
  formatPct,
  pctDirection,
  REGION_LABEL,
  REGIONS,
  regionIndex,
} from "@/features/pipeline_nominations/utils"
import { cn } from "@/lib/utils"

export type MatrixPeriod = "month" | "day" | "cycle"

type Props = {
  table: MatrixTable
  period: MatrixPeriod
  latestDate: string | null
  /** Facilities with no data in this view; shown greyed out with empty cells. */
  unavailable?: FacilityRow[]
  unavailableReason?: string
}

// Newest values are on the left, so each change is against the column to its right.
const CHANGE_HEADER: Record<MatrixPeriod, { label: string; title: string }> = {
  month: { label: "%", title: "Change against the previous month" },
  day: { label: "%", title: "Change against the previous day" },
  cycle: {
    label: "%",
    title: "Change against the previous cycle of the same day",
  },
}

const PCT_COLOR = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-red-600 dark:text-red-400",
  flat: "text-muted-foreground",
}

const CELL = "px-2 py-1.5 text-right tabular-nums"
const HEAD = "h-8 px-2 text-center normal-case"
// A column pair has a light divider; the first column of a day or year group has a stronger one.
const DIVIDER = "border-l border-border/60"
const GROUP_DIVIDER = "border-l-2 border-border"

function CellPair({
  cell,
  partial,
  groupStart,
  bold,
}: {
  cell: MatrixCell | undefined
  partial: boolean
  groupStart: boolean
  bold?: boolean
}) {
  const muted = partial || cell?.carried
  return (
    <>
      <TableCell
        className={cn(
          CELL,
          groupStart ? GROUP_DIVIDER : DIVIDER,
          "text-sm",
          bold && "font-semibold",
          muted && "italic text-muted-foreground",
        )}
        title={
          cell?.carried
            ? "Not published in this cycle; the previous cycle's nomination is shown"
            : undefined
        }
      >
        {formatBcf(cell?.bcf ?? null)}
      </TableCell>
      <TableCell
        className={cn(
          CELL,
          "pl-1 text-xs",
          muted
            ? "italic text-muted-foreground"
            : PCT_COLOR[pctDirection(cell?.change_pct ?? null)],
        )}
      >
        {formatPct(cell?.change_pct ?? null)}
      </TableCell>
    </>
  )
}

function newestFirst(table: MatrixTable): MatrixTable {
  const reversed = (cells: MatrixCell[]) => [...cells].reverse()
  return {
    ...table,
    columns: [...table.columns].reverse(),
    total: reversed(table.total),
    region_totals: table.region_totals.map((region) => ({
      ...region,
      cells: reversed(region.cells),
    })),
    facilities: table.facilities.map((facility) => ({
      ...facility,
      cells: reversed(facility.cells),
      pipelines: facility.pipelines.map((pipeline) => ({
        ...pipeline,
        cells: reversed(pipeline.cells),
      })),
    })),
  }
}

// Facilities sit under a header per region; each region ends with its subtotal when there is
// more than one region in view. `zebra` counts only the facility and pipeline rows.
type BodyRow =
  | { kind: "region"; region: Region }
  | {
      kind: "facility"
      facility: FacilityRow
      greyedOut: boolean
      open: boolean
      zebra: number
    }
  | {
      kind: "pipeline"
      facility: string
      pipeline: PipelineRow
      greyedOut: boolean
      zebra: number
    }
  | { kind: "subtotal"; region: Region; cells: MatrixCell[] }

export function NominationsMatrix({
  table: source,
  period,
  latestDate,
  unavailable = [],
  unavailableReason,
}: Props) {
  // Facilities start collapsed, showing only their totals.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Most recent first, so the newest flow is on the left.
  const table = useMemo(() => newestFirst(source), [source])
  const { columns } = table
  const change = CHANGE_HEADER[period]
  const rows = useMemo(
    () =>
      [
        ...table.facilities.map((facility) => ({
          facility,
          greyedOut: false,
        })),
        ...unavailable.map((facility) => ({ facility, greyedOut: true })),
      ].sort(
        (a, b) =>
          regionIndex(a.facility.region) - regionIndex(b.facility.region) ||
          a.facility.name.localeCompare(b.facility.name),
      ),
    [table.facilities, unavailable],
  )

  const bodyRows = useMemo(() => {
    const present = REGIONS.filter((region) =>
      rows.some((row) => row.facility.region === region),
    )
    const showSubtotals = present.length > 1
    let zebra = 0
    return present.flatMap<BodyRow>((region) => {
      const subtotal = table.region_totals.find((t) => t.region === region)
      return [
        { kind: "region", region },
        ...rows
          .filter((row) => row.facility.region === region)
          .flatMap<BodyRow>(({ facility, greyedOut }) => {
            const open = expanded.has(facility.name)
            return [
              { kind: "facility", facility, greyedOut, open, zebra: zebra++ },
              ...(open
                ? facility.pipelines.map<BodyRow>((pipeline) => ({
                    kind: "pipeline",
                    facility: facility.name,
                    pipeline,
                    greyedOut,
                    zebra: zebra++,
                  }))
                : []),
            ]
          }),
        ...(showSubtotals && subtotal
          ? [{ kind: "subtotal" as const, region, cells: subtotal.cells }]
          : []),
      ]
    })
  }, [rows, expanded, table.region_totals])

  const toggle = (name: string) => {
    const next = new Set(expanded)
    if (!next.delete(name)) next.add(name)
    setExpanded(next)
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

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No data for the selected filters.
      </p>
    )
  }

  const hasPartial = columns.some((c) => c.partial)
  const startsGroup = (i: number) =>
    i === 0 || columns[i].group !== columns[i - 1].group

  return (
    <div className="flex flex-col gap-2">
      <Table className="text-sm">
        <TableHeader>
          <TableRow>
            <TableHead
              rowSpan={3}
              className="sticky left-0 z-10 w-56 min-w-56 border-r bg-muted px-3 text-left text-sm normal-case"
            >
              Facility / pipeline
            </TableHead>
            {groups.map((group) => (
              <TableHead
                key={group.group}
                colSpan={group.count * 2}
                className={cn(
                  HEAD,
                  GROUP_DIVIDER,
                  "text-sm font-semibold text-foreground",
                )}
              >
                {group.group}
              </TableHead>
            ))}
          </TableRow>
          <TableRow>
            {columns.map((column, i) => (
              <TableHead
                key={column.key}
                colSpan={2}
                className={cn(
                  HEAD,
                  startsGroup(i) ? GROUP_DIVIDER : DIVIDER,
                  "text-foreground",
                  column.partial && "italic",
                )}
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
          <TableRow className="border-b-2">
            {columns.map((column, i) => (
              <Fragment key={column.key}>
                <TableHead
                  className={cn(
                    HEAD,
                    startsGroup(i) ? GROUP_DIVIDER : DIVIDER,
                    "text-[11px] font-normal",
                  )}
                >
                  BCF/d
                </TableHead>
                <TableHead
                  className={cn(HEAD, "pl-1 text-[11px] font-normal")}
                  title={change.title}
                >
                  {change.label}
                </TableHead>
              </Fragment>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {bodyRows.map((row) => {
            if (row.kind === "region") {
              return (
                <TableRow
                  key={`region::${row.region}`}
                  className="border-t-2 bg-muted/60 hover:bg-muted/60"
                >
                  <TableCell className="sticky left-0 z-10 border-r bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {REGION_LABEL[row.region]}
                  </TableCell>
                  <TableCell colSpan={columns.length * 2} className="py-1" />
                </TableRow>
              )
            }

            if (row.kind === "subtotal") {
              return (
                <TableRow
                  key={`subtotal::${row.region}`}
                  className="border-t bg-secondary/60 font-semibold"
                >
                  <TableCell className="sticky left-0 z-10 border-r bg-secondary px-3 py-1.5 text-xs">
                    {REGION_LABEL[row.region]} total
                  </TableCell>
                  {columns.map((column, i) => (
                    <CellPair
                      key={column.key}
                      cell={row.cells[i]}
                      partial={column.partial}
                      groupStart={startsGroup(i)}
                      bold
                    />
                  ))}
                </TableRow>
              )
            }

            // Alternate colours over the visible rows; sticky cells need the same opaque colour.
            const zebra = row.zebra % 2 === 0 ? "bg-background" : "bg-muted"
            const grey = row.greyedOut && "text-muted-foreground opacity-50"
            const title = row.greyedOut ? unavailableReason : undefined
            const cellsOf = (cells: MatrixCell[]) =>
              row.greyedOut ? [] : cells

            if (row.kind === "pipeline") {
              return (
                <TableRow
                  key={`${row.facility}::${row.pipeline.name}`}
                  className={cn(zebra, grey)}
                  title={title}
                >
                  <TableCell
                    className={cn(
                      "sticky left-0 z-10 max-w-56 border-r py-1.5 pr-2 pl-10 font-normal whitespace-normal",
                      zebra,
                    )}
                  >
                    {row.pipeline.name}
                  </TableCell>
                  {columns.map((column, i) => (
                    <CellPair
                      key={column.key}
                      cell={cellsOf(row.pipeline.cells)[i]}
                      partial={column.partial}
                      groupStart={startsGroup(i)}
                    />
                  ))}
                </TableRow>
              )
            }

            return (
              <TableRow
                key={row.facility.name}
                className={cn(zebra, "font-semibold", grey)}
                title={title}
              >
                <TableCell
                  className={cn(
                    "sticky left-0 z-10 border-r px-3 py-1.5",
                    zebra,
                  )}
                >
                  <button
                    type="button"
                    className="mr-2 inline-flex size-4 items-center justify-center rounded-sm border align-middle"
                    aria-expanded={row.open}
                    aria-label={`${row.open ? "Collapse" : "Expand"} ${row.facility.name}`}
                    onClick={() => toggle(row.facility.name)}
                  >
                    {row.open ? (
                      <Minus className="size-3" />
                    ) : (
                      <Plus className="size-3" />
                    )}
                  </button>
                  {row.facility.name}
                </TableCell>
                {columns.map((column, i) => (
                  <CellPair
                    key={column.key}
                    cell={cellsOf(row.facility.cells)[i]}
                    partial={column.partial}
                    groupStart={startsGroup(i)}
                    bold
                  />
                ))}
              </TableRow>
            )
          })}
          <TableRow className="border-t-2 bg-secondary font-semibold">
            <TableCell className="sticky left-0 z-10 border-r bg-secondary px-3 py-1.5">
              Total
            </TableCell>
            {columns.map((column, i) => (
              <CellPair
                key={column.key}
                cell={table.total[i]}
                partial={column.partial}
                groupStart={startsGroup(i)}
                bold
              />
            ))}
          </TableRow>
        </TableBody>
      </Table>
      {period === "cycle" && (
        <p className="text-xs text-muted-foreground">
          Italic values were not re-posted in that cycle, so the previous
          cycle's nomination is shown. Cycles that have not happened yet are
          blank. Post is the figure after the gas day has ended.
        </p>
      )}
      {hasPartial && latestDate && (
        <p className="text-xs text-muted-foreground">
          * Data runs to {formatDay(latestDate, true)}, so the latest month only
          covers the days so far. Its value is the average per day.
        </p>
      )}
    </div>
  )
}
