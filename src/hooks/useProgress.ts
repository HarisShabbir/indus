import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { fetchProgressSummary, type ProgressSummary, type ProgressSummaryRequest } from '../api'
import { FEATURE_PROGRESS_V2 } from '../config'

const DEFAULT_POLL_INTERVAL_MS = 45_000
const MIN_POLL_INTERVAL_MS = 10_000

type ProgressHookState = {
  data: ProgressSummary | null
  loading: boolean
  refreshing: boolean
  error: string | null
  lastFetched: number | null
}

const INITIAL_STATE: ProgressHookState = {
  data: null,
  loading: false,
  refreshing: false,
  error: null,
  lastFetched: null,
}

export function useProgressSummary(
  params: ProgressSummaryRequest,
  options?: { enabled?: boolean; pollIntervalMs?: number },
) {
  const { enabled = true, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS } = options ?? {}
  const scope = useMemo<ProgressSummaryRequest>(
    () => ({
      projectId: params.projectId,
      contractId: params.contractId ?? null,
      sowId: params.sowId ?? null,
      processId: params.processId ?? null,
      tenantId: params.tenantId ?? null,
    }),
    [params.contractId, params.processId, params.projectId, params.sowId, params.tenantId],
  )
  const scopeKey = useMemo(() => JSON.stringify(scope), [scope])
  const [state, setState] = useState<ProgressHookState>(INITIAL_STATE)
  const [tick, setTick] = useState(0)
  const controllerRef = useRef<AbortController | null>(null)

  const supportsProgress = FEATURE_PROGRESS_V2 && enabled && Boolean(scope.projectId)

  const refresh = useCallback(() => {
    setTick((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!supportsProgress) {
      controllerRef.current?.abort()
      setState(INITIAL_STATE)
      return () => {
        controllerRef.current?.abort()
      }
    }

    let active = true

    const executeFetch = async () => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller

      setState((prev) => ({
        data: prev.data,
        loading: prev.data === null,
        refreshing: prev.data !== null,
        error: null,
        lastFetched: prev.lastFetched,
      }))

      try {
        const data = await fetchProgressSummary(scope, controller.signal)
        if (!active) {
          return
        }
        setState({
          data,
          loading: false,
          refreshing: false,
          error: null,
          lastFetched: Date.now(),
        })
      } catch (error) {
        if (!active) {
          return
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        const message =
          error instanceof Error ? error.message || 'Unable to load progress summary' : 'Unable to load progress summary'
        setState((prev) => ({
          ...prev,
          loading: false,
          refreshing: false,
          error: message,
        }))
      }
    }

    executeFetch()
    const interval = window.setInterval(
      executeFetch,
      Math.max(MIN_POLL_INTERVAL_MS, pollIntervalMs),
    )

    return () => {
      active = false
      controllerRef.current?.abort()
      window.clearInterval(interval)
    }
  }, [supportsProgress, scope, scopeKey, pollIntervalMs, tick])

  return useMemo(
    () => ({
      data: state.data,
      loading: state.loading,
      refreshing: state.refreshing,
      error: state.error,
      lastFetched: state.lastFetched,
      refresh,
      enabled: supportsProgress,
    }),
    [refresh, state.data, state.error, state.lastFetched, state.loading, state.refreshing, supportsProgress],
  )
}
