// frontend/src/hooks/useHiddenArticles.ts
import { useCallback, useState } from "react"

import { readJson, writeJson } from "@/lib/storage"

const HIDDEN_KEY = "news-hidden-articles-v1"

/**
 * Client-side "hide" flag for news articles, persisted in localStorage.
 *
 * Hidden articles stay favourited and are still shown (greyed out) on the full
 * News Summary page, but are omitted entirely from the condensed page.
 */
export function useHiddenArticles() {
  const [hidden, setHidden] = useState<Set<number>>(() => {
    const stored = readJson<number[]>(localStorage, HIDDEN_KEY) ?? []
    return new Set(stored)
  })

  const toggleHidden = useCallback((id: number) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      writeJson(localStorage, HIDDEN_KEY, [...next])
      return next
    })
  }, [])

  const isHidden = useCallback((id: number) => hidden.has(id), [hidden])

  return { hidden, isHidden, toggleHidden }
}
