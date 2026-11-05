export function formatTime(iso: string | null) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(+d)) return "—"
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function readTimeMinFromContent(content: string | null) {
  if (!content) return 2
  const words = content.trim().split(/\s+/).filter(Boolean).length
  return Math.max(2, Math.min(10, Math.round(words / 220)))
}

export function cleanTagValue(value: unknown) {
  if (value == null) return ""
  const text = String(value).trim()
  if (!text) return ""

  return text
    .replace(/^\[+/, "")
    .replace(/\]+$/, "")
    .replace(/^['\"]+/, "")
    .replace(/['\"]+$/, "")
    .trim()
}
