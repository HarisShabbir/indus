import { useQuery } from '@tanstack/react-query'

import { fetchRccMetrics } from '../api'
import type { RccEnvironmentMetric } from '../types/rcc'

export function useRccMetrics(sowId: string) {
  const { data, error, isLoading, refetch } = useQuery<RccEnvironmentMetric[], Error>({
    queryKey: ['rcc-metrics', sowId],
    queryFn: () => fetchRccMetrics(sowId),
    staleTime: 1000 * 60 * 2,
  })

  return {
    metrics: data ?? [],
    metricsError: error,
    metricsLoading: isLoading,
    refreshMetrics: refetch,
  }
}
