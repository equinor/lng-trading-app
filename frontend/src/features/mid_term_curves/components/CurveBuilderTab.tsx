import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Copy, Plus, Save, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  type CustomCurveMonth,
  createCustomCurve,
  deleteCustomCurve,
  type SaveCustomCurveBody,
  updateCustomCurve,
} from "@/features/mid_term_curves/api"
import { CurveMonthsTable } from "@/features/mid_term_curves/components/CurveMonthsTable"
import { CURVE_BY_ID } from "@/features/mid_term_curves/curves"
import { useCurveDateRange } from "@/features/mid_term_curves/hooks/useCurveDateRange"
import { useRegisterExport } from "@/features/mid_term_curves/hooks/useCurveExport"
import {
  midTermCurveKeys,
  useCurvePrices,
  useSavedCurves,
} from "@/features/mid_term_curves/hooks/useMidTermCurves"
import {
  formatTimestamp,
  groupSavedCurves,
  summarizeMonth,
} from "@/features/mid_term_curves/utils"
import { readString, removeKey, writeString } from "@/lib/storage"

const SELECTED_CURVE_STORAGE_KEY = "mid-term-curves-builder-selected-curve"

export function CurveBuilderTab() {
  const queryClient = useQueryClient()
  const { fromDate, toDate } = useCurveDateRange()
  const pricesQuery = useCurvePrices()
  const savedQuery = useSavedCurves()
  const prices = pricesQuery.data
  const savedRows = savedQuery.data

  const [selectedCurveId, setSelectedCurveId] = useState<string | null>(() =>
    readString(window.localStorage, SELECTED_CURVE_STORAGE_KEY),
  )
  const [curveName, setCurveName] = useState("")
  const [lastSaveWasDuplicate, setLastSaveWasDuplicate] = useState(false)
  const [draftMonths, setDraftMonths] = useState<CustomCurveMonth[]>([])

  const savedCurves = useMemo(
    () => groupSavedCurves(savedRows ?? []),
    [savedRows],
  )
  const activeCurve = savedCurves.find((curve) => curve.id === selectedCurveId)
  const priceByMonth = useMemo(
    () => new Map((prices ?? []).map((row) => [row.start_date, row])),
    [prices],
  )
  const visibleMonths = draftMonths.filter(
    (month) => month.month >= fromDate && month.month <= toDate,
  )

  useEffect(() => {
    if (selectedCurveId)
      writeString(
        window.localStorage,
        SELECTED_CURVE_STORAGE_KEY,
        selectedCurveId,
      )
    else removeKey(window.localStorage, SELECTED_CURVE_STORAGE_KEY)
  }, [selectedCurveId])

  // A curve that was deleted elsewhere can no longer stay selected.
  useEffect(() => {
    if (savedQuery.isSuccess && selectedCurveId && !activeCurve)
      setSelectedCurveId(null)
  }, [savedQuery.isSuccess, selectedCurveId, activeCurve])

  // Every month of the price table gets a row, filled from the selected saved curve.
  useEffect(() => {
    if (!prices || !savedRows) return
    const savedByMonth = new Map(
      (selectedCurveId
        ? savedRows.filter((row) => row.curve_id === selectedCurveId)
        : []
      ).map((row) => [row.month, row]),
    )
    setDraftMonths(
      prices.map((price) => {
        const saved = savedByMonth.get(price.start_date)
        return {
          month: price.start_date,
          fundamental_rationale: saved?.fundamental_rationale ?? "",
          curve_1_id: saved?.curve_1_id ?? null,
          curve_2_id: saved?.curve_2_id ?? null,
        }
      }),
    )
    setCurveName(activeCurve?.name ?? "")
  }, [prices, savedRows, selectedCurveId, activeCurve?.name])

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
      const { average, brentPercent } = summarizeMonth(
        priceByMonth.get(month.month),
        [month.curve_1_id, month.curve_2_id],
      )
      return [
        month.month,
        month.fundamental_rationale,
        month.curve_1_id
          ? (CURVE_BY_ID.get(month.curve_1_id)?.label ?? null)
          : null,
        month.curve_2_id
          ? (CURVE_BY_ID.get(month.curve_2_id)?.label ?? null)
          : null,
        average,
        brentPercent,
      ]
    }),
  }))

  const refreshSavedCurves = () =>
    queryClient.invalidateQueries({ queryKey: midTermCurveKeys.customCurves })
  const saveMutation = useMutation({
    mutationFn: ({
      curveId,
      body,
    }: {
      curveId: string | null
      body: SaveCustomCurveBody
    }) =>
      curveId ? updateCustomCurve(curveId, body) : createCustomCurve(body),
    onSuccess: async ({ curve_id }) => {
      setSelectedCurveId(curve_id)
      await refreshSavedCurves()
    },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteCustomCurve,
    onSuccess: async () => {
      setSelectedCurveId(null)
      setCurveName("")
      await refreshSavedCurves()
    },
  })
  const busy = saveMutation.isPending || deleteMutation.isPending

  const updateMonth = (month: string, patch: Partial<CustomCurveMonth>) => {
    setDraftMonths((current) =>
      current.map((row) => (row.month === month ? { ...row, ...patch } : row)),
    )
  }

  const startNewCurve = () => {
    setSelectedCurveId(null)
    setCurveName("")
  }

  const save = () => {
    const name = curveName.trim()
    if (!name || visibleMonths.length === 0) return
    if (
      activeCurve &&
      name !== activeCurve.name &&
      !window.confirm(
        `Change curve name from "${activeCurve.name}" to "${name}"?`,
      )
    ) {
      return
    }
    setLastSaveWasDuplicate(false)
    saveMutation.mutate({
      curveId: selectedCurveId,
      body: { curve_name: name, months: visibleMonths },
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
          <div className="flex w-64 flex-col gap-1 text-xs">
            <label htmlFor="mid-term-curves-curve-name">Curve name</label>
            <Input
              id="mid-term-curves-curve-name"
              value={curveName}
              maxLength={120}
              placeholder="Name this curve"
              onChange={(event) => setCurveName(event.target.value)}
            />
          </div>
          <div className="flex w-64 flex-col gap-1 text-xs">
            <label htmlFor="mid-term-curves-saved-curves">Saved curves</label>
            <select
              id="mid-term-curves-saved-curves"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={selectedCurveId ?? ""}
              onChange={(event) =>
                setSelectedCurveId(event.target.value || null)
              }
            >
              <option value="">New curve</option>
              {savedCurves.map((curve) => (
                <option key={curve.id} value={curve.id}>
                  {curve.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" variant="outline" onClick={startNewCurve}>
            <Plus aria-hidden="true" />
            New
          </Button>
          {activeCurve && (
            <Button
              type="button"
              variant="outline"
              onClick={duplicate}
              disabled={busy}
              title={`Duplicate ${activeCurve.name}`}
            >
              <Copy aria-hidden="true" />
              Duplicate
            </Button>
          )}
          <Button
            type="button"
            onClick={save}
            disabled={!curveName.trim() || visibleMonths.length === 0 || busy}
          >
            <Save aria-hidden="true" />
            {saveMutation.isPending ? "Saving..." : "Save curve"}
          </Button>
          {activeCurve && (
            <Button
              type="button"
              variant="destructive"
              onClick={deleteSelected}
              disabled={busy}
              title={`Delete ${activeCurve.name}`}
            >
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          )}
        </div>
        {activeCurve && (
          <p className="text-xs text-muted-foreground">
            Created by {activeCurve.createdBy} ·{" "}
            {formatTimestamp(activeCurve.createdAt)} · Modified{" "}
            {formatTimestamp(activeCurve.modifiedAt)}
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
            {deleteMutation.isError
              ? "Could not delete this curve"
              : "Could not save this curve"}
          </AlertTitle>
          <AlertDescription>
            Check that you have writer access and that the custom curve table is
            available in Databricks.
          </AlertDescription>
        </Alert>
      ) : deleteMutation.isSuccess ? (
        <output className="block text-xs text-emerald-700 dark:text-emerald-400">
          Curve deleted.
        </output>
      ) : saveMutation.isSuccess ? (
        <output className="block text-xs text-emerald-700 dark:text-emerald-400">
          {lastSaveWasDuplicate ? "Curve duplicated." : "Curve saved."}
        </output>
      ) : null}

      {pricesQuery.isPending || savedQuery.isPending ? (
        <Skeleton className="min-h-0 flex-1" />
      ) : (
        <CurveMonthsTable
          months={visibleMonths}
          priceByMonth={priceByMonth}
          onChange={updateMonth}
        />
      )}
    </div>
  )
}
