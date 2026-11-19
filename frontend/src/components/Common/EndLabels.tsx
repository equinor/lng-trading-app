import { usePlotArea, useXAxisScale, useYAxisScale } from "recharts"

export type EndLabel = {
  key: string
  /** The x category the line ends on. */
  x: string
  value: number
  color: string
}

const LINE_HEIGHT = 14
const OFFSET = 8

/** Moves labels apart so none overlaps the next, keeping them between `top` and `bottom`. */
function spread(ys: number[], top: number, bottom: number): number[] {
  const order = ys.map((_, i) => i).sort((a, b) => ys[a] - ys[b])
  const placed = order.map((i) => Math.min(Math.max(ys[i], top), bottom))
  for (let i = 1; i < placed.length; i++) {
    placed[i] = Math.max(placed[i], placed[i - 1] + LINE_HEIGHT)
  }
  // Labels pushed past the bottom edge are pulled back up.
  for (let i = placed.length - 1; i >= 0; i--) {
    const limit = i === placed.length - 1 ? bottom : placed[i + 1] - LINE_HEIGHT
    placed[i] = Math.min(placed[i], limit)
  }
  const result = new Array<number>(ys.length)
  order.forEach((index, rank) => {
    result[index] = placed[rank]
  })
  return result
}

/** The value at the tail end of each line. Must be a child of a Recharts chart. */
export function EndLabels({
  labels,
  format = (value) => value.toFixed(2),
}: {
  labels: EndLabel[]
  format?: (value: number) => string
}) {
  const xScale = useXAxisScale()
  const yScale = useYAxisScale()
  const plot = usePlotArea()
  if (!xScale || !yScale || !plot) return null
  const top = plot.y + LINE_HEIGHT / 2
  const bottom = plot.y + plot.height - LINE_HEIGHT / 2

  const points = labels.flatMap((label) => {
    const px = xScale(label.x)
    const py = yScale(label.value)
    return typeof px === "number" && typeof py === "number"
      ? [{ label, px, py }]
      : []
  })

  // Lines that end on the same x compete for the same space, so each group is spread apart.
  const groups = new Map<number, typeof points>()
  for (const point of points) {
    groups.set(point.px, [...(groups.get(point.px) ?? []), point])
  }

  return (
    <g>
      {[...groups.values()].flatMap((group) => {
        const ys = spread(
          group.map((p) => p.py),
          top,
          bottom,
        )
        return group.map(({ label, px }, i) => (
          <text
            key={label.key}
            x={px + OFFSET}
            y={ys[i]}
            dominantBaseline="middle"
            fontSize={11}
            fontWeight={600}
            fill={label.color}
            stroke="var(--background)"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {format(label.value)}
          </text>
        ))
      })}
    </g>
  )
}
