import { describe, expect, it } from 'vitest'

import {
  deliveryDateOf,
  formatAxisMw,
  formatDateLong,
  formatDuration,
  formatGwh,
  formatMw,
  formatPct,
  formatSignedGw,
  formatSignedMw,
  formatUkTime,
  minutesBetween,
  ukDateHour,
} from './format'

describe('number formatting', () => {
  it('formats MW with thousands separators and a true minus sign', () => {
    expect(formatMw(12345.4)).toBe('12,345')
    expect(formatMw(-1500)).toBe('−1,500')
    expect(formatSignedMw(1727)).toBe('+1,727')
    expect(formatSignedMw(-12.3)).toBe('−12')
    expect(formatSignedMw(0.2)).toBe('0')
  })

  it('formats energy and percentages', () => {
    expect(formatGwh(255880)).toBe('255.9')
    expect(formatSignedGw(31416)).toBe('+31.4')
    expect(formatSignedGw(-20)).toBe('0.0')
    expect(formatPct(79.97)).toBe('80.0%')
    expect(formatPct(-38.7)).toBe('−38.7%')
  })

  it('formats compact axis ticks', () => {
    expect(formatAxisMw(0)).toBe('0')
    expect(formatAxisMw(750)).toBe('750')
    expect(formatAxisMw(2500)).toBe('2.5k')
    expect(formatAxisMw(20000)).toBe('20k')
    expect(formatAxisMw(-5000)).toBe('−5k')
  })

  it('formats durations', () => {
    expect(formatDuration(20)).toBe('20 min')
    expect(formatDuration(120)).toBe('2 h')
    expect(formatDuration(135)).toBe('2 h 15 min')
    expect(minutesBetween('2026-01-14T09:30:00Z', '2026-01-14T09:50:00Z')).toBe(20)
  })
})

describe('UK time', () => {
  it('shows GMT in winter and BST in summer', () => {
    expect(formatUkTime('2026-01-14T23:00:00Z')).toBe('23:00')
    expect(formatUkTime('2026-07-14T22:00:00Z')).toBe('23:00')
  })

  it('formats calendar dates without time-zone drift', () => {
    expect(formatDateLong('2026-01-15')).toBe('Thu, 15 Jan 2026')
  })

  it('finds the UK date and hour of an instant', () => {
    expect(ukDateHour('2026-07-14T23:30:00Z')).toEqual({ date: '2026-07-15', hour: 0 })
  })

  it('assigns instants to GB day-ahead delivery days (23:00 UK boundary)', () => {
    expect(deliveryDateOf('2026-01-14T22:30:00Z')).toBe('2026-01-14')
    expect(deliveryDateOf('2026-01-14T23:00:00Z')).toBe('2026-01-15')
    expect(deliveryDateOf('2026-01-31T23:00:00Z')).toBe('2026-02-01')
    expect(deliveryDateOf('2026-07-14T22:00:00Z')).toBe('2026-07-15')
  })
})
