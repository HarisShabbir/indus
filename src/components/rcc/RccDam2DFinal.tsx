import React, { useCallback, useMemo, useRef, useState } from 'react'

type LiftStatus = 'completed' | 'in-progress' | 'at-risk' | 'not-started' | 'no-data'
type AlarmSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

type LiftAlarm = {
  rule_id: string
  severity: AlarmSeverity
  message: string
}

type LiftDetail = {
  id: string
  block: string
  blockIndex: number
  liftLayer: (typeof LIFT_LAYERS)[number]
  liftNumber: number
  elevationBottom: number
  elevationTop: number
  status: LiftStatus
  totalVolume: number
  pouredVolume: number
  batchId: string
  pourId: number
  alarms: LiftAlarm[]
  highestSeverity: AlarmSeverity | null
  x: number
  y: number
  width: number
  height: number
  statusColor: string
  midElevation: number
  blockLength: number
}

export type RccDam2DFinalProps = {
  initialStatuses?: Record<string, Record<number, LiftStatus>>
}

const BLOCK_LABELS = Array.from({ length: 32 }, (_, index) => String(index + 5).padStart(2, '0'))
const LIFT_LAYERS = [
  { index: 1, bottom: 898, top: 977, label: 'Foundation 898–977', color: '#374151' },
  { index: 2, bottom: 977, top: 1004.5, label: 'Flushing Tunnel 977–1004.50', color: '#7c5a3a' },
  { index: 3, bottom: 1004.5, top: 1044.5, label: 'DG1004.50–1044.50', color: '#ca8a4c' },
  { index: 4, bottom: 1044.5, top: 1097.5, label: 'DG1044.50–1097.50', color: '#d4a574' },
  { index: 5, bottom: 1097.5, top: 1137.5, label: 'DG1097.50–1137.50', color: '#e6b866' },
  { index: 6, bottom: 1137.5, top: 1175, label: 'Crest 1137.50–1175.00', color: '#fef08a' },
] as const

const STATUS_META: Record<LiftStatus, { label: string; color: string; description: string }> = {
  completed: { label: 'Completed', color: '#22c55e', description: 'Lift placed & verified' },
  'in-progress': { label: 'In Progress', color: '#3b82f6', description: 'Concrete placement active' },
  'at-risk': { label: 'At Risk', color: '#f59e0b', description: 'Monitor closely' },
  'not-started': { label: 'Not Started', color: '#ef4444', description: 'Pending mobilization' },
  'no-data': { label: 'No Data', color: '#6b7280', description: 'Awaiting updates' },
}

const STATUS_LIST: LiftStatus[] = ['completed', 'in-progress', 'at-risk', 'not-started', 'no-data']
const MIN_ELEVATION = LIFT_LAYERS[0].bottom
const MAX_ELEVATION = LIFT_LAYERS[LIFT_LAYERS.length - 1].top
const CHART_DIMENSIONS = { width: 1700, height: 780, left: 190, top: 150, right: 130, bottom: 160 } as const

const LEFT_PROFILE = [
  { elevation: 1175, factor: -0.02 },
  { elevation: 1167.3, factor: 0 },
  { elevation: 1162.8, factor: 0.04 },
  { elevation: 1160.3, factor: 0.08 },
  { elevation: 1137.5, factor: 0.13 },
  { elevation: 1097.5, factor: 0.18 },
  { elevation: 1060, factor: 0.23 },
  { elevation: 1004.5, factor: 0.28 },
  { elevation: 977, factor: 0.34 },
  { elevation: 940, factor: 0.39 },
  { elevation: 915, factor: 0.43 },
  { elevation: 905, factor: 0.45 },
  { elevation: 898, factor: 0.47 },
] as const

const RIGHT_PROFILE = [
  { elevation: 1175, factor: 1.05 },
  { elevation: 1167.3, factor: 1.02 },
  { elevation: 1162.8, factor: 0.99 },
  { elevation: 1155, factor: 0.96 },
  { elevation: 1130, factor: 0.92 },
  { elevation: 1110, factor: 0.87 },
  { elevation: 1060, factor: 0.82 },
  { elevation: 1025, factor: 0.77 },
  { elevation: 1020, factor: 0.75 },
  { elevation: 975.8, factor: 0.71 },
  { elevation: 974, factor: 0.69 },
  { elevation: 960, factor: 0.66 },
  { elevation: 958, factor: 0.65 },
  { elevation: 951, factor: 0.63 },
  { elevation: 948, factor: 0.62 },
  { elevation: 930, factor: 0.6 },
  { elevation: 915, factor: 0.58 },
  { elevation: 905, factor: 0.56 },
  { elevation: 898, factor: 0.54 },
] as const

const FOUNDATION_SEGMENT = [
  { elevation: 898, factor: 0.64 },
  { elevation: 898, factor: 0.62 },
  { elevation: 898, factor: 0.6 },
  { elevation: 898, factor: 0.58 },
  { elevation: 898, factor: 0.56 },
  { elevation: 898, factor: 0.54 },
  { elevation: 898, factor: 0.52 },
  { elevation: 898, factor: 0.5 },
  { elevation: 898, factor: 0.48 },
  { elevation: 898, factor: 0.46 },
  { elevation: 898, factor: 0.44 },
  { elevation: 898, factor: 0.42 },
  { elevation: 898, factor: 0.4 },
  { elevation: 899, factor: 0.39 },
  { elevation: 902, factor: 0.38 },
  { elevation: 904, factor: 0.37 },
] as const

