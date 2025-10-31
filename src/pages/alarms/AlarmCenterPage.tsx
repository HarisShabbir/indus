import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import {
  fetchAlerts,
  fetchProgressHierarchy,
  type Alert,
  type AlertMetadata,
  type ProgressHierarchyContract,
  type ProgressHierarchyProcess,
  type ProgressHierarchyResponse,
  type ProgressHierarchySow,
} from '../../api'
import { SidebarNav, sidebarItems, ACCS_NAV_INDEX, type ThemeMode } from '../../layout/navigation'
import TopBar from '../../layout/TopBar'
import TopBarGlobalActions from '../../layout/TopBarActions'
import { applyTheme, resolveInitialTheme, toggleThemeValue } from '../../utils/theme'

type LocationState = {
  projectId?: string | null
  projectName?: string | null
  contractId?: string | null
  contractName?: string | null
  sowId?: string | null
  sowName?: string | null
  processId?: string | null
  processName?: string | null
} | null

type Severity = 'critical' | 'major' | 'minor'
type StatusKey = 'open' | 'acknowledged' | 'in_progress' | 'mitigated' | 'closed'

type ScopeSelection = {
  projectId: string | null
  contractId: string | null
  sowId: string | null
  processId: string | null
}

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'Critical',
  major: 'Major',
  minor: 'Minor',
}

const STATUS_LABELS: Record<StatusKey, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  in_progress: 'In progress',
  mitigated: 'Mitigated',
  closed: 'Closed',
}

const STATUS_ORDER: StatusKey[] = ['open', 'acknowledged', 'in_progress', 'mitigated', 'closed']

const POLLING_INTERVAL_MS = 30_000
const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })

function normaliseSeverity(alert: Alert): Severity {
  const raw = (alert.severity ?? '').toLowerCase()
  if (raw.includes('critical')) return 'critical'
  if (raw.includes('major') || raw === 'alert') return 'major'
  if (raw.includes('minor') || raw.includes('warning')) return 'minor'

  const itemHints = (alert.items ?? []).map((item) => `${item.label} ${item.detail}`.toLowerCase())
  if (itemHints.some((text) => text.includes('critical'))) return 'critical'
  if (itemHints.some((text) => text.includes('major') || text.includes('high'))) return 'major'
  return 'minor'
}

function matchesTextMeta(alert: Alert, token: string) {
  const haystack = [
    alert.title,
    alert.activity,
    alert.location,
    ...(alert.items ?? []).map((item) => `${item.label} ${item.detail}`),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(token.toLowerCase())
}

function filterAlertsByScope(alerts: Alert[], scope: ScopeSelection): Alert[] {
  return alerts.filter((alert) => {
    if (scope.projectId && alert.project_id !== scope.projectId) {
      return false
    }
    const metaScope = ((alert.metadata as AlertMetadata | null)?.scope) ?? {}

    if (scope.processId) {
      const matched = metaScope?.process?.code === scope.processId
      return matched || matchesTextMeta(alert, scope.processId)
    }
    if (scope.sowId) {
      const matched = metaScope?.sow?.code === scope.sowId
      return matched || matchesTextMeta(alert, scope.sowId)
    }
    if (scope.contractId) {
      const matched = metaScope?.contract?.code === scope.contractId
      return matched || matchesTextMeta(alert, scope.contractId)
    }
    return true
  })
}

function resolveScopeLabel(scope: ScopeSelection, hierarchy: ProgressHierarchyResponse | null) {
  const project = hierarchy?.projects.find((item) => item.code === (scope.projectId ?? undefined)) ?? null
  const contract = project?.contracts.find((item) => item.code === (scope.contractId ?? undefined)) ?? null
  const sow = contract?.sows.find((item) => item.code === (scope.sowId ?? undefined)) ?? null
  const process = sow?.processes.find((item) => item.code === (scope.processId ?? undefined)) ?? null

  if (process) return `Process · ${process.name}`
  if (sow) return `SOW · ${sow.name}`
  if (contract) return `Contract · ${contract.name}`
  if (project) return `Project · ${project.name}`
  return 'Portfolio overview'
}

function resolveScopeNames(scope: ScopeSelection, hierarchy: ProgressHierarchyResponse | null) {
  const project = hierarchy?.projects.find((item) => item.code === (scope.projectId ?? undefined)) ?? null
  const contract = project?.contracts.find((item) => item.code === (scope.contractId ?? undefined)) ?? null
  const sow = contract?.sows.find((item) => item.code === (scope.sowId ?? undefined)) ?? null
  const process = sow?.processes.find((item) => item.code === (scope.processId ?? undefined)) ?? null

  return {
    projectName: project?.name ?? null,
    contractName: contract?.name ?? null,
    sowName: sow?.name ?? null,
    processName: process?.name ?? null,
  }
}

function formatDueDescriptor(dueAt?: string | null) {
  if (!dueAt) return null
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return null
  const diffHours = (due.getTime() - Date.now()) / 3_600_000
  if (diffHours < 0) {
    return { label: `Overdue ${Math.abs(diffHours).toFixed(1)}h`, tone: 'overdue' as const }
  }
  if (diffHours <= 12) {
    return { label: `Due in ${Math.max(diffHours, 0).toFixed(1)}h`, tone: 'due-soon' as const }
  }
  const days = Math.round(diffHours / 24)
  return { label: `Due in ${days}d`, tone: 'calm' as const }
}

function formatMetric(value: number | null | undefined, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—'
  }
  return `${numberFormatter.format(Number(value))}${suffix}`
}

