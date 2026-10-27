/** Calendar-date helpers for YYYY-MM-DD strings (no time zone involved). */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !ISO_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Inclusive list of dates from first to last. */
export function dateRange(first: string, last: string): string[] {
  const dates: string[] = []
  for (let cursor = first; cursor <= last; cursor = addDays(cursor, 1)) dates.push(cursor)
  return dates
}

export function clampDate(value: string, first: string, last: string): string {
  if (value < first) return first
  if (value > last) return last
  return value
}
