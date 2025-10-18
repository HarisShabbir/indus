import React, { useEffect, useMemo, useState } from 'react'
import { Gantt, Task, ViewMode } from 'gantt-task-react'
import 'gantt-task-react/dist/index.css'

import type { GanttTask } from '../../types'

type Breadcrumb = {
  label: string
  onClick?: () => void
}

type ScheduleLayoutProps = {
  title: string
  breadcrumbs: Array<Breadcrumb | string>
  tasks: GanttTask[]
  loading: boolean
  error: string | null
  emptyMessage?: string
}

type ResourcePlan = {
  excavators: number
  concreteCrews: number
  qaInspectors: number
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

const defaultResourcePlan: ResourcePlan = {
  excavators: 0,
  concreteCrews: 0,
  qaInspectors: 0,
}

const resourceCatalog: Array<{ key: keyof ResourcePlan; label: string; description: string; step: number; impact: number }> = [
  {
    key: 'excavators',
    label: 'Excavators',
    description: 'Each excavator crew can shave ~4% off excavation & concreting cycle times.',
    step: 1,
    impact: 4,
  },
  {
    key: 'concreteCrews',
    label: 'Formwork / concrete crews',
    description: 'Adds finishing crews to reduce idle time between lifts (≈3% cycle acceleration).',
    step: 1,
    impact: 3,
  },
  {
    key: 'qaInspectors',
    label: 'QA inspectors & survey drones',
    description: 'Faster clearances reduce rework loops and hand-off delays (≈2% impact).',
    step: 1,
    impact: 2,
  },
]

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const monthFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
})

const formatPercent = (value: number) => `${Math.round(value)}%`

const formatCurrency = (valueMillions: number) => {
  if (!Number.isFinite(valueMillions) || valueMillions === 0) return '$0'
  const abs = Math.abs(valueMillions)
  const sign = valueMillions < 0 ? '-' : ''
  if (abs >= 1000) {
    return `${sign}$${(abs / 1000).toFixed(1)}B`
  }
  return `${sign}$${abs.toFixed(1)}M`
}

const normaliseBreadcrumbs = (breadcrumbs: Array<Breadcrumb | string>): Breadcrumb[] =>
  breadcrumbs.map((crumb) => (typeof crumb === 'string' ? { label: crumb } : crumb))

const deriveStyles = (task: GanttTask) => {
  const status = (task.meta?.status as string | undefined)?.toLowerCase() ?? ''
  if (status.includes('risk') || status.includes('delay')) {
    return { progressColor: '#f87171', progressSelectedColor: '#ef4444' }
  }
  if (status.includes('monitor')) {
    return { progressColor: '#fbbf24', progressSelectedColor: '#f59e0b' }
  }
  return { progressColor: '#34d399', progressSelectedColor: '#10b981' }
}

const toGanttTasks = (tasks: GanttTask[]): Array<Task & { raw: GanttTask }> => {
  if (!tasks.length) return []
  const parentIds = new Set(tasks.map((task) => task.parent).filter(Boolean))
  return tasks.map((task): Task & { raw: GanttTask } => {
    const startDate = new Date(task.start)
    const endDate = new Date(task.end)
    const progress = Math.round((task.progress ?? 0) * 100)
    const styles = deriveStyles(task)
    const ganttTask: Task & { raw: GanttTask } = {
      id: task.id,
      name: formatTaskLabel(task),
      start: startDate,
      end: endDate,
      progress,
      type: parentIds.has(task.id) ? 'project' : 'task',
      project: task.parent ?? undefined,
      styles,
    }
    ganttTask.raw = task
    return ganttTask
  })
}

const TooltipContent: React.FC<{ task: Task & { raw?: GanttTask }; fontSize: string; fontFamily: string }> = ({ task }) => {
  const raw = (task as Task & { raw?: GanttTask }).raw
  if (!raw) {
    return (
      <div className="schedule-tooltip">
        <strong>{task.name}</strong>
      </div>
    )
  }
  const meta = raw.meta ?? {}
  const start = dateFormatter.format(new Date(raw.start))
  const end = dateFormatter.format(new Date(raw.end))
  const spi = typeof meta.spi === 'number' ? Number(meta.spi).toFixed(2) : undefined
  const quality = typeof meta.quality_conf === 'number' ? `${Number(meta.quality_conf).toFixed(1)}%` : undefined
  const statusLabel = (meta.status_label as string | undefined) ?? (meta.status as string | undefined)

  return (
    <div className="schedule-tooltip">
      <strong>{raw.name}</strong>
      <p>
        <span>{start}</span> → <span>{end}</span>
      </p>
      <p>Progress: {formatPercent((raw.progress ?? 0) * 100)}</p>
      {spi && <p>SPI: {spi}</p>}
      {quality && <p>Quality: {quality}</p>}
      {statusLabel && <p>Status: {statusLabel}</p>}
    </div>
  )
}