export default function AlarmCenterPage(): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const locationState = (location.state as LocationState) ?? null

  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme())
  const [activeNavIndex, setActiveNavIndex] = useState(ACCS_NAV_INDEX)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSeverity, setSelectedSeverity] = useState<Severity | 'all'>('all')
  const [hierarchy, setHierarchy] = useState<ProgressHierarchyResponse | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [scopeSelection, setScopeSelection] = useState<ScopeSelection>(() => ({
    projectId: locationState?.projectId ?? null,
    contractId: locationState?.contractId ?? null,
    sowId: locationState?.sowId ?? null,
    processId: locationState?.processId ?? null,
  }))
  const [focusedAlertId, setFocusedAlertId] = useState<string | null>(null)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const handleThemeToggle = () => setTheme((prev) => toggleThemeValue(prev))

  useEffect(() => {
    let cancelled = false
    fetchProgressHierarchy()
      .then((payload) => {
        if (!cancelled) {
          setHierarchy(payload)
        }
      })
      .catch((err) => {
        console.warn('Unable to fetch hierarchy for alarm center', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hierarchy?.projects.length) return
    setScopeSelection((prev) => {
      if (prev.projectId) return prev
      const firstProject = hierarchy.projects[0]
      return {
        projectId: firstProject.code,
        contractId: null,
        sowId: null,
        processId: null,
      }
    })
  }, [hierarchy])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const load = async () => {
      if (!scopeSelection.projectId) {
        setAlerts([])
        setLastUpdated(new Date())
        return
      }
      setLoading(true)
      setError(null)
      try {
        const response = await fetchAlerts(scopeSelection.projectId)
        if (cancelled) return
        setAlerts(response)
        setLastUpdated(new Date())
      } catch (err) {
        if (cancelled) return
        console.error('Failed to load alerts', err)
        setError('Unable to update alarms right now.')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()
    timer = setInterval(load, POLLING_INTERVAL_MS)

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [scopeSelection.projectId])

  const projectOptions = hierarchy?.projects ?? []
  const selectedProject = projectOptions.find((project) => project.code === scopeSelection.projectId) ?? null
  const contractOptions: ProgressHierarchyContract[] = selectedProject?.contracts ?? []
  const selectedContract = contractOptions.find((contract) => contract.code === scopeSelection.contractId) ?? null
  const sowOptions: ProgressHierarchySow[] = selectedContract?.sows ?? []
  const selectedSow = sowOptions.find((sow) => sow.code === scopeSelection.sowId) ?? null
  const processOptions: ProgressHierarchyProcess[] = selectedSow?.processes ?? []
  const selectedProcess = processOptions.find((process) => process.code === scopeSelection.processId) ?? null

  const scopeLabel = resolveScopeLabel(scopeSelection, hierarchy)
  const scopeNames = resolveScopeNames(scopeSelection, hierarchy)

  useEffect(() => {
    navigate('/alarms', {
      replace: true,
      state: {
        ...scopeSelection,
        ...scopeNames,
      },
    })
  }, [navigate, scopeSelection, scopeNames.projectName, scopeNames.contractName, scopeNames.sowName, scopeNames.processName])

  const scopedAlerts = useMemo(() => filterAlertsByScope(alerts, scopeSelection), [alerts, scopeSelection])

  const buckets = useMemo(
    () =>
      scopedAlerts.reduce(
        (acc, alert) => {
          const severity = normaliseSeverity(alert)
          acc[severity].push(alert)
          return acc
        },
        {
          critical: [] as Alert[],
          major: [] as Alert[],
          minor: [] as Alert[],
        },
      ),
    [scopedAlerts],
  )

  const activeAlerts = useMemo(() => {
    if (selectedSeverity === 'all') {
      return [...buckets.critical, ...buckets.major, ...buckets.minor].sort(
        (a, b) => new Date(b.raised_at ?? 0).getTime() - new Date(a.raised_at ?? 0).getTime(),
      )
    }
    return buckets[selectedSeverity].sort(
      (a, b) => new Date(b.raised_at ?? 0).getTime() - new Date(a.raised_at ?? 0).getTime(),
    )
  }, [buckets, selectedSeverity])

  useEffect(() => {
    if (!activeAlerts.length) {
      setFocusedAlertId(null)
      return
    }
    if (!focusedAlertId || !activeAlerts.some((alert) => alert.id === focusedAlertId)) {
      setFocusedAlertId(activeAlerts[0].id)
    }
  }, [activeAlerts, focusedAlertId])

  const focusedAlert = useMemo(
    () => activeAlerts.find((alert) => alert.id === focusedAlertId) ?? null,
    [activeAlerts, focusedAlertId],
  )

  const totalCount = scopedAlerts.length

  const statusSummary = useMemo(() => {
    const base: Record<StatusKey, number> = {
      open: 0,
      acknowledged: 0,
      in_progress: 0,
      mitigated: 0,
      closed: 0,
    }
    scopedAlerts.forEach((alert) => {
      const key = (alert.status ?? 'open').toLowerCase()
      if (STATUS_ORDER.includes(key as StatusKey)) {
        base[key as StatusKey] += 1
      }
    })
    return base
  }, [scopedAlerts])

  const categorySummary = useMemo(() => {
    const map = new Map<string, number>()
    scopedAlerts.forEach((alert) => {
      const key = alert.category ?? 'Other'
      map.set(key, (map.get(key) ?? 0) + 1)
    })
    return Array.from(map.entries())
      .map(([category, count]) => ({
        category,
        count,
        share: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
  }, [scopedAlerts, totalCount])

  const topCategories = categorySummary.slice(0, 3)

  const timeMetrics = useMemo(() => {
    let denominator = 0
    let dueSoon = 0
    let overdue = 0
    let totalHours = 0
    const nowTs = Date.now()
    scopedAlerts.forEach((alert) => {
      const status = (alert.status ?? 'open').toLowerCase()
      if (status === 'mitigated' || status === 'closed') return
      if (!alert.due_at) return
      const due = new Date(alert.due_at).getTime()
      if (Number.isNaN(due)) return
      const diffHours = (due - nowTs) / 3_600_000
      denominator += 1
      totalHours += diffHours
      if (diffHours < 0) overdue += 1
      else if (diffHours <= 12) dueSoon += 1
    })
    return {
      averageHours: denominator ? totalHours / denominator : null,
      dueSoon,
      overdue,
    }
  }, [scopedAlerts])

  const breadcrumbs = useMemo(
    () => [
      { label: 'Dashboard', onClick: () => navigate('/', { state: { openView: 'dashboard' } }) },
      { label: 'Alarm Center' },
    ],
    [navigate],
  )

  const focusedMetadata = (focusedAlert?.metadata as AlertMetadata | null) ?? null
  const focusedImpact = focusedMetadata?.impact ?? null
  const focusedSignals = focusedMetadata?.signals ?? null
  const focusedStatusKey = (focusedAlert?.status?.toLowerCase() ?? 'open') as StatusKey

  return (
    <div className="alarm-center" data-theme={theme}>
      <SidebarNav
        activeIndex={activeNavIndex}
        onSelect={(index) => {
          setActiveNavIndex(index)
          if (index === sidebarItems.findIndex((item) => item.label === 'Home')) {
            navigate('/')
          }
        }}
        theme={theme}
        onToggleTheme={handleThemeToggle}
      />
      <div className="app-shell topbar-layout">
        <TopBar
          breadcrumbs={breadcrumbs}
          actions={<TopBarGlobalActions theme={theme} onToggleTheme={handleThemeToggle} scope={{ ...scopeSelection, ...scopeNames }} />}
        />
        <main className="alarm-center__body">
          <header className="alarm-center__header">
            <div>
              <h1>Alarm management</h1>
              <p>{scopeLabel}</p>
            </div>
            <div className="alarm-meta">
              <span>{loading ? 'Updating…' : `${totalCount} open alarms`}</span>
              {lastUpdated ? <span>Last updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> : null}
            </div>
          </header>

          <section className="alarm-center__controls">
            <div className="scope-selector">
              <label>
                <span>Project</span>
                <select
                  value={scopeSelection.projectId ?? ''}
                  onChange={(event) =>
                    setScopeSelection({
                      projectId: event.target.value || null,
                      contractId: null,
                      sowId: null,
                      processId: null,
                    })
                  }
                >
                  <option value="">Select project</option>
                  {projectOptions.map((project) => (
                    <option key={project.code} value={project.code}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Contract</span>
                <select
                  value={scopeSelection.contractId ?? ''}
                  onChange={(event) =>
                    setScopeSelection((prev) => ({
                      projectId: prev.projectId,
                      contractId: event.target.value || null,
                      sowId: null,
                      processId: null,
                    }))
                  }
                  disabled={!selectedProject || !contractOptions.length}
                >
                  <option value="">{contractOptions.length ? 'Select contract' : 'No contracts available'}</option>
                  {contractOptions.map((contract) => (
                    <option key={contract.code} value={contract.code}>
                      {contract.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>SOW</span>
                <select
                  value={scopeSelection.sowId ?? ''}
                  onChange={(event) =>
                    setScopeSelection((prev) => ({
                      projectId: prev.projectId,
                      contractId: prev.contractId,
                      sowId: event.target.value || null,
                      processId: null,
                    }))
                  }
                  disabled={!selectedContract || !sowOptions.length}
                >
                  <option value="">{sowOptions.length ? 'Select SOW' : 'No SOWs available'}</option>
                  {sowOptions.map((sow) => (
                    <option key={sow.code} value={sow.code}>
                      {sow.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Process</span>
                <select
                  value={scopeSelection.processId ?? ''}
                  onChange={(event) =>
                    setScopeSelection((prev) => ({
                      projectId: prev.projectId,
                      contractId: prev.contractId,
                      sowId: prev.sowId,
                      processId: event.target.value || null,
                    }))
                  }
                  disabled={!selectedSow || !processOptions.length}
                >
                  <option value="">{processOptions.length ? 'Select process' : 'No processes available'}</option>
                  {processOptions.map((process) => (
                    <option key={process.code} value={process.code}>
                      {process.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="scope-stats">
              <div className="scope-stat">
                <span>Open alarms</span>
                <strong>{statusSummary.open}</strong>
                <small>
                  {buckets.critical.length} critical · {buckets.major.length} major
                </small>
              </div>
              <div className="scope-stat">
                <span>Due within 12h</span>
                <strong>{timeMetrics.dueSoon}</strong>
                <small>{timeMetrics.overdue} overdue</small>
              </div>
              <div className="scope-stat">
                <span>Leading category</span>
                <strong>{topCategories[0]?.category ?? '—'}</strong>
                <small>{topCategories[0] ? `${topCategories[0].count} alarms` : 'Awaiting events'}</small>
              </div>
            </div>
          </section>

          <section className="alarm-summary">
            {(Object.keys(buckets) as Severity[]).map((severity) => {
              const isActive = selectedSeverity === severity
              const count = buckets[severity].length
              return (
                <button
                  key={severity}
                  type="button"
                  className={`alarm-summary__card severity-${severity} ${isActive ? 'active' : ''}`}
                  onClick={() => setSelectedSeverity(isActive ? 'all' : severity)}
                >
                  <header>
                    <span>{SEVERITY_LABELS[severity]}</span>
                    <strong>{count}</strong>
                  </header>
                  <p>
                    {count === 0
                      ? 'No active events'
                      : severity === 'critical'
                      ? 'Immediate mitigation required'
                      : severity === 'major'
                      ? 'Stabilize and plan recovery'
                      : 'Monitor and close out promptly'}
                  </p>
                </button>
              )
            })}
          </section>

          {error ? <div className="alarm-error">{error}</div> : null}

          <section className="alarm-grid">
            <div className="alarm-stream">
              <h2>{selectedSeverity === 'all' ? 'All active alarms' : `${SEVERITY_LABELS[selectedSeverity]} alarms`}</h2>
              <ul>
                {activeAlerts.map((alert) => {
                  const severity = normaliseSeverity(alert)
                  const statusKey = (alert.status ?? 'open').toLowerCase() as StatusKey
                  const statusLabel = STATUS_LABELS[statusKey] ?? (alert.status ?? 'Open')
                  const dueDescriptor = formatDueDescriptor(alert.due_at)
                  const raisedAt = alert.raised_at ? new Date(alert.raised_at).toLocaleString() : '—'
                  const isSelected = focusedAlertId === alert.id
                  return (
                    <li
                      key={alert.id}
                      className={`alarm-stream__row ${isSelected ? 'selected' : ''}`}
                      onClick={() => setFocusedAlertId(alert.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setFocusedAlertId(alert.id)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className={`badge severity-${severity}`}>{SEVERITY_LABELS[severity]}</div>
                      <div className="alarm-stream__content">
                        <div className="alarm-stream__header">
                          <h3>{alert.title}</h3>
                          <div className="alarm-stream__meta">
                            {alert.category ? <span className={`category-chip ${alert.category === 'Change Management' ? 'category-chip--change' : ''}`}>{alert.category}</span> : null}
                            <span className={`status-chip status-${statusKey}`}>{statusLabel}</span>
                            {dueDescriptor ? <span className={`due-chip due-chip--${dueDescriptor.tone}`}>{dueDescriptor.label}</span> : null}
                          </div>
                        </div>
                        <dl>
                          <div>
                            <dt>Raised</dt>
                            <dd>{raisedAt}</dd>
                          </div>
                          {alert.location ? (
                            <div>
                              <dt>Location</dt>
                              <dd>{alert.location}</dd>
                            </div>
                          ) : null}
                          {alert.activity ? (
                            <div>
                              <dt>Activity</dt>
                              <dd>{alert.activity}</dd>
                            </div>
                          ) : null}
                        </dl>
                        {alert.root_cause ? <p className="alarm-stream__rca">{alert.root_cause}</p> : null}
                        {alert.items?.length ? (
                          <ul className="alarm-tags">
                            {alert.items.map((item, index) => (
                              <li key={`${alert.id}-${index}`}>
                                <strong>{item.label}</strong>
                                <span>{item.detail}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
                {!activeAlerts.length ? <li className="alarm-empty">No alarms match the current filter.</li> : null}
              </ul>
            </div>

            <aside className="alarm-sidepanel">
              {focusedAlert ? (
                <div className="insight-card insight-card--rca">
                  <div className="insight-card__header">
                    <h3>RCA & recovery</h3>
                    <div className="insight-card__pills">
                      {focusedAlert.category ? (
                        <span className={`category-chip ${focusedAlert.category === 'Change Management' ? 'category-chip--change' : ''}`}>{focusedAlert.category}</span>
                      ) : null}
                      <span className={`status-chip status-${focusedStatusKey}`}>{STATUS_LABELS[focusedStatusKey] ?? 'Open'}</span>
                    </div>
                  </div>
                  <div className="insight-card__body">
                    <div className="insight-card__section">
                      <strong>Root cause</strong>
                      <p>{focusedAlert.root_cause ?? 'Root cause analysis pending.'}</p>
                    </div>
                    <div className="insight-card__section">
                      <strong>Recommended action</strong>
                      <p>{focusedAlert.recommendation ?? 'Awaiting recovery plan.'}</p>
                    </div>
                    <div className="insight-metrics">
                      <div>
                        <span>Schedule risk</span>
                        <strong>{formatMetric(focusedImpact?.scheduleDaysAtRisk, ' d')}</strong>
                      </div>
                      <div>
                        <span>Cost exposure</span>
                        <strong>{formatMetric(focusedImpact?.costExposureK, 'k')}</strong>
                      </div>
                      <div>
                        <span>Productivity loss</span>
                        <strong>{formatMetric(focusedImpact?.productivityLossHours, ' h')}</strong>
                      </div>
                    </div>
                    {focusedSignals?.source === 'sensor' ? (
                      <div className="insight-card__section insight-card__section--signals">
                        <strong>Signal intelligence</strong>
                        <ul>
                          <li>
                            <span>Tag</span>
                            <span>{focusedSignals.tag ?? '—'}</span>
                          </li>
                          <li>
                            <span>Last reading</span>
                            <span>{formatMetric(focusedSignals.lastReading)}</span>
                          </li>
                          <li>
                            <span>Confidence</span>
                            <span>{focusedSignals.confidence ? `${Math.round(focusedSignals.confidence * 100)}%` : '—'}</span>
                          </li>
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="insight-card">
                  <h3>RCA & recovery</h3>
                  <p>Select an alarm to view the root cause narrative and recovery plan.</p>
                </div>
              )}

              <div className="insight-card">
                <h3>Status ledger</h3>
                <ul className="status-ledger">
                  {STATUS_ORDER.map((key) => (
                    <li key={key}>
                      <span className={`status-chip status-${key}`}>{STATUS_LABELS[key]}</span>
                      <strong>{statusSummary[key]}</strong>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="insight-card">
                <h3>Category mix</h3>
                <ul className="category-mix">
                  {topCategories.length ? (
                    topCategories.map((entry) => (
                      <li key={entry.category}>
                        <span>{entry.category}</span>
                        <div className="category-mix__bar">
                          <span style={{ width: `${entry.share}%` }} />
                        </div>
                        <strong>{entry.count}</strong>
                      </li>
                    ))
                  ) : (
                    <li className="category-mix__empty">No category breakdown available.</li>
                  )}
                </ul>
              </div>

              <div className="insight-card">
                <h3>Severity mix</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Severity</th>
                      <th>Open</th>
                      <th>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.keys(buckets) as Severity[]).map((severity) => {
                      const count = buckets[severity].length
                      const share = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0
                      return (
                        <tr key={severity}>
                          <td>{SEVERITY_LABELS[severity]}</td>
                          <td>{count}</td>
                          <td>{share}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </aside>
          </section>
        </main>
      </div>
    </div>
  )
}

