import React, { useMemo, useRef } from 'react'
import ReactFlow, { Background, Controls, MiniMap, type Edge, type Node } from 'reactflow'
import 'reactflow/dist/style.css'

import {
  type ScmCanvasCard,
  type ScmCanvasLane,
  type ScmInsight,
  type ScmInsightAction,
  type ScmInventoryCard,
  type ScmProcessCanvasResponse,
  type ScmProcessMetrics,
} from '../../api'

type InsightRisk = 'critical' | 'warning' | 'normal'

export type InsightKind =
  | 'demandCoverage'
  | 'committedValue'
  | 'openPos'
  | 'openShipments'
  | 'overdueShipments'
  | 'inventoryValue'

export type InsightModalState = {
  title: string
  description?: string
  severity?: InsightRisk | string
  columns?: string[]
  rows?: Array<Array<string | number>>
  details?: string[]
  actions?: ScmInsightAction[]
  graph?: {
    nodes: Node[]
    edges: Edge[]
  }
}

export const normalizeMetricKey = (value: string): string => value.trim().toLowerCase()

export const METRIC_INSIGHT_MAP: Record<string, InsightKind> = {
  [normalizeMetricKey('Demand coverage')]: 'demandCoverage',
  [normalizeMetricKey('Committed value')]: 'committedValue',
  [normalizeMetricKey('Open POs')]: 'openPos',
  [normalizeMetricKey('Open shipments')]: 'openShipments',
  [normalizeMetricKey('Overdue shipments')]: 'overdueShipments',
  [normalizeMetricKey('Inventory value')]: 'inventoryValue',
}

export const RISK_CLASS: Record<string, string> = {
  critical: 'risk-critical',
  warning: 'risk-warning',
}

export const toDateLabel = (value: string | Date | null | undefined) => {
  if (!value) return '—'
  const source = typeof value === 'string' ? value : value.toISOString()
  const parsed = new Date(source)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString()
}

export const ensureMetadata = (payload: unknown): Record<string, unknown> => {
  if (!payload || typeof payload !== 'object') return {}
  return payload as Record<string, unknown>
}

const formatNumberValue = (value: unknown, digits = 0) => {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric.toLocaleString(undefined, { maximumFractionDigits: digits }) : '—'
}

export const buildFlowGraph = (
  canvas: ScmProcessCanvasResponse,
  highlight: 'demand' | 'procurement' | 'logistics' | 'inventory',
): { nodes: Node[]; edges: Edge[] } => {
  const demandCommitted = canvas.metrics.committedQty
  const demandRequired = canvas.metrics.requiredQty
  const poCount = canvas.metrics.openPurchaseOrders
  const shipmentCount = canvas.metrics.openShipments
  const inventoryValue = canvas.metrics.inventoryValue
  const coverage = canvas.metrics.coveragePct

  const baseX = 0
  const spacing = 220
  const nodes: Node[] = [
    {
      id: 'demand',
      position: { x: baseX, y: 120 },
      data: {
        label: `Demand\n${formatNumberValue(demandCommitted, 0)} committed of ${formatNumberValue(demandRequired, 0)}`,
      },
      className: `scm-flow-node scm-flow-node--demand${highlight === 'demand' ? ' is-highlight' : ''}`,
    },
    {
      id: 'procurement',
      position: { x: baseX + spacing, y: 40 },
      data: {
        label: `Procurement\n${poCount} open POs`,
      },
      className: `scm-flow-node scm-flow-node--procurement${highlight === 'procurement' ? ' is-highlight' : ''}`,
    },
    {
      id: 'logistics',
      position: { x: baseX + spacing * 2, y: 200 },
      data: {
        label: `Logistics\n${shipmentCount} shipments in flight`,
      },
      className: `scm-flow-node scm-flow-node--logistics${highlight === 'logistics' ? ' is-highlight' : ''}`,
    },
    {
      id: 'inventory',
      position: { x: baseX + spacing * 3, y: 120 },
      data: {
        label: `Inventory\n$${formatNumberValue(inventoryValue, 1)}`,
      },
      className: `scm-flow-node scm-flow-node--inventory${highlight === 'inventory' ? ' is-highlight' : ''}`,
    },
    {
      id: 'health',
      position: { x: baseX + spacing * 1.5, y: -20 },
      data: {
        label: `Readiness\n${coverage.toFixed(1)}% coverage`,
      },
      className: 'scm-flow-node scm-flow-node--summary',
    },
  ]

  const edges: Edge[] = [
    { id: 'e1', source: 'demand', target: 'procurement', animated: true },
    { id: 'e2', source: 'procurement', target: 'logistics', animated: true },
    { id: 'e3', source: 'logistics', target: 'inventory', animated: true },
    { id: 'e4', source: 'procurement', target: 'health', type: 'smoothstep' },
    { id: 'e5', source: 'logistics', target: 'health', type: 'smoothstep' },
    { id: 'e6', source: 'demand', target: 'health', type: 'smoothstep' },
  ]

  return { nodes, edges }
}

