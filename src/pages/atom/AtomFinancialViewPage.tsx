import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'

import {
  fetchAtomFinancialView,
  type AtomFinancialAllocation,
  type AtomFinancialBasisBreakdown,
  type AtomFinancialGroupingRow,
  type AtomFinancialScopeBlock,
  type AtomFinancialViewResponse,
} from '../../api'
import TopBar from '../../layout/TopBar'
import TopBarGlobalActions from '../../layout/TopBarActions'
import { SidebarNav, HOME_NAV_INDEX, ACCS_NAV_INDEX, type ThemeMode } from '../../layout/navigation'
import { applyTheme, resolveInitialTheme, toggleThemeValue } from '../../utils/theme'
import { ensureScheduleTheme, SCHEDULE_ECHARTS_THEME_NAME } from '../../theme/echartsTheme'
import { formatCurrency, formatHours, formatNumber } from './utils'
import AtomUtilityDock from './components/AtomUtilityDock'

type ScopeState = {
  tenantId?: string | null
  projectId?: string | null
  projectName?: string | null
  contractId?: string | null
  contractName?: string | null
  sowId?: string | null
  sowName?: string | null
  processId?: string | null
  processName?: string | null
  atomId?: string | null
  atomName?: string | null
} | null

type DatePreset = 'today' | 'thisWeek' | 'last7' | 'thisMonth' | 'custom'

type PaginationState = {
  page: number
  pageSize: number
}

const DEFAULT_PAGE_SIZE = 8

const BASIS_LABEL: Record<string, string> = {
  time: 'Time-based',
  volume: 'Volume-based',
  sensor: 'Sensor-based',
}

const formatISODate = (value: Date): string => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const startOfWeek = (value: Date): Date => {
  const clone = new Date(value)
  const day = clone.getDay()
  const diff = (day + 6) % 7
  clone.setDate(clone.getDate() - diff)
  return clone
}

const startOfMonth = (value: Date): Date => new Date(value.getFullYear(), value.getMonth(), 1)

const computePresetRange = (preset: DatePreset, custom: { start?: string | null; end?: string | null }): { start: string; end: string } => {
  const today = new Date()
  const end = new Date(today)
  let start = new Date(today)

  switch (preset) {
    case 'today':
      break
    case 'thisWeek':
      start = startOfWeek(end)
      break
    case 'thisMonth':
      start = startOfMonth(end)
      break
    case 'last7':
      start = new Date(end)
      start.setDate(end.getDate() - 6)
      break
    case 'custom':
      if (custom.start && custom.end) {
        return { start: custom.start, end: custom.end }
      }
      start = new Date(end)
      start.setDate(end.getDate() - 6)
      break
    default:
      break
  }
  return { start: formatISODate(start), end: formatISODate(end) }
}

const formatPercentValue = (value: number | null | undefined, fractionDigits = 1) => {
  if (value == null || Number.isNaN(value)) return '--'
  return `${(value * 100).toFixed(fractionDigits)}%`
}

const formatUtilization = (value: number | null | undefined, fractionDigits = 1) => {
  if (value == null || Number.isNaN(value)) return '--'
  return `${value.toFixed(fractionDigits)}%`
}

const formatShortDate = (value: string) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const formatTime = (value?: string | null) => {
  if (!value) return '--'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '--'
  return parsed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

const trendOption = (block: AtomFinancialScopeBlock | null) => {
  if (!block) return null
  const earnedSeries = block.trend.earnedVsBillable
  const dates = earnedSeries.map((point) => formatShortDate(point.date))
  const earned = earnedSeries.map((point) => Number(point.earned.toFixed(2)))
  const billable = earnedSeries.map((point) => Number(point.billableHours.toFixed(2)))

  return {
    color: ['#2563eb', '#7dd3fc'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.8)',
      borderWidth: 0,
      padding: 12,
      textStyle: { fontSize: 12 },
      valueFormatter: (value: number) => value.toFixed(2),
    },
    legend: {
      data: ['Earned ($)', 'Billable hours'],
    },
    grid: { left: 48, right: 20, top: 32, bottom: 36 },
    xAxis: {
      type: 'category',
      data: dates,
      boundaryGap: false,
      axisLabel: { color: 'var(--text-muted)' },
    },
    yAxis: [
      {
        type: 'value',
        axisLabel: {
          color: 'var(--text-muted)',
          formatter: (value: number) => `$${value.toFixed(0)}`,
        },
      },
      {
        type: 'value',
        axisLabel: {
          color: 'var(--text-muted)',
          formatter: (value: number) => `${value.toFixed(0)}h`,
        },
      },
    ],
    series: [
      {
        name: 'Earned ($)',
        type: 'line',
        smooth: true,
        showSymbol: true,
        symbolSize: 6,
        areaStyle: { opacity: 0.08 },
        data: earned,
        yAxisIndex: 0,
      },
      {
        name: 'Billable hours',
        type: 'line',
        smooth: true,
        showSymbol: true,
        symbolSize: 6,
        areaStyle: { opacity: 0.06 },
        data: billable,
        yAxisIndex: 1,
      },
    ],
  }
}

