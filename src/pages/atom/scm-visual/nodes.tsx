import React, { memo, useMemo } from 'react'
import { Handle, NodeProps, Position } from 'reactflow'

import {
  DemandMetrics,
  InventoryMetrics,
  LogisticsMetrics,
  ProcurementMetrics,
  ReadinessMetrics,
  Status,
} from './types'

type DemandNodeData = {
  metrics: DemandMetrics
  selected: boolean
  pulse: boolean
}

type ProcurementNodeData = {
  metrics: ProcurementMetrics
  selected: boolean
  pulse: boolean
}

type ReadinessNodeData = {
  metrics: ReadinessMetrics
  selected: boolean
  pulse: boolean
}

type LogisticsNodeData = {
  metrics: LogisticsMetrics
  selected: boolean
  pulse: boolean
}

type InventoryNodeData = {
  metrics: InventoryMetrics
  selected: boolean
  pulse: boolean
}

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })
const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

const formatNumber = (value: number) => numberFormatter.format(Math.round(value))
const formatCurrency = (value: number) => currencyFormatter.format(Math.round(value))
const formatPercent = (value: number, fractionDigits = 1) =>
  `${Number.isFinite(value) ? value.toFixed(fractionDigits) : '0.0'}%`

const statusClass = (status: Status) => `status-${status.toLowerCase()}`

const joinClass = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

const lastDelta = (values: number[]) => (values.length ? values[values.length - 1] : 0)

const Sparkline: React.FC<{ values: number[]; color?: string }> = memo(({ values, color = '#22d3ee' }) => {
  const viewBox = { width: 120, height: 44 }
  const points = useMemo(() => {
    if (!values.length) return []
    const sample = values.slice(-15)
    const max = Math.max(...sample)
    const min = Math.min(...sample)
    const range = max - min || 1
    return sample.map((value, index) => {
      const x = (index / Math.max(sample.length - 1, 1)) * viewBox.width
      const y = viewBox.height - ((value - min) / range) * (viewBox.height - 8) - 4
      return { x, y }
    })
  }, [values])

  const gradientId = useMemo(() => `scm-visual-spark-${Math.random().toString(36).slice(2)}`, [])

  if (!points.length) {
    return <div className="scm-visual-sparkline --empty" />
  }

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
  const area = `M 0 ${viewBox.height} ${points
    .map((point, index) => `${index === 0 ? 'L' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')} L ${viewBox.width} ${viewBox.height} Z`

  return (
    <svg className="scm-visual-sparkline" viewBox={`0 0 ${viewBox.width} ${viewBox.height}`} role="presentation">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.45} />
          <stop offset="100%" stopColor={color} stopOpacity={0.06} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} opacity={0.7} />
      <path d={path} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
})
Sparkline.displayName = 'Sparkline'

const Histogram: React.FC<{ values: number[]; color?: string }> = memo(({ values, color = '#f97316' }) => {
  if (!values.length) {
    return <div className="scm-visual-histogram --empty" />
  }
  const sample = values.slice(-16)
  const max = Math.max(...sample)

  return (
    <div className="scm-visual-histogram" role="presentation">
      {sample.map((value, index) => {
        const height = max === 0 ? 0 : (value / max) * 100
        return (
          <span
            key={index}
            style={{
              height: `${height.toFixed(1)}%`,
              background: `linear-gradient(180deg, ${color} 0%, rgba(15,23,42,0.2) 100%)`,
            }}
          />
        )
      })}
    </div>
  )
})
Histogram.displayName = 'Histogram'

const StatusChip: React.FC<{ status: Status }> = ({ status }) => (
  <span className={joinClass('scm-visual-status-chip', statusClass(status))}>{status}</span>
)

const DemandNodeComponent: React.FC<NodeProps<DemandNodeData>> = ({ data }) => {
  const { metrics, selected, pulse } = data
  const ratioPercent = Math.round(metrics.ratio * 100)
  const deltaValue = lastDelta(metrics.deltas)
  const recentDeltas = metrics.deltas.slice(-5)
  const tooltip = recentDeltas
    .map((delta, index) => {
      const sequenceNumber = metrics.deltas.length - recentDeltas.length + index + 1
      return `Δ${sequenceNumber}: ${delta >= 0 ? '+' : ''}${delta.toLocaleString()}`
    })
    .join('\n')

  return (
    <div
      className={joinClass('scm-visual-node scm-visual-node--demand', statusClass(metrics.status), selected && 'is-selected', pulse && 'is-hot')}
      tabIndex={0}
      role="button"
      aria-label={`Demand node. ${metrics.rationale}`}
      title={tooltip}
    >
      <Handle type="target" position={Position.Left} className="scm-visual-handle" />
      <Handle type="source" position={Position.Right} className="scm-visual-handle" />
      <header>
        <span>Demand</span>
        <StatusChip status={metrics.status} />
      </header>
      <strong className="scm-visual-node__primary">
        {formatNumber(metrics.committed)} <span>committed</span>
      </strong>
      <p className="scm-visual-node__secondary">of {formatNumber(metrics.total)} total</p>
      <div className="scm-visual-node__progress" aria-label={`Committed ${ratioPercent}%`}>
        <div className="fill" style={{ width: `${ratioPercent}%` }} />
      </div>
      <footer>
        <span>{ratioPercent}% coverage</span>
        <span className="delta">
          {deltaValue >= 0 ? '↑' : '↓'} {Math.abs(deltaValue)}
        </span>
      </footer>
    </div>
  )
}