const formatTaskLabel = (task: GanttTask) => {
  const percent = Math.round((task.progress ?? 0) * 100)
  const spi = typeof task.meta?.spi === 'number' ? Number(task.meta.spi).toFixed(2) : undefined
  const status = task.meta?.status as string | undefined
  const parts = [task.name, `${percent}%`]
  if (spi) parts.push(`SPI ${spi}`)
  if (status) parts.push(status)
  return parts.join(' · ')
}

type BaselineMetrics = {
  start?: Date
  end?: Date
  durationDays: number
  avgProgressPct: number
  avgSpi?: number | null
  atRiskCount: number
  monitoringCount: number
  completedCount: number
}

const computeBaselineMetrics = (tasks: GanttTask[]): BaselineMetrics => {
  if (!tasks.length) {
    return {
      start: undefined,
      end: undefined,
      durationDays: 0,
      avgProgressPct: 0,
      avgSpi: null,
      atRiskCount: 0,
      monitoringCount: 0,
      completedCount: 0,
    }
  }

  let start = Number.POSITIVE_INFINITY
  let end = Number.NEGATIVE_INFINITY
  let progressTotal = 0
  let spiTotal = 0
  let spiCount = 0
  let atRiskCount = 0
  let monitoringCount = 0
  let completedCount = 0

  for (const task of tasks) {
    const startMs = new Date(task.start).getTime()
    const endMs = new Date(task.end).getTime()
    start = Math.min(start, startMs)
    end = Math.max(end, endMs)
    progressTotal += task.progress ?? 0
    const spi = Number(task.meta?.spi)
    if (Number.isFinite(spi)) {
      spiTotal += spi
      spiCount += 1
    }
    const status = (task.meta?.status as string | undefined)?.toLowerCase() ?? ''
    if (status.includes('risk') || status.includes('delay')) {
      atRiskCount += 1
    } else if (status.includes('monitor')) {
      monitoringCount += 1
    }
    if ((task.progress ?? 0) >= 0.99) {
      completedCount += 1
    }
  }

  const durationDays = Math.max(1, Math.round((end - start) / MS_PER_DAY))
  return {
    start: new Date(start),
    end: new Date(end),
    durationDays,
    avgProgressPct: (progressTotal / tasks.length) * 100,
    avgSpi: spiCount ? spiTotal / spiCount : null,
    atRiskCount,
    monitoringCount,
    completedCount,
  }
}

const getLeafTasks = (tasks: GanttTask[]) => {
  if (!tasks.length) {
    return []
  }
  const parentIds = new Set(tasks.map((task) => task.id))
  tasks.forEach((task) => {
    if (task.parent) parentIds.delete(task.parent)
  })
  return tasks.filter((task) => !tasks.some((candidate) => candidate.parent === task.id))
}

const calculateResourceImpact = (plan: ResourcePlan) => {
  let impact = 0
  for (const entry of resourceCatalog) {
    const value = plan[entry.key]
    impact += Math.max(0, value) * entry.impact
  }
  return Math.min(40, impact) // cap to keep scenario realistic
}

type ScenarioMetrics = {
  taskDurationDays: number
  simulatedDurationDays: number
  taskDaysSaved: number
  projectedProjectDays: number
  projectedEnd: Date | undefined
  projectDaysSaved: number
  projectedSpi?: number | null
  projectedProgressPct: number
  financialImpactMillions: number
}

