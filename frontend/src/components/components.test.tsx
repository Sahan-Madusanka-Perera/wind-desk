import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { briefing, meta } from '../test/fixtures'
import { Blotter } from './Blotter'
import { DayRail } from './DayRail'
import { GateClosureControl } from './GateClosureControl'
import { Panel } from './Panel'

describe('Blotter', () => {
  it('lists every hourly product with forecast, calibrated value, outturn and range hits', () => {
    render(<Blotter briefing={briefing} showActual />)
    const rows = screen.getAllByRole('row')
    // header + 3 products + footer
    expect(rows).toHaveLength(5)
    const first = within(rows[1] as HTMLElement)
    expect(first.getByRole('rowheader')).toHaveTextContent('23:00D-1')
    expect(first.getByText('16,010')).toBeInTheDocument()
    expect(first.getByText('13,396')).toBeInTheDocument()
    expect(first.getByText('13,992')).toBeInTheDocument()
    expect(first.getByText('+2,018')).toBeInTheDocument()
    expect(first.getByText('inside range')).toBeInTheDocument()
    // 01:00: calibrated 11,019 with range 9,019-12,519 misses the 14,200 outturn
    expect(within(rows[3] as HTMLElement).getByText('outside range')).toBeInTheDocument()
    expect(screen.getByText('2/3 h in range')).toBeInTheDocument()
  })

  it('hides hindsight columns when outturn is switched off', () => {
    render(<Blotter briefing={briefing} showActual={false} />)
    expect(screen.queryByText('13,992')).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /outturn/i })).not.toBeInTheDocument()
  })
})

describe('GateClosureControl', () => {
  it('switches between auction presets', async () => {
    const onChange = vi.fn<(next: string) => void>()
    render(
      <GateClosureControl value="09:50" presets={meta.gateClosurePresets} onChange={onChange} />,
    )
    expect(screen.getByRole('button', { name: 'N2EX 09:50' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(screen.getByRole('button', { name: 'EPEX 09:20' }))
    expect(onChange).toHaveBeenCalledWith('09:20')
  })

  it('accepts a valid custom time on Enter', async () => {
    const onChange = vi.fn<(next: string) => void>()
    render(
      <GateClosureControl value="09:50" presets={meta.gateClosurePresets} onChange={onChange} />,
    )
    const input = screen.getByLabelText('Custom gate closure, UK time')
    await userEvent.clear(input)
    await userEvent.type(input, '08:00{Enter}')
    expect(onChange).toHaveBeenCalledWith('08:00')
  })
})

describe('DayRail', () => {
  const days = ['2026-01-14', '2026-01-15', '2026-01-16'].map((date, i) => ({
    date,
    forecastEnergyMwh: 100_000 * (i + 1),
  }))

  it('marks the selected day and moves with the arrow keys', async () => {
    const onSelect = vi.fn<(date: string) => void>()
    render(<DayRail days={days} selected="2026-01-15" onSelect={onSelect} />)
    const selected = screen.getByRole('button', { name: /Thu, 15 Jan 2026/ })
    expect(selected).toHaveAttribute('aria-current', 'date')
    expect(selected).toHaveAccessibleName('Thu, 15 Jan 2026, forecast 200.0 GWh')
    selected.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onSelect).toHaveBeenLastCalledWith('2026-01-16')
    await userEvent.keyboard('{Home}')
    expect(onSelect).toHaveBeenLastCalledWith('2026-01-14')
  })
})

describe('Panel', () => {
  it('offers a table view twin for its chart', async () => {
    render(
      <Panel title="Test chart" table={<p>table body</p>}>
        <p>chart body</p>
      </Panel>,
    )
    expect(screen.getByRole('heading', { name: 'Test chart' })).toBeInTheDocument()
    expect(screen.getByText('chart body')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Table view' }))
    expect(screen.getByText('table body')).toBeInTheDocument()
    expect(screen.queryByText('chart body')).not.toBeInTheDocument()
  })
})
