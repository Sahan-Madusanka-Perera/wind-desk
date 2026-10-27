import { describe, expect, it } from 'vitest'

import type { Vintage } from '../api/types'
import { deliveryDayTicks, hourTicks, niceCeil, niceTicks, symmetricTicks } from './chart'
import { addDays, clampDate, dateRange, isIsoDate } from './dates'
import { isValidGateClosure } from './useGateClosure'
import { drawOrder, vintageRole } from './vintages'

describe('calendar dates', () => {
  it('validates ISO dates strictly', () => {
    expect(isIsoDate('2026-01-15')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('15/01/2026')).toBe(false)
    expect(isIsoDate(null)).toBe(false)
  })

  it('adds days across month ends and builds inclusive ranges', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(dateRange('2026-01-30', '2026-02-01')).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
    ])
    expect(clampDate('2025-12-01', '2026-01-02', '2026-02-01')).toBe('2026-01-02')
    expect(clampDate('2026-03-01', '2026-01-02', '2026-02-01')).toBe('2026-02-01')
  })
})

describe('gate closure validation', () => {
  it('accepts HH:MM before 23:00 only', () => {
    expect(isValidGateClosure('09:50')).toBe(true)
    expect(isValidGateClosure('22:59')).toBe(true)
    expect(isValidGateClosure('23:00')).toBe(false)
    expect(isValidGateClosure('9:50')).toBe(false)
    expect(isValidGateClosure(undefined)).toBe(false)
  })
})

describe('chart scales', () => {
  it('produces clean ticks from zero', () => {
    expect(niceTicks(17805)).toEqual([0, 5000, 10000, 15000, 20000])
    expect(niceTicks(2301)).toEqual([0, 1000, 2000, 3000])
    expect(niceTicks(0)).toEqual([0, 1])
    expect(symmetricTicks(4133)).toEqual([-5000, -2500, 0, 2500, 5000])
    expect(niceCeil(17805)).toBe(20000)
  })

  it('places time ticks on UK clock hours and delivery-day starts', () => {
    const start = Date.parse('2026-01-14T23:00:00Z')
    const end = Date.parse('2026-01-15T23:00:00Z')
    const ticks = hourTicks(start, end, 6)
    expect(ticks.map((t) => new Date(t).toISOString().slice(11, 16))).toEqual([
      '00:00',
      '06:00',
      '12:00',
      '18:00',
    ])
    const dayTicks = deliveryDayTicks(start, Date.parse('2026-01-17T23:00:00Z'), 1)
    expect(dayTicks).toHaveLength(4)
  })
})

function vintage(publishTime: string, available: boolean, used: boolean): Vintage {
  return { publishTime, availableAtDecision: available, usedForDecision: used, points: [] }
}

describe('forecast vintages', () => {
  it('classifies runs by availability at gate closure', () => {
    expect(vintageRole(vintage('a', true, true))).toBe('used')
    expect(vintageRole(vintage('b', true, false))).toBe('earlier')
    expect(vintageRole(vintage('c', false, false))).toBe('later')
  })

  it('draws the decision run last so it is never hidden', () => {
    const order = drawOrder([
      vintage('used', true, true),
      vintage('later', false, false),
      vintage('earlier', true, false),
    ])
    expect(order.map((o) => o.vintage.publishTime)).toEqual(['later', 'earlier', 'used'])
    expect(order.map((o) => o.index)).toEqual([1, 2, 0])
  })
})
