import React, { useCallback, useMemo, useState } from 'react'

type LiftStatus = 'completed' | 'in-progress' | 'at-risk' | 'not-started' | 'no-data'

export type RccDam2DIsoProps = {
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
const CHART_DIMENSIONS = { width: 1660, height: 760, left: 170, top: 130, right: 110, bottom: 150 } as const

const UPSTREAM_STEPS = [
  { elevation: 898, offset: -190 },
  { elevation: 977, offset: -142 },
  { elevation: 1004.5, offset: -112 },
  { elevation: 1060, offset: -75 },
  { elevation: 1097.5, offset: -45 },
  { elevation: 1137.5, offset: -20 },
  { elevation: 1160.3, offset: -10 },
  { elevation: 1162.8, offset: -6 },
  { elevation: 1167.3, offset: -4 },
  { elevation: 1170, offset: -2 },
  { elevation: 1175, offset: 0 },
] as const

const DOWNSTREAM_STEPS = [
  { elevation: 1175, offset: 0 },
  { elevation: 1130, offset: 34 },
  { elevation: 1110, offset: 78 },
  { elevation: 1020, offset: 134 },
  { elevation: 975.8, offset: 190 },
  { elevation: 974, offset: 203 },
  { elevation: 960, offset: 235 },
  { elevation: 958, offset: 244 },
  { elevation: 951, offset: 268 },
  { elevation: 948, offset: 282 },
  { elevation: 898, offset: 330 },
] as const

const buildDefaultStatuses = (): Record<string, Record<number, LiftStatus>> => {
  const dataset: Record<string, Record<number, LiftStatus>> = {}
  BLOCK_LABELS.forEach((blockId, index) => {
    const progressBias = index / (BLOCK_LABELS.length - 1)
    const record: Record<number, LiftStatus> = {}
    LIFT_LAYERS.forEach((layer, liftIndex) => {
      const gradient = progressBias - liftIndex * 0.08
      let status: LiftStatus
      if (gradient > 0.65) status = 'completed'
      else if (gradient > 0.35) status = 'in-progress'
      else if (gradient > 0.1) status = 'at-risk'
      else if (gradient > -0.1) status = 'not-started'
      else status = 'no-data'
      record[layer.index] = status
    })
    dataset[blockId] = record
  })
  ;[
    { block: '08', lift: 2, status: 'in-progress' },
    { block: '10', lift: 5, status: 'completed' },
    { block: '12', lift: 1, status: 'completed' },
    { block: '16', lift: 3, status: 'in-progress' },
    { block: '17', lift: 3, status: 'at-risk' },
    { block: '19', lift: 2, status: 'at-risk' },
    { block: '20', lift: 4, status: 'completed' },
    { block: '21', lift: 5, status: 'in-progress' },
    { block: '22', lift: 6, status: 'not-started' },
    { block: '23', lift: 2, status: 'at-risk' },
    { block: '24', lift: 3, status: 'in-progress' },
    { block: '26', lift: 4, status: 'completed' },
    { block: '28', lift: 2, status: 'at-risk' },
    { block: '30', lift: 1, status: 'no-data' },
    { block: '32', lift: 5, status: 'not-started' },
    { block: '34', lift: 2, status: 'in-progress' },
  ].forEach(({ block, lift, status }) => {
    if (dataset[block]) {
      dataset[block][lift] = status
    }
  })
  return dataset
}

const DEFAULT_STATUS_DATA = buildDefaultStatuses()
const INITIAL_VISIBILITY = STATUS_LIST.reduce(
  (acc, status) => Object.assign(acc, { [status]: true }),
  {} as Record<LiftStatus, boolean>,
)

const isLiftStatus = (value?: string | null): value is LiftStatus => (value ? STATUS_LIST.includes(value as LiftStatus) : false)

export const RccDam2DIso: React.FC<RccDam2DIsoProps> = ({ initialStatuses }) => {
  const [statusVisibility, setStatusVisibility] = useState<Record<LiftStatus, boolean>>(() => ({ ...INITIAL_VISIBILITY }))

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

  const buildDamOutlinePath = useCallback(() => {
    const commands: string[] = []
    const startX = chart.left + UPSTREAM_STEPS[UPSTREAM_STEPS.length - 1].offset
    const startY = yForElevation(1175)
    commands.push(`M ${startX} ${startY}`)
    commands.push(`L ${chart.left + innerWidth} ${yForElevation(1175)}`)
    let prev = DOWNSTREAM_STEPS[0]
    DOWNSTREAM_STEPS.slice(1).forEach((step) => {
      const horizontalX = chart.left + innerWidth + step.offset
      const prevY = yForElevation(prev.elevation)
      commands.push(`L ${horizontalX} ${prevY}`)
      commands.push(`L ${horizontalX} ${yForElevation(step.elevation)}`)
      prev = step
    })
    const foundationPoints = [
      { x: chart.left + innerWidth * 0.76, y: yForElevation(904) },
      { x: chart.left + innerWidth * 0.55, y: yForElevation(899) },
      { x: chart.left + innerWidth * 0.32, y: yForElevation(900) },
      { x: chart.left + UPSTREAM_STEPS[0].offset, y: yForElevation(898) },
    ]
    foundationPoints.forEach((point) => commands.push(`L ${point.x} ${point.y}`))
    let prevUp = UPSTREAM_STEPS[0]
    UPSTREAM_STEPS.slice(1).forEach((step) => {
      const horizontalX = chart.left + step.offset
      const prevY = yForElevation(prevUp.elevation)
      commands.push(`L ${horizontalX} ${prevY}`)
      commands.push(`L ${horizontalX} ${yForElevation(step.elevation)}`)
      prevUp = step
    })
    commands.push('Z')
    return commands.join(' ')
  }, [chart.left, innerWidth, yForElevation])

  const damOutlinePath = useMemo(() => buildDamOutlinePath(), [buildDamOutlinePath])

  const blockCells = useMemo(() => {
    return BLOCK_LABELS.flatMap((blockId, blockIndex) =>
      LIFT_LAYERS.map((layer) => {
        const x = chart.left + blockIndex * blockWidth
        const yTop = yForElevation(layer.top)
        const yBottom = yForElevation(layer.bottom)
        return {
          id: `${blockId}-${layer.index}`,
          blockId,
          liftIndex: layer.index,
          x,
          y: yTop,
          width: blockWidth,
          height: yBottom - yTop,
          status: normalizedStatuses[blockId][layer.index],
        }
      }),
    )
  }, [blockWidth, normalizedStatuses, chart.left, yForElevation])

  const statusCounts = useMemo(() => {
    return blockCells.reduce(
      (acc, cell) => {
        acc[cell.status] += 1
        return acc
      },
      STATUS_LIST.reduce((acc, status) => Object.assign(acc, { [status]: 0 }), {} as Record<LiftStatus, number>),
    )
  }, [blockCells])

  const ogeeProfile = useMemo(() => {
    const points = [
      { x: chart.left + innerWidth * 0.05, elevation: 1160.3 },
      { x: chart.left + innerWidth * 0.22, elevation: 1162.8 },
      { x: chart.left + innerWidth * 0.38, elevation: 1164.2 },
      { x: chart.left + innerWidth * 0.6, elevation: 1166.8 },
      { x: chart.left + innerWidth * 0.78, elevation: 1168.5 },
      { x: chart.left + innerWidth * 0.92, elevation: 1170 },
    ]
    return points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${yForElevation(point.elevation)}`)
      .join(' ')
  }, [chart.left, innerWidth, yForElevation])

  const toggleStatus = (status: LiftStatus) => {
    setStatusVisibility((prev) => ({ ...prev, [status]: !prev[status] }))
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
        <div className="border-b border-slate-100 px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">RCC gravity dam</p>
          <h2 className="text-2xl font-semibold text-slate-900">2D Isometric Cross-Section</h2>
          <p className="text-sm text-slate-500">Live construction overlay across 32 dam blocks with lift-by-lift status control.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 px-5 py-5 text-sm sm:grid-cols-3 lg:grid-cols-5">
          {STATUS_LIST.map((status) => (
            <label
              key={status}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 text-left shadow-sm transition ${
                statusVisibility[status] ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-70'
              }`}
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-400 text-slate-900 focus:ring-slate-400"
                checked={statusVisibility[status]}
                onChange={() => toggleStatus(status)}
              />
              <span className="flex flex-1 flex-col">
                <span className="flex items-center gap-2 font-semibold text-slate-900">
                  <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: STATUS_META[status].color }} aria-hidden />
                  {STATUS_META[status].label}
                </span>
                <span className="text-xs text-slate-500">{STATUS_META[status].description}</span>
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{statusCounts[status]}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-[32px] border border-slate-800 bg-gradient-to-b from-slate-900 via-slate-950 to-black p-4 shadow-2xl shadow-slate-900/70">
        <div className="rounded-[28px] border border-white/5 bg-slate-900/70 p-4">
          <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-labelledby="rccDamTitle rccDamDesc" className="h-full w-full">
            <title id="rccDamTitle">RCC Dam Construction Dashboard</title>
            <desc id="rccDamDesc">
              Visualization of RCC dam cross-section showing block grid, elevation references, hydraulic structures, and construction status overlays.
            </desc>
            <defs>
              <clipPath id="dam-body">
                <path d={damOutlinePath} />
              </clipPath>
              <marker id="cyan-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0 0 L6 3 L0 6 z" fill="#67e8f9" />
              </marker>
            </defs>
            <rect x={0} y={0} width={chart.width} height={chart.height} fill="#020617" />

            <g clipPath="url(#dam-body)">
              {LIFT_LAYERS.map((layer) => {
                const yTop = yForElevation(layer.top)
                const yBottom = yForElevation(layer.bottom)
                return (
                  <rect
                    key={layer.index}
                    x={chart.left}
                    y={yTop}
                    width={innerWidth}
                    height={yBottom - yTop}
                    fill={layer.color}
                    opacity={0.25}
                  />
                )
              })}
              {LIFT_LAYERS.map((layer) => (
                <line
                  key={`h-${layer.index}`}
                  x1={chart.left}
                  x2={chart.left + innerWidth}
                  y1={yForElevation(layer.bottom)}
                  y2={yForElevation(layer.bottom)}
                  stroke="rgba(255,255,255,0.2)"
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
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth={0.8}
                    strokeDasharray="2 8"
                  />
                )
              })}
              {blockCells.map((cell) => {
                const statusColor = STATUS_META[cell.status].color
                const visible = statusVisibility[cell.status]
                return (
                  <rect
                    key={cell.id}
                    x={cell.x + 2}
                    y={cell.y + 2}
                    width={cell.width - 4}
                    height={cell.height - 4}
                    fill={statusColor}
                    opacity={visible ? 0.85 : 0}
                    className="transition-opacity duration-300 ease-in-out hover:opacity-100"
                  >
                    <title>
                      Block {cell.blockId} · Lift {cell.liftIndex} · {STATUS_META[cell.status].label}
                    </title>
                  </rect>
                )
              })}
            </g>

            <path d={damOutlinePath} fill="none" stroke="rgba(226,232,240,0.7)" strokeWidth={3} />
            <path d={damOutlinePath} fill="url(#dam-shade)" opacity={0.08}>
              <animate attributeName="opacity" values="0.08;0.12;0.08" dur="8s" repeatCount="indefinite" />
            </path>

            <defs>
              <linearGradient id="dam-shade" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.12" />
                <stop offset="60%" stopColor="#e5e7eb" stopOpacity="0.02" />
                <stop offset="100%" stopColor="#0f172a" stopOpacity="0.2" />
              </linearGradient>
            </defs>

            <path d={ogeeProfile} stroke="#fde047" strokeWidth={2} strokeDasharray="8 6" fill="none" />

            <g fontFamily="Inter, sans-serif" fontSize="12" fill="#e2e8f0" textAnchor="middle">
              {BLOCK_LABELS.map((blockId, index) => {
                const x = chart.left + index * blockWidth + blockWidth / 2
                return (
                  <text key={blockId} x={x} y={chart.top - 22} fontWeight="600">
                    {blockId}
                  </text>
                )
              })}
            </g>
            <text x={chart.left + 30} y={chart.top - 50} fontSize="16" fill="#f8fafc" fontWeight="600">
              Left Bank
            </text>
            <text x={chart.left + innerWidth - 30} y={chart.top - 50} fontSize="16" fill="#f8fafc" fontWeight="600" textAnchor="end">
              Right Bank
            </text>

            <text
              x={chart.left + innerWidth + 70}
              y={yForElevation(1175) - 10}
              fontSize="12"
              fill="#fef9c3"
              fontWeight="700"
              textAnchor="start"
            >
              Dam crest 1175.00
            </text>
            <text
              x={chart.left + innerWidth + 90}
              y={yForElevation(1160)}
              fontSize="12"
              fill="#bae6fd"
              fontWeight="600"
              textAnchor="start"
            >
              MAX. OP. WL. 1160.00
            </text>

            {[898, 977, 1004.5, 1060, 1097.5, 1137.5, 1175].map((elevation) => (
              <g key={`left-${elevation}`}>
                <line
                  x1={chart.left - 16}
                  x2={chart.left - 6}
                  y1={yForElevation(elevation)}
                  y2={yForElevation(elevation)}
                  stroke="#94a3b8"
                />
                <text x={chart.left - 20} y={yForElevation(elevation) - 4} textAnchor="end" fill="#cbd5f5" fontSize="11">
                  {elevation.toFixed(2)}
                </text>
              </g>
            ))}

            {[
              { label: '1130.00', elevation: 1130 },
              { label: '1110.00', elevation: 1110 },
              { label: '1020.00', elevation: 1020 },
              { label: '975.80–974.00', elevation: 974 },
              { label: '960.00–958.00', elevation: 958 },
              { label: '951.00–948.00', elevation: 948 },
            ].map((ref) => (
              <g key={ref.label}>
                <line
                  x1={chart.left + innerWidth + 6}
                  x2={chart.left + innerWidth + 16}
                  y1={yForElevation(ref.elevation)}
                  y2={yForElevation(ref.elevation)}
                  stroke="#94a3b8"
                />
                <text
                  x={chart.left + innerWidth + 20}
                  y={yForElevation(ref.elevation) - 4}
                  textAnchor="start"
                  fill="#cbd5f5"
                  fontSize="11"
                >
                  {ref.label}
                </text>
              </g>
            ))}

            <g fontSize="12" fill="#f8fafc" fontFamily="Inter, sans-serif">
              <text x={chart.left + innerWidth * 0.52} y={yForElevation(1036)} textAnchor="middle">
                8.5×11m Outlets
              </text>
              <rect
                x={chart.left + innerWidth * 0.46}
                y={yForElevation(1030)}
                width={blockWidth * 5.5}
                height={12}
                fill="rgba(255,255,255,0.12)"
                stroke="rgba(226,232,240,0.8)"
              />
              <line
                x1={chart.left + innerWidth * 0.62}
                y1={yForElevation(1030)}
                x2={chart.left + innerWidth * 0.75}
                y2={yForElevation(1010)}
                stroke="#67e8f9"
                strokeWidth={2}
                markerEnd="url(#cyan-arrow)"
              />

              <text x={chart.left + innerWidth * 0.57} y={yForElevation(990)} textAnchor="middle">
                8.5×9m Outlets
              </text>
              <rect
                x={chart.left + innerWidth * 0.52}
                y={yForElevation(985)}
                width={blockWidth * 3.5}
                height={12}
                fill="rgba(255,255,255,0.12)"
                stroke="rgba(226,232,240,0.8)"
              />
              <line
                x1={chart.left + innerWidth * 0.6}
                y1={yForElevation(985)}
                x2={chart.left + innerWidth * 0.78}
                y2={yForElevation(965)}
                stroke="#67e8f9"
                strokeWidth={2}
                markerEnd="url(#cyan-arrow)"
              />

              <text
                x={chart.left + innerWidth * 0.18}
                y={yForElevation(1015) - 16}
                textAnchor="middle"
              >
                Headrace tunnels
              </text>
              <circle
                cx={chart.left + innerWidth * 0.18}
                cy={yForElevation(1015)}
                r={11}
                stroke="#f8fafc"
                strokeWidth={2}
                fill="transparent"
              />

              <text x={chart.left + innerWidth * 0.3} y={yForElevation(968) - 14} textAnchor="middle">
                Flushing tunnel
              </text>
              <rect
                x={chart.left + innerWidth * 0.18}
                y={yForElevation(968) - 6}
                width={blockWidth * 4}
                height={10}
                fill="rgba(255,255,255,0.12)"
                stroke="rgba(226,232,240,0.8)"
              />
              <line
                x1={chart.left + innerWidth * 0.22}
                y1={yForElevation(968) + 12}
                x2={chart.left + innerWidth * 0.22}
                y2={yForElevation(950)}
                stroke="#67e8f9"
                strokeWidth={2}
                markerEnd="url(#cyan-arrow)"
              />

              <text x={chart.left + innerWidth * 0.88} y={yForElevation(952) - 20} textAnchor="start">
                Access tunnel
              </text>
              <text x={chart.left + innerWidth * 0.88} y={yForElevation(952) - 6} textAnchor="start">
                to gate chamber
              </text>
              <circle
                cx={chart.left + innerWidth * 0.86}
                cy={yForElevation(952)}
                r={9}
                stroke="#67e8f9"
                strokeWidth={2}
                fill="transparent"
              />
              <line
                x1={chart.left + innerWidth * 0.86}
                y1={yForElevation(952)}
                x2={chart.left + innerWidth * 0.92}
                y2={yForElevation(970)}
                stroke="#67e8f9"
                strokeWidth={2}
                markerEnd="url(#cyan-arrow)"
              />
            </g>

            <text
              x={chart.left + innerWidth * 0.4}
              y={yForElevation(1170) - 30}
              fontSize="12"
              fill="#fde047"
              fontWeight="600"
              textAnchor="middle"
            >
              OGEE CREST PROFILE
            </text>
          </svg>
        </div>
      </div>
    </div>
  )
}

export default RccDam2DIso