const utilizationOption = (block: AtomFinancialScopeBlock | null) => {
  if (!block) return null
  const points = block.trend.utilization
  const dates = points.map((point) => formatShortDate(point.date))
  const values = points.map((point) => Number(point.utilizationPct.toFixed(2)))

  return {
    color: ['#22c55e'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.8)',
      borderWidth: 0,
      padding: 12,
      textStyle: { fontSize: 12 },
      formatter: (params: any[]) => {
        const p = params[0]
        return `${p.axisValue}<br/>Utilization: ${p.data.toFixed(2)}%`
      },
    },
    grid: { left: 48, right: 20, top: 32, bottom: 36 },
    xAxis: {
      type: 'category',
      data: dates,
      boundaryGap: false,
      axisLabel: { color: 'var(--text-muted)' },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: {
        color: 'var(--text-muted)',
        formatter: (value: number) => `${value.toFixed(0)}%`,
      },
    },
    series: [
      {
        name: 'Utilization %',
        type: 'line',
        smooth: true,
        showSymbol: true,
        symbolSize: 6,
        areaStyle: { opacity: 0.12 },
        data: values,
      },
    ],
  }
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize)
  const adjustedPage = Math.min(Math.max(page, 1), totalPages)
  const offset = (adjustedPage - 1) * pageSize
  const slice = items.slice(offset, offset + pageSize)
  return { slice, total, adjustedPage, totalPages }
}

