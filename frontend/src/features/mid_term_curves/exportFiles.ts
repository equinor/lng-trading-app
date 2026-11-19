import type {
  ExportCell,
  ExportTable,
} from "@/features/mid_term_curves/hooks/useCurveExport"

function csvCell(value: ExportCell): string {
  if (value === null) return ""
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : ""
  // A leading apostrophe stops spreadsheet apps from running user text as a formula.
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "export"
}

export function downloadCsv(table: ExportTable) {
  const lines = [table.headers, ...table.rows].map((row) =>
    row.map((cell) => csvCell(cell as ExportCell)).join(","),
  )
  // The BOM makes Excel read the file as UTF-8.
  const blob = new Blob(["\uFEFF", lines.join("\r\n"), "\r\n"], {
    type: "text/csv;charset=utf-8",
  })
  saveBlob(blob, `${safeFileName(table.fileName)}.csv`)
}

export async function downloadXlsx(table: ExportTable) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser")
  const header = table.headers.map((value) => ({
    value,
    fontWeight: "bold" as const,
    textColor: "#ffffff",
    backgroundColor: "#007079",
  }))
  const rows = table.rows.map((row) =>
    row.map((cell) =>
      typeof cell === "number" && Number.isFinite(cell)
        ? { value: cell, type: Number, format: "0.00" }
        : cell === null || typeof cell === "number"
          ? null
          : { value: cell, type: String },
    ),
  )
  const blob = await writeXlsxFile([header, ...rows], {
    sheet: table.sheetName.replace(/[\\/?*[\]:]/g, " ").slice(0, 31),
    stickyRowsCount: 1,
    stickyColumnsCount: 1,
  }).toBlob()
  saveBlob(blob, `${safeFileName(table.fileName)}.xlsx`)
}
