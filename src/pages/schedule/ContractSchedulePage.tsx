import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import {
  fetchContractScheduleDetail,
  fetchScheduleKpis,
  postScheduleWhatIf,
  type ContractSchedule,
  type ScheduleWhatIfResponse,
  type SOWScheduleItem,
  type Project,
} from '../../api'
import { FEATURE_SCHEDULE_UI } from '../../config'
import { SidebarNav, ACCS_NAV_INDEX, HOME_NAV_INDEX, sidebarItems } from '../../layout/navigation'
import Breadcrumbs from '../../components/breadcrumbs/Breadcrumbs'
import ScheduleGantt, { ScheduleRow } from '../../components/schedule/ScheduleGantt'
import GaugeCard from '../../components/kpi/GaugeCard'
import Sparkline from '../../components/kpi/Sparkline'
import SmartInsights from '../../components/insights/SmartInsights'
import { useScheduleStore } from '../../state/scheduleStore'
import type { FilterState } from '../../state/scheduleStore'
import { readAuthToken } from '../../utils/auth'

type LocationState = {
  projectName?: string
  projectId?: string
  projectSnapshot?: Project | null
  contractId?: string
} | null

type ThemeMode = 'light' | 'dark'

const resourceCatalog = [
  { key: 'excavator', label: 'Excavator crews', description: 'Accelerate excavation & concreting cycles.' },
  { key: 'crew', label: 'Formwork / shift crews', description: 'Adds finishing teams to close hand-off gaps.' },
  { key: 'qa', label: 'QA inspectors & drones', description: 'Faster clearances reduce rework loops.' },
] as const

type ResourceKey = (typeof resourceCatalog)[number]['key']
type ResourcePlan = Record<ResourceKey, number>

const DEFAULT_STATUSES: FilterState['statuses'] = ['on-track', 'monitoring', 'risk']

const DEFAULT_PEER_CONTRACTS: Array<{ id: string; code: string; name: string }> = [
  { id: 'mw-02-powerhouse', code: 'MW-02', name: 'MW-02 – Powerhouse' },
  { id: 'mw-03-spillway', code: 'MW-03', name: 'MW-03 – Spillway & Intake' },
  { id: 'mw-04-transmission', code: 'MW-04', name: 'MW-04 – Transmission Corridor' },
]

const toTitleCase = (input: string): string =>
  input
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')
    .trim()

const derivePeerContract = (targetId: string): PeerContract => {
  const normalized = targetId.replace(/^contract:/, '')
  const directMatch =
    DEFAULT_PEER_CONTRACTS.find(
      (peer) =>
        peer.id === normalized ||
        peer.id === targetId ||
        peer.code === normalized ||
        peer.code === targetId ||
        peer.name === normalized ||
        peer.name === targetId,
    ) ?? null

  if (directMatch) return directMatch

  const title = toTitleCase(normalized)
  return {
    id: normalized,
    code: normalized.toUpperCase(),
    name: title.length ? title : normalized.toUpperCase(),
  }
}

const statusFromSpi = (spi?: number | null): 'on-track' | 'monitoring' | 'risk' => {
  if (spi === null || spi === undefined) return 'on-track'
  if (spi < 0.9) return 'risk'
  if (spi < 1) return 'monitoring'
  return 'on-track'
}

const calcSlipDays = (sow: SOWScheduleItem): number => {
  const startMs = new Date(sow.startPlanned ?? sow.startActual ?? Date.now()).getTime()
  const endMs = new Date(sow.endPlanned ?? sow.endActual ?? Date.now()).getTime()
  const duration = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)))
  const spi = sow.spi ?? 1
  return Math.round(duration * (1 - spi))
}

const average = (values: Array<number | null | undefined>): number | null => {
  const clean = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value))
  if (!clean.length) return null
  return clean.reduce((sum, value) => sum + value, 0) / clean.length
}

const contractWindow = (schedule: ContractSchedule, sows: SOWScheduleItem[]) => {
  const pool = sows.length ? sows : schedule.sows ?? []
  if (!pool.length) {
    const instant = new Date(schedule.updatedAt ?? Date.now())
    return { start: instant, end: instant }
  }
  const start = new Date(Math.min(...pool.map((sow) => new Date(sow.startPlanned ?? sow.startActual ?? Date.now()).getTime())))
  const end = new Date(Math.max(...pool.map((sow) => new Date(sow.endPlanned ?? sow.endActual ?? Date.now()).getTime())))
  return { start, end }
}

const fmtM = (value?: number | null) => ((value ?? null) === null ? '--' : `${value.toFixed(1)} M`)

const DAY_MS = 24 * 60 * 60 * 1000
const PLACEHOLDER_SPAN_DAYS = 120

