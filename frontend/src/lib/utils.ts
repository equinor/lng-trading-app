import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatHtmlText(value: string | null | undefined) {
  if (!value) return ""

  const source = String(value).trim()
  if (!source) return ""

  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return source
      .replace(/<li\b[^>]*>/gi, "\n• ")
      .replace(/<\/li>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(source, "text/html")
  const output: string[] = []

  const pushBreak = () => {
    if (output.at(-1) !== "") output.push("")
  }

  const pushText = (text: string) => {
    const cleaned = text.replace(/\s+/g, " ").trim()
    if (cleaned) output.push(cleaned)
  }

  const walk = (node: ChildNode) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(node.textContent ?? "")
      return
    }

    if (!(node instanceof Element)) return

    const tag = node.tagName.toLowerCase()
    if (tag === "li") {
      const text = node.textContent?.replace(/\s+/g, " ").trim()
      if (text) output.push(`• ${text}`)
      return
    }

    if (tag === "p" || tag === "div" || tag === "section" || tag === "article") {
      const text = node.textContent?.replace(/\s+/g, " ").trim()
      if (text) {
        output.push(text)
        pushBreak()
      }
      return
    }

    if (tag === "ul" || tag === "ol") {
      node.childNodes.forEach(walk)
      pushBreak()
      return
    }

    if (tag === "br") {
      pushBreak()
      return
    }

    node.childNodes.forEach(walk)
  }

  doc.body.childNodes.forEach(walk)

  return output
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
