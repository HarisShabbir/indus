import React, { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, type ThreeEvent } from '@react-three/fiber'
import { Edges, Html, OrbitControls, Text } from '@react-three/drei'
import { Mesh, Vector3, type Camera } from 'three'

import { syncRccDamMetrics, type SyncRccDamMetricsResponse } from '../../api'
import { useRccConfig } from '../../hooks/useRccConfig'
import { useRccProgress } from '../../hooks/useRccProgress'
import { useRccMetrics } from '../../hooks/useRccMetrics'
import type { RccBlockProgress, RccEnvironmentMetric } from '../../types/rcc'
import { useRccProgressStore } from '../../store/rccProgressStore'

type CellStatus = 'complete' | 'in-progress' | 'at-risk' | 'not-started' | 'rule-violated'

type BlockLiftStatus = {
  id: string
  blockId: string
  bank: 'Left' | 'Right'
  lift: number
  elevationTop: number
  elevationBottom: number
  status: CellStatus
  concreteVolume: number
  percentComplete: number
  xIndex: number
  yIndex: number
  metadata?: Record<string, unknown>
}

type DamStats = {
  blockCount: number
  liftCount: number
  totalVolume: number
  overallPercent: number
  statusCounts: Record<CellStatus, number>
  bankCompletion: Record<'Left' | 'Right', number>
}

type SyncSummary = SyncRccDamMetricsResponse & { timestamp: number }
type RiskHighlight = {
  blockId: string
  lift: number
  status: string
  riskReason?: string | null
}

type HoverMetrics = {
  riskReason: string | null
  lagMinutes: number | null
  actualRate: number | null
  progressDate: string | null
  totalVolume: number
  volumeToday: number
  volumeComplete: number
  volumeRemaining: number
  percentComplete: number
  remainingPercent: number
  pourAlarm: boolean
  volumeBefore: number
}

const statusColorMap: Record<CellStatus, string> = {
  complete: '#2ECC71',
  'in-progress': '#F1C40F',
  'at-risk': '#E67E22',
  'not-started': '#C0392B',
  'rule-violated': '#3498DB',
}
const STATUS_FALLBACK_COLOR = '#4B4F5C'
const STATUS_ORDER: CellStatus[] = ['complete', 'in-progress', 'at-risk', 'not-started', 'rule-violated']
const DAILY_POUR_LIMIT = 3
const MIN_CANVAS_HEIGHT = 320
const MAX_CANVAS_HEIGHT = 960
const clampCanvasHeight = (value: number) => Math.max(MIN_CANVAS_HEIGHT, Math.min(MAX_CANVAS_HEIGHT, value))

const DEFAULT_BLOCK_AXIS = Array.from({ length: 32 }, (_, i) => String(i + 5).padStart(2, '0'))
const ELEVATION_LAYERS = [
  { bottom: 898, top: 977, label: 'Foundation' },
  { bottom: 977, top: 1004.5, label: 'Flushing Tunnel' },
  { bottom: 1004.5, top: 1044.5, label: 'DG1004.50' },
  { bottom: 1044.5, top: 1097.5, label: 'DG1097.50' },
  { bottom: 1097.5, top: 1137.5, label: 'DG1137.50' },
  { bottom: 1137.5, top: 1175, label: 'Crest' },
]

const NUMBER_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const PERCENT_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

const formatVolume = (value: number) => `${NUMBER_FORMAT.format(Math.round(value))} m³`

const resolveBlockAxis = (labels?: string[] | null) => (labels?.length ? labels.filter((label) => /^\d+$/.test(label)) : DEFAULT_BLOCK_AXIS)

const backendStatusToCellStatus = (status?: string | null): CellStatus => {
  switch ((status ?? '').toLowerCase()) {
    case 'complete':
      return 'complete'
    case 'in-progress':
    case 'progress':
      return 'in-progress'
    case 'at-risk':
    case 'risk':
      return 'at-risk'
    case 'rule-violated':
    case 'rule violated':
      return 'rule-violated'
    default:
      return 'not-started'
  }
}

const mergeLiveData = (fallback: BlockLiftStatus[], progress: RccBlockProgress[], blockLabels?: string[]): BlockLiftStatus[] => {
  if (!progress.length) return fallback
  const numericLabelMap = new Map<number, string>()
  ;(blockLabels || []).forEach((label) => {
    const parsed = Number.parseInt(label, 10)
    if (!Number.isNaN(parsed)) {
      numericLabelMap.set(parsed, label)
    }
  })
  const records = new Map<string, Map<number, RccBlockProgress>>()
  progress.forEach((entry) => {
    const blockId = numericLabelMap.get(entry.block_no) ?? String(entry.block_no).padStart(2, '0')
    const recordMap = records.get(blockId) ?? new Map()
    recordMap.set(entry.lift_no ?? 1, entry)
    records.set(blockId, recordMap)
  })
  return fallback.map((cell) => {
    const blockData = records.get(cell.blockId)
    if (!blockData?.size) return cell
    const record = blockData.get(cell.lift)
    if (!record) {
      const highest = Math.max(...Array.from(blockData.keys()))
      if (cell.lift <= highest) return { ...cell, status: 'complete', percentComplete: 100 }
      return cell
    }
    return {
      ...cell,
      status: backendStatusToCellStatus(record.status),
      percentComplete: record.percent_complete ?? cell.percentComplete,
      metadata: record.metadata ?? cell.metadata,
    }
  })
}