const VALUE_GLOSSARY = [
  { code: 'EV', description: 'Earned Value – budgeted value of the work actually completed.' },
  { code: 'PV', description: 'Planned Value – budgeted value of work that was scheduled to be done by now.' },
  { code: 'AC', description: 'Actual Cost – the amount spent to achieve the current progress.' },
]

const formatIndexValue = (value?: number | null): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  return value.toFixed(2)
}

const describePerformanceIndex = (value?: number | null): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'No data available'
  if (value >= 1.05) return 'Well ahead of plan'
  if (value >= 1) return 'On track'
  if (value >= 0.9) return 'Slightly behind plan'
  return 'Needs recovery'
}

type PeerContract = NonNullable<ContractSchedule['peerContracts']>[number]

const normalizePlaceholderWindow = (start?: Date | null, end?: Date | null) => {
  const fallback = new Date()
  let safeStart =
    start && Number.isFinite(start.getTime()) ? new Date(start.getTime()) : new Date(fallback.getTime())
  let safeEnd = end && Number.isFinite(end.getTime()) ? new Date(end.getTime()) : new Date(fallback.getTime())

  if (safeEnd < safeStart) {
    const swap = safeStart
    safeStart = safeEnd
    safeEnd = swap
  }

  if (safeEnd.getTime() === safeStart.getTime()) {
    safeStart = new Date(safeStart.getTime() - PLACEHOLDER_SPAN_DAYS * DAY_MS)
    safeEnd = new Date(safeEnd.getTime() + PLACEHOLDER_SPAN_DAYS * DAY_MS)
  }

  return { start: safeStart, end: safeEnd }
}

const buildPlaceholderSchedule = (peer: PeerContract, referenceWindow?: { start: Date; end: Date }): ContractSchedule => {
  const peerId = peer.id ?? peer.code ?? peer.name ?? `contract-${Math.random().toString(36).slice(2)}`
  const contractName = peer.name ?? peer.code ?? peerId
  const contractCode = peer.code ?? peerId
  const normalized = normalizePlaceholderWindow(referenceWindow?.start ?? null, referenceWindow?.end ?? null)

  return {
    id: peerId,
    code: contractCode,
    name: contractName,
    updatedAt: normalized.end.toISOString(),
    sows: [],
    peerContracts: [],
    placeholder: true,
    windowHint: {
      start: normalized.start.toISOString(),
      end: normalized.end.toISOString(),
    },
  }
}

