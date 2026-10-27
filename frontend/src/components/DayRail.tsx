import { useEffect, useRef, type KeyboardEvent } from 'react'

import { formatDateLong, formatGwh } from '../lib/format'

export interface RailDay {
  date: string
  /** Forecast wind energy for the day as known at gate closure (no hindsight). */
  forecastEnergyMwh: number | null
}

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/**
 * Every delivery day of the pilot as a stepped rail; bar height is the wind energy the
 * desk was forecast to receive, so windy and calm days are visible before choosing.
 */
export function DayRail({
  days,
  selected,
  onSelect,
}: {
  days: RailDay[]
  selected: string
  onSelect: (date: string) => void
}) {
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const max = Math.max(1, ...days.map((d) => d.forecastEnergyMwh ?? 0))

  // On narrow screens the rail scrolls: keep the selected day in view.
  // Scrolls the rail only (never the page), so stepping days keeps the reader's place.
  useEffect(() => {
    const node = refs.current.get(selected)
    const rail = node?.parentElement
    if (!node || !rail) return
    const left = node.offsetLeft
    const right = left + node.offsetWidth
    if (left < rail.scrollLeft) rail.scrollLeft = left - 8
    else if (right > rail.scrollLeft + rail.clientWidth)
      rail.scrollLeft = right - rail.clientWidth + 8
  }, [selected])

  const focusDay = (date: string | undefined) => {
    if (!date) return
    onSelect(date)
    refs.current.get(date)?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = days.findIndex((d) => d.date === selected)
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 }
    if (event.key in moves) {
      event.preventDefault()
      event.stopPropagation()
      focusDay(days[Math.min(days.length - 1, Math.max(0, index + (moves[event.key] ?? 0)))]?.date)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusDay(days[0]?.date)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusDay(days.at(-1)?.date)
    }
  }

  return (
    // ARIA toolbar with a roving tabindex: focus lives on the selected day, not the container.
    // oxlint-disable-next-line jsx-a11y/interactive-supports-focus
    <div className="dayrail" role="toolbar" aria-label="Delivery day" onKeyDown={onKeyDown}>
      {days.map((day) => {
        const date = new Date(`${day.date}T00:00:00Z`)
        const weekday = date.getUTCDay()
        const isSelected = day.date === selected
        const height = day.forecastEnergyMwh ? Math.max(3, (day.forecastEnergyMwh / max) * 24) : 2
        const energy = day.forecastEnergyMwh
          ? `, forecast ${formatGwh(day.forecastEnergyMwh)} GWh`
          : ''
        return (
          <button
            key={day.date}
            ref={(node) => {
              if (node) refs.current.set(day.date, node)
              else refs.current.delete(day.date)
            }}
            type="button"
            className={`dayrail-day${weekday === 0 || weekday === 6 ? ' dayrail-weekend' : ''}`}
            aria-current={isSelected ? 'date' : undefined}
            aria-label={`${formatDateLong(day.date)}${energy}`}
            title={`${formatDateLong(day.date)}${energy}`}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(day.date)}
          >
            <span className="dayrail-bar" style={{ height }} aria-hidden="true" />
            <span className="dayrail-label" aria-hidden="true">
              <span>{WEEKDAY[weekday]}</span>
              <span className="dayrail-num">{date.getUTCDate()}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