const computeStats = (cells: BlockLiftStatus[]): DamStats => {
  const statusCounts: DamStats['statusCounts'] = {
    complete: 0,
    'in-progress': 0,
    'at-risk': 0,
    'not-started': 0,
    'rule-violated': 0,
  }
  const bankTotals: Record<'Left' | 'Right', { vol: number; done: number }> = {
    Left: { vol: 0, done: 0 },
    Right: { vol: 0, done: 0 },
  }
  let totalVolume = 0
  let achievedVolume = 0
  cells.forEach((cell) => {
    statusCounts[cell.status] += 1
    const volume = cell.concreteVolume
    const doneFactor = cell.status === 'complete' ? 1 : cell.status === 'in-progress' ? cell.percentComplete / 100 : 0
    totalVolume += volume
    achievedVolume += volume * doneFactor
    bankTotals[cell.bank].vol += volume
    bankTotals[cell.bank].done += volume * doneFactor
  })
  return {
    blockCount: new Set(cells.map((cell) => cell.blockId)).size,
    liftCount: cells.length,
    totalVolume,
    overallPercent: totalVolume ? (achievedVolume / totalVolume) * 100 : 0,
    statusCounts,
    bankCompletion: {
      Left: bankTotals.Left.vol ? (bankTotals.Left.done / bankTotals.Left.vol) * 100 : 0,
      Right: bankTotals.Right.vol ? (bankTotals.Right.done / bankTotals.Right.vol) * 100 : 0,
    },
  }
}

const buildSyntheticCells = (blockAxis: string[]): BlockLiftStatus[] => {
  const pseudoRandom = (x: number, y: number) => {
    const value = Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233) * 43758.5453
    return value - Math.floor(value)
  }
  return blockAxis.flatMap((blockId, xIndex) => {
    const bank: 'Left' | 'Right' = xIndex < blockAxis.length / 2 ? 'Left' : 'Right'
    const yIndex = bank === 'Left' ? 0 : 2
    return ELEVATION_LAYERS.map((layer, liftIdx) => {
      const noise = pseudoRandom(xIndex, liftIdx)
      const status: CellStatus =
        noise > 0.9 ? 'rule-violated' : noise > 0.65 ? 'at-risk' : noise > 0.35 ? 'in-progress' : noise > 0.2 ? 'complete' : 'not-started'
      const percent =
        status === 'complete'
          ? 100
          : status === 'in-progress'
            ? 40 + noise * 55
            : status === 'at-risk'
              ? 10 + noise * 45
              : status === 'rule-violated'
                ? 55 + noise * 25
                : 0
      return {
        id: `${blockId}-${liftIdx + 1}`,
        blockId,
        bank,
        lift: liftIdx + 1,
        elevationBottom: layer.bottom,
        elevationTop: layer.top,
        status,
        concreteVolume: 380 + liftIdx * 42 + (bank === 'Left' ? 40 : 20),
        percentComplete: Math.min(100, Math.max(0, percent)),
        xIndex,
        yIndex,
        metadata: {},
      }
    })
  })
}

const buildHoverDetails = (cell: BlockLiftStatus | null): HoverMetrics | null => {
  if (!cell) return null
  const riskReason = typeof cell.metadata?.risk_reason === 'string' ? cell.metadata.risk_reason : null
  const lagMinutes =
    typeof cell.metadata?.lag_minutes === 'number'
      ? Math.round(Number(cell.metadata.lag_minutes))
      : typeof cell.metadata?.lag_minutes === 'string'
        ? Number(cell.metadata.lag_minutes)
        : null
  const actualRate =
    typeof cell.metadata?.actual_rate === 'number'
      ? Math.round(Number(cell.metadata.actual_rate))
      : typeof cell.metadata?.actual_rate === 'string'
        ? Number(cell.metadata.actual_rate)
        : null
  const progressDateRaw = typeof cell.metadata?.progress_date === 'string' ? cell.metadata.progress_date : null
  const progressDate = progressDateRaw ? new Date(progressDateRaw).toLocaleDateString() : null
  const totalVolumeMeta =
    typeof cell.metadata?.volume_total === 'number'
      ? cell.metadata.volume_total
      : typeof cell.metadata?.volume_total === 'string'
        ? Number(cell.metadata.volume_total)
        : cell.concreteVolume
  const volumeToday =
    typeof cell.metadata?.volume_poured_today === 'number'
      ? cell.metadata.volume_poured_today
      : typeof cell.metadata?.volume_poured_today === 'string'
        ? Number(cell.metadata.volume_poured_today)
        : Math.round((cell.percentComplete / 100) * cell.concreteVolume)
  const volumeComplete =
    typeof cell.metadata?.volume_cumulative === 'number'
      ? cell.metadata.volume_cumulative
      : Math.round((cell.percentComplete / 100) * cell.concreteVolume)
  const rawVolumeRemaining =
    typeof cell.metadata?.volume_remaining === 'number'
      ? cell.metadata.volume_remaining
      : Math.max(0, totalVolumeMeta - volumeComplete)
  const percentComplete = totalVolumeMeta ? (volumeComplete / totalVolumeMeta) * 100 : cell.percentComplete
  const remainingPercent = Math.max(0, 100 - percentComplete)
  return {
    riskReason,
    lagMinutes,
    actualRate,
    progressDate,
    totalVolume: totalVolumeMeta,
    volumeToday,
    volumeComplete,
    volumeRemaining: Math.max(0, rawVolumeRemaining),
    percentComplete,
    remainingPercent,
    pourAlarm: volumeToday > DAILY_POUR_LIMIT,
    volumeBefore: Math.max(0, volumeComplete - volumeToday),
  }
}