const ProcurementNodeComponent: React.FC<NodeProps<ProcurementNodeData>> = ({ data }) => {
  const { metrics, selected, pulse } = data
  const handleButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
  }
  return (
    <div
      className={joinClass(
        'scm-visual-node scm-visual-node--procurement',
        statusClass(metrics.status),
        selected && 'is-selected',
        pulse && 'is-hot',
      )}
      tabIndex={0}
      role="button"
      aria-label={`Procurement node. ${metrics.rationale}`}
    >
      <Handle type="target" position={Position.Left} className="scm-visual-handle" />
      <Handle type="source" position={Position.Right} className="scm-visual-handle" />
      <header>
        <span>Procurement</span>
        <StatusChip status={metrics.status} />
      </header>
      <dl className="scm-visual-node__metrics">
        <div>
          <dt>Open POs</dt>
          <dd>{metrics.openPOs}</dd>
        </div>
        <div>
          <dt>Late</dt>
          <dd className={metrics.latePOs > 0 ? 'is-negative' : undefined}>{metrics.latePOs}</dd>
        </div>
        <div>
          <dt>ETA mean</dt>
          <dd>{metrics.etaDaysMean.toFixed(1)}d</dd>
        </div>
      </dl>
      <div className="scm-visual-node__actions">
        <button type="button" onClick={handleButtonClick}>
          View POs
        </button>
        <button type="button" onClick={handleButtonClick}>
          Raise CR
        </button>
      </div>
    </div>
  )
}

const ReadinessNodeComponent: React.FC<NodeProps<ReadinessNodeData>> = ({ data }) => {
  const { metrics, selected, pulse } = data
  const glowScale = Math.max(metrics.coveragePct / 100, 0.24)
  return (
    <div
      className={joinClass(
        'scm-visual-node scm-visual-node--readiness',
        statusClass(metrics.status),
        selected && 'is-selected',
        pulse && 'is-hot',
      )}
      tabIndex={0}
      role="button"
      aria-label={`Readiness node. ${metrics.rationale}`}
      style={{ '--readiness-glow': glowScale.toFixed(2) } as React.CSSProperties}
    >
      <Handle type="target" position={Position.Top} className="scm-visual-handle" />
      <Handle type="source" position={Position.Bottom} className="scm-visual-handle" />
      <header>
        <span>Readiness</span>
        <StatusChip status={metrics.status} />
      </header>
      <strong className="scm-visual-node__primary readiness">
        {metrics.coveragePct.toFixed(1)}
        <span>% coverage</span>
      </strong>
      <Sparkline values={metrics.trend} color="#22d3ee" />
      <footer>Trend last {metrics.trend.length} ticks</footer>
    </div>
  )
}

const LogisticsNodeComponent: React.FC<NodeProps<LogisticsNodeData>> = ({ data }) => {
  const { metrics, selected, pulse } = data
  return (
    <div
      className={joinClass(
        'scm-visual-node scm-visual-node--logistics',
        statusClass(metrics.status),
        selected && 'is-selected',
        pulse && 'is-hot',
      )}
      tabIndex={0}
      role="button"
      aria-label={`Logistics node. ${metrics.rationale}`}
    >
      <Handle type="target" position={Position.Left} className="scm-visual-handle" />
      <Handle type="source" position={Position.Right} className="scm-visual-handle" />
      <header>
        <span>Logistics</span>
        <StatusChip status={metrics.status} />
      </header>
      <dl className="scm-visual-node__metrics">
        <div>
          <dt>In flight</dt>
          <dd>{metrics.shipmentsInFlight}</dd>
        </div>
        <div>
          <dt>On-time</dt>
          <dd>{formatPercent(metrics.onTimePct * 100, 1)}</dd>
        </div>
        <div>
          <dt>Avg ETA</dt>
          <dd>{metrics.avgETA_Days.toFixed(1)}d</dd>
        </div>
      </dl>
      <p className="scm-visual-node__hint">Double-click to open live map</p>
    </div>
  )
}

const InventoryNodeComponent: React.FC<NodeProps<InventoryNodeData>> = ({ data }) => {
  const { metrics, selected, pulse } = data
  const handleLinkClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
  }
  return (
    <div
      className={joinClass(
        'scm-visual-node scm-visual-node--inventory',
        statusClass(metrics.status),
        selected && 'is-selected',
        pulse && 'is-hot',
      )}
      tabIndex={0}
      role="button"
      aria-label={`Inventory node. ${metrics.rationale}`}
    >
      <Handle type="target" position={Position.Left} className="scm-visual-handle" />
      <Handle type="source" position={Position.Right} className="scm-visual-handle" />
      <header>
        <span>Inventory</span>
        <StatusChip status={metrics.status} />
      </header>
      <strong className="scm-visual-node__primary">{formatCurrency(metrics.valueUSD)}</strong>
      <p className="scm-visual-node__secondary">{metrics.turns.toFixed(1)} turns</p>
      <Histogram values={metrics.spark} color="#f97316" />
      <div className="scm-visual-node__actions">
        <button type="button" className="link" onClick={handleLinkClick}>
          View aging
        </button>
      </div>
    </div>
  )
}

export const DemandNode = memo(DemandNodeComponent)
export const ProcurementNode = memo(ProcurementNodeComponent)
export const ReadinessNode = memo(ReadinessNodeComponent)
export const LogisticsNode = memo(LogisticsNodeComponent)
export const InventoryNode = memo(InventoryNodeComponent)

export const scmVisualNodeTypes = {
  demand: DemandNode,
  procurement: ProcurementNode,
  readiness: ReadinessNode,
  logistics: LogisticsNode,
  inventory: InventoryNode,
} as const

export type ScmVisualNodeType = keyof typeof scmVisualNodeTypes
