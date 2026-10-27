/**
 * Formatting helpers. Every clock time is shown in UK local time (GMT/BST), the
 * convention of the GB power market, whatever the viewer's own time zone.
 */

export const UK_TIME_ZONE = 'Europe/London'
const MINUS = '−'

const integerFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })
const oneDecimalFormat = new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const ukTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const ukDayTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const ukDateParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
})
const calendarShort = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
const calendarLong = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const calendarCompact = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
})

function withSign(value: number, formatted: string): string {
  if (value > 0) return `+${formatted}`
  if (value < 0) return `${MINUS}${formatted}`
  return formatted
}

/** 12,345 */
export function formatMw(value: number): string {
  const rounded = Math.round(value)
  return rounded < 0 ? `${MINUS}${integerFormat.format(-rounded)}` : integerFormat.format(rounded)
}

/** +1,234 / −1,234 / 0 */
export function formatSignedMw(value: number): string {
  const rounded = Math.round(value)
  return withSign(rounded, integerFormat.format(Math.abs(rounded)))
}

/** MW as GW with one decimal: 12.3 */
export function formatGw(valueMw: number): string {
  const gw = valueMw / 1000
  return gw < 0 ? `${MINUS}${oneDecimalFormat.format(-gw)}` : oneDecimalFormat.format(gw)
}

export function formatSignedGw(valueMw: number): string {
  return withSign(Math.round(valueMw / 100), oneDecimalFormat.format(Math.abs(valueMw) / 1000))
}

/** MWh as GWh with one decimal: 255.9 */
export function formatGwh(valueMwh: number): string {
  return oneDecimalFormat.format(valueMwh / 1000)
}

export function formatPct(value: number, digits = 1): string {
  const formatted = Math.abs(value).toFixed(digits)
  return value < 0 ? `${MINUS}${formatted}%` : `${formatted}%`
}

export function formatSignedPct(value: number, digits = 1): string {
  return withSign(value, `${Math.abs(value).toFixed(digits)}%`)
}

/** Compact axis ticks: 0, 5k, 10k, 15k */
export function formatAxisMw(value: number): string {
  if (value === 0) return '0'
  const abs = Math.abs(value)
  const text = abs >= 1000 ? `${Number((abs / 1000).toFixed(2))}k` : String(Math.round(abs))
  return value < 0 ? `${MINUS}${text}` : text
}

export function formatHours(hours: number): string {
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`
}

/** 23:00 (UK) */
export function formatUkTime(instant: string | number): string {
  return ukTime.format(new Date(instant))
}

/** Thu 15 Jan, 09:30 (UK) */
export function formatUkDayTime(instant: string | number): string {
  return ukDayTime.format(new Date(instant))
}

/** Fri 16 Jan, for a YYYY-MM-DD calendar date */
export function formatDateShort(isoDate: string): string {
  return calendarShort.format(new Date(`${isoDate}T00:00:00Z`))
}

/** Fri 16 Jan 2026 */
export function formatDateLong(isoDate: string): string {
  return calendarLong.format(new Date(`${isoDate}T00:00:00Z`))
}

/** 16 Jan */
export function formatDateCompact(isoDate: string): string {
  return calendarCompact.format(new Date(`${isoDate}T00:00:00Z`))
}

/** UK local calendar date and hour of an instant. */
export function ukDateHour(instant: string | number): { date: string; hour: number } {
  const parts = Object.fromEntries(
    ukDateParts.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) }
}

/** GB day-ahead delivery day an instant belongs to: 23:00 UK starts the next day. */
export function deliveryDateOf(instant: string | number): string {
  const { date, hour } = ukDateHour(instant)
  if (hour < 23) return date
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
}

/** Minutes between two instants, e.g. how long before gate closure a run was published. */
export function minutesBetween(earlier: string, later: string): number {
  return Math.round((Date.parse(later) - Date.parse(earlier)) / 60000)
}

export function formatDuration(minutes: number): string {
  const abs = Math.abs(minutes)
  if (abs < 60) return `${abs} min`
  const hours = Math.floor(abs / 60)
  const rest = abs % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}