type DamCellProps = {
  cell: BlockLiftStatus
  dims: {
    blockSpacing: number
    depth: number
    heightScale: number
    baseY: number
    centerX: number
    centerZ: number
  }
  dimmed: boolean
}

const DamCell = ({ cell, dims, dimmed }: DamCellProps) => {
  const { blockSpacing, depth, heightScale, baseY, centerX, centerZ } = dims
  const height = (cell.elevationTop - cell.elevationBottom) * heightScale
  const y = (cell.elevationBottom - baseY) * heightScale + height / 2
  const x = (cell.xIndex - centerX) * blockSpacing
  const z = (cell.yIndex - centerZ) * depth
  const color = statusColorMap[cell.status] || STATUS_FALLBACK_COLOR
  const isDimmed = dimmed
  const displayColor = isDimmed ? '#1f2937' : color
  return (
    <group position={[x, y, z]}>
      <mesh castShadow receiveShadow userData={{ cell }}>
        <boxGeometry args={[blockSpacing * 0.96, height, depth * 0.96]} />
        <meshStandardMaterial color={displayColor} roughness={0.55} metalness={0.05} transparent={isDimmed} opacity={isDimmed ? 0.22 : 1} />
        <Edges color={isDimmed ? '#1f2533' : '#334155'} threshold={20} />
      </mesh>
    </group>
  )
}

