// frontend/src/hooks/useEquinorFont.ts
import { useEffect } from "react"

const EQUINOR_FONT_HREF = "https://cdn.eds.equinor.com/font/eds-uprights-vf.css"

/**
 * Injects the Equinor brand font stylesheet at runtime (once), and removes it
 * on unmount if this hook added it. Safe to call from multiple components.
 */
export function useEquinorFont(): void {
  useEffect(() => {
    const existing = document.querySelector(`link[rel="stylesheet"][href="${EQUINOR_FONT_HREF}"]`)
    if (existing) return

    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = EQUINOR_FONT_HREF
    document.head.appendChild(link)

    return () => {
      link.remove()
    }
  }, [])
}