export const buildInsight = (canvas: ScmProcessCanvasResponse | null, kind: InsightKind): InsightModalState | null => {
  if (!canvas) return null

  switch (kind) {
    case 'demandCoverage': {
      const cards = [...canvas.requirements, ...canvas.inputs, ...canvas.outputs]
      if (!cards.length) return null
      return {
        title: 'Demand coverage breakdown',
        columns: ['Item', 'Process', 'Stage', 'Status', 'Required', 'Committed', 'Gap', 'Needed'],
        rows: cards.map((card) => {
          const metadata = ensureMetadata(card.metadata)
          const processName = metadata.processName ?? canvas.scope.name ?? canvas.scope.code ?? ''
          const required = Number(metadata.requiredQty ?? card.quantity ?? 0)
          const committed = Number(metadata.committedQty ?? (card.progress ? (required * Number(card.progress) * 0.01) : card.quantity ?? 0))
          const gap = Math.max(0, required - committed)
          return [
            card.title,
            String(processName),
            String(metadata.stage ?? ''),
            String(card.status ?? ''),
            formatNumberValue(required),
            formatNumberValue(committed),
            formatNumberValue(gap),
            toDateLabel(card.neededDate ?? metadata.neededDate ?? null),
          ]
        }),
        graph: buildFlowGraph(canvas, 'demand'),
      }
    }
    case 'committedValue': {
      const lane = canvas.procurement.find((entry) => entry.title.toLowerCase().includes('purchase'))
      if (!lane || !lane.cards.length) return null
      return {
        title: 'Purchase orders',
        columns: ['PO', 'Process', 'Supplier', 'Status', 'Ordered qty', 'Value', 'Expected'],
        rows: lane.cards.map((card) => {
          const metadata = ensureMetadata(card.metadata)
          const processName = metadata.processName ?? canvas.scope.name ?? canvas.scope.code ?? ''
          const value = metadata.committedValue ?? metadata.value ?? card.quantity ?? 0
          return [
            card.title,
            String(processName),
            card.subtitle ?? '—',
            card.status ? card.status.toUpperCase() : '—',
            formatNumberValue(metadata.orderedQty ?? card.quantity ?? 0),
            `$${formatNumberValue(value, 2)}`,
            toDateLabel(metadata.expectedDate ?? card.neededDate ?? null),
          ]
        }),
        graph: buildFlowGraph(canvas, 'procurement'),
      }
    }
    case 'openPos': {
      const lane = canvas.procurement.find((entry) => entry.title.toLowerCase().includes('purchase'))
      if (!lane) return null
      const rows = lane.cards.filter((card) => {
        const status = (card.status ?? '').toLowerCase()
        return status && !['received', 'closed', 'completed'].includes(status)
      })
      if (!rows.length) return null
      return {
        title: 'Open purchase orders',
        columns: ['PO', 'Process', 'Status', 'Supplier', 'Value', 'Expected'],
        rows: rows.map((card) => {
          const metadata = ensureMetadata(card.metadata)
          const processName = metadata.processName ?? canvas.scope.name ?? canvas.scope.code ?? ''
          return [
            card.title,
            String(processName),
            card.status ? card.status.toUpperCase() : '—',
            card.subtitle ?? '—',
            `$${formatNumberValue(metadata.committedValue ?? card.quantity ?? 0, 2)}`,
            toDateLabel(metadata.expectedDate ?? card.neededDate ?? null),
          ]
        }),
        graph: buildFlowGraph(canvas, 'procurement'),
      }
    }
    case 'openShipments': {
      if (!canvas.logistics.length) return null
      return {
        title: 'Shipments in transit',
        columns: ['Shipment', 'Process', 'Status', 'Route', 'ETA', 'Carrier'],
        rows: canvas.logistics.map((card) => {
          const metadata = ensureMetadata(card.metadata)
          const processName = metadata.processName ?? canvas.scope.name ?? canvas.scope.code ?? ''
          return [
            card.title,
            String(processName),
            card.status ? card.status.toUpperCase() : '—',
            card.subtitle ?? '—',
            toDateLabel(card.neededDate ?? metadata.eta ?? null),
            String(metadata.mode ?? metadata.carrier ?? ''),
          ]
        }),
        graph: buildFlowGraph(canvas, 'logistics'),
      }
    }
    case 'overdueShipments': {
      const overdue = canvas.logistics.filter((card) => (card.risk ?? '').toLowerCase() === 'critical')
      if (!overdue.length) return null
      return {
        title: 'Overdue shipments',
        columns: ['Shipment', 'Process', 'Status', 'Route', 'ETA', 'Carrier'],
        rows: overdue.map((card) => {
          const metadata = ensureMetadata(card.metadata)
          const processName = metadata.processName ?? canvas.scope.name ?? canvas.scope.code ?? ''
          return [
            card.title,
            String(processName),
            card.status ? card.status.toUpperCase() : '—',
            card.subtitle ?? '—',
            toDateLabel(card.neededDate ?? metadata.eta ?? null),
            String(metadata.mode ?? metadata.carrier ?? ''),
          ]
        }),
        graph: buildFlowGraph(canvas, 'logistics'),
      }
    }
    case 'inventoryValue': {
      if (!canvas.inventory.length) return null
      return {
        title: 'Inventory snapshots',
        columns: ['Item', 'Process / Location', 'On hand', 'Reserved', 'Available', 'Unit cost', 'Snapshot'],
        rows: canvas.inventory.map((item) => [
          item.itemName,
          item.location ?? '—',
          formatNumberValue(item.onHand),
          formatNumberValue(item.reserved),
          formatNumberValue(item.available),
          `$${formatNumberValue(item.unitCost, 2)}`,
          toDateLabel(item.snapshotDate),
        ]),
        graph: buildFlowGraph(canvas, 'inventory'),
      }
    }
    default:
      return null
  }
}