export default function RccVisualization({ sowId }: { sowId: string }): JSX.Element {
  const { data: config, isLoading: configLoading, error: configError } = useRccConfig()
  const { blocks, error: progressError, isLoading: progressLoading, refresh } = useRccProgress(sowId)
  const { metrics, metricsError, metricsLoading, refreshMetrics } = useRccMetrics(sowId)
  const applyProgressUpdates = useRccProgressStore((state) => state.applyUpdates)
  const metricsPanelRef = useRef<HTMLDivElement | null>(null)
  const canvasScrollRef = useRef<HTMLDivElement | null>(null)
  const percentCacheRef = useRef<Map<string, number>>(new Map())
  const [canvasHeight, setCanvasHeight] = useState(() => clampCanvasHeight(640))
  const resizeDragRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const [tooltipCell, setTooltipCell] = useState<BlockLiftStatus | null>(null)
  const [pointerInfo, setPointerInfo] = useState<{ x: number; y: number } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncNotice, setSyncNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [lastSyncSummary, setLastSyncSummary] = useState<SyncSummary | null>(null)
  const [lastRiskHighlights, setLastRiskHighlights] = useState<RiskHighlight[]>([])
  const [syncPulse, setSyncPulse] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [activeStatuses, setActiveStatuses] = useState<CellStatus[]>(STATUS_ORDER)
  const [metricOverrides, setMetricOverrides] = useState<SyncRccDamMetricsResponse['environmentMetricStatus'] | null>(null)
  const tooltipDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipSizeRef = useRef<{ width: number; height: number }>({ width: 280, height: 220 })
  const tooltipCardRef = useRef<HTMLDivElement | null>(null)
  const projectionVec = useMemo(() => new Vector3(), [])
  const scrollMetricsIntoView = () => {
    if (metricsPanelRef.current) {
      metricsPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
  const handleResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    resizeDragRef.current = { startY: event.clientY, startHeight: canvasHeight }
    setResizing(true)
  }

  const applyResizeDrag = (clientY: number) => {
    if (!resizeDragRef.current) return
    const delta = clientY - resizeDragRef.current.startY
    const next = clampCanvasHeight(resizeDragRef.current.startHeight + delta)
    setCanvasHeight(next)
  }

  const handleResizeOverlayMove = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    applyResizeDrag(event.clientY)
  }

  const handleResizeOverlayUp = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    applyResizeDrag(event.clientY)
    resizeDragRef.current = null
    setResizing(false)
  }

  const handleResizeOverlayLeave = () => {
    resizeDragRef.current = null
    setResizing(false)
  }

  const handleResizeReset = () => {
    setCanvasHeight(clampCanvasHeight(640))
    resizeDragRef.current = null
    setResizing(false)
  }

  const handleStatusFilterToggle = (status: CellStatus) => {
    setActiveStatuses((prev) => {
      const hasAll = prev.length === STATUS_ORDER.length
      if (hasAll) return [status]
      if (prev.length === 1 && prev[0] === status) return STATUS_ORDER
      if (prev.includes(status)) {
        const next = prev.filter((entry) => entry !== status)
        return next.length ? next : STATUS_ORDER
      }
      return [...prev, status]
    })
  }

  const resetStatusFilters = () => setActiveStatuses(STATUS_ORDER)

  const toScreenPosition = useCallback(
    (point: Vector3, camera: Camera) => {
      const projected = projectionVec.copy(point).project(camera)
      return {
        x: ((projected.x + 1) / 2) * window.innerWidth,
        y: ((-projected.y + 1) / 2) * window.innerHeight,
      }
    },
    [projectionVec],
  )

  const clearTooltip = useCallback(() => {
    if (tooltipDelayRef.current) {
      clearTimeout(tooltipDelayRef.current)
      tooltipDelayRef.current = null
    }
    setTooltipCell(null)
    setPointerInfo(null)
  }, [])

  const handleBlocksPointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation()
      const cell = (event.object as Mesh).userData?.cell as BlockLiftStatus | undefined
      if (!cell) {
        clearTooltip()
        return
      }
      if (tooltipDelayRef.current) {
        clearTimeout(tooltipDelayRef.current)
        tooltipDelayRef.current = null
      }
      tooltipDelayRef.current = window.setTimeout(() => {
        setTooltipCell(cell)
        tooltipDelayRef.current = null
      }, 60)
      setPointerInfo(toScreenPosition(event.point.clone(), event.camera as Camera))
    },
    [clearTooltip, toScreenPosition],
  )

  const handleBlocksPointerLeave = useCallback(() => {
    clearTooltip()
  }, [clearTooltip])

  const tooltipDetails = useMemo(() => buildHoverDetails(tooltipCell), [tooltipCell])
  const tooltipPosition = useMemo(() => {
    if (!pointerInfo || !tooltipCell) return null
    const { x, y } = pointerInfo
    const tooltipWidth = tooltipSizeRef.current.width || 260
    const tooltipHeight = tooltipSizeRef.current.height || 220
    const offset = 20
    let left = x + offset
    if (left + tooltipWidth > window.innerWidth - 20) {
      left = x - tooltipWidth - offset
    }
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16))
    let top = y + offset
    let placement: 'above' | 'below' = 'below'
    if (top + tooltipHeight > window.innerHeight - 16) {
      top = y - tooltipHeight - offset
      placement = 'above'
    }
    if (top < 16) {
      top = 16
      placement = 'below'
    }
    return { left, top, placement }
  }, [pointerInfo, tooltipCell])

  useLayoutEffect(() => {
    if (tooltipCardRef.current) {
      const rect = tooltipCardRef.current.getBoundingClientRect()
      tooltipSizeRef.current = { width: rect.width, height: rect.height }
    }
  }, [tooltipCell, tooltipDetails])

  useEffect(() => {
    return () => {
      if (noticeTimer.current) {
        clearTimeout(noticeTimer.current)
      }
      if (pulseTimer.current) {
        clearTimeout(pulseTimer.current)
      }
      if (tooltipDelayRef.current) {
        clearTimeout(tooltipDelayRef.current)
      }
    }
  }, [])

  const showSyncNotice = (type: 'success' | 'error', message: string) => {
    if (noticeTimer.current) {
      clearTimeout(noticeTimer.current)
    }
    setSyncNotice({ type, message })
    noticeTimer.current = setTimeout(() => setSyncNotice(null), 5000)
  }

  const handleSyncMetrics = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      const summary = await syncRccDamMetrics(sowId)
      if (summary.environmentMetricStatus && Object.keys(summary.environmentMetricStatus).length) {
        setMetricOverrides(summary.environmentMetricStatus)
      } else {
        setMetricOverrides(null)
      }
      if (summary.updates?.length) {
        const progressTimestamp = new Date().toISOString()
        applyProgressUpdates(
          summary.updates.map((update) => {
            const cellKey = `${update.blockId}-${update.lift}`
            const template = cellTemplateLookup.get(cellKey)
            const totalVolume = template?.concreteVolume ?? 0
            const previousPercent = percentCacheRef.current.get(cellKey) ?? template?.percentComplete ?? 0
            const newPercent = Math.max(0, Math.min(100, update.percentComplete ?? previousPercent))
            const deltaPercent = Math.max(0, newPercent - previousPercent)
            const cumulativeVolume = Math.round((newPercent / 100) * totalVolume)
            const pouredToday = Math.round((deltaPercent / 100) * totalVolume)
            const volumeRemaining = Math.max(0, Math.round(totalVolume - cumulativeVolume))
            percentCacheRef.current.set(cellKey, newPercent)
            const metadata = {
              ...(update.riskReason ? { risk_reason: update.riskReason } : {}),
              ...(update.lagMinutes !== undefined ? { lag_minutes: update.lagMinutes } : {}),
              ...(update.actualRate !== undefined ? { actual_rate: update.actualRate } : {}),
              ...(update.ruleViolated !== undefined ? { rule_violated: update.ruleViolated } : {}),
              volume_total: totalVolume,
              volume_cumulative: cumulativeVolume,
              volume_poured_today: pouredToday,
              volume_remaining: volumeRemaining,
              progress_date: progressTimestamp,
              elevation_bottom: template?.elevationBottom,
              elevation_top: template?.elevationTop,
              bank: template?.bank,
            }
            return {
              sow_id: sowId,
              block_no: update.blockNo,
              lift_no: update.lift,
              status: update.status,
              percent_complete: update.percentComplete,
              temperature: update.temperature ?? null,
              observed_at: progressTimestamp,
              metadata,
            }
          }),
        )
      }
      await Promise.all([refresh(), refreshMetrics()])
      setLastSyncSummary({ ...summary, timestamp: Date.now() })
      const highlights =
        summary.updates?.filter((update) => ['at-risk', 'rule-violated'].includes(update.status) && (update.riskReason || update.ruleViolated)).map((update) => ({
          blockId: update.blockId,
          lift: update.lift,
          status: update.status,
          riskReason: update.riskReason,
        })) ?? []
      setLastRiskHighlights(highlights.slice(0, 6))
      requestAnimationFrame(scrollMetricsIntoView)
      setSyncPulse(true)
      if (pulseTimer.current) {
        clearTimeout(pulseTimer.current)
      }
      pulseTimer.current = setTimeout(() => setSyncPulse(false), 1400)
      showSyncNotice('success', 'Metrics synced – visualization updated.')
    } catch (error) {
      console.error('Unable to sync RCC metrics', error)
      showSyncNotice('error', 'Unable to sync metrics. Please try again.')
    } finally {
      setSyncing(false)
    }
  }

  const blockAxis = useMemo(() => resolveBlockAxis(config?.visualization?.block_labels), [config])
  const blockLabels = config?.visualization?.block_labels ?? blockAxis
  const syntheticCells = useMemo(() => buildSyntheticCells(blockAxis), [blockAxis])
  const cellTemplateLookup = useMemo(() => {
    const map = new Map<string, BlockLiftStatus>()
    syntheticCells.forEach((cell) => map.set(`${cell.blockId}-${cell.lift}`, cell))
    return map
  }, [syntheticCells])
  const cells = useMemo(() => mergeLiveData(syntheticCells, blocks, config?.visualization?.block_labels), [syntheticCells, blocks, config])
  useEffect(() => {
    cells.forEach((cell) => {
      const key = `${cell.blockId}-${cell.lift}`
      if (!percentCacheRef.current.has(key)) {
        percentCacheRef.current.set(key, cell.percentComplete)
      }
    })
  }, [cells])
  useEffect(() => {
    cells.forEach((cell) => {
      const key = `${cell.blockId}-${cell.lift}`
      if (!percentCacheRef.current.has(key)) {
        percentCacheRef.current.set(key, cell.percentComplete)
      }
    })
  }, [cells])
  const stats = useMemo(() => computeStats(cells), [cells])
  const activeStatusSet = useMemo(() => new Set(activeStatuses), [activeStatuses])
  const statusFilterActive = activeStatuses.length !== STATUS_ORDER.length

  const baseY = Math.min(...cells.map((cell) => cell.elevationBottom))
  const crestY = Math.max(...cells.map((cell) => cell.elevationTop))
  const maxX = Math.max(...cells.map((cell) => cell.xIndex))
  const centerX = maxX / 2
  const centerZ = 1
  const blockSpacing = 1.6
  const depth = 2
  const heightScale = 0.038
  const labelRails = useMemo(() => {
    const base = blockSpacing * (maxX / 2 + 0.6)
    const laneGap = blockSpacing * 1.4
    return {
      bankX: -base,
      liftX: -(base + laneGap),
      elevationX: -(base + laneGap * 2),
    }
  }, [blockSpacing, maxX])

  const elevationMarks = config?.visualization?.elevation_marks ?? ELEVATION_LAYERS.map((layer) => ({
    label: `${layer.label} · ${layer.top.toFixed(2)}`,
    value: layer.top,
  }))
  const yFromElevation = (value: number) => (value - baseY) * heightScale
  const columnLabelPositions = useMemo(
    () =>
      blockLabels.map((label, xIndex) => ({
        label,
        x: (xIndex - centerX) * blockSpacing,
      })),
    [blockLabels, centerX, blockSpacing],
  )

  if (configLoading || progressLoading) {
    return (
      <div className="rcc-visualization-panel">
        <div className="rcc-visualization-header">
          <div>
            <strong>Isometric RCC Dam</strong>
            <span>Loading live data…</span>
          </div>
        </div>
        <div className="rcc-process-placeholder">Preparing 3D view…</div>
      </div>
    )
  }

  if (configError || progressError || !config) {
    return (
      <div className="rcc-visualization-panel">
        <div className="rcc-visualization-header">
          <strong>Isometric RCC Dam</strong>
          <button type="button" className="rcc-link-button" onClick={() => refresh()}>
            Retry
          </button>
        </div>
        <div className="rcc-process-placeholder error">{configError?.message ?? progressError?.message ?? 'Dam data unavailable.'}</div>
      </div>
    )
  }

  return (
    <div className="rcc-visualization-panel">
      <div className="rcc-visualization-header">
        <div>
          <strong>Isometric RCC Dam</strong>
          <span>
            {config.project.name} · Blocks 05–36 · Updated {blocks.length ? new Date(blocks[0].observed_at ?? Date.now()).toLocaleString() : '—'}
          </span>
        </div>
        <div className="rcc-process-actions">
          <button type="button" className="rcc-link-button" onClick={() => refresh()}>
            Refresh
          </button>
          <button type="button" className="rcc-link-button" onClick={handleSyncMetrics} disabled={syncing}>
            {syncing ? 'Syncing metrics…' : 'Sync metrics'}
          </button>
        </div>
        <div className="rcc-tooltip-spacer" aria-hidden="true" />
      </div>
      {syncNotice ? <div className={`rcc-sync-toast is-${syncNotice.type}`}>{syncNotice.message}</div> : null}
      {lastSyncSummary ? (
        <div className="rcc-sync-summary">
          <div>
            <span>Last sync · {new Date(lastSyncSummary.timestamp).toLocaleTimeString()}</span>
            <strong>{lastSyncSummary.liftsUpdated} lifts updated</strong>
          </div>
          <div className="rcc-sync-counts">
            {STATUS_ORDER.map((status) => (
              <span key={status}>
                <i style={{ background: statusColorMap[status] }} />
                <em>{status.replace('-', ' ')}</em>
                <strong>{lastSyncSummary.statusCounts[status] ?? 0}</strong>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {/* Risk callouts intentionally hidden to keep focus on metrics after sync */}
      <div className={`rcc-visualization-canvas ${syncPulse ? 'is-syncing' : ''}`} style={{ height: canvasHeight }} ref={canvasScrollRef}>
        <Canvas shadows dpr={[1, 2]} camera={{ position: [26, 32, 30], fov: 42 }}>
          <color attach="background" args={['#0f172a']} />
          <fog attach="fog" args={['#0f172a', 50, 150]} />
          <ambientLight intensity={0.18} />
          <directionalLight castShadow position={[15, 30, 20]} intensity={1.1} color="#ffd4a3" shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
          <hemisphereLight args={['#1e3a8a', '#0f172a', 0.4]} />
          <Suspense fallback={null}>
            <group onPointerMove={handleBlocksPointerMove} onPointerLeave={handleBlocksPointerLeave}>
              {cells.map((cell) => (
                <DamCell key={cell.id} cell={cell} dims={{ blockSpacing, depth, heightScale, baseY, centerX, centerZ }} dimmed={statusFilterActive && !activeStatusSet.has(cell.status)} />
              ))}
            </group>
            <Text position={[labelRails.bankX, (crestY - baseY) * heightScale + 2.2, 0]} fontSize={1.2} color="#bae6fd">
              Left bank
            </Text>
            <Text position={[maxX * 0.6, (crestY - baseY) * heightScale + 3, 0]} fontSize={1.2} color="#bae6fd">
              Right bank
            </Text>
            {columnLabelPositions.map((column) => (
              <Html key={column.label} position={[column.x, (crestY - baseY) * heightScale + 1.2, 0]}>
                <div className="rcc-column-label">{column.label}</div>
              </Html>
            ))}
            {ELEVATION_LAYERS.map((layer, idx) => {
              const mid = (layer.bottom + layer.top) / 2
              return (
                <Html key={layer.label} position={[labelRails.liftX, yFromElevation(mid) + idx * 0.25, 0]}>
                  <div className="rcc-lift-label">
                    <span>Lift {idx + 1}</span>
                    <strong>{layer.label}</strong>
                  </div>
                </Html>
              )
            })}
            {elevationMarks.map((mark, idx) => (
              <Html key={mark.label} position={[labelRails.elevationX, yFromElevation(mark.value) + idx * 0.2, 0]}>
                <div className="rcc-elevation-label">{mark.label}</div>
              </Html>
            ))}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]} receiveShadow>
              <planeGeometry args={[maxX * 3.6, 26]} />
              <meshStandardMaterial color="#e5e7eb" />
            </mesh>
          </Suspense>
          <OrbitControls enablePan enableZoom minPolarAngle={Math.PI / 6} maxPolarAngle={Math.PI / 2.05} target={[0, (crestY - baseY) * heightScale * 0.5 + 1.5, 0]} />
          <gridHelper args={[maxX * 3.6, blockAxis.length * 2, '#94a3b8', '#cbd5f5']} position={[0, -0.1, 0]} />
        </Canvas>
        {tooltipCell && tooltipDetails && tooltipPosition ? (
          <div
            className={`dam-tooltip${tooltipPosition.placement === 'above' ? ' dam-tooltip--above' : ''}`}
            ref={tooltipCardRef}
            style={{ left: tooltipPosition.left, top: tooltipPosition.top }}
          >
            <header>
              <strong>Block {tooltipCell.blockId}</strong>
              <span>
                Lift {tooltipCell.lift} · {tooltipCell.bank} bank
              </span>
            </header>
            <dl>
              <div>
                <dt>Status</dt>
                <dd>{tooltipCell.status.replace('-', ' ')}</dd>
              </div>
              <div>
                <dt>Elevation</dt>
                <dd>
                  {tooltipCell.elevationBottom.toFixed(1)}–{tooltipCell.elevationTop.toFixed(1)} m
                </dd>
              </div>
              <div>
                <dt>Total volume</dt>
                <dd>{formatVolume(tooltipDetails.totalVolume)}</dd>
              </div>
              <div>
                <dt>Volume today</dt>
                <dd className={tooltipDetails.pourAlarm ? 'is-alarm' : undefined}>
                  {formatVolume(tooltipDetails.volumeToday)}
                  <small>Limit {DAILY_POUR_LIMIT} m³</small>
                </dd>
              </div>
              <div>
                <dt>Cumulative</dt>
                <dd>
                  {formatVolume(tooltipDetails.volumeComplete)}
                  <small>{Math.round(tooltipDetails.percentComplete)}% done</small>
                </dd>
              </div>
              <div>
                <dt>Remaining</dt>
                <dd>
                  {formatVolume(tooltipDetails.volumeRemaining)}
                  <small>{Math.round(tooltipDetails.remainingPercent)}% to green</small>
                </dd>
              </div>
              {tooltipDetails.riskReason ? (
                <div>
                  <dt>{tooltipCell.status === 'rule-violated' ? 'Rule violation' : 'Risk reason'}</dt>
                  <dd>{tooltipDetails.riskReason}</dd>
                </div>
              ) : null}
            </dl>
            <footer className={tooltipDetails.pourAlarm ? 'is-alarm' : undefined}>
              {tooltipDetails.pourAlarm ? 'Exceeds daily threshold' : 'Within daily threshold'}
            </footer>
          </div>
        ) : null}
        <div className="rcc-tooltip-spacer" aria-hidden="true" />
      </div>
      <div
        className={`rcc-resize-handle${resizing ? ' is-dragging' : ''}`}
        onMouseDown={handleResizeStart}
        onDoubleClick={handleResizeReset}
        title="Drag to resize 3D view"
      />
      <div
        className={`rcc-resize-handle${resizing ? ' is-dragging' : ''}`}
        onMouseDown={handleResizeStart}
        onDoubleClick={handleResizeReset}
        title="Drag to resize 3D view"
      />
      {resizing ? (
        <div className="rcc-resize-overlay" onMouseMove={handleResizeOverlayMove} onMouseUp={handleResizeOverlayUp} onMouseLeave={handleResizeOverlayLeave} />
      ) : null}
      <div className="rcc-bottom-scroll">
        <div className="rcc-bottom-columns">
          <section className="rcc-bottom-column">
            <div className="rcc-visualization-stats">
              <div className="rcc-stat-grid">
                <div className="rcc-stat-card">
                  <span>Total blocks</span>
                  <strong>{stats.blockCount}</strong>
                </div>
                <div className="rcc-stat-card">
                  <span>Total lifts</span>
                  <strong>{stats.liftCount}</strong>
                </div>
                <div className="rcc-stat-card">
                  <span>Total volume</span>
                  <strong>{formatVolume(stats.totalVolume)}</strong>
                </div>
                <div className="rcc-stat-card">
                  <span>Overall completion</span>
                  <strong>{PERCENT_FORMAT.format(stats.overallPercent / 100)}</strong>
                </div>
              </div>
              <div className="rcc-status-breakdown">
                <div>
                  <span>Left bank</span>
                  <strong>{PERCENT_FORMAT.format(stats.bankCompletion.Left / 100)}</strong>
                </div>
                <div>
                  <span>Right bank</span>
                  <strong>{PERCENT_FORMAT.format(stats.bankCompletion.Right / 100)}</strong>
                </div>
              </div>
              <div className="rcc-status-toggle-panel">
                <header>Filter the 3D blocks</header>
                <div className="rcc-status-toggle-grid">
                  {STATUS_ORDER.map((status) => {
                    const label = status.replace('-', ' ')
                    const isActive = activeStatusSet.has(status)
                    return (
                      <button
                        key={status}
                        type="button"
                        className={`rcc-status-toggle${isActive ? ' active' : ''}`}
                        onClick={() => handleStatusFilterToggle(status)}
                        aria-pressed={isActive}
                      >
                        <i style={{ background: statusColorMap[status] }} />
                        <span>{label}</span>
                        <strong>{stats.statusCounts[status]}</strong>
                      </button>
                    )
                  })}
                </div>
                {statusFilterActive ? (
                  <button type="button" className="rcc-status-reset" onClick={resetStatusFilters}>
                    Show all statuses
                  </button>
                ) : null}
              </div>
            </div>
            <div className="rcc-visualization-legend">
              {STATUS_ORDER.map((status) => (
                <span key={status}>
                  <i style={{ background: statusColorMap[status] }} /> {status.replace('-', ' ')}
                </span>
              ))}
              <span className="legend-note">Rotate and hover cubes for block, lift, and elevation detail.</span>
            </div>
          </section>
          <section className="rcc-bottom-column">
            <div className="rcc-metrics-wrapper" ref={metricsPanelRef}>
              {metricsLoading ? (
                <div className="rcc-process-placeholder">Loading field telemetry…</div>
              ) : metricsError ? (
                <div className="rcc-process-placeholder error">{metricsError.message}</div>
              ) : (
                <>
                  {metricOverrides && Object.keys(metricOverrides).length ? (
                    <div className="rcc-metric-refresh-note">
                      <span>Showing values from the last sync snapshot.</span>
                      <button type="button" onClick={() => setMetricOverrides(null)}>
                        Reset metrics
                      </button>
                    </div>
                  ) : null}
                  <RccMetricDeck metrics={metrics} metricOverrides={metricOverrides} />
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function groupMetrics(metrics: RccEnvironmentMetric[]) {
  const grouped = new Map<string, RccEnvironmentMetric[]>()
  metrics.forEach((metric) => {
    const group = (metric.metadata?.group as string) || 'General'
    grouped.set(group, [...(grouped.get(group) ?? []), metric])
  })
  return Array.from(grouped.entries())
}

type MetricOverrideEntry = SyncRccDamMetricsResponse['environmentMetricStatus'] extends Record<string, infer V> ? V : never

function displayValue(metric: RccEnvironmentMetric, override?: MetricOverrideEntry | null) {
  const unit = override?.unit ?? metric.unit
  if (override?.valueText) return override.valueText
  if (override?.valueNumeric !== null && override?.valueNumeric !== undefined) {
    return `${override.valueNumeric.toLocaleString()}${unit ? ` ${unit}` : ''}`
  }
  if (metric.value_text) return metric.value_text
  if (metric.value_numeric !== null && metric.value_numeric !== undefined) {
    return `${metric.value_numeric.toLocaleString()}${unit ? ` ${unit}` : ''}`
  }
  return '—'
}

function RccMetricDeck({
  metrics,
  metricOverrides,
}: {
  metrics: RccEnvironmentMetric[]
  metricOverrides: SyncRccDamMetricsResponse['environmentMetricStatus'] | null
}) {
  if (!metrics.length) return null
  const grouped = groupMetrics(metrics)
  const quick = ['daily_pour_volume', 'cumulative_volume', 'core_temperature', 'moisture']
    .map((id) => metrics.find((metric) => metric.metric === id))
    .filter(Boolean) as RccEnvironmentMetric[]
  return (
    <>
      {quick.length ? (
        <div className="rcc-metric-quick-row">
          {quick.map((metric) => {
            const override = metricOverrides?.[metric.metric] ?? null
            const status = override?.status ?? metric.status
            return (
              <article key={metric.id} className={`rcc-metric-chip is-${status}`}>
                <span>{override?.label ?? metric.label}</span>
                <strong>{displayValue(metric, override)}</strong>
                {metric.metadata?.rule ? <small>{String(metric.metadata.rule)}</small> : null}
              </article>
            )
          })}
        </div>
      ) : null}
      <div className="rcc-metric-groups">
        {grouped.map(([group, items]) => (
          <section key={group}>
            <header>{group}</header>
            <div className="rcc-metric-grid">
              {items.map((metric) => {
                const override = metricOverrides?.[metric.metric] ?? null
                const status = override?.status ?? metric.status
                return (
                  <div key={metric.id} className={`rcc-metric-card is-${status}`}>
                    <div className="rcc-metric-card-main">
                      <span>{override?.label ?? metric.label}</span>
                      <strong>{displayValue(metric, override)}</strong>
                    </div>
                    {metric.metadata?.storage ? <p className="metric-meta">Storage: {String(metric.metadata.storage)}</p> : null}
                    {metric.metadata?.value && !metric.value_text ? <p className="metric-meta">{String(metric.metadata.value)}</p> : null}
                    {metric.metadata?.rule ? <p className="metric-meta">{String(metric.metadata.rule)}</p> : null}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
