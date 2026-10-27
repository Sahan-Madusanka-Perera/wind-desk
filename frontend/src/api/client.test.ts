import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError, getJson } from './client'

function mockFetch(response: Response | Error) {
  const fetchMock = vi.fn<() => Promise<Response>>(() =>
    response instanceof Response ? Promise.resolve(response) : Promise.reject(response),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getJson', () => {
  it('builds the URL from parameters and returns the parsed body', async () => {
    const fetchMock = mockFetch(Response.json({ ok: true }))
    await expect(api.briefing('2026-01-15', '09:50')).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/briefing?deliveryDate=2026-01-15&gateClosure=09%3A50',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
  })

  it('skips undefined parameters', async () => {
    const fetchMock = mockFetch(Response.json({}))
    await getJson('/meta', { a: undefined, b: 1 })
    expect(fetchMock).toHaveBeenCalledWith('/api/meta?b=1', expect.anything())
  })

  it('surfaces the API validation message', async () => {
    mockFetch(Response.json({ detail: 'Delivery date must be between X and Y' }, { status: 422 }))
    await expect(api.accuracy('09:50')).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      message: 'Delivery date must be between X and Y',
    })
  })

  it('summarises framework validation errors', async () => {
    mockFetch(Response.json({ detail: [{ loc: ['query'] }] }, { status: 422 }))
    await expect(api.meta()).rejects.toThrow('The request parameters are invalid.')
  })

  it('falls back to a generic message for non-JSON errors', async () => {
    mockFetch(new Response('<html>', { status: 502 }))
    await expect(api.meta()).rejects.toThrow('HTTP 502')
  })

  it('reports network failures as status 0', async () => {
    mockFetch(new TypeError('Failed to fetch'))
    const error = await api.meta().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(0)
  })

  it('passes aborts through untouched', async () => {
    mockFetch(new DOMException('aborted', 'AbortError'))
    await expect(api.meta()).rejects.toMatchObject({ name: 'AbortError' })
  })
})
