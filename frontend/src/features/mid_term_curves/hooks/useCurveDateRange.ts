import { createContext, useContext } from "react"

export type CurveDateRange = {
  fromDate: string
  toDate: string
  /** Earliest month with data; the date pickers cannot go before it. */
  minDate: string
  setFromDate: (value: string) => void
  setToDate: (value: string) => void
}

export const CurveDateRangeContext = createContext<CurveDateRange | null>(null)

/** The From/To range chosen in the page header, shared by every tab. */
export function useCurveDateRange(): CurveDateRange {
  const context = useContext(CurveDateRangeContext)
  if (!context) {
    throw new Error(
      "useCurveDateRange must be used within CurveDateRangeContext.",
    )
  }
  return context
}
