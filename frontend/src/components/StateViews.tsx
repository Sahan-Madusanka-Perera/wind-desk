import { ApiError } from '../api/client'
import { RetryIcon } from './Icons'

export function Skeleton({ height = 240 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} aria-hidden="true" />
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <div style={{ width: '100%' }}>
        <Skeleton height={180} />
      </div>
      <span className="visually-hidden">{label}</span>
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof ApiError
      ? error.message
      : 'Something went wrong while loading this view. Retry, or reload the page.'
  return (
    <div className="state" role="alert">
      <p className="state-title">Data could not be loaded</p>
      <p className="state-text">{message}</p>
      {onRetry ? (
        <button type="button" className="btn" onClick={onRetry}>
          <RetryIcon size={14} />
          Retry
        </button>
      ) : null}
    </div>
  )
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="state">
      <p className="state-title">{title}</p>
      <p className="state-text">{text}</p>
    </div>
  )
}
