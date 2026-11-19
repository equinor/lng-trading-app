import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  CurvePrices,
  CustomCurveMonth,
} from "@/features/mid_term_curves/api"
import { CURVE_SECTIONS } from "@/features/mid_term_curves/curves"
import {
  formatMonth,
  PRICE_FORMAT,
  summarizeMonth,
} from "@/features/mid_term_curves/utils"

type CurveField = "curve_1_id" | "curve_2_id"

type Props = {
  months: CustomCurveMonth[]
  priceByMonth: ReadonlyMap<string, CurvePrices>
  onChange: (month: string, patch: Partial<CustomCurveMonth>) => void
}

const HEAD_CLASS = "h-7 bg-[#007079] px-1 py-1 text-[10px] text-white"

/** One editable row per month: a rationale and up to two curves whose average is shown. */
export function CurveMonthsTable({ months, priceByMonth, onChange }: Props) {
  const changeCurve = (
    month: CustomCurveMonth,
    field: CurveField,
    value: string | null,
  ) => {
    const otherField: CurveField =
      field === "curve_1_id" ? "curve_2_id" : "curve_1_id"
    onChange(month.month, {
      [field]: value,
      // The same curve cannot be picked twice.
      ...(value && month[otherField] === value ? { [otherField]: null } : {}),
    })
  }

  return (
    <Table
      containerClassName="min-h-0 flex-1 overflow-auto"
      className="w-max min-w-[1161px] text-xs"
    >
      <TableHeader className="sticky top-0 z-30">
        <TableRow>
          <TableHead
            className={`sticky left-0 z-40 w-[66px] min-w-[66px] ${HEAD_CLASS}`}
          >
            Month
          </TableHead>
          <TableHead className={`w-[543px] min-w-[543px] ${HEAD_CLASS}`}>
            Fundamental rationale
          </TableHead>
          <TableHead className={`w-[198px] min-w-[198px] ${HEAD_CLASS}`}>
            Curve 1
          </TableHead>
          <TableHead className={`w-[198px] min-w-[198px] ${HEAD_CLASS}`}>
            Curve 2 (Optional)
          </TableHead>
          <TableHead
            className={`w-[66px] min-w-[66px] text-right ${HEAD_CLASS}`}
          >
            Asia LNG
          </TableHead>
          <TableHead
            className={`w-[90px] min-w-[90px] whitespace-normal text-right leading-tight ${HEAD_CLASS}`}
          >
            As % Brent
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {months.map((month) => {
          const { average, brentPercent } = summarizeMonth(
            priceByMonth.get(month.month),
            [month.curve_1_id, month.curve_2_id],
          )
          const rowBackground =
            Number(month.month.slice(0, 4)) % 2 === 1
              ? "bg-neutral-200 dark:bg-neutral-800"
              : "bg-background"

          return (
            <TableRow key={month.month} className={`h-[26px] ${rowBackground}`}>
              <TableCell
                className={`sticky left-0 z-20 w-[66px] min-w-[66px] ${rowBackground} px-1 py-0 text-[11px] font-medium tabular-nums`}
              >
                {formatMonth(month.month)}
              </TableCell>
              <TableCell className="w-[543px] min-w-[543px] px-1 py-0">
                <Input
                  aria-label={`Fundamental rationale for ${month.month}`}
                  className="h-5 w-full min-w-0 px-1 text-[11px]"
                  maxLength={4000}
                  value={month.fundamental_rationale}
                  onChange={(event) =>
                    onChange(month.month, {
                      fundamental_rationale: event.target.value,
                    })
                  }
                />
              </TableCell>
              {(["curve_1_id", "curve_2_id"] as const).map((field) => (
                <TableCell
                  key={field}
                  className="w-[198px] min-w-[198px] px-1 py-0"
                >
                  <select
                    aria-label={`${field === "curve_1_id" ? "First" : "Second"} curve for ${month.month}`}
                    className="h-5 w-full min-w-0 rounded-md border border-input bg-background px-1 text-[11px]"
                    value={month[field] ?? ""}
                    onChange={(event) =>
                      changeCurve(month, field, event.target.value || null)
                    }
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
                {brentPercent === null
                  ? "--"
                  : `${PRICE_FORMAT.format(brentPercent)}%`}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
