import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  fetchProgressHierarchy,
  fetchScmDashboard,
  fetchScmProcessCanvas,
  type ProgressHierarchyResponse,
  type ProgressHierarchyContract,
  type ProgressHierarchyProcess,
  type ProgressHierarchySow,
  type ScmDashboardResponse,
  type ScmProcessCanvasResponse,
} from '../../api'
import {
  METRIC_INSIGHT_MAP,
  ReadinessCard,
  RISK_CLASS,
  ScmInsightModal,
  ScmInsightRail,
  buildInsight,
  buildReadinessInsights,
  mergeProcessCanvases,
  normalizeMetricKey,
  type InsightModalState,
} from './ScmInsightToolkit'
import ScmFlowOverview from './ScmFlowOverview'
import { formatCurrency, formatNumber, formatShortDate } from '../../pages/atom/utils'

type ContractScmDashboardProps = {
  tenantId?: string | null
  projectId?: string | null
  projectName?: string | null
  contractId?: string | null
  contractName?: string | null
}

const MAX_LIST_ITEMS = 4

const emptyHierarchy: ProgressHierarchyResponse = { projects: [], asOf: new Date().toISOString() }

export function ContractScmDashboard({
  tenantId = 'default',
  projectId,
  projectName,
  contractId,
  contractName,
}: ContractScmDashboardProps) {
  const navigate = useNavigate()
  const [dashboard, setDashboard] = useState<ScmDashboardResponse | null>(null)
  const [canvas, setCanvas] = useState<ScmProcessCanvasResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [insightModal, setInsightModal] = useState<InsightModalState | null>(null)
  const [viewMode, setViewMode] = useState<'timeline' | 'canvas'>('timeline')
  const [flowHighlight, setFlowHighlight] = useState<'demand' | 'procurement' | 'logistics' | 'inventory'>('demand')
  const [flowHeight, setFlowHeight] = useState(360)
  const hierarchyCache = useRef<ProgressHierarchyResponse>(emptyHierarchy)
  const resizeStateRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const resizeMoveHandlerRef = useRef<((event: MouseEvent) => void) | null>(null)
  const resizeUpHandlerRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    hierarchyCache.current = emptyHierarchy
  }, [tenantId])

  const scopeLabel = contractName ?? contractId ?? 'Select a contract'

  const loadContractAggregate = useCallback(
    async (signal: AbortSignal): Promise<ScmProcessCanvasResponse | null> => {
      if (!tenantId || !projectId || !contractId) {
        return null
      }

      let hierarchy = hierarchyCache.current
      if (!hierarchy.projects.length) {
        hierarchy = await fetchProgressHierarchy(tenantId)
        hierarchyCache.current = hierarchy
      }

      const projectNode = hierarchy.projects.find((project) => project.code === projectId)
      if (!projectNode) return null

      const contractNode = projectNode.contracts.find((entry) => entry.code === contractId)
      if (!contractNode) return null

      const processNodes: Array<
        ProgressHierarchyProcess & { sowCode: string; contract: ProgressHierarchyContract; sow: ProgressHierarchySow }
      > = []
      contractNode.sows.forEach((sow) => {
        sow.processes.forEach((process) => {
          processNodes.push({ ...process, sowCode: sow.code, contract: contractNode, sow })
        })
      })

      if (!processNodes.length) return null

      const canvases: ScmProcessCanvasResponse[] = []
      for (const node of processNodes) {
        if (signal.aborted) break
        try {
          const canvasResponse = await fetchScmProcessCanvas(
            {
              tenantId,
              projectId,
              contractId,
              sowId: node.sowCode,
              processId: node.code,
            },
            signal,
          )
          canvases.push(canvasResponse)
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            return null
          }
          console.warn('SCM contract aggregate fetch failed', err)
        }
      }

      return mergeProcessCanvases(canvases, {
        code: contractNode.code,
        name: contractNode.name,
      })
    },
    [tenantId, projectId, contractId],
  )

  const loadData = useCallback(() => {
    if (!projectId || !contractId) {
      setDashboard(null)
      setCanvas(null)
      setError(null)
      setLoading(false)
      return () => {}
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    Promise.all([
      fetchScmDashboard(
        {
          scopeLevel: 'contract',
          tenantId,
          projectId,
          contractId,
        },
        controller.signal,
      ),
      loadContractAggregate(controller.signal),
    ])
      .then(([dashboardPayload, aggregate]) => {
        setDashboard(dashboardPayload)
        setCanvas(aggregate)
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return
        console.error('Failed to load contract SCM dashboard', err)
        setError('Unable to load supply-chain readiness for this contract.')
        setDashboard(null)
        setCanvas(null)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [contractId, loadContractAggregate, projectId, tenantId])

  useEffect(() => {
    const abort = loadData()
    return () => {
      if (typeof abort === 'function') abort()
    }
  }, [loadData])

  useEffect(() => {
    if (canvas) {
      setFlowHighlight('demand')
    }
  }, [canvas?.generatedAt])

  useEffect(() => {
    return () => {
      if (resizeMoveHandlerRef.current) {
        document.removeEventListener('mousemove', resizeMoveHandlerRef.current)
      }
      if (resizeUpHandlerRef.current) {
        document.removeEventListener('mouseup', resizeUpHandlerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!insightModal) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setInsightModal(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [insightModal])

  const readinessInsights = useMemo(() => buildReadinessInsights(canvas), [canvas])
  const insightsByMetric = useMemo(() => {
    const map = new Map<string, ScmDashboardResponse['insights'][number]>()
    ;(dashboard?.insights ?? []).forEach((insight) => map.set(normalizeMetricKey(insight.metric), insight))
    return map
  }, [dashboard?.insights])

  const coverageInsight = insightsByMetric.get(normalizeMetricKey('Demand coverage'))
  const poInsight = insightsByMetric.get(normalizeMetricKey('Open POs'))
  const logisticsInsight =
    insightsByMetric.get(normalizeMetricKey('Overdue shipments')) ??
    insightsByMetric.get(normalizeMetricKey('Open shipments'))
  const actionInsights = dashboard?.insights ?? []

  const metricToHighlight = useCallback((metricTitle: string): 'demand' | 'procurement' | 'logistics' | 'inventory' | null => {
    const key = normalizeMetricKey(metricTitle)
    switch (METRIC_INSIGHT_MAP[key] ?? '') {
      case 'demandCoverage':
        return 'demand'
      case 'committedValue':
      case 'openPos':
        return 'procurement'
      case 'openShipments':
      case 'overdueShipments':
        return 'logistics'
      case 'inventoryValue':
        return 'inventory'
      default:
        return null
    }
  }, [])

  const handleMetricClick = useCallback(
    (metricTitle: string) => {
      const metricKey = normalizeMetricKey(metricTitle)
      const nextHighlight = metricToHighlight(metricTitle)
      if (nextHighlight) {
        setFlowHighlight(nextHighlight)
      }
      const metricInsight = insightsByMetric.get(metricKey)
      if (metricInsight) {
        setInsightModal({
          title: metricInsight.headline,
          description: metricInsight.summary,
          severity: metricInsight.severity,
          details: metricInsight.details,
          actions: metricInsight.actions,
        })
        return
      }
      const kind = METRIC_INSIGHT_MAP[metricKey]
      if (!kind) {
        setInsightModal({
          title: metricTitle,
          description: 'No detailed insight is available yet for this KPI.',
        })
        return
      }
      if (!canvas) {
        setInsightModal({
          title: metricTitle,
          description: 'Detailed workflow insights require supply-chain canvas data for this contract.',
        })
        return
      }
      const data = buildInsight(canvas, kind)
      if (data) {
        setInsightModal(data)
        return
      }
      setInsightModal({
        title: metricTitle,
        description: 'No detailed insight is available yet for this KPI.',
      })
    },
    [canvas, insightsByMetric, metricToHighlight],
  )

  const handleOpenAlarmCenter = () => {
    navigate('/alarms', {
      state: {
        tenantId,
        projectId,
        projectName,
        contractId,
        contractName,
      },
    })
  }

  const handleOpenWorkspace = () => {
    navigate('/atoms/scm', {
      state: {
        tenantId,
        projectId,
        projectName,
        contractId,
        contractName,
        source: 'ccc',
      },
    })
  }

  const totals = dashboard?.totals ?? {}
  const metrics = dashboard?.kpis ?? []
  const activeMetrics = canvas?.metrics ?? null
  const riskLevel = activeMetrics?.riskLevel ?? 'normal'
  const riskBadgeClass = `atom-scm-badge atom-scm-badge--${riskLevel}`
  const lastUpdated = dashboard?.generatedAt ? new Date(dashboard.generatedAt) : null

  const requirements = useMemo(() => (canvas?.requirements ?? []).slice(0, MAX_LIST_ITEMS), [canvas?.requirements])
  const inputs = useMemo(() => (canvas?.inputs ?? []).slice(0, MAX_LIST_ITEMS), [canvas?.inputs])
  const outputs = useMemo(() => (canvas?.outputs ?? []).slice(0, MAX_LIST_ITEMS), [canvas?.outputs])
  const procurementLanes = useMemo(() => (canvas?.procurement ?? []).slice(0, 2), [canvas?.procurement])
  const logistics = useMemo(() => (canvas?.logistics ?? []).slice(0, MAX_LIST_ITEMS), [canvas?.logistics])
  const inventory = useMemo(() => (canvas?.inventory ?? []).slice(0, MAX_LIST_ITEMS), [canvas?.inventory])

  const coverageValue = activeMetrics?.coveragePct ?? (totals.requiredQty ? (Number(totals.committedQty ?? 0) / Number(totals.requiredQty ?? 1)) * 100 : 0)
  const poValue =
    activeMetrics?.openPurchaseOrders === 0 && activeMetrics?.openRequisitions === 0
      ? 100
      : Math.max(0, 100 - (activeMetrics?.openPurchaseOrders ?? 0) * 12)
  const logisticsValue =
    activeMetrics?.openShipments === 0 ? 100 : Math.max(0, 100 - (activeMetrics?.openShipments ?? 0) * 15)

  return (
    <section className="ccc-scm" aria-label="Supply chain control tower">
      <header className="ccc-scm__header">
        <div>
          <h2>Supply Chain Control</h2>
          <p>
            {scopeLabel}
            {projectName ? ` · ${projectName}` : ''}
          </p>
        </div>
        <div className="ccc-scm__header-actions">
          <button type="button" className="ccc-scm__cta" onClick={handleOpenAlarmCenter}>
            Open Alarm Center
          </button>
          <button type="button" className="ccc-scm__cta primary" onClick={handleOpenWorkspace}>
            Launch SCM workspace
          </button>
        </div>
      </header>

      {!contractId ? (
        <div className="ccc-scm__placeholder">
          <p>Select a contract from the left to unlock procurement and logistics insights.</p>
        </div>
      ) : null}

      {contractId ? (
        <>
          <div className="ccc-scm__status">
            <span className={riskBadgeClass}>
              Risk {riskLevel}
            </span>
            <span>
              Required {formatNumber(Number(totals.requiredQty ?? 0))} · Committed {formatNumber(Number(totals.committedQty ?? 0))}{' '}
              ({coverageValue ? coverageValue.toFixed(1) : '0.0'}%)
            </span>
            <span>Inventory {formatCurrency(Number(totals.inventoryValue ?? 0), 1)}</span>
            {lastUpdated ? <span>Updated {lastUpdated.toLocaleString()}</span> : null}
          </div>

          {riskLevel !== 'normal' && activeMetrics?.riskReasons?.length ? (
            <ul className="ccc-scm__risk-list">
              {activeMetrics.riskReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}

          {actionInsights.length ? <ScmInsightRail insights={actionInsights} onSelect={handleMetricClick} /> : null}

          <div className="ccc-scm__readiness">
            <ReadinessCard
              title="Material readiness"
              value={coverageValue}
              unit="%"
              subtitle={coverageInsight?.summary ?? 'Committed vs required quantities'}
              bullets={coverageInsight?.details?.length ? coverageInsight.details : readinessInsights.material}
              actions={coverageInsight?.actions}
              onOpen={() => handleMetricClick('Demand coverage')}
            />
            <ReadinessCard
              title="PO coverage"
              value={poValue}
              unit="%"
              subtitle={poInsight?.summary ?? `${activeMetrics?.openPurchaseOrders ?? 0} open purchase orders`}
              bullets={poInsight?.details?.length ? poInsight.details : readinessInsights.purchaseOrders}
              actions={poInsight?.actions}
              onOpen={() => handleMetricClick('Open POs')}
            />
            <ReadinessCard
              title="Logistics on track"
              value={logisticsValue}
              unit="%"
              subtitle={logisticsInsight?.summary ?? `${activeMetrics?.openShipments ?? 0} active shipments`}
              bullets={logisticsInsight?.details?.length ? logisticsInsight.details : readinessInsights.logistics}
              actions={logisticsInsight?.actions}
              onOpen={() => handleMetricClick('Overdue shipments')}
            />
          </div>

          {canvas ? (
            <section className="ccc-scm__flow">
              <header>
                <div>
                  <h3>Supply network flow</h3>
                  <span>Visualise how demand feeds procurement, logistics, and inventory for this contract.</span>
                </div>
                <div className="ccc-scm__flow-actions">
                  <button type="button" onClick={() => setFlowHighlight('demand')} aria-pressed={flowHighlight === 'demand'}>
                    Demand
                  </button>
                  <button type="button" onClick={() => setFlowHighlight('procurement')} aria-pressed={flowHighlight === 'procurement'}>
                    Procurement
                  </button>
                  <button type="button" onClick={() => setFlowHighlight('logistics')} aria-pressed={flowHighlight === 'logistics'}>
                    Logistics
                  </button>
                  <button type="button" onClick={() => setFlowHighlight('inventory')} aria-pressed={flowHighlight === 'inventory'}>
                    Inventory
                  </button>
                </div>
              </header>
              <div className="ccc-scm__flow-surface" style={{ height: `${flowHeight}px` }}>
                <ScmFlowOverview canvas={canvas} highlight={flowHighlight} height={flowHeight} />
                <div
                  className="ccc-scm__flow-resize"
                  role="separator"
                  aria-label="Resize supply chain flow workspace"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    resizeStateRef.current = { startY: event.clientY, startHeight: flowHeight }
                    const handleMove = (moveEvent: MouseEvent) => {
                      if (!resizeStateRef.current) return
                      const delta = moveEvent.clientY - resizeStateRef.current.startY
                      const nextHeight = Math.min(660, Math.max(240, resizeStateRef.current.startHeight + delta))
                      setFlowHeight(nextHeight)
                    }
                    const handleUp = () => {
                      resizeStateRef.current = null
                      if (resizeMoveHandlerRef.current) {
                        document.removeEventListener('mousemove', resizeMoveHandlerRef.current)
                      }
                      if (resizeUpHandlerRef.current) {
                        document.removeEventListener('mouseup', resizeUpHandlerRef.current)
                      }
                      resizeMoveHandlerRef.current = null
                      resizeUpHandlerRef.current = null
                    }
                    resizeMoveHandlerRef.current = handleMove
                    resizeUpHandlerRef.current = handleUp
                    document.addEventListener('mousemove', handleMove)
                    document.addEventListener('mouseup', handleUp)
                  }}
                >
                  <span />
                </div>
              </div>
            </section>
          ) : null}

          <div className="ccc-scm__metric-grid">
            {metrics.map((metric) => {
              const metricKey = normalizeMetricKey(metric.title)
              return (
                <button
                  key={metricKey || metric.title}
                  type="button"
                  className={`ccc-scm__metric ${metric.status ? `status-${metric.status}` : ''}`}
                  onClick={() => handleMetricClick(metric.title)}
                  onMouseEnter={() => {
                    const stage = metricToHighlight(metric.title)
                    if (stage) setFlowHighlight(stage)
                  }}
                  onFocus={() => {
                    const stage = metricToHighlight(metric.title)
                    if (stage) setFlowHighlight(stage)
                  }}
                  onMouseLeave={() => setFlowHighlight('demand')}
                  onBlur={() => setFlowHighlight('demand')}
                >
                  <span>{metric.title}</span>
                  <strong>
                    {metric.unit === 'USD'
                      ? formatCurrency(metric.value, 1)
                      : metric.unit === '%'
                        ? `${metric.value.toFixed(1)}%`
                        : formatNumber(metric.value)}
                  </strong>
                </button>
              )
            })}
            {!metrics.length && !loading ? <p className="ccc-scm__empty">No KPI metrics available for this contract.</p> : null}
          </div>

          <div className="ccc-scm__view-toggle" role="tablist" aria-label="SCM board view">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'timeline'}
              className={viewMode === 'timeline' ? 'active' : ''}
              onClick={() => setViewMode('timeline')}
            >
              Timeline lanes
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'canvas'}
              className={viewMode === 'canvas' ? 'active' : ''}
              onClick={() => setViewMode('canvas')}
            >
              Canvas board
            </button>
          </div>

          <div className={`ccc-scm__board ccc-scm__board--${viewMode}`}>
            <div className="ccc-scm__column">
              <header>
                <h3>Requirements</h3>
                <span>{canvas?.requirements.length ?? 0}</span>
              </header>
              <div className="ccc-scm__card-list">
                {requirements.map((card, index) => (
                  <ContractCanvasCard key={`requirements-${card.id ?? index}-${index}`} card={card} />
                ))}
                {!requirements.length && !loading ? <p className="ccc-scm__empty">No material demand captured yet.</p> : null}
              </div>
              <header>
                <h3>Inputs</h3>
                <span>{canvas?.inputs.length ?? 0}</span>
              </header>
              <div className="ccc-scm__card-list">
                {inputs.map((card, index) => (
                  <ContractCanvasCard key={`inputs-${card.id ?? index}-${index}`} card={card} />
                ))}
                {!inputs.length && !loading ? <p className="ccc-scm__empty">No inbound materials in flight.</p> : null}
              </div>
              <header>
                <h3>Outputs</h3>
                <span>{canvas?.outputs.length ?? 0}</span>
              </header>
              <div className="ccc-scm__card-list">
                {outputs.map((card, index) => (
                  <ContractCanvasCard key={`outputs-${card.id ?? index}-${index}`} card={card} />
                ))}
                {!outputs.length && !loading ? <p className="ccc-scm__empty">Outputs will appear as work is completed.</p> : null}
              </div>
            </div>

            <div className="ccc-scm__column">
              {procurementLanes.map((lane, laneIndex) => (
                <div key={`${lane.title}-${laneIndex}`}>
                  <header>
                    <h3>{lane.title}</h3>
                    <span>{lane.cards.length}</span>
                  </header>
                  <div className="ccc-scm__card-list">
                    {lane.cards.slice(0, MAX_LIST_ITEMS).map((card, index) => (
                      <ContractCanvasCard key={`procurement-${lane.title}-${card.id ?? index}-${index}`} card={card} />
                    ))}
                    {!lane.cards.length && !loading ? <p className="ccc-scm__empty">Lane clear — great job.</p> : null}
                  </div>
                </div>
              ))}
              {!procurementLanes.length && !loading ? <p className="ccc-scm__empty">No procurement lanes available.</p> : null}
            </div>

            <div className="ccc-scm__column">
              <header>
                <h3>Logistics</h3>
                <span>{canvas?.logistics.length ?? 0}</span>
              </header>
              <div className="ccc-scm__card-list">
                {logistics.map((card, index) => (
                  <ContractCanvasCard key={`logistics-${card.id ?? index}-${index}`} card={card} compact />
                ))}
                {!logistics.length && !loading ? <p className="ccc-scm__empty">No shipments en route.</p> : null}
              </div>

              <header>
                <h3>Inventory snapshots</h3>
                <span>{canvas?.inventory.length ?? 0}</span>
              </header>
              <div className="ccc-scm__inventory">
                {inventory.map((item, index) => (
                  <div key={`inventory-${item.id ?? index}-${index}`} className="ccc-scm__inventory-card">
                    <div>
                      <strong>{item.itemName}</strong>
                      <span>{item.itemCode}</span>
                    </div>
                    <div className="ccc-scm__inventory-metrics">
                      <span>On hand {formatNumber(item.onHand)}</span>
                      <span>Reserved {formatNumber(item.reserved)}</span>
                      <span>Available {formatNumber(item.available)}</span>
                    </div>
                    <div className="ccc-scm__inventory-footer">
                      <span>{item.location ?? 'Unassigned'}</span>
                      <span>{formatShortDate(item.snapshotDate)}</span>
                    </div>
                  </div>
                ))}
                {!inventory.length && !loading ? <p className="ccc-scm__empty">No inventory recorded for this contract.</p> : null}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {loading ? (
        <div className="ccc-scm__skeleton">
          <div className="ccc-scm__skeleton-row" />
          <div className="ccc-scm__skeleton-row" />
          <div className="ccc-scm__skeleton-grid">
            <span />
            <span />
            <span />
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="ccc-scm__error">
          <p>{error}</p>
          <button type="button" onClick={loadData}>
            Retry
          </button>
        </div>
      ) : null}

      {insightModal ? <ScmInsightModal data={insightModal} onClose={() => setInsightModal(null)} /> : null}
    </section>
  )
}

function ContractCanvasCard({ card, compact = false }: { card: ScmProcessCanvasResponse['requirements'][number]; compact?: boolean }) {
  const riskClass = card.risk ? ` ${RISK_CLASS[card.risk] ?? ''}` : ''
  return (
    <article className={`atom-scm-card${compact ? ' atom-scm-card--sidebar' : ''}${riskClass}`}>
      <header>
        <span className="atom-scm-card-title">{card.title}</span>
        {card.status ? <span className="atom-scm-card-status">{card.status}</span> : null}
      </header>
      {card.subtitle ? <p className="atom-scm-card-subtitle">{card.subtitle}</p> : null}
      <div className="atom-scm-card-body">
        {typeof card.quantity === 'number' ? (
          <span className="atom-scm-card-quantity">
            {formatNumber(card.quantity)}
            {card.unit ? ` ${card.unit}` : ''}
          </span>
        ) : null}
        {card.neededDate ? <span>Needed {formatShortDate(card.neededDate)}</span> : null}
        {card.eta ? <span>ETA {formatShortDate(card.eta)}</span> : null}
        {typeof card.progress === 'number' ? <span>Committed {card.progress.toFixed(0)}%</span> : null}
      </div>
      {card.tags?.length ? (
        <footer className="atom-scm-card-tags">
          {card.tags.slice(0, 3).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </footer>
      ) : null}
    </article>
  )
}

export default ContractScmDashboard