export const buildReadinessInsights = (canvas: ScmProcessCanvasResponse | null) => {
  if (!canvas) {
    return {
      material: [] as string[],
      purchaseOrders: [] as string[],
      logistics: [] as string[],
    }
  }

  const materialGaps = [...canvas.requirements, ...canvas.inputs]
    .filter((card) => {
      const metadata = ensureMetadata(card.metadata)
      const required = Number(metadata.requiredQty ?? card.quantity ?? 0)
      const committed = Number(metadata.committedQty ?? (card.progress ? (required * Number(card.progress) * 0.01) : 0))
      return required > 0 && committed < required
    })
    .slice(0, 4)
    .map((card) => {
      const metadata = ensureMetadata(card.metadata)
      const gap = Math.max(0, Number(metadata.requiredQty ?? card.quantity ?? 0) - Number(metadata.committedQty ?? 0))
      const processName = metadata.processName ?? canvas.scope.name ?? canvas.scope.code ?? ''
      const processSuffix = processName ? ` · ${processName}` : ''
      return `${card.title}${processSuffix} → short by ${gap.toLocaleString()} ${card.unit ?? ''}`
    })

  const openPurchaseOrders =
    canvas.procurement
      .find((lane) => lane.title.toLowerCase().includes('purchase'))
      ?.cards.filter((card) => {
        const status = (card.status ?? '').toLowerCase()
        return status && !['received', 'closed', 'completed'].includes(status)
      })
      .slice(0, 4)
      .map((card) => {
        const metadata = ensureMetadata(card.metadata)
        const processName = metadata.processName ?? canvas.scope.name ?? canvas.scope.code ?? ''
        const processSuffix = processName ? ` · ${processName}` : ''
        return `${card.title}${processSuffix} → ${card.status?.toUpperCase() ?? 'OPEN'}`
      }) ?? []

  const logisticsRisks = canvas.logistics
    .filter((card) => (card.risk ?? '').toLowerCase() === 'critical' || (card.status ?? '').toLowerCase() === 'delayed')
    .slice(0, 4)
    .map((card) => {
      const metadata = ensureMetadata(card.metadata)
      const eta = toDateLabel(card.neededDate ?? metadata.eta ?? null)
      const route = card.subtitle ?? [metadata.origin, metadata.destination].filter(Boolean).join(' → ')
      return `${card.title} · ${route || 'Route pending'} · ETA ${eta}`
    })

  return {
    material: materialGaps,
    purchaseOrders: openPurchaseOrders,
    logistics: logisticsRisks,
  }
}