const buildScenario = (
  tasks: GanttTask[],
  baseline: BaselineMetrics,
  selectedTaskId: string | null,
  acceleration: number,
  resourcePlan: ResourcePlan,
): ScenarioMetrics => {
  const selectedTask = tasks.find((task) => task.id === selectedTaskId)
  if (!selectedTask || !baseline.start || !baseline.end) {
    return {
      taskDurationDays: 0,
      simulatedDurationDays: 0,
      taskDaysSaved: 0,
      projectedProjectDays: baseline.durationDays,
      projectedEnd: baseline.end,
      projectDaysSaved: 0,
      projectedSpi: baseline.avgSpi,
      projectedProgressPct: baseline.avgProgressPct,
      financialImpactMillions: 0,
    }
  }

  const taskStart = new Date(selectedTask.start).getTime()
  const taskEnd = new Date(selectedTask.end).getTime()
  const taskDurationDays = Math.max(1, Math.round((taskEnd - taskStart) / MS_PER_DAY))

  const resourceImpact = calculateResourceImpact(resourcePlan)
  const combinedAcceleration = Math.min(60, Math.max(0, acceleration + resourceImpact))
  const accelerationFactor = Math.max(0.35, 1 - combinedAcceleration / 100)
  const simulatedDurationDays = Math.max(1, Math.round(taskDurationDays * accelerationFactor))
  const taskDaysSaved = Math.max(0, taskDurationDays - simulatedDurationDays)

  const taskWeight = Math.min(0.9, taskDurationDays / Math.max(1, baseline.durationDays))
  const projectDaysSaved = Math.round(taskDaysSaved * taskWeight)
  const projectedProjectDays = Math.max(1, baseline.durationDays - projectDaysSaved)
  const projectedEnd = new Date(baseline.end.getTime() - projectDaysSaved * MS_PER_DAY)

  const projectedSpi = baseline.avgSpi !== null && baseline.avgSpi !== undefined ? Math.min(1.35, baseline.avgSpi + projectDaysSaved * 0.012) : null
  const projectedProgressPct = Math.min(100, baseline.avgProgressPct + projectDaysSaved * 0.9)
  const financialImpactMillions = projectDaysSaved * 0.45 // rough estimate: $0.45M burn per day saved

  return {
    taskDurationDays,
    simulatedDurationDays,
    taskDaysSaved,
    projectedProjectDays,
    projectedEnd,
    projectDaysSaved,
    projectedSpi,
    projectedProgressPct,
    financialImpactMillions,
  }
}

const describeStatus = (tasks: GanttTask[]) => {
  const atRisk = tasks.filter((task) => (task.meta?.status as string | undefined)?.toLowerCase().includes('risk'))
  const monitoring = tasks.filter((task) => (task.meta?.status as string | undefined)?.toLowerCase().includes('monitor'))
  return { atRisk, monitoring }
}

