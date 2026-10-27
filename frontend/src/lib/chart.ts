import { ukDateHour } from './format'

/** Chart chrome shared by every plot: recessive solid hairlines, muted ticks. */
export const AXIS = {
  stroke: 'var(--axis)',
  tickLine: false,
  tick: { fill: 'var(--ink-3)', fontSize: 11 },
} as const

export const GRID = { stroke: 'var(--grid)', strokeDasharray: undefined } as const

export const CURSOR = { stroke: 'var(--ink-3)', strokeWidth: 1 } as const

export const MARGIN = { top: 8, right: 16, bottom: 4, left: 4 } as const

/** Active point marker: >= 8px with a 2px ring in the surface colour. */
export function activeDot(color: string) {
  return { r: 4, fill: color, stroke: 'var(--panel)', strokeWidth: 2 }
}

const HOUR_MS = 3_600_000

/** Ticks at UK clock hours divisible by `every` inside [start, end]. */
export function hourTicks(start: number, end: number, every: number): number[] {
  const ticks: number[] = []
  for (let t = Math.ceil(start / HOUR_MS) * HOUR_MS; t <= end; t += HOUR_MS) {
    if (ukDateHour(t).hour % every === 0) ticks.push(t)
  }
  return ticks
}

/** Ticks at the start (23:00 UK) of every `every`-th delivery day inside [start, end]. */
export function deliveryDayTicks(start: number, end: number, every: number): number[] {
  const ticks: number[] = []
  let index = 0
  for (let t = Math.ceil(start / HOUR_MS) * HOUR_MS; t <= end; t += HOUR_MS) {
    if (ukDateHour(t).hour === 23) {
      if (index % every === 0) ticks.push(t)
      index += 1
    }
  }
  return ticks
}

/**
 * Axis ticks from zero on a clean 1 / 2 / 2.5 / 5 step, about `target` intervals,
 * ending at or just above `max`.
 */
export function niceTicks(max: number, target = 4): number[] {
  if (!(max > 0)) return [0, 1]
  const rough = max / target
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude
  const ticks: number[] = []
  for (let value = 0; value < max + step; value += step) {
    ticks.push(Math.round(value * 1e6) / 1e6)
    if (value >= max) break
  }
  return ticks
}

/** Symmetric ticks around zero for signed values. */
export function symmetricTicks(extent: number, target = 2): number[] {
  const positive = niceTicks(extent, target)
  return [
    ...positive
      .slice(1)
      .map((v) => -v)
      .toReversed(),
    ...positive,
  ]
}

/** Round an axis maximum up to a clean step. */
export function niceCeil(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
  const step = steps.find((s) => s * magnitude >= value) ?? 10
  return step * magnitude
}
