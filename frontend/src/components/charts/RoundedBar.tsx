interface BarShapeProps {
  x?: number
  y?: number
  width?: number
  height?: number
  fill?: string
  value?: number | [number, number]
}

/**
 * Bar with a 4px rounded data end and a square baseline end; works for negative values
 * (the rounded end then faces down).
 */
export function RoundedBar({ x = 0, y = 0, width = 0, height = 0, fill, value }: BarShapeProps) {
  if (width <= 0 || height === 0) return null
  const top = Math.min(y, y + height)
  const h = Math.abs(height)
  const numeric = Array.isArray(value) ? value[1] - value[0] : (value ?? 0)
  const r = Math.min(4, width / 2, h)
  const right = x + width
  const bottom = top + h
  const path =
    numeric >= 0
      ? `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${right - r} Q${right},${top} ${right},${top + r} V${bottom} Z`
      : `M${x},${top} V${bottom - r} Q${x},${bottom} ${x + r},${bottom} H${right - r} Q${right},${bottom} ${right},${bottom - r} V${top} Z`
  return <path d={path} fill={fill} />
}
