import React, { useEffect, useMemo, useState } from 'react'

import {
  fetchScmDashboard,
  fetchScmProcessCanvas,
  type ScmDashboardResponse,
  type ScmProcessCanvasResponse,
} from '../../api'

export type ScmScope = {
  tenantId?: string | null
  projectId?: string | null
  projectName?: string | null
  contractId?: string | null
  contractName?: string | null
  sowId?: string | null
  sowName?: string | null
  processId?: string | null
  processName?: string | null
}

type ScmQuickViewProps = {
  open: boolean
  scope: ScmScope | null
  onRequestClose?: () => void
}

type ScopeLevel = 'portfolio' | 'project' | 'contract' | 'sow' | 'process'

const resolveLevel = (scope: ScmScope | null): ScopeLevel => {
  if (!scope) return 'portfolio'
  if (scope.processId) return 'process'
  if (scope.sowId) return 'sow'
  if (scope.contractId) return 'contract'
  if (scope.projectId) return 'project'
  return 'portfolio'
}

const resolveScopeLabel = (scope: ScmScope | null): string => {
  if (!scope) return 'Portfolio'
  if (scope.processId && scope.processName) return scope.processName
  if (scope.processId) return scope.processId
  if (scope.sowId && scope.sowName) return scope.sowName
  if (scope.sowId) return scope.sowId
  if (scope.contractId && scope.contractName) return scope.contractName
  if (scope.contractId) return scope.contractId
  if (scope.projectId && scope.projectName) return scope.projectName
  if (scope.projectId) return scope.projectId
  return 'Portfolio'
}

const buildDashboardParams = (scope: ScmScope | null, level: ScopeLevel) => {
  if (!scope) {
    return {
      scopeLevel: level,
      tenantId: 'default',
    } as const
  }
  return {
    scopeLevel: level,
    tenantId: scope.tenantId ?? 'default',
    projectId: scope.projectId ?? undefined,
    contractId: scope.contractId ?? undefined,
    sowId: scope.sowId ?? undefined,
    processId: scope.processId ?? undefined,
  } as const
}

const buildCanvasParams = (scope: ScmScope | null) => {
  if (!scope || !scope.projectId || !scope.processId) {
    return null
  }
  return {
    tenantId: scope.tenantId ?? 'default',
    projectId: scope.projectId,
    contractId: scope.contractId ?? undefined,
    sowId: scope.sowId ?? undefined,
    processId: scope.processId,
  } as const
}

