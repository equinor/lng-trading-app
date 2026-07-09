// frontend/src/hooks/useHiddenArticles.ts
import { useCallback, useState } from "react"

import { readJson, writeJson } from "@/lib/storage"

const HIDDEN_KEY = "news-hidden-articles-v2"

function composite(panelKey: string, id: number): string {
  return `${panelKey}::${id}`
}

/**
 * Client-side "hide" flag for news articles, scoped per panel/section and
 * persisted in localStorage.
 *
 * Hiding an article in one section (a sentiment panel or a specific category
 * panel) does not affect the same article in other sections. Hidden articles
 * stay favourited and are still shown (greyed out) on the full News Summary
 * page, but are omitted from that section on the condensed page.
 */
export function useHiddenArticles() {
  const [hidden, setHidden] = useState<Set<string>>(() => {
    const stored = readJson<string[]>(localStorage, HIDDEN_KEY) ?? []
    return new Set(stored)
  })

  const toggleHidden = useCallback((panelKey: string, id: number) => {
    setHidden((prev) => {
      const key = composite(panelKey, id)
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      writeJson(localStorage, HIDDEN_KEY, [...next])
      return next
    })
  }, [])

  const isHidden = useCallback(
    (panelKey: string, id: number) => hidden.has(composite(panelKey, id)),
    [hidden],
  )

  return { hidden, isHidden, toggleHidden }
}
