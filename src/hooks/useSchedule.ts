import { useEffect, useMemo, useState } from 'react'

import type { GanttTask } from '../types'
import { fetchContractSchedule, fetchProcessSchedule, fetchProjectSchedule, fetchSowSchedule } from '../api'

type Scope = 'project' | 'contract' | 'sow' | 'process'

type ScheduleState = {
  data: GanttTask[]
  loading: boolean
  error: string | null
}

const cache = new Map<string, GanttTask[]>()

const fetchers: Record<Scope, (id: string) => Promise<GanttTask[]>> = {
  project: fetchProjectSchedule,
  contract: fetchContractSchedule,
  sow: fetchSowSchedule,
  process: fetchProcessSchedule,
}

function useSchedule(scope: Scope, identifier: string | null | undefined, enabled = true): ScheduleState {
  const cacheKey = useMemo(() => (identifier ? `${scope}:${identifier}` : 'nil'), [scope, identifier])
  const [state, setState] = useState<ScheduleState>({ data: [], loading: false, error: null })

  useEffect(() => {
    if (!enabled || !identifier) {
      setState({ data: [], loading: false, error: null })
      return
    }
    if (cache.has(cacheKey)) {
      setState({ data: cache.get(cacheKey) ?? [], loading: false, error: null })
      return
    }

    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))

    fetchers[scope](identifier)
      .then((tasks) => {
        if (cancelled) return
        cache.set(cacheKey, tasks)
        setState({ data: tasks, loading: false, error: null })
      })
      .catch((error: Error) => {
        if (cancelled) return
        setState({ data: [], loading: false, error: error.message })
      })

    return () => {
      cancelled = true
    }
  }, [cacheKey, enabled, identifier, scope])

  return state
}

export const useProjectSchedule = (projectId: string | null | undefined, enabled = true) =>
  useSchedule('project', projectId, enabled)

export const useContractSchedule = (contractId: string | null | undefined, enabled = true) =>
  useSchedule('contract', contractId, enabled)

export const useSowSchedule = (sowId: string | null | undefined, enabled = true) =>
  useSchedule('sow', sowId, enabled)

export const useProcessSchedule = (processId: string | null | undefined, enabled = true) =>
  useSchedule('process', processId, enabled)
