// frontend/src/components/News/ArticleEditPanel.tsx
import { useEffect, useState } from "react"
import { EyeOff, Star, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  type DbNewsRow,
  type DbSentiment,
  patchClassification,
  patchFavourite,
  patchSentiment,
} from "@/services/news/news_api"
import { cleanTagValue } from "@/services/news/news_utils"

const SENTIMENTS: { label: string; value: DbSentiment }[] = [
  { label: "Bullish", value: "bullish" },
  { label: "Bearish", value: "bearish" },
  { label: "Neutral", value: "neutral" },
  { label: "None", value: null },
]

/**
 * Inline editor for a single article: favourite, hide, sentiment and the
 * region/category tags. Changes are patched to the backend immediately; `onPatched`
 * is called afterwards so the caller can refresh the list.
 */
export function ArticleEditPanel(props: {
  article: DbNewsRow
  isHidden: boolean
  onToggleHidden: () => void
  onPatched: () => void
}) {
  const { article, isHidden, onToggleHidden, onPatched } = props
  const [saving, setSaving] = useState(false)
  const [regions, setRegions] = useState<string[]>(article.region ?? [])
  const [categories, setCategories] = useState<string[]>(article.category ?? [])
  const [newRegion, setNewRegion] = useState("")
  const [newCategory, setNewCategory] = useState("")

  useEffect(() => {
    setRegions(article.region ?? [])
    setCategories(article.category ?? [])
  }, [article.region, article.category])

  const run = async (fn: () => Promise<unknown>) => {
    setSaving(true)
    try {
      await fn()
      onPatched()
    } finally {
      setSaving(false)
    }
  }

  const toggleFavourite = () => run(() => patchFavourite(article.id, !article.favourited))
  const chooseSentiment = (value: DbSentiment) => run(() => patchSentiment(article.id, value))
  const saveClassification = (nextCategories: string[], nextRegions: string[]) =>
    run(() => patchClassification(article.id, nextCategories, nextRegions))

  const addRegion = () => {
    const value = newRegion.trim()
    if (!value || regions.includes(value)) return
    const next = [...regions, value]
    setRegions(next)
    setNewRegion("")
    void saveClassification(categories, next)
  }
  const removeRegion = (value: string) => {
    const next = regions.filter((r) => r !== value)
    setRegions(next)
    void saveClassification(categories, next)
  }
  const addCategory = () => {
    const value = newCategory.trim()
    if (!value || categories.includes(value)) return
    const next = [...categories, value]
    setCategories(next)
    setNewCategory("")
    void saveClassification(next, regions)
  }
  const removeCategory = (value: string) => {
    const next = categories.filter((c) => c !== value)
    setCategories(next)
    void saveClassification(next, regions)
  }

  const currentSentiment = article.official_sentiment ?? null

  return (
    <div className="mt-1 space-y-2 rounded border bg-muted/30 p-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant={article.favourited ? "default" : "outline"}
          className="h-6 gap-1 px-2 text-[11px]"
          disabled={saving}
          onClick={toggleFavourite}
        >
          <Star className={`h-3 w-3 ${article.favourited ? "fill-current" : ""}`} />
          {article.favourited ? "Favourited" : "Favourite"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={isHidden ? "default" : "outline"}
          className="h-6 gap-1 px-2 text-[11px]"
          onClick={onToggleHidden}
        >
          <EyeOff className="h-3 w-3" />
          {isHidden ? "Hidden" : "Hide"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-muted-foreground">Sentiment</span>
        {SENTIMENTS.map((s) => (
          <Button
            key={s.label}
            type="button"
            size="sm"
            variant={currentSentiment === s.value ? "default" : "outline"}
            className="h-6 px-2 text-[11px]"
            disabled={saving}
            onClick={() => chooseSentiment(s.value)}
          >
            {s.label}
          </Button>
        ))}
      </div>

      <TagEditor
        label="Regions"
        tags={regions}
        newValue={newRegion}
        setNewValue={setNewRegion}
        onAdd={addRegion}
        onRemove={removeRegion}
        disabled={saving}
      />
      <TagEditor
        label="Categories"
        tags={categories}
        newValue={newCategory}
        setNewValue={setNewCategory}
        onAdd={addCategory}
        onRemove={removeCategory}
        disabled={saving}
      />
    </div>
  )
}

function TagEditor(props: {
  label: string
  tags: string[]
  newValue: string
  setNewValue: (value: string) => void
  onAdd: () => void
  onRemove: (value: string) => void
  disabled: boolean
}) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-muted-foreground">{props.label}</span>
        {props.tags.map((tag) => (
          <Badge key={`${props.label}-${tag}`} variant="secondary" className="gap-1 pr-1 text-[10px]">
            {cleanTagValue(tag)}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              className="rounded-full px-0.5 hover:bg-muted-foreground/20"
              disabled={props.disabled}
              onClick={() => props.onRemove(tag)}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-1">
        <Input
          value={props.newValue}
          placeholder={`Add ${props.label.toLowerCase().replace(/s$/, "")}...`}
          className="h-6 text-[11px]"
          disabled={props.disabled}
          onChange={(e) => props.setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              props.onAdd()
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-6 px-2 text-[11px]"
          disabled={props.disabled || !props.newValue.trim()}
          onClick={props.onAdd}
        >
          Add
        </Button>
      </div>
    </div>
  )
}