export function ScheduleLayout({ title, breadcrumbs, tasks, loading, error, emptyMessage }: ScheduleLayoutProps) {
  const normalisedBreadcrumbs = useMemo(() => normaliseBreadcrumbs(breadcrumbs), [breadcrumbs])
  const ganttTasks = useMemo(() => toGanttTasks(tasks), [tasks])
  const baseline = useMemo(() => computeBaselineMetrics(tasks), [tasks])
  const leafTasks = useMemo(() => getLeafTasks(tasks), [tasks])
  const statusGroups = useMemo(() => describeStatus(tasks), [tasks])

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(leafTasks[0]?.id ?? null)
  const [acceleration, setAcceleration] = useState<number>(12)
  const [resourcePlan, setResourcePlan] = useState<ResourcePlan>(defaultResourcePlan)

  useEffect(() => {
    if (!leafTasks.length) {
      setSelectedTaskId(null)
      return
    }
    setSelectedTaskId((previous) => previous && leafTasks.some((task) => task.id === previous) ? previous : leafTasks[0].id)
  }, [leafTasks])

  const scenario = useMemo(
    () => buildScenario(tasks, baseline, selectedTaskId, acceleration, resourcePlan),
    [tasks, baseline, selectedTaskId, acceleration, resourcePlan],
  )

  const renderBreadcrumbItem = (item: Breadcrumb, index: number) => {
    const isLast = index === normalisedBreadcrumbs.length - 1
    if (item.onClick && !isLast) {
      return (
        <button key={item.label} type="button" className="breadcrumb-link" onClick={item.onClick}>
          {item.label}
          <span className="breadcrumb-separator" aria-hidden>
            ›
          </span>
        </button>
      )
    }
    return (
      <span key={item.label} className={`breadcrumb-text ${isLast ? 'current' : ''}`}>
        {item.label}
        {!isLast && (
          <span className="breadcrumb-separator" aria-hidden>
            ›
          </span>
        )}
      </span>
    )
  }

  let ganttContent: React.ReactNode
  if (loading) {
    ganttContent = <div className="schedule-state">Loading schedule…</div>
  } else if (error) {
    ganttContent = <div className="schedule-state error">{error}</div>
  } else if (!ganttTasks.length) {
    ganttContent = <div className="schedule-state">{emptyMessage ?? 'No schedule data available.'}</div>
  } else {
    ganttContent = (
      <Gantt
        tasks={ganttTasks}
        viewMode={ViewMode.Month}
        listCellWidth="320px"
        columnWidth={64}
        TooltipContent={TooltipContent}
        projectBackgroundColor="rgba(14, 165, 233, 0.15)"
        todayColor="rgba(59,130,246,0.18)"
        Locale="en"
      />
    )
  }

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null

  return (
    <div className="schedule-page schedule-page--immersive">
      <header className="schedule-header">
        <nav className="schedule-breadcrumb" aria-label="Breadcrumb trail">
          {normalisedBreadcrumbs.map(renderBreadcrumbItem)}
        </nav>
        <div className="schedule-title-row">
          <h1>{title}</h1>
          {baseline.start && baseline.end && (
            <div className="schedule-title-meta">
              <span>
                Window <strong>{monthFormatter.format(baseline.start)}</strong> → <strong>{monthFormatter.format(baseline.end)}</strong>
              </span>
              <span>
                Duration <strong>{baseline.durationDays} days</strong>
              </span>
            </div>
          )}
        </div>

        <section className="schedule-summary">
          <div className="summary-card">
            <span className="summary-label">Portfolio Pulse</span>
            <strong className="summary-value">{formatPercent(baseline.avgProgressPct)}</strong>
            <span className="summary-footnote">Mean completion across tracked scopes</span>
          </div>
          <div className="summary-card">
            <span className="summary-label">Schedule Performance</span>
            <strong className="summary-value">
              {baseline.avgSpi !== null && baseline.avgSpi !== undefined ? baseline.avgSpi.toFixed(2) : '—'}
            </strong>
            <span className="summary-footnote">
              {baseline.atRiskCount} at risk · {baseline.monitoringCount} under watch · {baseline.completedCount} complete
            </span>
          </div>
          <div className="summary-card summary-card--accent">
            <span className="summary-label">Simulation Scenario</span>
            <strong className="summary-value">{scenario.projectDaysSaved > 0 ? `-${scenario.projectDaysSaved} days` : 'Baseline'}</strong>
            <span className="summary-footnote">
              {scenario.projectedEnd ? `Projected delivery ${dateFormatter.format(scenario.projectedEnd)}` : 'Awaiting scenario data'}
            </span>
          </div>
        </section>
      </header>

      <main className="schedule-body-grid">
        <section className="schedule-insights">
          <h2>Realtime scheduling intelligence</h2>
          <p className="insights-lead">
            Track performance, surface blockers, and play out “what-if” recovery plans before they hit your cash-flow and claims ledger.
          </p>

          <div className="insights-radar">
            <div className="radar-ring">
              <span className="radar-value">{formatPercent(baseline.avgProgressPct)}</span>
              <span className="radar-label">Progress Confidence</span>
            </div>
            <ul className="radar-metrics">
              <li>
                <strong>{baseline.durationDays}</strong>
                <span>Baseline days to deliver</span>
              </li>
              <li>
                <strong>{statusGroups.atRisk.length}</strong>
                <span>Work packages flagged “At Risk”</span>
              </li>
              <li>
                <strong>{statusGroups.monitoring.length}</strong>
                <span>Under monitoring to hold SPI</span>
              </li>
            </ul>
          </div>

          <div className="insights-feed">
            <h3>Key watch-list</h3>
            <ul>
              {statusGroups.atRisk.slice(0, 3).map((task) => (
                <li key={task.id}>
                  <span className="feed-title">{task.name}</span>
                  <span className="feed-meta">
                    {Math.round((task.progress ?? 0) * 100)}% · SPI {Number(task.meta?.spi ?? 0).toFixed(2)} ·{' '}
                    {dateFormatter.format(new Date(task.end))}
                  </span>
                </li>
              ))}
              {statusGroups.atRisk.length === 0 && <li className="feed-empty">No processes are currently tagged “At Risk”.</li>}
            </ul>

            <h3>Monitoring lane</h3>
            <ul>
              {statusGroups.monitoring.slice(0, 3).map((task) => (
                <li key={task.id}>
                  <span className="feed-title">{task.name}</span>
                  <span className="feed-meta">
                    {Math.round((task.progress ?? 0) * 100)}% · SPI {Number(task.meta?.spi ?? 0).toFixed(2)} ·{' '}
                    {dateFormatter.format(new Date(task.end))}
                  </span>
                </li>
              ))}
              {statusGroups.monitoring.length === 0 && <li className="feed-empty">Everything else is tracking to plan.</li>}
            </ul>
          </div>
        </section>

        <section className="schedule-gantt-panel">
          <div className="schedule-gantt-toolbar">
            <div>
              <h2>Live plan</h2>
              {scenario.projectedEnd && (
                <span>
                  {scenario.projectDaysSaved > 0 ? 'Scenario pulls completion forward by ' : 'Holding baseline · '}
                  <strong>{scenario.projectDaysSaved > 0 ? `${scenario.projectDaysSaved} days` : '0 days'}</strong>
                </span>
              )}
            </div>
            <div className="schedule-legend">
              <span className="legend-item legend-success">On Track</span>
              <span className="legend-item legend-watch">Monitoring</span>
              <span className="legend-item legend-risk">At Risk</span>
            </div>
          </div>
          <div className="schedule-gantt">{ganttContent}</div>
        </section>

        <aside className="schedule-simulation">
          <header>
            <h2>Scenario lab</h2>
            <p>
              Model cascading impacts in seconds: fast-track a process, add kit, or open an extra crew to see delivery and finance impact instantly.
            </p>
          </header>

          <div className="simulation-control">
            <label htmlFor="task-select">Focus process</label>
            <select
              id="task-select"
              value={selectedTaskId ?? ''}
              onChange={(event) => setSelectedTaskId(event.target.value || null)}
              disabled={!leafTasks.length}
            >
              {leafTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name} ({formatPercent((task.progress ?? 0) * 100)})
                </option>
              ))}
            </select>
          </div>

          <div className="simulation-control">
            <label htmlFor="acceleration-range">
              Acceleration window <span>{acceleration}% boost</span>
            </label>
            <input
              id="acceleration-range"
              type="range"
              min={0}
              max={30}
              step={1}
              value={acceleration}
              onChange={(event) => setAcceleration(Number(event.target.value))}
            />
            <p className="control-hint">
              Pull target handover forward by adjusting trade-hours, shift coverage, or construction sequence.
            </p>
          </div>

          <div className="simulation-resource-grid">
            {resourceCatalog.map((resource) => (
              <div key={resource.key} className="resource-card">
                <div className="resource-heading">
                  <span>{resource.label}</span>
                  <div className="resource-counter">
                    <button
                      type="button"
                      onClick={() =>
                        setResourcePlan((prev) => ({
                          ...prev,
                          [resource.key]: Math.max(0, prev[resource.key] - resource.step),
                        }))
                      }
                      aria-label={`Remove ${resource.label}`}
                    >
                      –
                    </button>
                    <span>{resourcePlan[resource.key]}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setResourcePlan((prev) => ({
                          ...prev,
                          [resource.key]: prev[resource.key] + resource.step,
                        }))
                      }
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

          <div className="simulation-outlook">
            <h3>Scenario outlook</h3>
            <ul>
              <li>
                <span>Task duration</span>
                <strong>
                  {scenario.simulatedDurationDays} days{' '}
                  {scenario.taskDaysSaved > 0 && <em>(-{scenario.taskDaysSaved}d vs baseline)</em>}
                </strong>
              </li>
              <li>
                <span>Projected finish</span>
                <strong>{scenario.projectedEnd ? dateFormatter.format(scenario.projectedEnd) : '—'}</strong>
              </li>
              <li>
                <span>Portfolio SPI trajectory</span>
                <strong>
                  {scenario.projectedSpi !== null && scenario.projectedSpi !== undefined
                    ? scenario.projectedSpi.toFixed(2)
                    : '—'}
                </strong>
              </li>
              <li>
                <span>Projected progress</span>
                <strong>{formatPercent(scenario.projectedProgressPct)}</strong>
              </li>
              <li>
                <span>Finance upside</span>
                <strong>{formatCurrency(scenario.financialImpactMillions)}</strong>
              </li>
            </ul>
            <p className="outlook-footnote">
              Financial impact assumes historical burn of $0.45M/day and proportionally applies to the schedule compression achieved in this scenario.
            </p>
          </div>

          <div className="simulation-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setAcceleration(12)
                setResourcePlan(defaultResourcePlan)
              }}
            >
              Reset scenario
            </button>
            {selectedTask && (
              <div className="scenario-note">
                <strong>Why it matters:</strong> {selectedTask.name} represents{' '}
                {baseline.durationDays > 0 ? Math.round((scenario.taskDurationDays / baseline.durationDays) * 100) : 0}% of the total
                schedule horizon. Gains ripple directly into delivery and cashflow.
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  )
}

export default ScheduleLayout