export default function ContractSchedulePage(): JSX.Element {
  const navigate = useNavigate()
  const { id: routeContractId } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const state = (location.state as LocationState) ?? null
  const isAuthenticated = readAuthToken()

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/', { state: { openView: 'login' } })
    }
  }, [isAuthenticated, navigate])

  if (!isAuthenticated) {
    return null
  }

  const storeState = useScheduleStore()
  const {
    schedules,
    expanded,
    loading,
    error,
    filters,
    kpis,
    whatIfOffset,
    whatIfProjectedFinish,
    whatIfProjectedDelta,
    whatIfNotes,
    whatIfSpiProjected,
    currentContractId,
    selectedRowId,
    selectedLevel,
    selectedId,
    setCurrentContractId,
    setSchedule,
    toggleExpansion,
    selectItem,
    setFilters,
    setKpis,
    setLoading,
    setError,
    setWhatIf,
    reset,
  } = storeState

  const [theme, setTheme] = useState<ThemeMode>((document.documentElement.dataset.theme as ThemeMode) ?? 'light')
  const [activeNav, setActiveNav] = useState<number>(ACCS_NAV_INDEX)
  const [resourcePlan, setResourcePlan] = useState<ResourcePlan>({ excavator: 0, crew: 0, qa: 0 })
  const [rangeDisplay, setRangeDisplay] = useState<string>('')
  const [whatIfSimulating, setWhatIfSimulating] = useState(false)

  useEffect(() => () => reset(), [reset])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const ensureSchedule = useCallback(
    async (targetId: string, suppressError = false): Promise<ContractSchedule | undefined> => {
      const existing = useScheduleStore.getState().schedules[targetId]
      if (existing) {
        if (existing.placeholder) {
          if (suppressError) return existing
        } else {
          return existing
        }
      }

      const createPlaceholder = () => {
        const peerMeta = derivePeerContract(targetId)
        const referenceSchedule = Object.values(useScheduleStore.getState().schedules).find(
          (schedule) => !schedule.placeholder && (schedule.sows?.length ?? 0) > 0,
        )
        const referenceWindow = referenceSchedule ? contractWindow(referenceSchedule, referenceSchedule.sows ?? []) : undefined
        const placeholder = buildPlaceholderSchedule(peerMeta, referenceWindow)
        setSchedule(targetId, placeholder)
        return placeholder
      }

      if (suppressError) {
        return createPlaceholder()
      }

      try {
        const payload = await fetchContractScheduleDetail(targetId)
        setSchedule(targetId, payload)
        return payload
      } catch (err) {
        if (!suppressError) {
          console.error(err)
        }
        if (!suppressError) {
          setError(err instanceof Error ? err.message : 'Unable to load contract schedule')
        }
        return existing ?? createPlaceholder()
      }
    },
    [setSchedule, setError],
  )

  useEffect(() => {
    if (!FEATURE_SCHEDULE_UI || !routeContractId) return
    let cancelled = false
    setCurrentContractId(routeContractId)
    setLoading(true)
    setResourcePlan({ excavator: 0, crew: 0, qa: 0 })
    ensureSchedule(routeContractId)
      .then((schedule) => {
        if (!schedule || cancelled) return
        const safeId = schedule.id ?? schedule.code ?? schedule.name ?? routeContractId
        setCurrentContractId(safeId)
        selectItem('contract', safeId, safeId, `contract:${safeId}`)
        setWhatIf({ offset: 0, notes: [], delta: null, finish: null, spiProjected: null })
        const referenceWindow = contractWindow(schedule, schedule.sows ?? [])
        const peers =
          schedule.peerContracts && schedule.peerContracts.length > 0 ? schedule.peerContracts : DEFAULT_PEER_CONTRACTS
        peers.forEach((peer) => {
          const peerId = peer.id ?? peer.code ?? peer.name
          if (peerId && peerId !== safeId) {
            const existing = useScheduleStore.getState().schedules[peerId]
            if (!existing) {
              const placeholder = buildPlaceholderSchedule(peer, referenceWindow)
              setSchedule(peerId, placeholder)
            }
            ensureSchedule(peerId, true)
          }
        })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [routeContractId, ensureSchedule, setCurrentContractId, setLoading, selectItem, setWhatIf])

  useEffect(() => {
    const range = searchParams.get('range') as FilterState['range'] | null
    const critical = searchParams.get('critical') === 'true'
    const baseline = searchParams.get('baseline') === 'true'
    const milestones = searchParams.get('milestones') !== 'false'
    const searchValue = searchParams.get('search') ?? ''
    const statusesParam = searchParams.get('statuses')
    const parsedStatuses = statusesParam
      ? (statusesParam.split(',').map((status) => status.trim()).filter(Boolean) as FilterState['statuses'])
      : useScheduleStore.getState().filters.statuses ?? DEFAULT_STATUSES

    setFilters({
      range: range ?? useScheduleStore.getState().filters.range,
      criticalOnly: critical,
      showBaseline: baseline,
      showMilestones: milestones,
      search: searchValue,
      statuses: parsedStatuses.length ? parsedStatuses : DEFAULT_STATUSES,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('range', filters.range)
    params.set('critical', String(filters.criticalOnly))
    params.set('baseline', String(filters.showBaseline))
    params.set('milestones', String(filters.showMilestones))
    if (filters.search) params.set('search', filters.search)
    const activeStatuses = filters?.statuses ?? DEFAULT_STATUSES
    params.set('statuses', activeStatuses.join(','))

    const next = params.toString()
    const current = searchParams.toString()
    if (next !== current) {
      setSearchParams(params, { replace: true })
    }
  }, [filters, searchParams, setSearchParams])

  const activeContractId = currentContractId ?? routeContractId ?? null

  const scheduleEntries = useMemo(
    () =>
      Object.values(schedules)
        .filter((entry): entry is ContractSchedule => Boolean(entry))
        .map((schedule, index) => ({
          schedule,
          index,
          safeId: String(schedule.id ?? schedule.code ?? schedule.name ?? `contract-${index}`),
        })),
    [schedules],
  )

  const filteredSchedules = useMemo(() => {
    return scheduleEntries.map(({ schedule, index, safeId }) => {
      const baseSows = schedule.sows ?? []
      let sows = baseSows
      if (filters.search) {
        const needle = filters.search.toLowerCase()
        sows = sows.filter(
          (sow) =>
            sow.name.toLowerCase().includes(needle) ||
            (sow.code ?? '').toLowerCase().includes(needle) ||
            (sow.processes ?? []).some((proc) => proc.name.toLowerCase().includes(needle)),
        )
      }
      if (filters.criticalOnly) {
        sows = sows.filter((sow) => (sow.spi ?? 1) < 1)
      }
      const statusFilters = filters?.statuses ?? DEFAULT_STATUSES
      if (statusFilters.length) {
        sows = sows.filter((sow) => statusFilters.includes(statusFromSpi(sow.spi)))
      }
      return { schedule, sows, index, safeId }
    })
  }, [scheduleEntries, filters])

  const rows: ScheduleRow[] = useMemo(() => {
    const prepared = filteredSchedules.map(({ schedule, sows, safeId }) => {
      const window = contractWindow(schedule, sows)
      const hasConcreteData = (sows?.length ?? 0) > 0 || (schedule.sows?.length ?? 0) > 0
      return { schedule, sows, safeId, window, hasConcreteData }
    })

    let globalStart: Date | null = null
    let globalEnd: Date | null = null

    prepared.forEach(({ window, hasConcreteData }) => {
      if (!hasConcreteData) return
      if (!globalStart || window.start < globalStart) {
        globalStart = new Date(window.start)
      }
      if (!globalEnd || window.end > globalEnd) {
        globalEnd = new Date(window.end)
      }
    })

    return prepared.reduce<ScheduleRow[]>((acc, { schedule, sows, safeId, window, hasConcreteData }) => {
      let start = new Date(window.start)
      let end = new Date(window.end)

      const scheduleHint = schedule.windowHint
      if ((!hasConcreteData || start.getTime() === end.getTime()) && scheduleHint) {
        const hintNormalized = normalizePlaceholderWindow(new Date(scheduleHint.start), new Date(scheduleHint.end))
        start = hintNormalized.start
        end = hintNormalized.end
      } else if ((!hasConcreteData || start.getTime() === end.getTime()) && globalStart && globalEnd && globalStart.getTime() !== globalEnd.getTime()) {
        start = new Date(globalStart)
        end = new Date(globalEnd)
      } else if (start.getTime() === end.getTime()) {
        const normalized = normalizePlaceholderWindow(start, end)
        start = normalized.start
        end = normalized.end
      }

      const startIso = start.toISOString()
      const endIso = end.toISOString()
      const contractRowId = `contract:${safeId}`
      const percent =
        sows.length > 0
          ? sows.reduce((sum, sow) => sum + (sow.percentComplete ?? 0), 0) / sows.length
          : average((schedule.sows ?? []).map((sow) => sow.percentComplete ?? 0)) ?? 0
      const spi = average((sows.length ? sows : schedule.sows ?? []).map((sow) => sow.spi ?? null))
      const baseLabel = `${schedule.code ?? schedule.name ?? safeId} · ${schedule.name ?? schedule.code ?? safeId}`
      const contractLabel = schedule.placeholder ? `${baseLabel} (no schedule data)` : baseLabel

      acc.push({
        id: contractRowId,
        entityId: safeId,
        contractId: safeId,
        contractRowId,
        type: 'contract',
        name: contractLabel,
        start: startIso,
        end: endIso,
        percentComplete: percent,
        spi,
        cpi: null,
        parentId: null,
        status: statusFromSpi(spi ?? undefined),
        placeholder: schedule.placeholder ?? false,
      })

      sows.forEach((sow) => {
        const sowRowId = `sow:${sow.id}`
        acc.push({
          id: sowRowId,
          entityId: sow.id,
          contractId: safeId,
          contractRowId,
          type: 'sow',
          name: `${sow.code ?? sow.id} · ${sow.name}`,
          start: sow.startPlanned ?? sow.startActual ?? startIso,
          end: sow.endPlanned ?? sow.endActual ?? endIso,
          percentComplete: sow.percentComplete ?? 0,
          spi: sow.spi ?? null,
          cpi: sow.cpi ?? null,
          parentId: contractRowId,
          status: statusFromSpi(sow.spi),
        })
        ;(sow.processes ?? []).forEach((proc) => {
          acc.push({
            id: `process:${proc.id}`,
            entityId: proc.id,
            contractId: safeId,
            contractRowId,
            type: 'process',
            name: proc.name,
            start: proc.startPlanned ?? proc.startActual ?? sow.startPlanned ?? sow.startActual ?? startIso,
            end: proc.endPlanned ?? proc.endActual ?? sow.endPlanned ?? sow.endActual ?? endIso,
            percentComplete: proc.percentComplete ?? 0,
            spi: proc.spi ?? null,
            cpi: proc.cpi ?? null,
            parentId: sowRowId,
            status: statusFromSpi(proc.spi),
          })
        })
      })

      return acc
    }, [])
  }, [filteredSchedules])

  const allFilteredSows = useMemo(() => filteredSchedules.flatMap(({ sows }) => sows), [filteredSchedules])

  const primaryContractRow = useMemo(() => {
    const targetId = activeContractId ?? routeContractId ?? null
    if (!targetId) return null
    return rows.find((row) => row.type === 'contract' && row.contractId === targetId) ?? null
  }, [rows, activeContractId, routeContractId])

  const timelineSummary = useMemo(() => {
    const scopeTally = allFilteredSows.reduce(
      (acc, sow) => {
        const spi = sow.spi ?? 1
        if (spi < 0.9) acc.risk += 1
        else if (spi < 1) acc.monitoring += 1
        return acc
      },
      { risk: 0, monitoring: 0 },
    )

    const slipStats = allFilteredSows.reduce(
      (acc, sow) => {
        const slip = calcSlipDays(sow)
        if (slip > 0) {
          acc.totalSlip += slip
          acc.worstSlip = Math.max(acc.worstSlip, slip)
        }
        return acc
      },
      { totalSlip: 0, worstSlip: 0 },
    )

    if (!primaryContractRow) {
      return {
        startDate: null,
        finishDate: null,
        daysRemaining: null,
        progressPercent: null,
        timePercent: null,
        scheduleDelta: null,
        scopeCount: allFilteredSows.length,
        riskCount: scopeTally.risk,
        monitoringCount: scopeTally.monitoring,
        totalSlip: slipStats.totalSlip,
        worstSlip: slipStats.worstSlip,
      }
    }

    const startCandidate = new Date(primaryContractRow.start)
    const finishCandidate = new Date(primaryContractRow.end)
    const startDate = Number.isFinite(startCandidate.getTime()) ? startCandidate : null
    const finishDate = Number.isFinite(finishCandidate.getTime()) ? finishCandidate : null
    const now = Date.now()

    const daysRemaining = finishDate ? Math.max(0, Math.ceil((finishDate.getTime() - now) / DAY_MS)) : null
    const durationDays =
      startDate && finishDate ? Math.max(1, Math.round((finishDate.getTime() - startDate.getTime()) / DAY_MS)) : null
    const elapsedDays = startDate ? Math.max(0, Math.ceil((now - startDate.getTime()) / DAY_MS)) : null
    const timePercent =
      durationDays && elapsedDays !== null ? Math.min(100, Math.max(0, Math.round((elapsedDays / durationDays) * 100))) : null

    const rawProgress = primaryContractRow.percentComplete
    const progressPercent =
      typeof rawProgress === 'number' && Number.isFinite(rawProgress) ? Math.round(rawProgress * 100) : null

    const scheduleDelta =
      progressPercent !== null && timePercent !== null ? progressPercent - timePercent : null

    return {
      startDate,
      finishDate,
      daysRemaining,
      progressPercent,
      timePercent,
      scheduleDelta,
      scopeCount: allFilteredSows.length,
      riskCount: scopeTally.risk,
      monitoringCount: scopeTally.monitoring,
      totalSlip: slipStats.totalSlip,
      worstSlip: slipStats.worstSlip,
    }
  }, [primaryContractRow, allFilteredSows])

  const slips = useMemo(
    () =>
      allFilteredSows
        .map((sow) => ({ label: sow.name, days: calcSlipDays(sow) }))
        .filter((item) => item.days > 2)
        .sort((a, b) => b.days - a.days)
        .slice(0, 4),
    [allFilteredSows],
  )

  const riskySows = useMemo(
    () =>
      allFilteredSows
        .filter((sow) => (sow.spi ?? 1) < 0.9)
        .map((sow) => ({ label: sow.name, spi: sow.spi ?? 0 }))
        .slice(0, 4),
    [allFilteredSows],
  )

  const resourceInsights = useMemo(
    () =>
      allFilteredSows.slice(0, 3).map((sow) => ({
        label: sow.name,
        note: (sow.spi ?? 1) < 0.9 ? 'Field crews under-resourced' : 'Resource mix adequate',
      })),
    [allFilteredSows],
  )

  useEffect(() => {
    if (!activeContractId || !selectedLevel) return
    const activeScheduleRecord = schedules[activeContractId]
    if (activeScheduleRecord?.placeholder) return
    fetchScheduleKpis(activeContractId, selectedLevel, selectedId ?? undefined)
      .then((response) => setKpis(response))
      .catch((err) => {
        console.warn('Failed to load KPIs', err)
        setKpis(null)
      })
  }, [activeContractId, selectedLevel, selectedId, setKpis])

  useEffect(() => {
    if (!activeContractId) return
    const activeScheduleRecord = schedules[activeContractId]
    if (activeScheduleRecord?.placeholder) return
    const handler = setTimeout(() => {
      setWhatIfSimulating(true)
      const resourcesPayload = Object.entries(resourcePlan)
        .filter(([, quantity]) => quantity !== 0)
        .map(([resource, quantity]) => ({ resource, quantity }))
      postScheduleWhatIf(activeContractId, whatIfOffset, resourcesPayload)
        .then((res: ScheduleWhatIfResponse) => {
          setWhatIf({
            finish: res.projectedFinish,
            delta: res.deltaDays,
            notes: res.notes ?? [],
            offset: whatIfOffset,
            spiProjected: res.spiProjected ?? null,
          })
        })
        .catch((err) => console.warn('What-if failed', err))
        .finally(() => setWhatIfSimulating(false))
    }, 250)
    return () => clearTimeout(handler)
  }, [activeContractId, whatIfOffset, resourcePlan, setWhatIf])

  useEffect(() => {
    setResourcePlan({ excavator: 0, crew: 0, qa: 0 })
  }, [activeContractId])

  if (!FEATURE_SCHEDULE_UI) {
    return <div className="schedule-page">Scheduling feature unavailable.</div>
  }

  if (!routeContractId) {
    return <div className="schedule-page">Contract identifier missing.</div>
  }

  if (!isAuthenticated) {
    return null
  }

  const activeSchedule = activeContractId ? schedules[activeContractId] : undefined
  const projectName = state?.projectName ?? state?.projectSnapshot?.name ?? activeSchedule?.name ?? 'Project'
  const projectSlug = projectName.replace(/\s+/g, '_')
  const projectSnapshot = state?.projectSnapshot ?? null
  const focusContractId = state?.contractId ?? activeContractId ?? null

  const handleNavigateToCcc = () => {
    if (projectSnapshot) {
      navigate('/', {
        state: {
          openView: 'contract',
          projectSnapshot,
          projectId: state?.projectId ?? null,
          focusContractId,
          utilityView: 'scheduling',
        },
      })
      return
    }
    if (state?.projectId) {
      navigate('/', {
        state: {
          openView: 'contract',
          projectId: state.projectId,
          focusContractId,
          utilityView: 'scheduling',
        },
      })
      return
    }
    navigate('/')
  }

  const breadcrumbs = [
    { label: 'Dashboard', onClick: () => navigate('/', { state: { openView: 'dashboard' } }) },
    { label: projectSlug },
    { label: 'Construction Control Center', onClick: handleNavigateToCcc },
    { label: 'CCC-Scheduling View', isCurrent: true },
  ]

  const handleSidebarSelect = (index: number) => {
    setActiveNav(index)
    const item = sidebarItems[index]
    if (!item) return
    if (index === HOME_NAV_INDEX) {
      navigate('/')
    }
  }

  const handleSelectRow = (row: ScheduleRow) => {
    selectItem(row.type, row.entityId, row.contractId, row.id)
    if (row.placeholder) {
      ensureSchedule(row.contractId, true)
      return
    }
    setCurrentContractId(row.contractId)
    setResourcePlan({ excavator: 0, crew: 0, qa: 0 })
  }

  const contractOptions = scheduleEntries
    .filter(({ schedule }) => Boolean(schedule.id))
    .map(({ schedule }) => ({
      id: schedule.id as string,
      label: `${schedule.code ?? schedule.id} · ${schedule.name ?? schedule.code ?? schedule.id}`,
    }))

  const kpiProgressActual = typeof kpis?.progressActual === 'number' && Number.isFinite(kpis.progressActual) ? kpis.progressActual : null
  const kpiProgressPlanned = typeof kpis?.progressPlanned === 'number' && Number.isFinite(kpis.progressPlanned) ? kpis.progressPlanned : null

  const completionDisplay =
    kpiProgressActual !== null
      ? `${kpiProgressActual.toFixed(1)}%`
      : timelineSummary.progressPercent !== null
      ? `${Math.round(timelineSummary.progressPercent)}%`
      : '--'

  const plannedProgressDisplay = kpiProgressPlanned !== null ? `${kpiProgressPlanned.toFixed(1)}%` : null

  const scheduleVariance = kpiProgressActual !== null && kpiProgressPlanned !== null ? kpiProgressActual - kpiProgressPlanned : null

  const finishLabel = timelineSummary.finishDate ? timelineSummary.finishDate.toLocaleDateString() : null
  const startLabel = timelineSummary.startDate ? timelineSummary.startDate.toLocaleDateString() : null
  const scheduleDeltaLabel = (() => {
    if (scheduleVariance !== null) {
      if (Math.abs(scheduleVariance) < 0.05) return 'On plan vs budget';
      return scheduleVariance > 0
        ? `Ahead ${scheduleVariance.toFixed(1)}% vs plan`
        : `Behind ${Math.abs(scheduleVariance).toFixed(1)}% vs plan`
    }
    if (timelineSummary.scheduleDelta === null) {
      return timelineSummary.timePercent !== null ? `Time elapsed ${timelineSummary.timePercent}%` : 'Progress baseline unavailable'
    }
    if (timelineSummary.scheduleDelta === 0) return 'On plan'
    return timelineSummary.scheduleDelta > 0
      ? `Ahead ${timelineSummary.scheduleDelta}%`
      : `Behind ${Math.abs(timelineSummary.scheduleDelta)}%`
  })()

  const scopeHealthCaption = [
    typeof timelineSummary.riskCount === 'number' ? `${timelineSummary.riskCount} at risk` : null,
    typeof timelineSummary.monitoringCount === 'number' ? `${timelineSummary.monitoringCount} monitoring` : null,
    timelineSummary.worstSlip ? `Worst slip ${timelineSummary.worstSlip}d` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const spiValue = formatIndexValue(kpis?.spi)
  const spiDescriptor = describePerformanceIndex(kpis?.spi)
  const cpiValue = formatIndexValue(kpis?.cpi)
  const cpiDescriptor = describePerformanceIndex(kpis?.cpi)

  return (
    <div className="schedule-shell">
      <SidebarNav
        activeIndex={activeNav}
        onSelect={handleSidebarSelect}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      />
      <main className="schedule-main">
        <header className="schedule-header">
          <div className="header-bar">
            <div className="header-leading">
              <Breadcrumbs items={breadcrumbs} />
              <h1>
                Contract {activeSchedule?.code ?? routeContractId}
                <span>{activeSchedule?.name ?? ''}</span>
              </h1>
              {rangeDisplay && <small className="range-display">{rangeDisplay}</small>}
            </div>
            <div className="header-actions">
              <div className="schedule-controls">
                {contractOptions.length > 1 && (
                  <div className="control-group">
                    <label htmlFor="contract-select">Contract</label>
                    <select
                      id="contract-select"
                      value={activeContractId ?? ''}
                      onChange={(event) => {
                        const nextId = event.target.value
                        if (nextId && nextId !== routeContractId) {
                          navigate(`/contracts/${nextId}/schedule`, { state })
                        }
                      }}
                    >
                      {contractOptions.map((option, index) => (
                        <option key={option.id ?? `contract-${index}`} value={option.id ?? `contract-${index}`}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="control-group">
                  <label htmlFor="range">Range</label>
                  <select
                    id="range"
                    value={filters.range}
                    onChange={(event) => setFilters({ range: event.target.value as FilterState['range'] })}
                  >
                    <option value="30d">Last 30 days</option>
                    <option value="60d">Last 60 days</option>
                    <option value="90d">Last 90 days</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div className="control-group toggles">
                  <button
                    type="button"
                    className={`chip-toggle ${filters.criticalOnly ? 'active' : ''}`}
                    onClick={() => setFilters({ criticalOnly: !filters.criticalOnly })}
                  >
                    Critical path
                  </button>
                  <button
                    type="button"
                    className={`chip-toggle ${filters.showBaseline ? 'active' : ''}`}
                    onClick={() => setFilters({ showBaseline: !filters.showBaseline })}
                  >
                    Show baseline
                  </button>
                  <button
                    type="button"
                    className={`chip-toggle ${filters.showMilestones ? 'active' : ''}`}
                    onClick={() => setFilters({ showMilestones: !filters.showMilestones })}
                  >
                    Show milestones
                  </button>
                </div>
                <div className="control-group search">
                  <label htmlFor="schedule-search">Search</label>
                  <input
                    id="schedule-search"
                    type="search"
                    placeholder="Search SOW or process"
                    value={filters.search}
                    onChange={(event) => setFilters({ search: event.target.value })}
                  />
                </div>
              </div>
              <div className="status-chips">
                {[
                  { label: 'On track', value: 'on-track' as const },
                  { label: 'Monitoring', value: 'monitoring' as const },
                  { label: 'At risk', value: 'risk' as const },
                ].map((chip) => {
                  const activeStatuses = filters?.statuses ?? DEFAULT_STATUSES
                  const active = activeStatuses.includes(chip.value)
                  return (
                    <button
                      key={chip.value}
                      type="button"
                      className={`status-chip ${chip.value} ${active ? 'active' : ''}`}
                      onClick={() => {
                        const currentStatuses = filters?.statuses ?? DEFAULT_STATUSES
                        const next = active
                          ? currentStatuses.filter((status) => status !== chip.value)
                          : [...new Set([...currentStatuses, chip.value])]
                        setFilters({ statuses: next.length ? next : DEFAULT_STATUSES })
                      }}
                    >
                      {chip.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="header-metrics">
            <div className="schedule-metric-card">
              <span className="metric-label">Days remaining</span>
              <strong>{timelineSummary.daysRemaining ?? '--'}</strong>
              <small>{finishLabel ? `Planned finish ${finishLabel}` : 'No planned finish date'}</small>
              {startLabel && <small>Started {startLabel}</small>}
            </div>
            <div className="schedule-metric-card">
              <span className="metric-label">Completion</span>
              <strong>{completionDisplay}</strong>
              <small>{scheduleDeltaLabel}</small>
              {plannedProgressDisplay && <small>Planned {plannedProgressDisplay}</small>}
            </div>
            <div className="schedule-metric-card">
              <span className="metric-label">Scope packages</span>
              <strong>{timelineSummary.scopeCount ?? '--'}</strong>
              <small>{scopeHealthCaption || 'Awaiting scope data'}</small>
            </div>
            <div className="schedule-metric-card">
              <span className="metric-label">Schedule index (SPI)</span>
              <strong>{spiValue}</strong>
              <small>{spiDescriptor}</small>
            </div>
            <div className="schedule-metric-card">
              <span className="metric-label">Cost index (CPI)</span>
              <strong>{cpiValue}</strong>
              <small>{cpiDescriptor}</small>
            </div>
            <div className="schedule-metric-card schedule-metric-card--financial">
              <span className="metric-label">Value snapshot</span>
              <div className="metric-split">
                <div>
                  <span>EV</span>
                  <strong>{fmtM(kpis?.ev)}</strong>
                </div>
                <div>
                  <span>PV</span>
                  <strong>{fmtM(kpis?.pv)}</strong>
                </div>
                <div>
                  <span>AC</span>
                  <strong>{fmtM(kpis?.ac)}</strong>
                </div>
              </div>
              <div className="value-glossary">
                {VALUE_GLOSSARY.map((item) => (
                  <small key={item.code}>
                    <strong>{item.code}</strong> {item.description}
                  </small>
                ))}
              </div>
            </div>
          </div>
        </header>

        <div className="schedule-body">
          <section className="schedule-center">
            <div className="gantt-container-card">
              <div className="gantt-header">
                <div>
                  <h2>Live plan</h2>
                  <span className="subtitle">
                    Scenario pulls completion forward by {whatIfProjectedDelta ? `${whatIfProjectedDelta} days` : '0 days'}
                  </span>
                </div>
                <div className="whatif-slider">
                  <label htmlFor="whatif">What-if Timeline</label>
                  <input
                    id="whatif"
                    type="range"
                    min={-30}
                    max={30}
                    value={whatIfOffset}
                    onChange={(event) =>
                      setWhatIf({ offset: Number(event.target.value), notes: [], delta: null, finish: null, spiProjected: null })
                    }
                  />
                  <span>{whatIfOffset >= 0 ? `+${whatIfOffset}d` : `${whatIfOffset}d`}</span>
                </div>
              </div>

              {loading && !rows.length ? (
                <div className="schedule-state">Loading schedule…</div>
              ) : error && !rows.length ? (
                <div className="schedule-state error">{error}</div>
              ) : (
                <ScheduleGantt
                  rows={rows}
                  expandedMap={expanded}
                  selectedId={selectedRowId}
                  onToggleRow={toggleExpansion}
                  onSelect={handleSelectRow}
                  onRangeChange={({ start, end }) => setRangeDisplay(`${start.toLocaleDateString()} → ${end.toLocaleDateString()}`)}
                />
              )}
            </div>

            <SmartInsights slips={slips} risks={riskySows} resources={resourceInsights} notes={whatIfNotes} />
          </section>

          <aside className="schedule-sidebar">
            <div className="sidebar-summary">
              <h3>Schedule KPIs</h3>
              <p>Focused metrics for the selected scope.</p>
              <div className="gauge-grid">
                <GaugeCard title="SPI" value={kpis?.spi ?? null} subtitle="Schedule performance" />
                <GaugeCard title="CPI" value={kpis?.cpi ?? null} subtitle="Cost performance" />
              </div>
              <div className="kpi-meta">
                <div>
                  <span>EV</span>
                  <strong>{fmtM(kpis?.ev)}</strong>
                </div>
                <div>
                  <span>PV</span>
                  <strong>{fmtM(kpis?.pv)}</strong>
                </div>
                <div>
                  <span>AC</span>
                  <strong>{fmtM(kpis?.ac)}</strong>
                </div>
              </div>
              <Sparkline title="SPI trend" points={kpis?.trend ?? []} />
              <div className="whatif-info">
                <h4>Scenario</h4>
                {whatIfSimulating ? (
                  <span>Simulating…</span>
                ) : (
                  <span>{whatIfProjectedFinish ? new Date(whatIfProjectedFinish).toLocaleDateString() : 'Baseline finish'}</span>
                )}
                {typeof whatIfSpiProjected === 'number' && Number.isFinite(whatIfSpiProjected) && (
                  <small>Projected SPI {whatIfSpiProjected.toFixed(2)}</small>
                )}
              </div>
              <div className="resource-grid">
                {resourceCatalog.map((resource) => (
                  <div key={resource.key} className="resource-card">
                    <div className="resource-heading">
                      <span>{resource.label}</span>
                      <div className="resource-counter">
                        <button
                          type="button"
                          onClick={() => setResourcePlan((prev) => ({ ...prev, [resource.key]: Math.max(0, prev[resource.key] - 1) }))}
                          aria-label={`Remove ${resource.label}`}
                        >
                          –
                        </button>
                        <span>{resourcePlan[resource.key]}</span>
                        <button
                          type="button"
                          onClick={() => setResourcePlan((prev) => ({ ...prev, [resource.key]: prev[resource.key] + 1 }))}
                          aria-label={`Add ${resource.label}`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <p>{resource.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
