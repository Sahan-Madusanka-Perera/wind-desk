import type { ReactNode } from 'react'

export interface QuoteItem {
  id: string
  label: ReactNode
  value: ReactNode
  unit?: string
  sub?: ReactNode
  primary?: boolean
}

/** A terminal quote line: the few numbers that matter, side by side at equal rank. */
export function Quotes({ items, label }: { items: QuoteItem[]; label: string }) {
  return (
    <dl className="quotes" aria-label={label}>
      {items.map((item) => (
        <div key={item.id} className={item.primary ? 'quote quote-primary' : 'quote'}>
          <dt className="quote-label">{item.label}</dt>
          <dd className="quote-value">
            {item.value}
            {item.unit ? <small>{item.unit}</small> : null}
          </dd>
          {item.sub ? <dd className="quote-sub">{item.sub}</dd> : null}
        </div>
      ))}
    </dl>
  )
}