const buildDefaultStatuses = (): Record<string, Record<number, LiftStatus>> => {
  const dataset: Record<string, Record<number, LiftStatus>> = {}
  BLOCK_LABELS.forEach((blockId, blockIndex) => {
    const gradient = blockIndex / (BLOCK_LABELS.length - 1)
    const record: Record<number, LiftStatus> = {}
    LIFT_LAYERS.forEach((layer, liftIndex) => {
      const trend = gradient - liftIndex * 0.08
      let status: LiftStatus
      if (trend > 0.75) status = 'completed'
      else if (trend > 0.45) status = 'in-progress'
      else if (trend > 0.15) status = 'at-risk'
      else if (trend > -0.1) status = 'not-started'
      else status = 'no-data'
      record[layer.index] = status
    })
    dataset[blockId] = record
  })
  ;[
    { block: '08', lift: 2, status: 'in-progress' },
    { block: '10', lift: 5, status: 'completed' },
    { block: '14', lift: 3, status: 'at-risk' },
    { block: '17', lift: 2, status: 'at-risk' },
    { block: '19', lift: 4, status: 'completed' },
    { block: '20', lift: 6, status: 'in-progress' },
    { block: '22', lift: 3, status: 'in-progress' },
    { block: '23', lift: 1, status: 'completed' },
    { block: '24', lift: 2, status: 'at-risk' },
    { block: '27', lift: 4, status: 'in-progress' },
    { block: '29', lift: 1, status: 'no-data' },
    { block: '32', lift: 5, status: 'not-started' },
    { block: '34', lift: 3, status: 'at-risk' },
  ].forEach(({ block, lift, status }) => {
    if (dataset[block]) dataset[block][lift] = status
  })
  return dataset
}

const DEFAULT_STATUS_DATA = buildDefaultStatuses()
const INITIAL_VISIBILITY = STATUS_LIST.reduce(
  (acc, status) => Object.assign(acc, { [status]: true }),
  {} as Record<LiftStatus, boolean>,
)

const isLiftStatus = (value?: string | null): value is LiftStatus => (value ? STATUS_LIST.includes(value as LiftStatus) : false)
const severityPriority: Record<AlarmSeverity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }

const pseudoRandom = (seed: number) => {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

const evaluateRules = (metrics: {
  timeBetweenHours: number
  wetDensity: number
  pourTemp: number
  monthlyMax: number
  compressiveStrength: number
  designTarget: number
}): LiftAlarm[] => {
  const alarms: LiftAlarm[] = []
  if (metrics.timeBetweenHours < 72) {
    alarms.push({
      rule_id: 'PR-004',
      severity: 'CRITICAL',
      message: `Lift interval ${metrics.timeBetweenHours.toFixed(0)}h < 72h minimum`,
    })
  }
  if (metrics.wetDensity < 2590) {
    alarms.push({
      rule_id: 'PR-006',
      severity: 'HIGH',
      message: `Wet density ${metrics.wetDensity.toFixed(0)} kg/m³ < 2590`,
    })
  }
  if (metrics.pourTemp < 4 || metrics.pourTemp > 18) {
    alarms.push({
      rule_id: 'PR-001',
      severity: 'HIGH',
      message: `Pour temperature ${metrics.pourTemp.toFixed(1)}°C outside 4–18°C`,
    })
  }
  if (metrics.pourTemp > metrics.monthlyMax) {
    alarms.push({
      rule_id: 'PR-002',
      severity: 'MEDIUM',
      message: `Pour temp ${metrics.pourTemp.toFixed(1)}°C exceeds month limit ${metrics.monthlyMax}°C`,
    })
  }
  if (metrics.compressiveStrength < metrics.designTarget) {
    alarms.push({
      rule_id: 'CU-002',
      severity: 'CRITICAL',
      message: `28d strength ${metrics.compressiveStrength.toFixed(1)} MPa < ${metrics.designTarget} MPa`,
    })
  }
  return alarms
}

export const RccDam2DFinal: React.FC<RccDam2DFinalProps> = ({ initialStatuses }) => {
  const [statusVisibility, setStatusVisibility] = useState<Record<LiftStatus, boolean>>(() => ({ ...INITIAL_VISIBILITY }))
  const [selectedLiftId, setSelectedLiftId] = useState<string | null>(null)
  const [parallax, setParallax] = useState({ x: 0, y: 0 })
  const detailRef = useRef<HTMLDivElement | null>(null)
  const topRef = useRef<HTMLDivElement | null>(null)

  const chart = CHART_DIMENSIONS
  const innerWidth = chart.width - chart.left - chart.right
  const innerHeight = chart.height - chart.top - chart.bottom
  const blockWidth = innerWidth / BLOCK_LABELS.length

  const yForElevation = useCallback(
    (elevation: number) => {
      const ratio = (MAX_ELEVATION - elevation) / (MAX_ELEVATION - MIN_ELEVATION)
      return chart.top + ratio * innerHeight
    },
    [chart.top, innerHeight],
  )

  const xForFactor = useCallback((factor: number) => chart.left + innerWidth * factor, [chart.left, innerWidth])

  const normalizedStatuses = useMemo(() => {
    return BLOCK_LABELS.reduce((acc, blockId) => {
      const defaultBlock = DEFAULT_STATUS_DATA[blockId] ?? {}
      const incoming = initialStatuses?.[blockId]
      const record: Record<number, LiftStatus> = {}
      LIFT_LAYERS.forEach((layer) => {
        const custom = incoming?.[layer.index]
        record[layer.index] = isLiftStatus(custom) ? custom : defaultBlock[layer.index] ?? 'no-data'
      })
      acc[blockId] = record
      return acc
    }, {} as Record<string, Record<number, LiftStatus>>)
  }, [initialStatuses])

  const damOutlinePath = useMemo(() => {
    const commands: string[] = []
    commands.push(`M ${xForFactor(LEFT_PROFILE[0].factor)} ${yForElevation(LEFT_PROFILE[0].elevation)}`)
    commands.push(`L ${xForFactor(RIGHT_PROFILE[0].factor)} ${yForElevation(RIGHT_PROFILE[0].elevation)}`)
    RIGHT_PROFILE.slice(1).forEach((step) => {
      commands.push(`L ${xForFactor(step.factor)} ${yForElevation(step.elevation)}`)
    })
    FOUNDATION_SEGMENT.forEach((step) => commands.push(`L ${xForFactor(step.factor)} ${yForElevation(step.elevation)}`))
    LEFT_PROFILE.slice().reverse().forEach((step) => {
      commands.push(`L ${xForFactor(step.factor)} ${yForElevation(step.elevation)}`)
    })
    commands.push('Z')
    return commands.join(' ')
  }, [xForFactor, yForElevation])

  const rockyEdgePath = useMemo(() => {
    const segments = LEFT_PROFILE.map((step, index) => {
      const jitterX = (index % 2 === 0 ? -8 : 6) + (index % 3 === 0 ? 3 : -2)
      const jitterY = (index % 2 === 0 ? 3 : -2) + (index % 4 === 0 ? 2 : -1)
      return `${index === 0 ? 'M' : 'L'} ${xForFactor(step.factor) + jitterX} ${yForElevation(step.elevation) + jitterY}`
    })
    return segments.join(' ')
  }, [xForFactor, yForElevation])

  const liftDetails = useMemo<LiftDetail[]>(() => {
    const monthlyLimits: Record<number, number> = { 0: 19, 1: 18, 2: 17, 3: 16, 4: 15, 5: 18, 6: 17 }
    return BLOCK_LABELS.flatMap((blockId, blockIndex) =>
      LIFT_LAYERS.map((layer, layerIndex) => {
        const x = chart.left + blockIndex * blockWidth
        const yTop = yForElevation(layer.top)
        const yBottom = yForElevation(layer.bottom)
        const status = normalizedStatuses[blockId][layer.index]
        const noise = pseudoRandom(blockIndex * 10 + layerIndex * 5)
        const blockLength = 36 + Math.sin((blockIndex + layerIndex) * 0.35) * 5 + (blockIndex < 12 ? 5 : blockIndex > 25 ? -3 : 0)
        const totalVolume = Math.round(33.635 * 3 * blockLength)
        const completion =
          status === 'completed'
            ? 1
            : status === 'in-progress'
              ? 0.55 + noise * 0.35
              : status === 'at-risk'
                ? 0.2 + noise * 0.25
                : status === 'not-started'
                  ? 0.05 + noise * 0.06
                  : 0.1 + noise * 0.1
        const pouredVolume = Math.round(totalVolume * Math.min(1, completion))
        const midElevation = (layer.top + layer.bottom) / 2
        const liftNumber = Math.max(1, Math.min(92, Math.ceil((midElevation - 898) / 3)))

        const metrics = {
          timeBetweenHours: 65 + (blockIndex % 4) * 12 + layerIndex * 4 + (noise - 0.5) * 30,
          wetDensity: 2610 + (noise - 0.5) * 140 + (status === 'completed' ? 30 : 0),
          pourTemp: 8 + (blockIndex % 6) * 0.9 + (layerIndex % 3) * 0.4 + (noise - 0.5) * 8,
          monthlyMax: monthlyLimits[blockIndex % 7],
          compressiveStrength: 36 + (status === 'completed' ? 2 : -1) + (noise - 0.5) * 5,
          designTarget: 34 + (layerIndex % 2),
        }
        const alarms = evaluateRules(metrics)
        const highestSeverity =
          alarms.length === 0
            ? null
            : alarms.reduce((max, alarm) => (severityPriority[alarm.severity] > severityPriority[max] ? alarm.severity : max), alarms[0].severity)

        return {
          id: `${blockId}-${layer.index}`,
          block: blockId,
          blockIndex,
          liftLayer: layer,
          liftNumber,
          elevationBottom: layer.bottom,
          elevationTop: layer.top,
          status,
          totalVolume,
          pouredVolume,
          batchId: `B-2025-${String(blockIndex + 4).padStart(2, '0')}-${String(200 + layerIndex * 7)}`,
          pourId: 180 + blockIndex * 6 + layer.index,
          alarms,
          highestSeverity,
          x,
          y: yTop,
          width: blockWidth,
          height: yBottom - yTop,
          statusColor: STATUS_META[status].color,
          midElevation,
          blockLength,
        }
      }),
    )
  }, [BLOCK_LABELS, LIFT_LAYERS, blockWidth, chart.left, normalizedStatuses, yForElevation])

  const statusCounts = useMemo(() => {
    return liftDetails.reduce(
      (acc, cell) => {
        acc[cell.status] += 1
        return acc
      },
      STATUS_LIST.reduce((acc, status) => Object.assign(acc, { [status]: 0 }), {} as Record<LiftStatus, number>),
    )
  }, [liftDetails])

  const alarmTotals = useMemo(
    () =>
      liftDetails.reduce(
        (acc, cell) => {
          cell.alarms.forEach((alarm) => {
            if (alarm.severity === 'CRITICAL') acc.CRITICAL += 1
            else if (alarm.severity === 'HIGH') acc.HIGH += 1
            else if (alarm.severity === 'MEDIUM') acc.MEDIUM += 1
          })
          return acc
        },
        { CRITICAL: 0, HIGH: 0, MEDIUM: 0 },
      ),
    [liftDetails],
  )

  const ogeeProfile = useMemo(() => {
    const points = [
      { factor: 0.08, elevation: 1160.3 },
      { factor: 0.26, elevation: 1162.8 },
      { factor: 0.42, elevation: 1164.8 },
      { factor: 0.58, elevation: 1166.8 },
      { factor: 0.75, elevation: 1167.9 },
      { factor: 0.92, elevation: 1169.5 },
    ]
    return points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xForFactor(point.factor)} ${yForElevation(point.elevation)}`)
      .join(' ')
  }, [xForFactor, yForElevation])

  const toggleStatus = (status: LiftStatus) => setStatusVisibility((prev) => ({ ...prev, [status]: !prev[status] }))
  const handleLiftSelect = (cell: LiftDetail) => {
    setSelectedLiftId(cell.id)
    detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleParallaxMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const relX = (event.clientX - bounds.left) / bounds.width - 0.5
    const relY = (event.clientY - bounds.top) / bounds.height - 0.5
    setParallax({ x: relX * 5, y: relY * -3 })
  }
  const resetParallax = () => setParallax({ x: 0, y: 0 })

  const temporalTimeline = useCallback(
    (lift: LiftDetail) => {
      const seed = pseudoRandom(lift.blockIndex * 500 + lift.liftNumber)
      const offsets = [24, 12, 6].map((base, idx) => Math.round(base + seed * (idx + 2) * 4))
      return [
        { label: 'Formwork ready', detail: `${offsets[0]}h ago`, status: 'complete' as const },
        { label: 'Cooling pipes pre-tested', detail: `${offsets[1]}h ago`, status: 'complete' as const },
        { label: 'Current pour window', detail: `Ends in ${(8 + seed * 4).toFixed(1)}h`, status: 'in-progress' as const },
        { label: 'Next lift release', detail: `${(36 + seed * 10).toFixed(0)}h ETA`, status: 'pending' as const },
      ]
    },
    [],
  )

  const buildInsightEntries = useCallback((lift: LiftDetail) => {
    const seed = pseudoRandom(lift.blockIndex * 120 + lift.liftNumber * 2)
    const hydration = (65 + seed * 20).toFixed(0)
    const thermal = (1.5 + seed * 3).toFixed(1)
    const vibration = (50 + seed * 20).toFixed(0)
    return [
      { label: 'Hydration progress', value: `${hydration}%`, description: 'Cooling blanket telemetry' },
      { label: 'Thermal gradient', value: `${thermal}°C`, description: 'Between core and surface' },
      { label: 'Vibration coverage', value: `${vibration}%`, description: 'Smart needle sensors engaged' },
    ]
  }, [])

  const selectedLift = useMemo(() => {
    if (!selectedLiftId) return null
    return liftDetails.find((lift) => lift.id === selectedLiftId) ?? null
  }, [liftDetails, selectedLiftId])
  const timelineEntries = useMemo(() => (selectedLift ? temporalTimeline(selectedLift) : []), [selectedLift, temporalTimeline])
  const insightEntries = useMemo(() => (selectedLift ? buildInsightEntries(selectedLift) : []), [selectedLift, buildInsightEntries])
  const pouredRatio = selectedLift && selectedLift.totalVolume ? selectedLift.pouredVolume / selectedLift.totalVolume : 0
  const remainingVolume = selectedLift ? Math.max(0, selectedLift.totalVolume - selectedLift.pouredVolume) : 0
  const progressCircumference = 2 * Math.PI * 110
  const scanlineKeyframes = `
    @keyframes neoScan {
      0% { background-position: 0 0; }
      100% { background-position: 0 200px; }
    }
  `

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: scanlineKeyframes }} />
      <style jsx global>{`
        .force-cyan-text * {
          color: #67e8f9 !important;
        }
        .force-cyan-text h1,
        .force-cyan-text h2,
        .force-cyan-text h3,
        .force-cyan-text p,
        .force-cyan-text span {
          color: #67e8f9 !important;
        }
        .preserve-red * {
          color: inherit !important;
        }
      `}</style>
      <div className="force-cyan-text space-y-10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6" ref={topRef}>
        <div className="rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 shadow-[0_30px_90px_rgba(15,23,42,0.65)]">
          <div className="border-b border-white/10 px-6 py-5">
            <h1 className="text-5xl font-black tracking-tight text-cyan-300 leading-tight">
              RCC Dam Isometric Cross-Section
            </h1>
            <p className="mt-3 text-lg font-medium text-cyan-300 opacity-90">Hyperreal digital twin view with live lift intelligence.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 px-5 py-5 text-sm sm:grid-cols-3 lg:grid-cols-5">
            {STATUS_LIST.map((status) => (
              <label
                key={status}
                className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 text-left transition duration-300 ${
                  statusVisibility[status]
                    ? 'border-cyan-400/60 bg-gradient-to-br from-cyan-500/20 via-indigo-600/10 to-transparent shadow-[0_15px_45px_rgba(14,165,233,0.35)] text-cyan-300'
                    : 'border-slate-700 bg-slate-900/40 text-cyan-300/70'
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-400 bg-slate-900 text-cyan-400 focus:ring-cyan-400"
                  checked={statusVisibility[status]}
                  onChange={() => toggleStatus(status)}
                />
                <span className="flex flex-1 flex-col">
                  <span className="flex items-center gap-2 font-semibold text-cyan-300">
                    <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: STATUS_META[status].color }} aria-hidden />
                    {STATUS_META[status].label}
                  </span>
                  <span className="text-xs text-cyan-400">{STATUS_META[status].description}</span>
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">({statusCounts[status]})</span>
              </label>
            ))}
          </div>
        </div>
        <div
          className="relative overflow-hidden rounded-[32px] border border-slate-800 bg-gradient-to-b from-slate-900 via-slate-950 to-black p-4 shadow-[0_25px_80px_rgba(15,23,42,0.9)]"
          onMouseMove={handleParallaxMove}
          onMouseLeave={resetParallax}
          style={{ transform: `perspective(1600px) rotateX(${parallax.y}deg) rotateY(${parallax.x}deg)`, transition: 'transform 0.35s ease-out' }}
        >
          <div
            className="pointer-events-none absolute inset-0 z-10 rounded-[32px]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(120deg, rgba(6,182,212,0.08) 0, rgba(6,182,212,0.08) 1px, transparent 1px, transparent 4px)',
              animation: 'neoScan 8s linear infinite',
              mixBlendMode: 'screen',
              opacity: 0.35,
            }}
          />
          <div className="relative z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-500/40 bg-gradient-to-r from-cyan-500/10 via-transparent to-fuchsia-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-widest text-cyan-300">
            <div className="flex items-center gap-8 text-sm font-bold uppercase tracking-wider">
              <span>{alarmTotals.CRITICAL} Critical</span>
              <span>|</span>
              <span>{alarmTotals.HIGH} High</span>
              <span>|</span>
              <span>{alarmTotals.MEDIUM} Medium</span>
              <span className="mx-4">alarms</span>
            </div>
            <span className="text-cyan-300 animate-pulse">Click any lift to inspect live data</span>
          </div>
          <div className="relative z-20 rounded-[28px] border border-white/5 bg-slate-950/70 p-4 backdrop-blur-xl">
            <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-labelledby="damTitle damDesc" className="h-full w-full" style={{ overflow: 'visible' }}>
              <style
                dangerouslySetInnerHTML={{
                  __html: `
                    svg text {
                      fill: #e0f2fe !important;
                      font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
                      font-weight: 600 !important;
                    }
                    g.block-label text {
                      fill: white !important;
                      font-weight: 800 !important;
                    }
                    text.force-amber { fill: #fbbf24 !important; }
                    text.force-yellow { fill: #fde047 !important; font-weight: 800 !important; }
                    text.force-sky { fill: #7dd3fc !important; }
                    text.force-cyan { fill: #67e8f9 !important; }
                    text[font-size="14"] {
                      font-size: 18px !important;
                      pointer-events: none;
                    }
                    svg text {
                      fill: #67e8f9 !important;
                    }
                    g.text-cyan-300 text,
                    g text {
                      fill: #67e8f9 !important;
                    }
                    text[fill="currentColor"],
                    text[style*="currentColor"] {
                      fill: #67e8f9 !important;
                    }
                  `,
                }}
              />
              <title id="damTitle">RCC Dam Cross Section</title>
              <desc id="damDesc">Exact RCC gravity dam geometry with lift statuses, tunnels, and crest profile.</desc>
              <defs>
                <clipPath id="damShape">
                  <path d={damOutlinePath} />
                </clipPath>
                <marker id="cyan-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0 0 L6 3 L0 6 z" fill="#67e8f9" />
                </marker>
                <linearGradient id="damLayerGradient" x1="0%" y1="0%" x2="100%" y2="120%">
                  <stop offset="0%" stopColor="#312e81" stopOpacity="0.4" />
                  <stop offset="40%" stopColor="#2563eb" stopOpacity="0.35" />
                  <stop offset="70%" stopColor="#0ea5e9" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0.6" />
                </linearGradient>
                <radialGradient id="damGlow" cx="50%" cy="30%" r="80%">
                  <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.35" />
                  <stop offset="50%" stopColor="#312e81" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="liftGloss" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
                  <stop offset="20%" stopColor="#c7d2fe" stopOpacity="0.15" />
                  <stop offset="60%" stopColor="#0f172a" stopOpacity="0.05" />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
                </linearGradient>
                <filter id="liftShadow" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#0ea5e9" floodOpacity="0.25" />
                </filter>
                <filter id="liftShadowCritical" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#f87171" floodOpacity="0.45" />
                </filter>
                <filter id="selectedGlow" x="-40%" y="-40%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#ffffff" floodOpacity="0.8" />
                </filter>
              </defs>
              <rect width={chart.width} height={chart.height} fill="#020617" />

              <g clipPath="url(#damShape)">
                {LIFT_LAYERS.map((layer) => {
                  const yTop = yForElevation(layer.top)
                  const yBottom = yForElevation(layer.bottom)
                  return (
                    <rect key={layer.index} x={chart.left} y={yTop} width={innerWidth} height={yBottom - yTop} fill={layer.color} opacity={0.26} />
                  )
                })}
                {LIFT_LAYERS.map((layer) => (
                  <line
                    key={`h-${layer.index}`}
                    x1={chart.left}
                    x2={chart.left + innerWidth}
                    y1={yForElevation(layer.bottom)}
                    y2={yForElevation(layer.bottom)}
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth={1}
                  />
                ))}
                {Array.from({ length: BLOCK_LABELS.length + 1 }, (_, index) => {
                  const x = chart.left + index * blockWidth
                  return (
                    <line
                      key={`v-${index}`}
                      x1={x}
                      x2={x}
                      y1={yForElevation(MAX_ELEVATION)}
                      y2={yForElevation(MIN_ELEVATION)}
                      stroke="rgba(255,255,255,0.15)"
                      strokeWidth={0.8}
                      strokeDasharray="2 7"
                    />
                  )
                })}
                <rect x={chart.left} y={chart.top} width={innerWidth} height={innerHeight} fill="url(#damLayerGradient)" opacity={0.45} />
                <rect x={chart.left} y={chart.top} width={innerWidth} height={innerHeight} fill="url(#damGlow)" opacity={0.45} />
                {liftDetails.map((cell) => {
                  if (!statusVisibility[cell.status]) return null
                  const isSelected = selectedLiftId === cell.id
                  const borderColor =
                    cell.highestSeverity === 'CRITICAL'
                      ? '#ef4444'
                      : cell.highestSeverity === 'HIGH' || cell.highestSeverity === 'MEDIUM'
                        ? '#f59e0b'
                        : 'transparent'
                  const shadowFilter = cell.highestSeverity === 'CRITICAL' ? 'url(#liftShadowCritical)' : 'url(#liftShadow)'
                  return (
                    <g key={cell.id}>
                      <rect
                        x={cell.x + 2}
                        y={cell.y + 2}
                        width={cell.width - 4}
                        height={cell.height - 4}
                        fill={cell.statusColor}
                        opacity={0.87}
                        stroke={borderColor}
                        strokeWidth={cell.highestSeverity ? 2.5 : 0}
                        className="transition-all duration-300 hover:opacity-100"
                        tabIndex={0}
                        role="button"
                        focusable="true"
                        onClick={() => handleLiftSelect(cell)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            handleLiftSelect(cell)
                          }
                        }}
                        filter={shadowFilter}
                      />
                      <rect x={cell.x + 2} y={cell.y + 2} width={cell.width - 4} height={cell.height - 4} fill="url(#liftGloss)" opacity={0.6} pointerEvents="none" />
                      {isSelected ? (
                        <rect
                          x={cell.x}
                          y={cell.y}
                          width={cell.width}
                          height={cell.height}
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth={4}
                          rx={6}
                          pointerEvents="none"
                          filter="url(#selectedGlow)"
                          className="animate-pulse"
                        />
                      ) : null}
                      {cell.highestSeverity ? (
                        <text
                          x={cell.x + cell.width - 12}
                          y={cell.y + 18}
                          fontSize="14"
                          fill={cell.highestSeverity === 'CRITICAL' ? '#ef4444' : '#f59e0b'}
                          className={cell.highestSeverity === 'CRITICAL' ? 'animate-pulse' : ''}
                        >
                          ⚠
                        </text>
                      ) : null}
                    </g>
                  )
                })}
              </g>

              <path d={damOutlinePath} fill="none" stroke="rgba(226,232,240,0.7)" strokeWidth={3.5} />
              <path d={rockyEdgePath} fill="none" stroke="#cbd5f5" strokeWidth={1.2} strokeDasharray="5 6" />
              <path d={ogeeProfile} stroke="#fde047" strokeWidth={2} strokeDasharray="8 6" fill="none" />

              {/* Block labels at top */}
              <g className="block-label">
                {BLOCK_LABELS.map((blockId, index) => {
                  const x = chart.left + index * blockWidth + blockWidth / 2
                  const boxWidth = blockWidth * 0.75
                  const boxHeight = 22
                  const boxX = x - boxWidth / 2
                  const boxY = chart.top - 70
                  return (
                    <g key={blockId}>
                      <rect x={boxX} y={boxY} width={boxWidth} height={boxHeight} fill="rgba(15,23,42,0.9)" stroke="#475569" rx={4} />
                      <text x={x} y={boxY + 15} textAnchor="middle" fontWeight="700" fontSize="13">
                        {blockId}
                      </text>
                    </g>
                  )
                })}
              </g>

              {/* Left / Right bank labels */}
              <text x={chart.left - 60} y={chart.top - 90} fontSize="16" fontWeight="600" className="text-cyan-300">
                Left Bank
              </text>
              <text x={chart.left + innerWidth + 60} y={chart.top - 90} fontSize="16" fontWeight="600" textAnchor="end" className="text-cyan-300">
                Right Bank
              </text>

              {/* Special labels */}
              <text x={chart.left + innerWidth + 70} y={yForElevation(1175) - 12} className="force-amber" fontWeight="700" fontSize="12" textAnchor="start">
                Dam crest 1175.00
              </text>
              <text x={chart.left + innerWidth + 90} y={yForElevation(1160)} className="force-sky" fontWeight="600" fontSize="12" textAnchor="start">
                MAX. OP. WL. 1160.00
              </text>
              <text x={xForFactor(0.45)} y={yForElevation(1169) - 30} className="force-yellow" fontWeight="700" fontSize="12" textAnchor="middle">
                OGEE CREST PROFILE
              </text>

              {/* All tunnel / outlet annotations */}
              <g className="force-cyan">
                <text x={xForFactor(0.55)} y={yForElevation(1036)} textAnchor="middle" fontSize="12">
                  8.5×11m Outlets
                </text>
                <text x={xForFactor(0.6)} y={yForElevation(990)} textAnchor="middle" fontSize="12">
                  8.5×9m Outlets
                </text>
                <text x={xForFactor(0.2)} y={yForElevation(1015) - 16} textAnchor="middle" fontSize="12">
                  Headrace tunnels
                </text>
                <text x={xForFactor(0.28)} y={yForElevation(968) - 14} textAnchor="middle" fontSize="12">
                  Flushing tunnel
                </text>
                <text x={xForFactor(0.88)} y={yForElevation(952) - 20} fontSize="12">
                  Access tunnel
                </text>
                <text x={xForFactor(0.88)} y={yForElevation(952) - 6} fontSize="12">
                  to gate chamber
                </text>
              </g>

              {/* Elevation labels */}
              <g className="text-cyan-300" fontSize="11">
                {[898, 977, 1004.5, 1060, 1097.5, 1137.5, 1160.3, 1162.8, 1167.3, 1175].map((elevation) => (
                  <text key={`left-elev-${elevation}`} x={chart.left - 22} y={yForElevation(elevation) - 4} textAnchor="end">
                    {elevation.toFixed(2)}
                  </text>
                ))}
                {[
                  { label: '1130.00', elevation: 1130 },
                  { label: '1110.00', elevation: 1110 },
                  { label: '1060.00', elevation: 1060 },
                  { label: '1025.00', elevation: 1025 },
                  { label: '1020.00', elevation: 1020 },
                  { label: '975.80–974.00', elevation: 974 },
                  { label: '960.00–958.00', elevation: 958 },
                  { label: '951.00–948.00', elevation: 948 },
                ].map((ref) => (
                  <text key={`right-elev-${ref.label}`} x={chart.left + innerWidth + 22} y={yForElevation(ref.elevation) - 4}>
                    {ref.label}
                  </text>
                ))}
              </g>

              <g pointerEvents="bounding-box">
                {liftDetails.map((cell) => {
                  if (!statusVisibility[cell.status]) return null
                  return (
                    <rect
                      key={`hitbox-${cell.id}`}
                      x={cell.x}
                      y={cell.y}
                      width={cell.width}
                      height={cell.height}
                      fill="transparent"
                      pointerEvents="all"
                      className="cursor-pointer"
                      role="button"
                      onClick={() => handleLiftSelect(cell)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          handleLiftSelect(cell)
                        }
                      }}
                      tabIndex={0}
                    />
                  )
                })}
              </g>
            </svg>
          </div>
        </div>
        {selectedLift ? (
          <section
            ref={detailRef}
            className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-slate-950/90 text-cyan-300 shadow-2xl backdrop-blur-2xl"
            style={{
              background:
                'radial-gradient(circle at 30% 20%, rgba(6, 182, 212, 0.15), transparent 50%), radial-gradient(circle at 70% 80%, rgba(139, 92, 246, 0.1), transparent 50%), #0f172a',
            }}
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-70" />
            <div className="p-8 space-y-10">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">Selected Lift • Live Intelligence</p>
                  <h2 className="mt-2 text-4xl font-black text-cyan-300">
                    Block {selectedLift.block} • Lift {selectedLift.liftNumber}
                  </h2>
                  <div className="mt-3 flex items-center gap-4">
                    <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-cyan-300 shadow-lg shadow-cyan-500/20">
                      {STATUS_META[selectedLift.status].label}
                    </span>
                    <span className="text-sm text-cyan-300">
                      Elevation: {selectedLift.elevationBottom.toFixed(1)}–{selectedLift.elevationTop.toFixed(1)} m
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => topRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  className="group flex items-center gap-3 rounded-2xl border border-cyan-400/40 bg-cyan-500/10 px-6 py-3 transition-all duration-300 hover:bg-cyan-500/20"
                >
                  <span className="text-cyan-300 font-semibold">Back to Diagram</span>
                  <svg className="h-5 w-5 text-cyan-300 transition group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                  </svg>
                </button>
              </div>

              <div className="grid gap-8 lg:grid-cols-3">
                <div className="relative flex items-center justify-center">
                  <svg className="w-64 h-64 -rotate-90">
                    <circle cx="128" cy="128" r="110" stroke="rgba(34,197,94,0.2)" strokeWidth="16" fill="none" />
                    <circle
                      cx="128"
                      cy="128"
                      r="110"
                      stroke="#22c55e"
                      strokeWidth="16"
                      fill="none"
                      strokeDasharray={`${pouredRatio * progressCircumference} ${progressCircumference}`}
                      className="transition-all duration-1000 ease-out"
                      strokeLinecap="round"
                    />
                    <text x="128" y="128" textAnchor="middle" dominantBaseline="middle" className="fill-cyan-300 text-5xl font-black">
                      {Math.round(pouredRatio * 100)}%
                    </text>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <p className="text-lg font-semibold text-cyan-400">Volume Poured</p>
                    <p className="text-3xl font-black text-cyan-300">{selectedLift.pouredVolume.toLocaleString()} m³</p>
                    <p className="text-sm text-cyan-400">of {selectedLift.totalVolume.toLocaleString()} m³</p>
                  </div>
                </div>
                <div className="lg:col-span-2 grid grid-cols-2 gap-6">
                  {[
                    { label: 'Remaining Volume', value: `${remainingVolume.toLocaleString()} m³` },
                    { label: 'Plan Length', value: `${selectedLift.blockLength.toFixed(1)} m` },
                    { label: 'Batch ID', value: selectedLift.batchId },
                    { label: 'Pour #', value: `${selectedLift.pourId}` },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-cyan-500/20 bg-slate-900/50 p-6">
                      <p className="text-sm font-semibold uppercase tracking-wider text-cyan-400">{item.label}</p>
                      <p className="text-3xl font-black text-cyan-300 mt-2">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-cyan-500/20 bg-slate-900/50 backdrop-blur p-6">
                <h3 className="text-xl font-bold text-cyan-300 mb-6">Pour Timeline</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {timelineEntries.map((entry) => (
                    <div key={`${selectedLift.id}-${entry.label}`} className="text-center">
                      <div
                        className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center text-2xl font-bold mb-3 ${
                          entry.status === 'complete'
                            ? 'bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/50'
                            : entry.status === 'in-progress'
                              ? 'bg-sky-500/20 text-sky-400 border-2 border-sky-500/50 animate-pulse'
                              : 'bg-slate-700/50 text-slate-400 border-2 border-slate-600'
                        }`}
                      >
                        {entry.status === 'complete' ? '✓' : entry.status === 'in-progress' ? '●' : '⏱'}
                      </div>
                      <p className="text-cyan-300 font-semibold">{entry.label}</p>
                      <p className="text-sm text-cyan-400 mt-1">{entry.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-8">
                <div className="preserve-red rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-950/30 to-slate-900/50 p-6">
                  <h3 className="text-xl font-bold text-red-400 mb-4">Active Alarms ({selectedLift.alarms.length})</h3>
                  {selectedLift.alarms.length ? (
                    <div className="space-y-3">
                      {selectedLift.alarms.map((alarm) => (
                        <div key={alarm.rule_id} className="flex items-start gap-4 rounded-xl bg-red-900/20 border border-red-500/30 p-4">
                          <span className="text-3xl text-red-300">{alarm.severity === 'CRITICAL' ? '⚠' : alarm.severity === 'HIGH' ? '▲' : '!'}</span>
                          <div>
                            <p className="font-bold text-red-300">{alarm.rule_id}</p>
                            <p className="text-sm text-red-200">
                              <span className="capitalize">{alarm.severity.toLowerCase()}</span> · {alarm.message}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-emerald-400 font-semibold text-lg">No alarms — All systems nominal</p>
                  )}
                </div>
                <div className="rounded-2xl border border-cyan-500/20 bg-slate-900/50 p-6">
                  <h3 className="text-xl font-bold text-cyan-300 mb-4">Operational Insights</h3>
                  <div className="space-y-5">
                    {insightEntries.map((insight) => (
                      <div key={`${selectedLift.id}-${insight.label}`} className="flex items-center justify-between">
                        <div>
                          <p className="text-cyan-200 font-semibold">{insight.label}</p>
                          <p className="text-xs text-slate-400">{insight.description}</p>
                        </div>
                        <p className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">{insight.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section
            ref={detailRef}
            className="rounded-[32px] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8 text-cyan-50 shadow-[0_35px_90px_rgba(15,23,42,0.75)]"
          >
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-32 h-32 rounded-full border-4 border-dashed border-cyan-500/30 bg-cyan-500/5 flex items-center justify-center mb-8">
                <svg className="w-16 h-16 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <p className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-400">
                Select a lift to activate live intelligence
              </p>
              <p className="mt-4 text-lg text-cyan-200/80">Real-time pour tracking • Quality alarms • Thermal & hydration telemetry</p>
            </div>
          </section>
        )}
      </div>
    </>
  )
}

export default RccDam2DFinal