export default function AtomFinancialViewPage(): JSX.Element | null {
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state as ScopeState) ?? null

  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme())
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    ensureScheduleTheme()
  }, [])

  const [activeNavIndex, setActiveNavIndex] = useState(ACCS_NAV_INDEX)
  const handleNavSelect = (index: number) => {
    setActiveNavIndex(index)
    if (index === HOME_NAV_INDEX) {
      navigate('/')
    }
  }

  const tenantId = state?.tenantId ?? 'default'
  const projectId = state?.projectId ?? null
  const contractId = state?.contractId ?? null
  const sowId = state?.sowId ?? null
  const processId = state?.processId ?? null
  const atomId = state?.atomId ?? null

  const [datePreset, setDatePreset] = useState<DatePreset>('last7')
  const [customRange, setCustomRange] = useState<{ start: string; end: string }>(() => {
    const range = computePresetRange('last7', {})
    return { start: range.start, end: range.end }
  })

  const dateRange = useMemo(() => computePresetRange(datePreset, customRange), [datePreset, customRange])

  const [basisFilter, setBasisFilter] = useState<string[]>([])
  const [locationFilter, setLocationFilter] = useState<string | null>(null)
  const [atomTypeFilter, setAtomTypeFilter] = useState<string | null>(null)
  const [shiftFilter, setShiftFilter] = useState<string | null>(null)
  const [billableFilter, setBillableFilter] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<string | null>(null)

  const [data, setData] = useState<AtomFinancialViewResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const [activeScope, setActiveScope] = useState<string>('atom')
  const [scopePagination, setScopePagination] = useState<Record<string, PaginationState>>({})
  const [allocationSearch, setAllocationSearch] = useState<string>('')

  const currentScopeState = useMemo(
    () => ({
      tenantId,
      projectId,
      projectName: state?.projectName ?? null,
      contractId,
      contractName: state?.contractName ?? null,
      sowId,
      sowName: state?.sowName ?? null,
      processId,
      processName: state?.processName ?? null,
      atomId,
      atomName: state?.atomName ?? null,
    }),
    [tenantId, projectId, contractId, sowId, processId, atomId, state?.projectName, state?.contractName, state?.sowName, state?.processName, state?.atomName],
  )

  useEffect(() => {
    if (!projectId) {
      setData(null)
      setError('Select a project to view financial data.')
      return
    }

    const controller = new AbortController()
    const params = {
      tenantId,
      projectId,
      contractId,
      sowId,
      processId,
      atomId,
      startDate: dateRange.start,
      endDate: dateRange.end,
      basis: basisFilter.length ? basisFilter : null,
      location: locationFilter ?? undefined,
      atomType: atomTypeFilter ?? undefined,
      shift: shiftFilter ?? undefined,
      billable: billableFilter ?? undefined,
      groupBy: groupBy ?? undefined,
    }

    setLoading(true)
    setError(null)

    fetchAtomFinancialView(params, controller.signal)
      .then((payload) => {
        setData(payload)
        setUpdatedAt(new Date())
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        console.error('Failed to load atom financial view', err)
        setError('Unable to load financial data. Please try again.')
        setData(null)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [
    tenantId,
    projectId,
    contractId,
    sowId,
    processId,
    atomId,
    dateRange.start,
    dateRange.end,
    basisFilter.join(','),
    locationFilter,
    atomTypeFilter,
    shiftFilter,
    billableFilter,
    groupBy,
  ])

  useEffect(() => {
    if (!data) return
    const nextKey = data.scopeOrder.includes(activeScope) ? activeScope : data.scopeOrder[0]
    setActiveScope(nextKey)
  }, [data, activeScope])

  useEffect(() => {
    setScopePagination((prev) => {
      if (prev[activeScope]) return prev
      return {
        ...prev,
        [activeScope]: { page: 1, pageSize: DEFAULT_PAGE_SIZE },
      }
    })
  }, [activeScope])

  const currentBlock: AtomFinancialScopeBlock | null = useMemo(() => {
    if (!data) return null
    return data.scopes[activeScope] ?? null
  }, [data, activeScope])

  const availableGroupings = useMemo(() => {
    if (!currentBlock) return []
    return Object.keys(currentBlock.groupings)
  }, [currentBlock])

  const activeGroupingKey = useMemo(() => {
    if (groupBy && currentBlock && currentBlock.groupings[groupBy]) return groupBy
    if (availableGroupings.length > 0) return availableGroupings[0]
    return null
  }, [groupBy, currentBlock, availableGroupings])

  const groupingRows: AtomFinancialGroupingRow[] = useMemo(() => {
    if (!currentBlock || !activeGroupingKey) return []
    return currentBlock.groupings[activeGroupingKey] ?? []
  }, [currentBlock, activeGroupingKey])

  const basisChips: AtomFinancialBasisBreakdown[] = currentBlock?.basisBreakdown ?? []
  const allocationSearchValue = allocationSearch.trim().toLowerCase()
  const filteredAllocations = useMemo(() => {
    if (!currentBlock) return []
    if (!allocationSearchValue) return currentBlock.allocations.items
    return currentBlock.allocations.items.filter((allocation) => {
      const haystack = [
        allocation.atomName,
        allocation.processName,
        allocation.location,
        allocation.shift,
        allocation.status,
        allocation.notes,
        allocation.nonBillableReason,
        allocation.sensorCondition,
        allocation.basis,
      ]
        .concat(allocation.formula ? [allocation.formula] : [])
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (haystack.includes(allocationSearchValue)) return true
      if (allocation.quantity != null && allocation.quantity.toString().toLowerCase().includes(allocationSearchValue)) {
        return true
      }
      return false
    })
  }, [currentBlock, allocationSearchValue])
  const volumeSummary = useMemo(() => {
    if (!currentBlock) return '--'
    if (!currentBlock.kpis.volumeBilled || currentBlock.kpis.volumeBilled <= 0) return '--'
    const unitSet = new Set<string>()
    currentBlock.allocations.items.forEach((allocation) => {
      if (allocation.basis === 'volume' && allocation.quantityUnit) {
        unitSet.add(allocation.quantityUnit)
      }
    })
    const unitLabel = unitSet.size === 1 ? Array.from(unitSet)[0] : 'units'
    return `${currentBlock.kpis.volumeBilled.toFixed(1)} ${unitLabel}`
  }, [currentBlock])

  const pagination = scopePagination[activeScope] ?? { page: 1, pageSize: DEFAULT_PAGE_SIZE }
  const totalAllocations = filteredAllocations.length
  const originalAllocationsTotal = currentBlock?.allocations.total ?? totalAllocations
  const { slice, total, adjustedPage, totalPages } = paginate(
    filteredAllocations,
    pagination.page,
    pagination.pageSize,
  )

  useEffect(() => {
    if (pagination.page !== adjustedPage) {
      setScopePagination((prev) => ({
        ...prev,
        [activeScope]: { page: adjustedPage, pageSize: prev[activeScope]?.pageSize ?? DEFAULT_PAGE_SIZE },
      }))
    }
  }, [pagination.page, adjustedPage, activeScope])

  const handlePageChange = useCallback(
    (page: number) => {
      setScopePagination((prev) => ({
        ...prev,
        [activeScope]: { page, pageSize: prev[activeScope]?.pageSize ?? DEFAULT_PAGE_SIZE },
      }))
    },
    [activeScope],
  )

  const handlePageSizeChange = useCallback(
    (pageSize: number) => {
      setScopePagination((prev) => ({
        ...prev,
        [activeScope]: { page: 1, pageSize },
      }))
    },
    [activeScope],
  )

  const handleAllocationSearchChange = useCallback(
    (value: string) => {
      setAllocationSearch(value)
      setScopePagination((prev) => ({
        ...prev,
        [activeScope]: { page: 1, pageSize: prev[activeScope]?.pageSize ?? DEFAULT_PAGE_SIZE },
      }))
    },
    [activeScope],
  )

  const handleToggleTheme = () => setTheme((prev) => toggleThemeValue(prev))

  const toggleBasis = (value: string) => {
    setBasisFilter((prev) => {
      if (prev.includes(value)) {
        return prev.filter((item) => item !== value)
      }
      return [...prev, value]
    })
  }

  const resetFilters = () => {
    setBasisFilter([])
    setLocationFilter(null)
    setAtomTypeFilter(null)
    setShiftFilter(null)
    setBillableFilter(null)
    setGroupBy(null)
  }

  const snapshots = data?.scopeOrder ?? []
  const dateRangeLabel = `${formatShortDate(dateRange.start)} → ${formatShortDate(dateRange.end)}`
  const updatedLabel = updatedAt ? updatedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : null

  const breadcrumbProjectLabel = (currentScopeState.projectName ?? 'Project').replace(/\s+/g, '_')

  const breadcrumbs = useMemo(
    () => [
      { label: 'Dashboard', onClick: () => navigate('/', { state: { openView: 'dashboard' } }) },
      {
        label: breadcrumbProjectLabel,
        onClick: () => {
          if (currentScopeState.projectId) {
            navigate('/', { state: { openView: 'contract', projectId: currentScopeState.projectId } })
          }
        },
      },
      {
        label: 'Construction Control Center',
        onClick: () => {
          if (currentScopeState.projectId) {
            navigate('/', { state: { openView: 'contract', projectId: currentScopeState.projectId } })
          }
        },
      },
      {
        label: 'Atom Manager',
        onClick: () => navigate('/atoms', { state: currentScopeState }),
      },
      { label: 'Atom Financials' },
    ],
    [breadcrumbProjectLabel, currentScopeState, navigate],
  )

  return (
    <div className="atom-financial-layout" data-theme={theme}>
      <SidebarNav activeIndex={activeNavIndex} onSelect={handleNavSelect} theme={theme} onToggleTheme={handleToggleTheme} />
      <div className="atom-financial-main">
        <TopBar
          breadcrumbs={breadcrumbs}
          center={
            <div className="atom-financial-top-meta">
              <span className="atom-financial-top-meta__title">{state?.projectName ?? 'Project'}</span>
              <span className="atom-financial-top-meta__range">{dateRangeLabel}</span>
              {atomId && (state?.atomName ?? data?.selectedAtomName) ? (
                <span className="atom-financial-top-meta__atom">{state?.atomName ?? data?.selectedAtomName}</span>
              ) : null}
            </div>
          }
          actions={<TopBarGlobalActions theme={theme} onToggleTheme={handleToggleTheme} scope={currentScopeState} />}
        />

        <main className="atom-financial-content">
          <section className="atom-financial-controls">
            <div className="atom-financial-control-group">
              <label htmlFor="financial-range">Date range</label>
              <div className="atom-financial-range-row">
                <select
                  id="financial-range"
                  value={datePreset}
                  onChange={(event) => setDatePreset(event.target.value as DatePreset)}
                >
                  <option value="today">Today</option>
                  <option value="thisWeek">This week</option>
                  <option value="last7">Last 7 days</option>
                  <option value="thisMonth">This month</option>
                  <option value="custom">Custom</option>
                </select>
                {datePreset === 'custom' ? (
                  <div className="atom-financial-range-custom">
                    <input
                      type="date"
                      value={customRange.start}
                      max={customRange.end}
                      onChange={(event) =>
                        setCustomRange((prev) => ({ ...prev, start: event.target.value || prev.start }))
                      }
                    />
                    <span>to</span>
                    <input
                      type="date"
                      value={customRange.end}
                      min={customRange.start}
                      onChange={(event) =>
                        setCustomRange((prev) => ({ ...prev, end: event.target.value || prev.end }))
                      }
                    />
                  </div>
                ) : null}
              </div>
            </div>
            <div className="atom-financial-control-group">
              <label>Basis</label>
              <div className="atom-financial-chips">
                {(['time', 'volume', 'sensor'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`atom-financial-chip ${basisFilter.includes(key) ? 'is-active' : ''}`}
                    onClick={() => toggleBasis(key)}
                  >
                    {BASIS_LABEL[key] ?? key}
                  </button>
                ))}
              </div>
            </div>
            <div className="atom-financial-control-row">
              <div className="atom-financial-control-group">
                <label htmlFor="financial-billable">Billable</label>
                <select
                  id="financial-billable"
                  value={billableFilter ?? 'all'}
                  onChange={(event) => {
                    const value = event.target.value
                    setBillableFilter(value === 'all' ? null : value)
                  }}
                >
                  <option value="all">All</option>
                  <option value="billable">Billable</option>
                  <option value="non_billable">Non-billable</option>
                </select>
              </div>
              <div className="atom-financial-control-group">
                <label htmlFor="financial-group">Group by</label>
                <select
                  id="financial-group"
                  value={groupBy ?? (availableGroupings[0] ?? 'process')}
                  onChange={(event) => setGroupBy(event.target.value)}
                >
                  {['process', 'atomType', 'location', 'shift'].map((option) => (
                    <option key={option} value={option}>
                      {option === 'atomType' ? 'Atom type' : option.charAt(0).toUpperCase() + option.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="atom-financial-control-group">
                <label htmlFor="financial-location">Location</label>
                <select
                  id="financial-location"
                  value={locationFilter ?? ''}
                  onChange={(event) => setLocationFilter(event.target.value || null)}
                >
                  <option value="">All locations</option>
                  {data?.availableFilters.locations.map((option) => (
                    <option key={option.id} value={option.label}>
                      {option.label}
                      {option.count != null ? ` (${option.count})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="atom-financial-control-group">
                <label htmlFor="financial-atom-type">Atom type</label>
                <select
                  id="financial-atom-type"
                  value={atomTypeFilter ?? ''}
                  onChange={(event) => setAtomTypeFilter(event.target.value || null)}
                >
                  <option value="">All types</option>
                  {data?.availableFilters.atomTypes.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                      {option.count != null ? ` (${option.count})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="atom-financial-control-group">
                <label htmlFor="financial-shift">Shift</label>
                <select
                  id="financial-shift"
                  value={shiftFilter ?? ''}
                  onChange={(event) => setShiftFilter(event.target.value || null)}
                >
                  <option value="">All shifts</option>
                  {data?.availableFilters.shifts.map((option) => (
                    <option key={option.id} value={option.label}>
                      {option.label}
                      {option.count != null ? ` (${option.count})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="atom-financial-control-group">
                <label>&nbsp;</label>
                <button type="button" className="atom-financial-reset" onClick={resetFilters}>
                  Reset filters
                </button>
              </div>
            </div>
            {updatedLabel ? (
              <div className="atom-financial-updated">Updated {updatedLabel}</div>
            ) : null}
          </section>

          <section className="atom-financial-scope-tabs" role="tablist" aria-label="Financial scope selection">
            {snapshots.map((scopeKey) => {
              const block = data?.scopes[scopeKey]
              if (!block) return null
              const label = block.scope.name ?? block.scope.level.toUpperCase()
              const earned = formatCurrency(block.kpis.earned, 1)
              return (
                <button
                  key={scopeKey}
                  type="button"
                  className={`atom-financial-scope-tab ${scopeKey === activeScope ? 'is-active' : ''}`}
                  onClick={() => setActiveScope(scopeKey)}
                  role="tab"
                  aria-selected={scopeKey === activeScope}
                >
                  <span>{label}</span>
                  <strong>{earned}</strong>
                </button>
              )
            })}
          </section>

          {loading ? (
            <div className="atom-financial-loading">Loading financial performance…</div>
          ) : error ? (
            <div className="atom-financial-error">{error}</div>
          ) : !currentBlock ? (
            <div className="atom-financial-empty">No financial data available for the selected scope.</div>
          ) : (
            <div className="atom-financial-grid">
              <section className="atom-financial-panel atom-financial-panel--primary">
                <div className="atom-financial-kpi-grid">
                  <KpiCard label="Billable hours" value={formatHours(currentBlock.kpis.billableHours)} helper="Hours invoiced in range" />
                  <KpiCard label="Idle hours" value={formatHours(currentBlock.kpis.idleHours)} helper="Tracked idle/non-billable time" />
                  <KpiCard label="Utilisation" value={formatUtilization(currentBlock.kpis.utilizationPct)} helper="Busy vs idle balance" />
                  <KpiCard label="Earned value" value={formatCurrency(currentBlock.kpis.earned, 1)} helper="Total earned (time + volume + sensor)" />
                  <KpiCard
                    label="Avg bill rate"
                    value={currentBlock.kpis.averageRate != null ? formatCurrency(currentBlock.kpis.averageRate, 1) : '--'}
                    helper="Weighted average hourly rate"
                  />
                  <KpiCard label="Volume billed" value={volumeSummary} helper="Aggregated volume-based billing" />
                  <KpiCard label="Non-billable hours" value={formatHours(currentBlock.kpis.nonBillableHours)} helper="Idle and internal rework windows" />
                </div>

                {basisChips.length ? (
                  <div className="atom-financial-subsection">
                    <h3>Billing basis breakdown</h3>
                    <div className="atom-financial-basis-grid">
                      {basisChips.map((chip) => (
                        <div key={chip.basis} className="atom-financial-basis-card">
                          <span>{BASIS_LABEL[chip.basis] ?? chip.basis}</span>
                          <strong>{formatCurrency(chip.earned, 1)}</strong>
                          <div className="atom-financial-basis-meta">
                            <span>Billable: {formatHours(chip.billableHours)}</span>
                            <span>Utilisation: {formatUtilization(chip.utilizationPct)}</span>
                            {chip.volume != null ? <span>Volume: {chip.volume.toFixed(1)}</span> : null}
                            <span>Allocations: {formatNumber(chip.allocationCount)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {groupingRows.length ? (
                  <div className="atom-financial-subsection">
                    <div className="atom-financial-subsection__header">
                      <h3>Group breakdown</h3>
                      <span>{activeGroupingKey === 'atomType' ? 'Atom type' : activeGroupingKey?.charAt(0).toUpperCase() + activeGroupingKey?.slice(1)}</span>
                    </div>
                    <div className="atom-financial-group-table-wrapper">
                      <table className="atom-financial-group-table">
                        <thead>
                          <tr>
                            <th>{activeGroupingKey === 'atomType' ? 'Atom type' : 'Group'}</th>
                            <th>Earned</th>
                            <th>Billable hrs</th>
                            <th>Busy hrs</th>
                            <th>Utilisation</th>
                            <th>Allocations</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupingRows.map((row) => (
                            <tr key={row.key}>
                              <td>
                                <div className="atom-financial-group-name">
                                  <strong>{row.name ?? row.code ?? row.key}</strong>
                                  {row.volume != null ? <span>{row.volume.toFixed(1)} units</span> : null}
                                </div>
                              </td>
                              <td>{formatCurrency(row.earned, 1)}</td>
                              <td>{formatHours(row.billableHours)}</td>
                              <td>{formatHours(row.busyHours)}</td>
                              <td>{formatUtilization(row.utilizationPct)}</td>
                              <td>{formatNumber(row.allocationCount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                <div className="atom-financial-subsection atom-financial-subsection--trend">
                  <div className="atom-financial-trend-grid">
                    <div className="atom-financial-card">
                      <div className="atom-financial-card__header">
                        <h3>Earned vs billable hours</h3>
                      </div>
                      {trendOption(currentBlock) ? (
                        <ReactECharts
                          style={{ height: 260 }}
                          option={trendOption(currentBlock)}
                          theme={SCHEDULE_ECHARTS_THEME_NAME}
                          notMerge
                          lazyUpdate
                        />
                      ) : (
                        <div className="atom-financial-empty-chart">Insufficient data for trend.</div>
                      )}
                    </div>
                    <div className="atom-financial-card">
                      <div className="atom-financial-card__header">
                        <h3>Utilisation trend</h3>
                      </div>
                      {utilizationOption(currentBlock) ? (
                        <ReactECharts
                          style={{ height: 260 }}
                          option={utilizationOption(currentBlock)}
                          theme={SCHEDULE_ECHARTS_THEME_NAME}
                          notMerge
                          lazyUpdate
                        />
                      ) : (
                        <div className="atom-financial-empty-chart">Insufficient data for utilisation trend.</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="atom-financial-subsection atom-financial-subsection--allocations">
                  <div className="atom-financial-card__header">
                    <h3>
                      Allocations (
                      {allocationSearch
                        ? `${total} of ${formatNumber(originalAllocationsTotal)}`
                        : formatNumber(total)}
                      )
                    </h3>
                    <div className="atom-search-field">
                      <input
                        type="search"
                        placeholder="Search allocations…"
                        value={allocationSearch}
                        onChange={(event) => handleAllocationSearchChange(event.target.value)}
                        aria-label="Search allocations"
                      />
                      {allocationSearch ? (
                        <button
                          type="button"
                          className="atom-search-clear"
                          onClick={() => handleAllocationSearchChange('')}
                          aria-label="Clear allocation search"
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                    <div className="atom-financial-pagination">
                      <label>
                        Rows per page
                        <select
                          value={pagination.pageSize}
                          onChange={(event) => handlePageSizeChange(Number(event.target.value))}
                        >
                          {[8, 12, 20].map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="atom-financial-pagination__controls">
                        <button type="button" onClick={() => handlePageChange(adjustedPage - 1)} disabled={adjustedPage <= 1}>
                          Prev
                        </button>
                        <span>
                          Page {adjustedPage} of {totalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => handlePageChange(adjustedPage + 1)}
                          disabled={adjustedPage >= totalPages}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </div>
                  {total === 0 ? (
                    <div className="atom-financial-empty">No allocations for the selected filters.</div>
                  ) : (
                    <div className="atom-financial-table-wrapper">
                      <table className="atom-financial-table">
                        <thead>
                          <tr>
                            <th>Date / window</th>
                            <th>Atom / process</th>
                            <th>Location</th>
                            <th>Basis</th>
                            <th>Hours</th>
                            <th>Rate</th>
                            <th>Earned</th>
                            <th>Status / notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {slice.map((allocation) => (
                            <AllocationRow key={allocation.allocationId} allocation={allocation} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="atom-financial-subsection atom-financial-subsection--reconciliation">
                  <div className="atom-financial-reconciliation">
                    <div>
                      <span>Planned earned</span>
                      <strong>{formatCurrency(currentBlock.reconciliation.plannedEarned, 1)}</strong>
                      {currentBlock.reconciliation.plannedHours != null ? (
                        <small>{formatHours(currentBlock.reconciliation.plannedHours)}</small>
                      ) : null}
                    </div>
                    <div>
                      <span>Actual earned</span>
                      <strong>{formatCurrency(currentBlock.reconciliation.actualEarned, 1)}</strong>
                      {currentBlock.reconciliation.actualHours != null ? (
                        <small>{formatHours(currentBlock.reconciliation.actualHours)}</small>
                      ) : null}
                    </div>
                    <div>
                      <span>Variance</span>
                      <strong>{formatCurrency(currentBlock.reconciliation.variance, 1)}</strong>
                      <small>{formatPercentValue(currentBlock.reconciliation.variancePct)}</small>
                    </div>
                  </div>
                  {currentBlock.reconciliation.messages.length ? (
                    <ul className="atom-financial-reconciliation__messages">
                      {currentBlock.reconciliation.messages.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  ) : null}

                  {currentBlock.flags.missingRates.length ||
                  currentBlock.flags.zeroDuration.length ||
                  currentBlock.flags.overlaps.length ||
                  currentBlock.flags.highlights.length ? (
                    <div className="atom-financial-flags">
                      {currentBlock.flags.missingRates.length ? (
                        <span>Missing rate data for {currentBlock.flags.missingRates.length} allocation(s).</span>
                      ) : null}
                      {currentBlock.flags.zeroDuration.length ? (
                        <span>Zero-duration entries detected for {currentBlock.flags.zeroDuration.length} allocation(s).</span>
                      ) : null}
                      {currentBlock.flags.overlaps.length ? (
                        <span>Overlap detected across {currentBlock.flags.overlaps.length} allocation(s).</span>
                      ) : null}
                      {currentBlock.flags.highlights.map((highlight) => (
                        <span key={highlight}>{highlight}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
      <AtomUtilityDock activeView="financial" scopeState={currentScopeState} />
    </div>
  )
}

function KpiCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="atom-financial-kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </div>
  )
}

function AllocationRow({ allocation }: { allocation: AtomFinancialAllocation }) {
  return (
    <tr className={`atom-financial-row ${allocation.overlap ? 'is-overlap' : ''}`}>
      <td>
        <div className="atom-financial-cell">
          <strong>{formatShortDate(allocation.allocationDate)}</strong>
          <span>
            {formatTime(allocation.start)} → {formatTime(allocation.end)}
          </span>
        </div>
      </td>
      <td>
        <div className="atom-financial-cell">
          <strong>{allocation.atomName}</strong>
          <span>{allocation.processName ?? '—'}</span>
        </div>
      </td>
      <td>
        <div className="atom-financial-cell">
          <strong>{allocation.location ?? '—'}</strong>
          <span>{allocation.shift ?? ''}</span>
        </div>
      </td>
      <td>
        <div className="atom-financial-cell">
          <strong>{BASIS_LABEL[allocation.basis] ?? allocation.basis}</strong>
          {allocation.quantity != null ? (
            <span>
              {allocation.quantity.toFixed(1)} {allocation.quantityUnit ?? 'units'}
            </span>
          ) : null}
        </div>
      </td>
      <td>
        <div className="atom-financial-cell">
          <span>Busy {formatHours(allocation.busyHours)}</span>
          <span>Billable {formatHours(allocation.billableHours)}</span>
          <span>Idle {formatHours(allocation.idleHours)}</span>
        </div>
      </td>
      <td>
        <div className="atom-financial-cell">
          {allocation.rate != null ? <strong>{formatCurrency(allocation.rate, 1)}</strong> : <strong>--</strong>}
          {allocation.standbyRate != null ? <span>Standby {formatCurrency(allocation.standbyRate, 1)}</span> : null}
          {allocation.overtimeMultiplier != null ? <span>Overtime ×{allocation.overtimeMultiplier.toFixed(2)}</span> : null}
          {allocation.surchargeMultiplier != null ? <span>Surcharge ×{allocation.surchargeMultiplier.toFixed(2)}</span> : null}
        </div>
      </td>
      <td>
        <div className="atom-financial-cell">
          <strong>{formatCurrency(allocation.earned, 1)}</strong>
          {allocation.formula ? <span className="atom-financial-formula">{allocation.formula}</span> : null}
        </div>
      </td>
      <td>
        <div className="atom-financial-cell atom-financial-cell--status">
          <div className="atom-financial-tags">
            {allocation.status ? <span className={`atom-financial-tag status-${allocation.status.toLowerCase()}`}>{allocation.status}</span> : null}
            {allocation.tags.map((tag) => (
              <span key={tag} className="atom-financial-tag">
                {tag}
              </span>
            ))}
          </div>
          {allocation.nonBillableReason ? <span className="atom-financial-note">{allocation.nonBillableReason}</span> : null}
          {allocation.notes ? <span className="atom-financial-note">{allocation.notes}</span> : null}
          {allocation.sensorCondition ? <span className="atom-financial-note">{allocation.sensorCondition}</span> : null}
        </div>
      </td>
    </tr>
  )
}
