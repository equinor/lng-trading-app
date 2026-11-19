import { Download } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  downloadCsv,
  downloadXlsx,
} from "@/features/mid_term_curves/exportFiles"
import type { TabExporter } from "@/features/mid_term_curves/hooks/useCurveExport"

type Format = "xlsx" | "csv"

/** Exports the table of the tab that is currently open. */
export function ExportButtons({ exporter }: { exporter: TabExporter | null }) {
  const runExport = async (format: Format) => {
    const table = exporter?.get()
    if (!table || table.rows.length === 0) {
      toast.info("Nothing to export for the current tab and date range.")
      return
    }
    try {
      if (format === "csv") downloadCsv(table)
      else await downloadXlsx(table)
    } catch {
      toast.error("Export failed.")
    }
  }

  return (
    <div className="flex items-center gap-2">
      {(
        [
          { format: "xlsx", label: "Excel" },
          { format: "csv", label: "CSV" },
        ] as const
      ).map(({ format, label }) => (
        <Button
          key={format}
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={!exporter}
          onClick={() => runExport(format)}
        >
          <Download className="size-3.5" />
          {label}
        </Button>
      ))}
    </div>
  )
}
