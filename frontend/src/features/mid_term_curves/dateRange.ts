import { createContext, useContext } from "react"

export type CurveDateRange = {
  fromDate: string
  toDate: string
  minDate: string
  setFromDate: (value: string) => void
  setToDate: (value: string) => void
}

export const CurveDateRangeContext = createContext<CurveDateRange | null>(null)

export function useCurveDateRange(): CurveDateRange {
  const context = useContext(CurveDateRangeContext)
  if (!context) {
    throw new Error("useCurveDateRange must be used within CurveDateRangeContext.")
  }
  return context
}