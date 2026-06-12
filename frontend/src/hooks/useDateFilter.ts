import { useState } from "react"

function getDefault(key: string, fallback: string): string {
  try {
    return sessionStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function defaultFrom(daysBack: number) {
  return new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10)
}

export function useDateFilter(pageKey: string, defaultDaysBack: number) {
  const keyFrom = `${pageKey}-date-from`
  const keyTo = `${pageKey}-date-to`
  const fallbackFrom = defaultFrom(defaultDaysBack)

  const [dateFrom, setDateFromRaw] = useState(() => getDefault(keyFrom, fallbackFrom))
  const [dateTo, setDateToRaw] = useState(() => getDefault(keyTo, ""))

  const setDateFrom = (v: string) => {
    setDateFromRaw(v)
    try { sessionStorage.setItem(keyFrom, v) } catch { /* */ }
  }

  const setDateTo = (v: string) => {
    setDateToRaw(v)
    try { sessionStorage.setItem(keyTo, v) } catch { /* */ }
  }

  const resetDates = () => {
    setDateFrom(defaultFrom(defaultDaysBack))
    setDateTo("")
  }

  return { dateFrom, setDateFrom, dateTo, setDateTo, resetDates }
}
