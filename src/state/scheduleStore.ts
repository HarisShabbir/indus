import { useSyncExternalStore } from 'react'
import type { ContractSchedule, KPIResponse } from '../api'

export type ScheduleLevel = 'contract' | 'sow' | 'process'

export type FilterState = {
  range: '30d' | '60d' | '90d' | 'custom'
  criticalOnly: boolean
  showBaseline: boolean
  showMilestones: boolean
  search: string
  statuses: Array<'on-track' | 'monitoring' | 'risk'>
}

type ScheduleStore = {
  currentContractId: string | null
  schedules: Record<string, ContractSchedule>
  loading: boolean
  error: string | null
  kpis: KPIResponse | null
  whatIfOffset: number
  whatIfNotes: string[]
  whatIfProjectedFinish: string | null
  whatIfProjectedDelta: number | null
  whatIfSpiProjected: number | null
  selectedLevel: ScheduleLevel
  selectedId: string | null
  selectedContractId: string | null
  selectedRowId: string | null
  expanded: Record<string, boolean>
  filters: FilterState
  setCurrentContractId: (contractId: string | null) => void
  setLoading: (loading: boolean) => void
  setError: (message: string | null) => void
  setSchedule: (contractId: string, schedule: ContractSchedule) => void
  toggleExpansion: (entityId: string) => void
  selectItem: (level: ScheduleLevel, id: string | null, contractId: string | null, rowId: string | null) => void
  setFilters: (partial: Partial<FilterState>) => void
  setKpis: (kpis: KPIResponse | null) => void
  setWhatIf: (payload: {
    finish?: string | null
    delta?: number | null
    notes?: string[]
    offset?: number
    spiProjected?: number | null
  }) => void
  reset: () => void
}

const initialFilters: FilterState = {
  range: '90d',
  criticalOnly: false,
  showBaseline: false,
  showMilestones: true,
  search: '',
  statuses: ['on-track', 'monitoring', 'risk'],
}

type Listener = () => void

const createStore = <T,>(initializer: (set: (partial: Partial<T> | ((state: T) => Partial<T>)) => void, get: () => T) => T) => {
  const listeners = new Set<Listener>()
  let state: T

  const get = () => state
  const set = (partial: Partial<T> | ((state: T) => Partial<T>)) => {
    const next = typeof partial === 'function' ? (partial as (state: T) => Partial<T>)(state) : partial
    state = { ...state, ...next }
    listeners.forEach((listener) => listener())
  }

  state = initializer(set, get)

  const subscribe = (listener: Listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return { getState: get, setState: set, subscribe }
}

const scheduleStoreApi = createStore<ScheduleStore>((set) => ({
  currentContractId: null,
  schedules: {},
  loading: false,
  error: null,
  kpis: null,
  whatIfOffset: 0,
  whatIfNotes: [],
  whatIfProjectedFinish: null,
  whatIfProjectedDelta: null,
  whatIfSpiProjected: null,
  selectedLevel: 'contract',
  selectedId: null,
  selectedContractId: null,
  selectedRowId: null,
  expanded: {},
  filters: initialFilters,
  setCurrentContractId: (contractId) => set({ currentContractId: contractId }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setSchedule: (contractId, schedule) =>
    set((state) => {
      const expanded = { ...state.expanded }
      const contractKey = `contract:${contractId}`
      if (expanded[contractKey] === undefined) {
        expanded[contractKey] = false
      }
      schedule.sows.forEach((sow) => {
        const key = `sow:${sow.id}`
        if (expanded[key] === undefined) {
          expanded[key] = false
        }
      })
      return {
        schedules: { ...state.schedules, [contractId]: schedule },
        expanded,
      }
    }),
  toggleExpansion: (id) =>
    set((state) => ({
      expanded: { ...state.expanded, [id]: !state.expanded[id] },
    })),
  selectItem: (level, id, contractId, rowId) =>
    set({
      selectedLevel: level,
      selectedId: id,
      selectedContractId: contractId,
      selectedRowId: rowId,
    }),
  setFilters: (partial) =>
    set((state) => ({
      filters: { ...state.filters, ...partial },
    })),
  setKpis: (kpis) => set({ kpis }),
  setWhatIf: ({ finish, delta, notes, offset, spiProjected }) =>
    set((state) => ({
      whatIfProjectedFinish: finish ?? state.whatIfProjectedFinish,
      whatIfProjectedDelta: delta ?? state.whatIfProjectedDelta,
      whatIfNotes: notes ?? state.whatIfNotes,
      whatIfOffset: offset ?? state.whatIfOffset,
      whatIfSpiProjected: spiProjected ?? state.whatIfSpiProjected,
    })),
  reset: () =>
    set({
      currentContractId: null,
      schedules: {},
      loading: false,
      error: null,
      kpis: null,
      whatIfOffset: 0,
      whatIfNotes: [],
      whatIfProjectedFinish: null,
      whatIfProjectedDelta: null,
      whatIfSpiProjected: null,
      selectedLevel: 'contract',
      selectedId: null,
      selectedContractId: null,
      selectedRowId: null,
      expanded: {},
      filters: initialFilters,
    }),
}))

export const useScheduleStore = Object.assign(
  () => useSyncExternalStore(scheduleStoreApi.subscribe, scheduleStoreApi.getState, scheduleStoreApi.getState),
  {
    getState: scheduleStoreApi.getState,
    setState: scheduleStoreApi.setState,
  },
) as (() => ScheduleStore) & {
  getState: () => ScheduleStore
  setState: (partial: Partial<ScheduleStore> | ((state: ScheduleStore) => Partial<ScheduleStore>)) => void
}
