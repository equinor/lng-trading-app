import { createContext, useContext, useEffect, useRef } from "react"

export type ExportCell = string | number | null

export type ExportTable = {
  fileName: string
  sheetName: string
  headers: string[]
  rows: ExportCell[][]
}

export type TabExporter = { get: () => ExportTable | null }

export const CurveExportContext = createContext<
  ((exporter: TabExporter | null) => void) | null
>(null)

/** Lets the mounted tab supply the table that the shared Excel/CSV buttons export. */
export function useRegisterExport(getTable: () => ExportTable | null) {
  const setExporter = useContext(CurveExportContext)
  const getterRef = useRef(getTable)
  getterRef.current = getTable

  useEffect(() => {
    if (!setExporter) return
    setExporter({ get: () => getterRef.current() })
    return () => setExporter(null)
  }, [setExporter])
}