export function ScmQuickView({ open, scope, onRequestClose }: ScmQuickViewProps) {
  const scopeLevel = useMemo(() => resolveLevel(scope), [scope])
  const scopeLabel = useMemo(() => resolveScopeLabel(scope), [scope])
  const [dashboard, setDashboard] = useState<ScmDashboardResponse | null>(null)
  const [canvas, setCanvas] = useState<ScmProcessCanvasResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scopeKey = useMemo(() => {
    if (!scope) return 'portfolio'
    return JSON.stringify({
      level: scopeLevel,
      tenantId: scope.tenantId ?? 'default',
      projectId: scope.projectId ?? null,
      contractId: scope.contractId ?? null,
      sowId: scope.sowId ?? null,
      processId: scope.processId ?? null,
    })
  }, [scope, scopeLevel])

  useEffect(() => {
    if (!open) {
      return
    }
    const dashboardParams = buildDashboardParams(scope, scopeLevel)
    if (scopeLevel !== 'portfolio') {
      const missingContractLevel = scopeLevel === 'contract' && !scope?.contractId
      const missingSowLevel = scopeLevel === 'sow' && !scope?.sowId
      const missingProcessId = scopeLevel === 'process' && !scope?.processId
      const missingProcessProject = scopeLevel === 'process' && !scope?.projectId
      if (missingContractLevel || missingSowLevel || missingProcessId || missingProcessProject) {
        setError('Select a scope to load SCM insights.')
        setDashboard(null)
        setCanvas(null)
        return
      }
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    const tasks: Array<Promise<unknown>> = [
      fetchScmDashboard(dashboardParams, controller.signal).then((data) => {
        setDashboard(data)
      }),
    ]
    if (scopeLevel === 'process') {
      const canvasParams = buildCanvasParams(scope)
      if (canvasParams) {
        tasks.push(
          fetchScmProcessCanvas(canvasParams, controller.signal).then((data) => {
            setCanvas(data)
          }),
        )
      }
    } else {
      setCanvas(null)
    }

    Promise.all(tasks)
      .catch((err) => {
        if (err.name === 'AbortError') return
        console.error('Failed to load SCM snapshot', err)
        setError('Unable to load SCM snapshot.')
        setDashboard(null)
        setCanvas(null)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [open, scopeKey, scope, scopeLevel])

  if (!open) {
    return null
  }

  return (
    <aside className="scm-quick-view" role="dialog" aria-label="SCM snapshot">
      <header className="scm-quick-view__header">
        <div>
          <h3>SCM Snapshot</h3>
          <p>
            {scopeLevel.charAt(0).toUpperCase() + scopeLevel.slice(1)} · {scopeLabel}
          </p>
        </div>
        <button type="button" className="scm-quick-view__close" onClick={onRequestClose}>
          <span aria-hidden>×</span>
          <span className="sr-only">Close SCM snapshot</span>
        </button>
      </header>

      {loading ? <div className="scm-quick-view__status">Loading SCM data…</div> : null}
      {error ? <div className="scm-quick-view__status scm-quick-view__status--error">{error}</div> : null}

      {!loading && !error ? (
        <div className="scm-quick-view__content">
          <section>
            <h4>Performance</h4>
            <div className="scm-quick-view__metrics">
              {(dashboard?.kpis ?? []).map((metric) => (
                <article
                  key={metric.title}
                  className={`scm-quick-view__metric-card${metric.status ? ` status-${metric.status}` : ''}`}
                >
                  <span>{metric.title}</span>
                  <strong>
                    {typeof metric.value === 'number'
                      ? metric.unit === 'USD'
                        ? new Intl.NumberFormat(undefined, {
                            style: 'currency',
                            currency: 'USD',
                            maximumFractionDigits: 1,
                          }).format(metric.value)
                        : metric.unit === '%'
                          ? `${metric.value.toFixed(1)}%`
                          : metric.value.toLocaleString()
                      : metric.value ?? '—'}
                  </strong>
                </article>
              ))}
              {!dashboard?.kpis?.length ? <p className="scm-quick-view__empty">No metrics available.</p> : null}
            </div>
          </section>

          {canvas ? (
            <>
              <section>
                <h4>Material Coverage</h4>
                <ul className="scm-quick-view__list">
                  <li>Required qty: {canvas.metrics ? canvas.metrics.requiredQty.toLocaleString() : '—'}</li>
                  <li>Committed qty: {canvas.metrics ? canvas.metrics.committedQty.toLocaleString() : '—'}</li>
                  <li>Coverage: {canvas.metrics ? `${canvas.metrics.coveragePct.toFixed(1)}%` : '—'}</li>
                  <li>Open shipments: {canvas.metrics ? canvas.metrics.openShipments.toLocaleString() : '—'}</li>
                </ul>
              </section>

              <section>
                <h4>Procurement Lanes</h4>
                <div className="scm-quick-view__lanes">
                  {canvas.procurement.slice(0, 4).map((lane) => (
                    <div key={lane.title} className="scm-quick-view__lane-card">
                      <header>
                        <span>{lane.title}</span>
                        <span>{lane.cards.length}</span>
                      </header>
                      <ul>
                        {lane.cards.slice(0, 3).map((card) => (
                          <li key={card.id}>
                            <span>{card.title}</span>
                            {card.neededDate ? <small>Need {card.neededDate}</small> : null}
                          </li>
                        ))}
                        {lane.cards.length > 3 ? <li className="scm-quick-view__more">+{lane.cards.length - 3} more</li> : null}
                        {!lane.cards.length ? <li className="scm-quick-view__empty">Lane clear</li> : null}
                      </ul>
                    </div>
                  ))}
                  {!canvas.procurement.length ? <p className="scm-quick-view__empty">No procurement lanes.</p> : null}
                </div>
              </section>

              <section>
                <h4>Logistics</h4>
                <ul className="scm-quick-view__list">
                  {canvas.logistics.slice(0, 5).map((item) => (
                    <li key={item.id}>
                      <strong>{item.title}</strong>
                      {item.eta ? <span> · ETA {item.eta}</span> : null}
                    </li>
                  ))}
                  {!canvas.logistics.length ? <li className="scm-quick-view__empty">No active shipments.</li> : null}
                </ul>
              </section>
            </>
          ) : null}
        </div>
      ) : null}
    </aside>
  )
}

export default ScmQuickView
