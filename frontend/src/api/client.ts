import type { Accuracy, Briefing, IsoDate, Meta, SeriesMode, TimeSeries } from './types'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

/** An API failure carrying a message that is safe to show to the user. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

type Params = Record<string, string | number | undefined>

function buildUrl(path: string, params: Params = {}): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const query = search.toString()
  return `${API_BASE}/api${path}${query ? `?${query}` : ''}`
}

async function readDetail(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && 'detail' in body) {
      const { detail } = body as { detail: unknown }
      if (typeof detail === 'string') return detail
      if (Array.isArray(detail)) return 'The request parameters are invalid.'
    }
  } catch {
    // Non-JSON error bodies fall through to the generic message.
  }
  return null
}

export async function getJson<T>(path: string, params?: Params, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(buildUrl(path, params), {
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'Cannot reach the WindDesk service. Check your connection and retry.')
  }
  if (!response.ok) {
    const detail = await readDetail(response)
    throw new ApiError(
      response.status,
      detail ?? `The WindDesk service returned an error (HTTP ${response.status}).`,
    )
  }
  return (await response.json()) as T
}

export const api = {
  meta: (signal?: AbortSignal) => getJson<Meta>('/meta', undefined, signal),
  briefing: (deliveryDate: IsoDate, gateClosure: string, signal?: AbortSignal) =>
    getJson<Briefing>('/briefing', { deliveryDate, gateClosure }, signal),
  accuracy: (gateClosure: string, signal?: AbortSignal) =>
    getJson<Accuracy>('/accuracy', { gateClosure }, signal),
  timeseries: (
    args: {
      from: IsoDate
      to: IsoDate
      mode: SeriesMode
      gateClosure: string
      leadHours: number
    },
    signal?: AbortSignal,
  ) =>
    getJson<TimeSeries>(
      '/timeseries',
      {
        from: args.from,
        to: args.to,
        mode: args.mode,
        gateClosure: args.gateClosure,
        leadHours: args.leadHours,
      },
      signal,
    ),
}
