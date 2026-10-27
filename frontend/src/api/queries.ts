import { keepPreviousData, QueryClient, useQuery } from '@tanstack/react-query'

import { api, ApiError } from './client'
import type { IsoDate, SeriesMode } from './types'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The pilot dataset is an immutable snapshot: nothing goes stale in a session.
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) =>
          failureCount < 2 && !(error instanceof ApiError && error.status === 422),
      },
    },
  })
}

export const queryKeys = {
  meta: ['meta'] as const,
  briefing: (deliveryDate: IsoDate, gateClosure: string) =>
    ['briefing', deliveryDate, gateClosure] as const,
  accuracy: (gateClosure: string) => ['accuracy', gateClosure] as const,
  timeseries: (from: IsoDate, to: IsoDate, mode: SeriesMode, gateClosure: string, lead: number) =>
    ['timeseries', from, to, mode, gateClosure, lead] as const,
}

export function useMeta() {
  return useQuery({ queryKey: queryKeys.meta, queryFn: ({ signal }) => api.meta(signal) })
}

export function useBriefing(deliveryDate: IsoDate | undefined, gateClosure: string | undefined) {
  return useQuery({
    queryKey: queryKeys.briefing(deliveryDate ?? '', gateClosure ?? ''),
    queryFn: ({ signal }) => api.briefing(deliveryDate as IsoDate, gateClosure as string, signal),
    enabled: Boolean(deliveryDate && gateClosure),
    placeholderData: keepPreviousData,
  })
}

export function useAccuracy(gateClosure: string | undefined) {
  return useQuery({
    queryKey: queryKeys.accuracy(gateClosure ?? ''),
    queryFn: ({ signal }) => api.accuracy(gateClosure as string, signal),
    enabled: Boolean(gateClosure),
    placeholderData: keepPreviousData,
  })
}

export function useTimeseries(args: {
  from: IsoDate | undefined
  to: IsoDate | undefined
  mode: SeriesMode
  gateClosure: string | undefined
  leadHours: number
}) {
  const { from, to, mode, gateClosure, leadHours } = args
  return useQuery({
    queryKey: queryKeys.timeseries(from ?? '', to ?? '', mode, gateClosure ?? '', leadHours),
    queryFn: ({ signal }) =>
      api.timeseries(
        {
          from: from as IsoDate,
          to: to as IsoDate,
          mode,
          gateClosure: gateClosure as string,
          leadHours,
        },
        signal,
      ),
    enabled: Boolean(from && to && gateClosure),
    placeholderData: keepPreviousData,
  })
}
