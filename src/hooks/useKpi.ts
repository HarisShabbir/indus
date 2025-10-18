import { useEffect, useMemo, useState } from 'react'

import type { ContractRightPanelLatest, ContractRightPanelSeries } from '../api'
import { fetchContractKpiLatest, fetchContractKpiSeries } from '../api'

type AsyncState<T> = {
  data: T | null
  loading: boolean
  error: string | null
}

const latestCache = new Map<string, ContractRightPanelLatest>()
const seriesCache = new Map<string, ContractRightPanelSeries>()

const emptyLatest: ContractRightPanelLatest = { latest: {} }

export function useLatest(contractId: string | null | undefined, enabled = true): AsyncState<ContractRightPanelLatest> {
  const cacheKey = contractId ?? 'nil'
  const [state, setState] = useState<AsyncState<ContractRightPanelLatest>>({ data: null, loading: false, error: null })

  useEffect(() => {
    if (!enabled || !contractId) {
      setState({ data: null, loading: false, error: null })
      return
    }
    if (latestCache.has(cacheKey)) {
      setState({ data: latestCache.get(cacheKey) ?? emptyLatest, loading: false, error: null })
      return
    }

    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))

    fetchContractKpiLatest(contractId)
      .then((payload) => {
        if (cancelled) return
        const data = payload ?? emptyLatest
        latestCache.set(cacheKey, data)
        setState({ data, loading: false, error: null })
      })
      .catch((error: Error) => {
        if (cancelled) return
        setState({ data: null, loading: false, error: error.message })
      })

    return () => {
      cancelled = true
    }
  }, [cacheKey, contractId, enabled])

  return useMemo(() => state, [state])
}

export function useSeries(
  contractId: string | null | undefined,
  metricCode: string,
  days = 90,
  enabled = true,
): AsyncState<ContractRightPanelSeries> {
  const cacheKey = contractId ? `${contractId}:${metricCode}:${days}` : 'nil'
  const [state, setState] = useState<AsyncState<ContractRightPanelSeries>>({ data: null, loading: false, error: null })

  useEffect(() => {
    if (!enabled || !contractId) {
      setState({ data: null, loading: false, error: null })
      return
    }
    if (seriesCache.has(cacheKey)) {
      setState({ data: seriesCache.get(cacheKey) ?? { dates: [], actual: [], planned: [] }, loading: false, error: null })
      return
    }

    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))

    fetchContractKpiSeries(contractId, metricCode, days)
      .then((payload) => {
        if (cancelled) return
        const data = payload ?? { dates: [], actual: [], planned: [] }
        seriesCache.set(cacheKey, data)
        setState({ data, loading: false, error: null })
      })
      .catch((error: Error) => {
        if (cancelled) return
        setState({ data: null, loading: false, error: error.message })
      })

    return () => {
      cancelled = true
    }
  }, [cacheKey, contractId, metricCode, days, enabled])

  return useMemo(() => state, [state])
}

export function useContractKpiLatest(contractId: string | null | undefined, enabled = true) {
  return useLatest(contractId, enabled)
}

export function useContractKpiSeries(contractId: string | null | undefined, metricCode: string, days = 90, enabled = true) {
  return useSeries(contractId, metricCode, days, enabled)
}