type ReadinessCardProps = {
  title: string
  value: number
  unit: string
  subtitle: string
  bullets?: string[]
  actions?: ScmInsightAction[]
  onOpen?: () => void
  onAction?: (action: ScmInsightAction) => void
  busy?: boolean
}

export function ReadinessCard({
  title,
  value,
  unit,
  subtitle,
  bullets = [],
  actions = [],
  onOpen,
  onAction,
  busy = false,
}: ReadinessCardProps) {
  const bounded = Math.max(0, Math.min(100, value))
  return (
    <article className="atom-scm-readiness-card">
      <header>
        <span>{title}</span>
        <strong>
          {bounded.toFixed(1)}
          {unit}
        </strong>
      </header>
      <div className="atom-scm-progress">
        <div className="atom-scm-progress__bar" aria-hidden>
          <span style={{ width: `${bounded}%` }} />
        </div>
        <small>{subtitle}</small>
      </div>
      {bullets.length ? (
        <ul className="atom-scm-readiness-list">
          {bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {actions.length ? (
        <div className="atom-scm-readiness-actions">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={busy}
              onClick={() => {
                if (onAction) {
                  onAction(action)
                  return
                }
                if (action.href) {
                  window.location.href = action.href
                } else if (action.description) {
                  window.alert(action.description)
                }
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
      {onOpen ? (
        <button type="button" className="atom-scm-readiness-view" onClick={onOpen}>
          View insight
        </button>
      ) : null}
    </article>
  )
}

type ScmInsightRailProps = {
  insights: ScmInsight[]
  onSelect: (metric: string) => void
}

export function ScmInsightRail({ insights, onSelect }: ScmInsightRailProps) {
  if (!insights.length) return null
  return (
    <section className="atom-scm-insight-rail" aria-label="SCM insight summary">
      {insights.map((insight) => (
        <button
          key={`${insight.metric}-${insight.headline}`}
          type="button"
          className={`atom-scm-insight-card severity-${insight.severity}`}
          onClick={() => onSelect(insight.metric)}
        >
          <header>
            <span>{insight.metric}</span>
            <strong>{insight.headline}</strong>
          </header>
          <p>{insight.summary}</p>
          {insight.details?.length ? <small>{insight.details[0]}</small> : null}
        </button>
      ))}
    </section>
  )
}

type ScmInsightModalProps = {
  data: InsightModalState
  onClose: () => void
  onAction?: (action: ScmInsightAction) => void
  pendingIntent?: string | null
}

export function ScmInsightModal({ data, onClose, onAction, pendingIntent }: ScmInsightModalProps) {
  const columns = data.columns ?? []
  const rows = data.rows ?? []
  const hasTable = columns.length > 0
  const hasDetails = Boolean(data.details && data.details.length)
  const hasActions = Boolean(data.actions && data.actions.length)
  const graphContent = useMemo(() => data.graph ?? null, [data.graph])
  const closeIntentRef = useRef(false)

  return (
    <div
      className="scm-insight-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={data.title}
      onMouseDown={(event) => {
        closeIntentRef.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (closeIntentRef.current && event.target === event.currentTarget) {
          onClose()
        }
        closeIntentRef.current = false
      }}
    >
      <div
        className="scm-insight-dialog"
        onClick={(event) => {
          event.stopPropagation()
        }}
      >
        <header>
          <div className="scm-insight-title">
            <h3>{data.title}</h3>
            {data.description ? <p>{data.description}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close insights">
            ×
          </button>
        </header>

        {graphContent ? (
          <div className="scm-insight-graph" role="presentation">
            <ReactFlow
              nodes={graphContent.nodes}
              edges={graphContent.edges}
              fitView
              panOnScroll
              zoomOnScroll={false}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
            >
              <MiniMap pannable zoomable nodeColor={() => '#1e293b'} nodeStrokeColor={() => '#94a3b8'} />
              <Controls showInteractive={false} position="bottom-left" />
              <Background gap={28} color="rgba(148,163,184,0.15)" />
            </ReactFlow>
          </div>
        ) : null}

        {hasDetails ? (
          <ul className="scm-insight-details">
            {(data.details ?? []).map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        ) : null}

        {hasTable ? (
          <div className="scm-insight-table-wrapper">
            <table>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row, index) => (
                    <tr key={`${data.title}-${index}`}>
                      {row.map((value, columnIndex) => (
                        <td key={columnIndex}>{typeof value === 'number' ? value.toLocaleString() : value}</td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={columns.length} style={{ textAlign: 'center', padding: '18px 0' }}>
                      No records available for this metric.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {hasActions ? (
          <footer className="scm-insight-actions">
            {(data.actions ?? []).map((action) => (
              <button
                key={action.label}
                type="button"
                disabled={Boolean(pendingIntent && action.intent === pendingIntent)}
                onClick={() => {
                  if (onAction) {
                    onAction(action)
                    return
                  }
                  if (action.href) {
                    window.location.href = action.href
                  } else if (action.description) {
                    window.alert(action.description)
                  }
                }}
              >
                {action.label}
              </button>
            ))}
          </footer>
        ) : null}
      </div>
    </div>
  )
}

export const annotateCard = (card: ScmCanvasCard, processName: string, processCode: string): ScmCanvasCard => {
  const metadata = { ...ensureMetadata(card.metadata), processName, processCode }
  if (metadata.requiredQty === undefined && typeof card.quantity === 'number') {
    metadata.requiredQty = card.quantity
  }
  if (
    metadata.committedQty === undefined &&
    typeof metadata.requiredQty === 'number' &&
    typeof card.progress === 'number'
  ) {
    metadata.committedQty = (Number(metadata.requiredQty) * Number(card.progress)) / 100
  }
  const tags = Array.isArray(card.tags) ? [...card.tags, processName] : [processName]
  return {
    ...card,
    metadata,
    tags,
  }
}

export const mergeProcessCanvases = (
  canvases: ScmProcessCanvasResponse[],
  contractInfo?: { id?: string | null; code?: string | null; name?: string | null },
): ScmProcessCanvasResponse | null => {
  if (!canvases.length) return null

  const aggregated = {
    generatedAt: new Date().toISOString(),
    scope: {
      level: 'contract',
      id: contractInfo?.id ?? canvases[0].scope.id,
      code: contractInfo?.code ?? canvases[0].scope.code,
      name: contractInfo?.name ?? canvases[0].scope.name,
    },
    requirements: [] as ScmCanvasCard[],
    inputs: [] as ScmCanvasCard[],
    outputs: [] as ScmCanvasCard[],
    timeline: [] as ScmCanvasLane[],
    procurement: [] as ScmCanvasLane[],
    logistics: [] as ScmCanvasCard[],
    inventory: [] as ScmInventoryCard[],
    metrics: {
      coveragePct: 0,
      requiredQty: 0,
      committedQty: 0,
      openRequisitions: 0,
      openPurchaseOrders: 0,
      openShipments: 0,
      inventoryValue: 0,
      riskLevel: 'normal',
      riskReasons: [] as string[],
    } satisfies ScmProcessMetrics,
  }

  const timelineMap = new Map<string, ScmCanvasLane>()
  const procurementMap = new Map<string, ScmCanvasLane>()
  let requiredTotal = 0
  let committedTotal = 0
  let inventoryTotal = 0
  let maxRisk: 'normal' | 'warning' | 'critical' = 'normal'

  canvases.forEach((canvas) => {
    const processName = canvas.scope.name ?? canvas.scope.code ?? 'Process'
    const processCode = canvas.scope.code ?? ''

    const pushCards = (source: ScmCanvasCard[], target: ScmCanvasCard[]) => {
      source.forEach((card) => target.push(annotateCard(card, processName, processCode)))
    }

    pushCards(canvas.requirements, aggregated.requirements)
    pushCards(canvas.inputs, aggregated.inputs)
    pushCards(canvas.outputs, aggregated.outputs)
    pushCards(canvas.logistics, aggregated.logistics)

    canvas.procurement.forEach((lane) => {
      const entry = procurementMap.get(lane.title) ?? { title: lane.title, cards: [] }
      lane.cards.forEach((card) => entry.cards.push(annotateCard(card, processName, processCode)))
      procurementMap.set(lane.title, entry)
    })

    canvas.timeline?.forEach((lane) => {
      const entry = timelineMap.get(lane.title) ?? { title: lane.title, cards: [] }
      lane.cards.forEach((card) => entry.cards.push(annotateCard(card, processName, processCode)))
      timelineMap.set(lane.title, entry)
    })

    canvas.inventory.forEach((item) => {
      aggregated.inventory.push({ ...item, location: item.location ?? processName })
      inventoryTotal += Number(item.available ?? 0) * Number(item.unitCost ?? 0)
    })

    requiredTotal += canvas.metrics.requiredQty
    committedTotal += canvas.metrics.committedQty
    aggregated.metrics.openRequisitions += canvas.metrics.openRequisitions
    aggregated.metrics.openPurchaseOrders += canvas.metrics.openPurchaseOrders
    aggregated.metrics.openShipments += canvas.metrics.openShipments
    aggregated.metrics.inventoryValue += canvas.metrics.inventoryValue
    aggregated.metrics.riskReasons.push(...canvas.metrics.riskReasons)

    if (canvas.metrics.riskLevel === 'critical') {
      maxRisk = 'critical'
    } else if (canvas.metrics.riskLevel === 'warning' && maxRisk !== 'critical') {
      maxRisk = 'warning'
    }
  })

  aggregated.timeline = Array.from(timelineMap.values())
  aggregated.procurement = Array.from(procurementMap.values())
  aggregated.metrics.requiredQty = requiredTotal
  aggregated.metrics.committedQty = committedTotal
  aggregated.metrics.coveragePct = requiredTotal ? (committedTotal / requiredTotal) * 100 : 0
  aggregated.metrics.inventoryValue = inventoryTotal || aggregated.metrics.inventoryValue
  aggregated.metrics.riskLevel = maxRisk
  aggregated.metrics.riskReasons = Array.from(new Set(aggregated.metrics.riskReasons))

  return aggregated
}
