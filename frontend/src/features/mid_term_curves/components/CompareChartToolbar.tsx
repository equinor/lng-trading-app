import { RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  CompareChartOptions,
  ShadeMode,
} from "@/features/mid_term_curves/compareDefaults"

const AXIS_FIELDS = [
  { key: "yMin", label: "Y min" },
  { key: "yMax", label: "Y max" },
  { key: "yStep", label: "Y step" },
] as const

type Props = {
  options: CompareChartOptions
  onChange: <K extends keyof CompareChartOptions>(
    key: K,
    value: CompareChartOptions[K],
  ) => void
  onReset: () => void
}

export function CompareChartToolbar({ options, onChange, onReset }: Props) {
  return (
    <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onReset}
          title="Restore the default Y axis, Today, Years, and shading"
        >
          <RotateCcw aria-hidden="true" />
          Reset graph
        </Button>
        {AXIS_FIELDS.map((field) => (
          <div key={field.key} className="flex items-center gap-1.5 text-xs">
            <label htmlFor={`mid-term-curves-${field.key}`}>
              {field.label}
            </label>
            <Input
              id={`mid-term-curves-${field.key}`}
              type="number"
              inputMode="decimal"
              step="any"
              min={field.key === "yStep" ? 0 : undefined}
              placeholder="Auto"
              value={options[field.key]}
              onChange={(event) => onChange(field.key, event.target.value)}
              className="h-8 w-20 px-2 text-xs"
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs">
          <Checkbox
            id="mid-term-curves-today-line"
            checked={options.showTodayLine}
            onCheckedChange={(checked) =>
              onChange("showTodayLine", checked === true)
            }
          />
          <label
            htmlFor="mid-term-curves-today-line"
            className="cursor-pointer"
          >
            Today
          </label>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Checkbox
            id="mid-term-curves-year-lines"
            checked={options.showYearStartLines}
            onCheckedChange={(checked) =>
              onChange("showYearStartLines", checked === true)
            }
          />
          <label
            htmlFor="mid-term-curves-year-lines"
            className="cursor-pointer"
          >
            Years
          </label>
        </div>
        <Tabs
          value={options.shadeMode}
          onValueChange={(value) => onChange("shadeMode", value as ShadeMode)}
        >
          <TabsList aria-label="Shade date range" className="h-8">
            <TabsTrigger value="off" className="px-2 text-xs">
              No shade
            </TabsTrigger>
            <TabsTrigger value="history" className="px-2 text-xs">
              History
            </TabsTrigger>
            <TabsTrigger value="forward" className="px-2 text-xs">
              Forward
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  )
}
