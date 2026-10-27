import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '../api/queries'
import { App } from '../App'
import { accuracy, briefing, meta } from '../test/fixtures'

function stubApi(overrides: Record<string, Response> = {}) {
  const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>((input) => {
    const url = new URL(String(input), 'http://localhost')
    const override = overrides[url.pathname]
    if (override) return Promise.resolve(override.clone())
    if (url.pathname === '/api/meta') return Promise.resolve(Response.json(meta))
    if (url.pathname === '/api/briefing')
      return Promise.resolve(
        Response.json({ ...briefing, deliveryDate: url.searchParams.get('deliveryDate') }),
      )
    if (url.pathname === '/api/accuracy') return Promise.resolve(Response.json(accuracy))
    return Promise.resolve(Response.json({ detail: 'Not Found' }, { status: 404 }))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Briefing page', () => {
  it('shows the decision-time forecast summary for the requested delivery day', async () => {
    const fetchMock = stubApi()
    renderAt('/briefing/2026-01-15')

    const summary = within(await screen.findByLabelText('Delivery day summary'))
    expect(summary.getByText('39.7')).toBeInTheDocument() // expected wind, GWh
    expect(summary.getByText('33.7')).toBeInTheDocument() // firm at 90%
    expect(summary.getByText('47.3')).toBeInTheDocument() // NESO forecast
    expect(summary.getByText('20 min before gate closure')).toBeInTheDocument()
    expect(screen.getByText(/outturn ≈ 0.677 × forecast \+ 2,560 MW/)).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('/api/briefing?deliveryDate=2026-01-15&gateClosure=09%3A50'),
      ),
    ).toBe(true)
  })

  it('steps to the next delivery day with the arrow key', async () => {
    const fetchMock = stubApi()
    renderAt('/briefing/2026-01-15')
    await screen.findByLabelText('Delivery day summary')
    await userEvent.keyboard('{ArrowRight}')
    expect(
      await screen.findByRole('heading', { name: /delivery Fri, 16 Jan 2026/ }),
    ).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('2026-01-16'))).toBe(true)
  })

  it('refetches with the chosen gate closure', async () => {
    const fetchMock = stubApi()
    renderAt('/briefing/2026-01-15')
    await screen.findByLabelText('Delivery day summary')
    await userEvent.click(screen.getByRole('button', { name: 'EPEX 09:20' }))
    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).includes('gateClosure=09%3A20')),
      ).toBe(true),
    )
  })

  it('explains when a delivery day is outside the pilot', async () => {
    stubApi()
    renderAt('/briefing/2025-06-01')
    expect(await screen.findByText('That delivery day is outside the pilot')).toBeInTheDocument()
  })

  it('reports API failures with a retry action', async () => {
    stubApi({
      '/api/briefing': Response.json(
        { detail: 'Wind data is temporarily unavailable.' },
        { status: 503 },
      ),
    })
    renderAt('/briefing/2026-01-15')
    expect(
      await screen.findByText('Wind data is temporarily unavailable.', {}, { timeout: 4000 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})

describe('Accuracy page', () => {
  it('compares NESO and calibrated accuracy and explains each chart with a finding', async () => {
    stubApi()
    renderAt('/accuracy')
    expect(await screen.findByRole('heading', { name: 'Accuracy report' })).toBeInTheDocument()
    const headline = within(
      await screen.findByRole('table', { name: /NESO forecast and the calibrated/ }),
    )
    const mae = headline.getByRole('row', { name: /Mean absolute error/ })
    expect(within(mae).getByText('1,500')).toBeInTheDocument()
    expect(within(mae).getByText('1,036')).toBeInTheDocument()
    expect(within(mae).getByText('\u221230.9%')).toBeInTheDocument()
    expect(headline.getByRole('row', { name: /inside 80% range/ })).toHaveTextContent('80.0%')
    expect(screen.getByText(/ran 1.5 GW above outturn on average/)).toBeInTheDocument()
    expect(screen.getByText(/cut mean absolute error from 1,500 to 1,036 MW/)).toBeInTheDocument()
  })
})

describe('Navigation', () => {
  it('redirects the root to the briefing and supports number-key sections', async () => {
    stubApi()
    renderAt('/')
    await screen.findByLabelText('Delivery day summary')
    await userEvent.keyboard('4')
    expect(await screen.findByRole('heading', { name: 'Methodology' })).toBeInTheDocument()
  })

  it('shows a not-found view for unknown paths', async () => {
    stubApi()
    renderAt('/nowhere')
    expect(await screen.findByText('Page not found')).toBeInTheDocument()
  })
})
