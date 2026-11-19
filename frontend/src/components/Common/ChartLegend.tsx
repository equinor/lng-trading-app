export type LegendItem = { name: string; color: string }

/** Chart legend kept outside the chart so the plot can use the full width. */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  if (items.length === 0) return null
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items.map((item) => (
        <li key={item.name} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: item.color }}
          />
          {item.name}
        </li>
      ))}
    </ul>
  )
}
