import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, Plus, Save, Trash2 } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  createCustomCurve,
  deleteCustomCurve,
  getMidTermCurvePrices,
  getSavedCustomCurves,
  type CustomCurveMonth,
  type CurvePrices,
  type SavedCustomCurveMonth,
  updateCustomCurve,
  type SaveCustomCurveBody,
} from "@/features/mid_term_curves/api"
import { useCurveDateRange } from "@/features/mid_term_curves/dateRange"
import { useRegisterExport } from "@/features/mid_term_curves/exportContext"
import { CURVE_SECTIONS } from "@/routes/_layout/index"

const PRICE_FORMAT = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

type DraftMonth = CustomCurveMonth

function monthLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`))
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function savedCurveName(rows: SavedCustomCurveMonth[], id: string) {
  return rows.find((row) => row.curve_id === id)?.curve_name ?? ""
}

export function CurveBuilder() {
  const queryClient = useQueryClient()
  const { fromDate, toDate } = useCurveDateRange()
  const pricesQuery = useQuery({
    queryKey: ["mid_term_curves", "prices"],
    queryFn: getMidTermCurvePrices,
    staleTime: 15 * 60_000,
  })
  const savedQuery = useQuery({
    queryKey: ["mid_term_curves", "custom-curves"],
    queryFn: getSavedCustomCurves,
    staleTime: 30_000,
  })
  const prices = pricesQuery.data ?? []
  const savedRows = savedQuery.data ?? []
  const [selectedCurveId, setSelectedCurveId] = useState<string | null>(null)
  const [curveName, setCurveName] = useState("")
  const [lastSaveWasDuplicate, setLastSaveWasDuplicate] = useState(false)
  const [draftMonths, setDraftMonths] = useState<DraftMonth[]>([])

  const curvesById = useMemo(
    () => new Map(CURVE_SECTIONS.flatMap((section) => section.curves.map((curve) => [curve.id, curve] as const))),
    [],
  )
  const curveRows = useMemo(() => {
    const grouped = new Map<string, SavedCustomCurveMonth[]>()
    for (const row of savedRows) {
      const current = grouped.get(row.curve_id) ?? []
      current.push(row)
      grouped.set(row.curve_id, current)
    }
    return [...grouped.entries()].map(([id, months]) => ({
      id,
      name: months[0]?.curve_name ?? "Untitled curve",
      createdBy: months[0]?.created_by ?? "",
      createdAt: months[0]?.created_at ?? "",
      modifiedAt: months.reduce(
        (latest, month) => (month.modified_at > latest ? month.modified_at : latest),
        months[0]?.modified_at ?? "",
      ),
      months,
    }))
  }, [savedRows])
  const activeCurve = curveRows.find((curve) => curve.id === selectedCurveId)
  const visibleMonths = draftMonths.filter(
    (month) => month.month >= fromDate && month.month <= toDate,
  )
  const sourceByMonth = useMemo(
    () => new Map(prices.map((row) => [row.start_date, row])),
    [prices],
  )
  const monthValues = (month: DraftMonth) => {
    const source = sourceByMonth.get(month.month)
    const selectedValues = [month.curve_1_id, month.curve_2_id]
      .map((id) => {
        if (!id || !source) return null
        return curvesById.get(id)?.value(source) ?? null
      })
      .filter((value): value is number => value !== null)
    const average = selectedValues.length
      ? selectedValues.reduce((sum, value) => sum + value, 0) / selectedValues.length
      : null
    const brentPercent =
      average !== null && source?.brent ? (average / source.brent) * 100 : null
    return { source, average, brentPercent }
  }

  useRegisterExport(() => ({
    fileName: `curve_builder_${curveName.trim() || "unsaved"}_${fromDate}_${toDate}`,
    sheetName: "Curve builder",
    headers: [
      "Month",
      "Fundamental rationale",
      "Curve 1",
      "Curve 2 (Optional)",
      "Asia LNG",
      "As % Brent",
    ],
    rows: visibleMonths.map((month) => {
      const { average, brentPercent } = monthValues(month)
      return [
        month.month,
        month.fundamental_rationale,
        month.curve_1_id ? curvesById.get(month.curve_1_id)?.label ?? null : null,
        month.curve_2_id ? curvesById.get(month.curve_2_id)?.label ?? null : null,
        average,
        brentPercent,
      ]
    }),
  }))

  useEffect(() => {
    if (pricesQuery.isPending || savedQuery.isPending) return
    const savedMonths = new Map(
      (selectedCurveId
        ? savedRows.filter((row) => row.curve_id === selectedCurveId)
        : []
      ).map((row) => [row.month, row]),
    )
    setDraftMonths(
      prices.map((price) => {
        const saved = savedMonths.get(price.start_date)
        return {
          month: price.start_date,
          fundamental_rationale: saved?.fundamental_rationale ?? "",
          curve_1_id: saved?.curve_1_id ?? null,
          curve_2_id: saved?.curve_2_id ?? null,
        }
      }),
    )
    setCurveName(selectedCurveId ? savedCurveName(savedRows, selectedCurveId) : "")
  }, [pricesQuery.isPending, savedQuery.isPending, prices, savedRows, selectedCurveId])

  const saveMutation = useMutation({
    mutationFn: ({ curveId, body }: { curveId: string | null; body: SaveCustomCurveBody }) =>
      curveId ? updateCustomCurve(curveId, body) : createCustomCurve(body),
    onSuccess: async ({ curve_id }) => {
      setSelectedCurveId(curve_id)
      await queryClient.invalidateQueries({ queryKey: ["mid_term_curves", "custom-curves"] })
    },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteCustomCurve,
    onSuccess: async () => {
      setSelectedCurveId(null)
      setCurveName("")
      await queryClient.invalidateQueries({ queryKey: ["mid_term_curves", "custom-curves"] })
    },
  })

  const updateMonth = (month: string, patch: Partial<DraftMonth>) => {
    setDraftMonths((current) =>
      current.map((row) => (row.month === month ? { ...row, ...patch } : row)),
    )
  }

  const startNewCurve = () => {
    setSelectedCurveId(null)
    setCurveName("")
  }

  const selectCurve = (id: string) => {
    if (!id) {
      startNewCurve()
      return
    }
    setSelectedCurveId(id)
  }

  const save = () => {
    if (!curveName.trim() || visibleMonths.length === 0) return
    if (
      activeCurve &&
      curveName.trim() !== activeCurve.name &&
      !window.confirm(`Change curve name from "${activeCurve.name}" to "${curveName.trim()}"?`)
    ) {
      return
    }
    setLastSaveWasDuplicate(false)
    saveMutation.mutate({
      curveId: selectedCurveId,
      body: {
        curve_name: curveName.trim(),
        months: visibleMonths,
      },
    })
  }

  const duplicate = () => {
    if (!activeCurve) return
    const duplicatedName = `${activeCurve.name} Copy`
    setLastSaveWasDuplicate(true)
    setCurveName(duplicatedName)
    saveMutation.mutate({
      curveId: null,
      body: {
        curve_name: duplicatedName,
        months: activeCurve.months.map((month) => ({
          month: month.month,
          fundamental_rationale: month.fundamental_rationale,
          curve_1_id: month.curve_1_id,
          curve_2_id: month.curve_2_id,
        })),
      },
    })
  }

  const deleteSelected = () => {
    if (!activeCurve) return
    const confirmed = window.confirm(
      `Delete "${activeCurve.name}"? All monthly entries for this curve will be removed. This cannot be undone.`,
    )
    if (confirmed) deleteMutation.mutate(activeCurve.id)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex w-64 flex-col gap-1 text-xs">
            Curve name
            <Input
              value={curveName}
              maxLength={120}
              placeholder="Name this curve"
              onChange={(event) => setCurveName(event.target.value)}
            />
          </label>
          <label className="flex w-64 flex-col gap-1 text-xs">
            Saved curves
            <select
              aria-label="Saved custom curves"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={selectedCurveId ?? ""}
              onChange={(event) => selectCurve(event.target.value)}
            >
              <option value="">New curve</option>
              {curveRows.map((curve) => (
                <option key={curve.id} value={curve.id}>
                  {curve.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" variant="outline" onClick={startNewCurve}>
            <Plus aria-hidden="true" />
            New
          </Button>
          {activeCurve && (
            <Button
              type="button"
              variant="outline"
              onClick={duplicate}
              disabled={saveMutation.isPending || deleteMutation.isPending}
              title={`Duplicate ${activeCurve.name}`}
            >
              <Copy aria-hidden="true" />
              Duplicate
            </Button>
          )}
          <Button
            type="button"
            onClick={save}
            disabled={!curveName.trim() || visibleMonths.length === 0 || saveMutation.isPending || deleteMutation.isPending}
          >
            <Save aria-hidden="true" />
            {saveMutation.isPending ? "Saving..." : "Save curve"}
          </Button>
          {activeCurve && (
            <Button
              type="button"
              variant="destructive"
              onClick={deleteSelected}
              disabled={deleteMutation.isPending || saveMutation.isPending}
              title={`Delete ${activeCurve.name}`}
            >
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          )}
        </div>
        {activeCurve && (
          <p className="text-xs text-muted-foreground">
            Created by {activeCurve.createdBy} · {formatTimestamp(activeCurve.createdAt)} · Modified {formatTimestamp(activeCurve.modifiedAt)}
          </p>
        )}
      </header>

      {pricesQuery.isError || savedQuery.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load custom curve data</AlertTitle>
          <AlertDescription>
            Check the backend and Databricks connection, then reload this tab.
          </AlertDescription>
        </Alert>
      ) : saveMutation.isError || deleteMutation.isError ? (
        <Alert variant="destructive">
          <AlertTitle>
            {deleteMutation.isError ? "Could not delete this curve" : "Could not save this curve"}
          </AlertTitle>
          <AlertDescription>
            Check that you have writer access and that the custom curve table is available in Databricks.
          </AlertDescription>
        </Alert>
      ) : deleteMutation.isSuccess ? (
        <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">
          Curve deleted.
        </p>
      ) : saveMutation.isSuccess ? (
        <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">
          {lastSaveWasDuplicate ? "Curve duplicated." : "Curve saved."}
        </p>
      ) : null}

      {pricesQuery.isPending || savedQuery.isPending ? (
        <Skeleton className="min-h-0 flex-1" />
      ) : (
        <Table
          containerClassName="min-h-0 flex-1 overflow-auto"
          className="w-max min-w-[1161px] text-xs"
        >
          <TableHeader className="sticky top-0 z-30">
            <TableRow>
              <TableHead className="sticky left-0 z-40 h-7 w-[66px] min-w-[66px] bg-[#007079] px-1 py-1 text-[10px] text-white">
                Month
              </TableHead>
              <TableHead className="h-7 w-[543px] min-w-[543px] bg-[#007079] px-1 py-1 text-[10px] text-white">Fundamental rationale</TableHead>
              <TableHead className="h-7 w-[198px] min-w-[198px] bg-[#007079] px-1 py-1 text-[10px] text-white">Curve 1</TableHead>
              <TableHead className="h-7 w-[198px] min-w-[198px] bg-[#007079] px-1 py-1 text-[10px] text-white">Curve 2 (Optional)</TableHead>
              <TableHead className="h-7 w-[66px] min-w-[66px] bg-[#007079] px-1 py-1 text-right text-[10px] text-white">Asia LNG</TableHead>
              <TableHead className="h-7 w-[90px] min-w-[90px] whitespace-normal bg-[#007079] px-1 py-1 text-right text-[10px] leading-tight text-white">As % Brent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleMonths.map((month) => {
              const { source, average, brentPercent } = monthValues(month)
              const alternateYear = Number(month.month.slice(0, 4)) % 2 === 1
              const yearBackground = alternateYear
                ? "bg-neutral-200 dark:bg-neutral-800"
                : "bg-background"

              return (
                <TableRow
                  key={month.month}
                  className={`h-[26px] ${yearBackground}`}
                >
                  <TableCell className={`sticky left-0 z-20 w-[66px] min-w-[66px] ${yearBackground} px-1 py-0 text-[11px] font-medium tabular-nums`}>
                    {monthLabel(month.month)}
                  </TableCell>
                  <TableCell className="w-[543px] min-w-[543px] px-1 py-0">
                    <Input
                      aria-label={`Fundamental rationale for ${month.month}`}
                      className="h-5 w-full min-w-0 px-1 text-[11px]"
                      maxLength={4000}
                      value={month.fundamental_rationale}
                      onChange={(event) =>
                        updateMonth(month.month, {
                          fundamental_rationale: event.target.value,
                        })
                      }
                    />
                  </TableCell>
                  {(["curve_1_id", "curve_2_id"] as const).map((field) => (
                    <TableCell key={field} className="w-[198px] min-w-[198px] px-1 py-0">
                      <select
                        aria-label={`${field === "curve_1_id" ? "First" : "Second"} curve for ${month.month}`}
                        className="h-5 w-full min-w-0 rounded-md border border-input bg-background px-1 text-[11px]"
                        value={month[field] ?? ""}
                        onChange={(event) => {
                          const value = event.target.value || null
                          const otherField = field === "curve_1_id" ? "curve_2_id" : "curve_1_id"
                          updateMonth(month.month, {
                            [field]: value,
                            ...(value && month[otherField] === value
                              ? { [otherField]: null }
                              : {}),
                          })
                        }}
                      >
                        <option value="">None</option>
                        {CURVE_SECTIONS.map((section) => (
                          <optgroup key={section.id} label={section.label}>
                            {section.curves.map((curve) => (
                              <option key={curve.id} value={curve.id}>
                                {curve.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </TableCell>
                  ))}
                  <TableCell className="w-[66px] min-w-[66px] px-1 py-0 text-right text-[11px] tabular-nums">
                    {average === null ? "--" : PRICE_FORMAT.format(average)}
                  </TableCell>
                  <TableCell className="w-[90px] min-w-[90px] px-1 py-0 text-right text-[11px] tabular-nums">
                    {brentPercent === null ? "--" : `${PRICE_FORMAT.format(brentPercent)}%`}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}