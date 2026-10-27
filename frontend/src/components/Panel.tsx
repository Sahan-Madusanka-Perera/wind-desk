import { useId, useState, type ReactNode } from 'react'

import { ChartIcon, TableIcon } from './Icons'

interface PanelProps {
  title: string
  sub?: ReactNode
  actions?: ReactNode
  /** Table twin of the chart: every chart can be read without colour or hover. */
  table?: ReactNode
  flush?: boolean
  refreshing?: boolean
  note?: ReactNode
  className?: string
  children: ReactNode
}

export function Panel({
  title,
  sub,
  actions,
  table,
  flush = false,
  refreshing = false,
  note,
  className,
  children,
}: PanelProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const headingId = useId()

  return (
    <section className={['panel', className].filter(Boolean).join(' ')} aria-labelledby={headingId}>
      <header className="panel-head">
        <h2 className="panel-title" id={headingId}>
          {title}
        </h2>
        {sub ? <span className="panel-sub">{sub}</span> : null}
        {actions || table ? (
          <div className="panel-actions">
            {actions}
            {table ? (
              <div className="segmented" role="group" aria-label={`${title} view`}>
                <button
                  type="button"
                  aria-pressed={view === 'chart'}
                  onClick={() => setView('chart')}
                  title="Chart view"
                >
                  <ChartIcon size={14} />
                  <span className="visually-hidden">Chart view</span>
                </button>
                <button
                  type="button"
                  aria-pressed={view === 'table'}
                  onClick={() => setView('table')}
                  title="Table view"
                >
                  <TableIcon size={14} />
                  <span className="visually-hidden">Table view</span>
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>
      <div
        className={[
          'panel-body',
          flush || view === 'table' ? 'panel-body-flush' : '',
          refreshing ? 'is-refreshing' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-busy={refreshing || undefined}
      >
        {table && view === 'table' ? table : children}
      </div>
      {note ? <div className="panel-note">{note}</div> : null}
    </section>
  )
}
