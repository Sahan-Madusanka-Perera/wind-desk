import type { ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'

import type { Meta } from '../api/types'
import { formatDateCompact, formatDateLong, formatUkDayTime } from '../lib/format'
import { GATE_CLOSURE_PARAM } from '../lib/useGateClosure'
import { useHotkeys } from '../lib/useHotkeys'
import { BrandMark } from './Icons'

const SECTIONS = [
  { key: '1', path: '/briefing', label: 'Briefing', long: 'Day-ahead briefing' },
  { key: '2', path: '/accuracy', label: 'Accuracy', long: 'Accuracy report' },
  { key: '3', path: '/explorer', label: 'Explorer', long: 'Forecast explorer' },
  { key: '4', path: '/methodology', label: 'Method', long: 'Methodology' },
] as const

/** Carries the decision time (?gc=) across sections so the whole desk stays in one context. */
function useSectionHref(): (path: string) => string {
  const { search } = useLocation()
  const gateClosure = new URLSearchParams(search).get(GATE_CLOSURE_PARAM)
  return (path) => (gateClosure ? `${path}?${GATE_CLOSURE_PARAM}=${gateClosure}` : path)
}

export function Shell({ meta, children }: { meta: Meta | undefined; children: ReactNode }) {
  const navigate = useNavigate()
  const href = useSectionHref()

  useHotkeys(
    Object.fromEntries(
      SECTIONS.map((section) => [section.key, () => navigate(href(section.path))]),
    ),
  )

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link className="brand" to={href('/briefing')} aria-label="WindDesk home">
          <BrandMark />
          <span className="brand-name">WINDDESK</span>
        </Link>
        <nav aria-label="Sections" style={{ display: 'flex', minWidth: 0 }}>
          <ul className="fkeys">
            {SECTIONS.map((section) => (
              <li key={section.path}>
                <NavLink
                  className="fkey"
                  to={href(section.path)}
                  title={`${section.long} (key ${section.key})`}
                >
                  <kbd aria-hidden="true">{section.key}</kbd>
                  <span>{section.label.toUpperCase()}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="topbar-status" aria-label="Data status">
          <span className="status-dot" aria-hidden="true" />
          {meta ? (
            <span>
              {meta.data.source === 'live' ? 'LIVE' : 'SNAPSHOT'} · PILOT · DECISIONS{' '}
              {formatDateCompact(meta.firstDecisionDate).toUpperCase()}–
              {formatDateCompact(meta.lastDecisionDate).toUpperCase()}{' '}
              {meta.lastDecisionDate.slice(0, 4)} · UK TIME
            </span>
          ) : (
            <span>CONNECTING…</span>
          )}
        </div>
      </header>

      <main id="main" className="page" tabIndex={-1}>
        {children}
      </main>

      <footer className="statusline">
        <span>
          Source: Elexon Insights Solution (BMRS) · WINDFOR wind forecasts · FUELHH wind outturn
        </span>
        {meta ? (
          <>
            <span>
              Snapshot {formatUkDayTime(meta.data.fetchedAt)} UK · {meta.data.forecastRuns} forecast
              runs · {meta.data.actualRecords.toLocaleString('en-GB')} settlement periods
            </span>
            <span>
              Window {formatDateLong(meta.firstDeliveryDate)} –{' '}
              {formatDateLong(meta.lastDeliveryDate)} delivery
            </span>
          </>
        ) : null}
        <span>
          <a href="/api/docs">API</a> · v{meta?.version ?? '1.0.0'}
        </span>
      </footer>
    </div>
  )
}
