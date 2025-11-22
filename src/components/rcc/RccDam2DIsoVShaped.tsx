import React, { useCallback, useMemo, useState } from 'react'

type LiftStatus = 'completed' | 'in-progress' | 'at-risk' | 'not-started' | 'no-data'

export type RccDam2DIsoVShapedProps = {
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
const CHART_DIMENSIONS = { width: 1680, height: 780, left: 180, top: 150, right: 120, bottom: 160 } as const

const RIGHT_PROFILE_FACTORS = [
  { elevation: 1175, factor: 1.08 },
  { elevation: 1167.3, factor: 1.03 },
  { elevation: 1162.8, factor: 1.0 },
  { elevation: 1155, factor: 0.97 },
  { elevation: 1130, factor: 0.93 },
  { elevation: 1110, factor: 0.88 },
  { elevation: 1060, factor: 0.8 },
  { elevation: 1025, factor: 0.74 },
  { elevation: 1020, factor: 0.71 },
  { elevation: 975.8, factor: 0.66 },
  { elevation: 974, factor: 0.64 },
  { elevation: 960, factor: 0.61 },
  { elevation: 958, factor: 0.6 },
  { elevation: 951, factor: 0.58 },
  { elevation: 948, factor: 0.57 },
  { elevation: 930, factor: 0.55 },
  { elevation: 910, factor: 0.535 },
  { elevation: 898, factor: 0.52 },
] as const

const LEFT_PROFILE_FACTORS = [
  { elevation: 898, factor: 0.48 },
  { elevation: 920, factor: 0.42 },
  { elevation: 960, factor: 0.34 },
  { elevation: 977, factor: 0.3 },
  { elevation: 1004.5, factor: 0.25 },
  { elevation: 1060, factor: 0.2 },
  { elevation: 1097.5, factor: 0.16 },
  { elevation: 1137.5, factor: 0.1 },
  { elevation: 1160.3, factor: 0.04 },
  { elevation: 1167.3, factor: 0.0 },
  { elevation: 1175, factor: -0.08 },
] as const

const createDefaultStatuses = (): Record<string, Record<number, LiftStatus>> => {
  const dataset: Record<string, Record<number, LiftStatus>> = {}
  BLOCK_LABELS.forEach((blockId, blockIndex) => {
    const gradient = blockIndex / (BLOCK_LABELS.length - 1)
    const blockRecord: Record<number, LiftStatus> = {}
    LIFT_LAYERS.forEach((layer, liftIndex) => {
      const value = gradient - liftIndex * 0.08
      let status: LiftStatus
      if (value > 0.7) status = 'completed'
      else if (value > 0.4) status = 'in-progress'
      else if (value > 0.1) status = 'at-risk'
      else if (value > -0.1) status = 'not-started'
      else status = 'no-data'
      blockRecord[layer.index] = status
    })
    dataset[blockId] = blockRecord
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

const DEFAULT_STATUS_DATA = createDefaultStatuses()
const INITIAL_VISIBILITY = STATUS_LIST.reduce(
  (acc, status) => Object.assign(acc, { [status]: true }),
  {} as Record<LiftStatus, boolean>,
)

const isLiftStatus = (value?: string | null): value is LiftStatus => (value ? STATUS_LIST.includes(value as LiftStatus) : false)

export const RccDam2DIsoVShaped: React.FC<RccDam2DIsoVShapedProps> = ({ initialStatuses }) => {
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
      const incoming = initialStatuses?.[blockId]
      const defaultBlock = DEFAULT_STATUS_DATA[blockId] ?? {}
      const record: Record<number, LiftStatus> = {}
      LIFT_LAYERS.forEach((layer) => {
        const custom = incoming?.[layer.index]
        record[layer.index] = isLiftStatus(custom) ? custom : defaultBlock[layer.index] ?? 'no-data'
      })
      acc[blockId] = record
      return acc
    }, {} as Record<string, Record<number, LiftStatus>>)
  }, [initialStatuses])

  const xForFactor = useCallback((factor: number) => chart.left + innerWidth * factor, [chart.left, innerWidth])

  const damOutlinePath = useMemo(() => {
    const commands: string[] = []
    const leftCrest = LEFT_PROFILE_FACTORS[LEFT_PROFILE_FACTORS.length - 1]
    commands.push(`M ${xForFactor(leftCrest.factor)} ${yForElevation(leftCrest.elevation)}`)
    commands.push(`L ${xForFactor(RIGHT_PROFILE_FACTORS[0].factor)} ${yForElevation(RIGHT_PROFILE_FACTORS[0].elevation)}`)
    RIGHT_PROFILE_FACTORS.slice(1).forEach((step) => {
      commands.push(`L ${xForFactor(step.factor)} ${yForElevation(step.elevation)}`)
    })
    const baseNoise = [
      { factor: 0.5, elevation: 894 },
      { factor: 0.48, elevation: 898 },
    ]
    baseNoise.forEach((point) => commands.push(`L ${xForFactor(point.factor)} ${yForElevation(point.elevation)}`))
    LEFT_PROFILE_FACTORS.slice(0, -1)
      .slice()
      .reverse()
      .forEach((step) => {
        commands.push(`L ${xForFactor(step.factor)} ${yForElevation(step.elevation)}`)
      })
    commands.push('Z')
    return commands.join(' ')
  }, [xForFactor, yForElevation])

  const rockyEdgePath = useMemo(() => {
    const segments = LEFT_PROFILE_FACTORS.map((step, index) => {
      const jitter = (index % 2 === 0 ? -6 : 6) + (index % 3 === 0 ? 4 : -3)
      const x = xForFactor(step.factor) + jitter
      const y = yForElevation(step.elevation) + (index % 2 === 0 ? 4 : -2)
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    return segments.join(' ')
  }, [xForFactor, yForElevation])

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
  }, [blockWidth, chart.left, normalizedStatuses, yForElevation])

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
    const samples = [
      { factor: 0.08, elevation: 1160.3 },
      { factor: 0.25, elevation: 1162.8 },
      { factor: 0.4, elevation: 1165 },
      { factor: 0.55, elevation: 1167.3 },
      { factor: 0.73, elevation: 1168.5 },
      { factor: 0.9, elevation: 1170 },
    ]
    return samples
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xForFactor(point.factor)} ${yForElevation(point.elevation)}`)
      .join(' ')
  }, [xForFactor, yForElevation])

  const toggleStatus = (status: LiftStatus) => {
    setStatusVisibility((prev) => ({ ...prev, [status]: !prev[status] }))
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
        <div className="border-b border-slate-100 px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">RCC gravity dam</p>
          <h2 className="text-2xl font-semibold text-slate-900">V-Shaped Isometric Cross-Section</h2>
          <p className="text-sm text-slate-500">Authentic dam geometry with live block-by-block lift status overlays.</p>
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
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">({statusCounts[status]})</span>
            </label>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-[32px] border border-slate-800 bg-gradient-to-b from-slate-900 via-slate-950 to-black p-4 shadow-2xl shadow-slate-900/70">
        <div className="rounded-[28px] border border-white/5 bg-slate-900/70 p-4">
          <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-labelledby="rccDamTitle rccDamDesc" className="h-full w-full">
            <title id="rccDamTitle">RCC Dam Construction Dashboard</title>
            <desc id="rccDamDesc">
              Visualization of a rough-edged, V-shaped RCC gravity dam cross-section showing block grid, lifts, tunnels, and construction statuses.
            </desc>
            <defs>
              <clipPath id="dam-clip">
                <path d={damOutlinePath} />
              </clipPath>
              <marker id="cyan-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0 0 L6 3 L0 6 z" fill="#67e8f9" />
              </marker>
            </defs>
            <rect x={0} y={0} width={chart.width} height={chart.height} fill="#020617" />

            <g clipPath="url(#dam-clip)">
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
                const visible = statusVisibility[cell.status]
                return (
                  <rect
                    key={cell.id}
                    x={cell.x + 2}
                    y={cell.y + 2}
                    width={cell.width - 4}
                    height={cell.height - 4}
                    fill={STATUS_META[cell.status].color}
                    opacity={visible ? 0.86 : 0}
                    className="transition-opacity duration-300 ease-in-out hover:opacity-100"
                  >
                    <title>
                      Block {cell.blockId} · Lift {cell.liftIndex} · {STATUS_META[cell.status].label}
                    </title>
                  </rect>
                )
              })}
            </g>

            <path d={damOutlinePath} fill="none" stroke="rgba(226,232,240,0.7)" strokeWidth={3.5} />
            <path d={rockyEdgePath} fill="none" stroke="#cbd5f5" strokeWidth={1.2} strokeDasharray="4 6" />
            <path d={ogeeProfile} stroke="#fde047" strokeWidth={2} strokeDasharray="8 6" fill="none" />

            <g fontFamily="Inter, sans-serif" fontSize="13" fill="#0f172a">
              {BLOCK_LABELS.map((blockId, index) => {
                const x = chart.left + index * blockWidth + blockWidth / 2
                const boxWidth = blockWidth * 0.75
                const boxHeight = 22
                const boxX = x - boxWidth / 2
                const boxY = chart.top - 70
                return (
                  <g key={blockId}>
                    <rect x={boxX} y={boxY} width={boxWidth} height={boxHeight} fill="#fff" stroke="#cbd5f5" rx={4} />
                    <text x={x} y={boxY + 15} textAnchor="middle" fontWeight="600">
                      {blockId}
                    </text>
                  </g>
                )
              })}
            </g>

            <text x={chart.left - 60} y={chart.top - 90} fontSize="16" fill="#f8fafc" fontWeight="600">
              Left Bank
            </text>
            <text x={chart.left + innerWidth + 60} y={chart.top - 90} fontSize="16" fill="#f8fafc" fontWeight="600" textAnchor="end">
              Right Bank
            </text>

            <text
              x={chart.left + innerWidth + 70}
              y={yForElevation(1175) - 12}
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

            {[898, 977, 1004.5, 1060, 1097.5, 1137.5, 1167.3, 1162.8, 1160.3, 1155, 1175].map((elevation) => (
              <g key={`left-${elevation}`}>
                <line
                  x1={chart.left - 18}
                  x2={chart.left - 8}
                  y1={yForElevation(elevation)}
                  y2={yForElevation(elevation)}
                  stroke="#94a3b8"
                />
                <text x={chart.left - 22} y={yForElevation(elevation) - 4} textAnchor="end" fill="#cbd5f5" fontSize="11">
                  {elevation.toFixed(2)}
                </text>
              </g>
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
              <g key={ref.label}>
                <line
                  x1={chart.left + innerWidth + 8}
                  x2={chart.left + innerWidth + 18}
                  y1={yForElevation(ref.elevation)}
                  y2={yForElevation(ref.elevation)}
                  stroke="#94a3b8"
                />
                <text
                  x={chart.left + innerWidth + 22}
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
              <text x={xForFactor(0.55)} y={yForElevation(1036)} textAnchor="middle">
                8.5×11m Outlets
              </text>
              <rect
                x={xForFactor(0.47)}
                y={yForElevation(1030)}
                width={blockWidth * 5.8}
                height={12}
                fill="rgba(255,255,255,0.1)"
                stroke="rgba(226,232,240,0.8)"
              />
              <line
                x1={xForFactor(0.62)}
                y1={yForElevation(1030)}
                x2={xForFactor(0.77)}
                y2={yForElevation(1010)}
                stroke="#67e8f9"
                strokeWidth={2}
                markerEnd="url(#cyan-arrow)"
              />

              <text x={xForFactor(0.6)} y={yForElevation(990)} textAnchor="middle">
                8.5×9m Outlets
              </text>
              <rect
                x={xForFactor(0.54)}
                y={yForElevation(985)}
                width={blockWidth * 3.6}
                height={12}
                fill="rgba(255,255,255,0.1)"
                stroke="rgba(226,232,240,0.8)"
              />
              <line
                x1={xForFactor(0.64)}
                y1={yForElevation(985)}
                x2={xForFactor(0.8)}
                y2={yForElevation(965)}
                stroke="#67e8f9"
                strokeWidth={2}
                markerEnd="url(#cyan-arrow)"
              />

              <text x={xForFactor(0.2)} y={yForElevation(1015) - 16} textAnchor="middle">
                Headrace tunnels
              </text>
              <circle
                cx={xForFactor(0.2)}
                cy={yForElevation(1015)}
                r={11}
                stroke="#f8fafc"
                strokeWidth={2}
                fill="transparent"
              />

              <text x={xForFactor(0.28)} y={yForElevation(968) - 14} textAnchor="middle">
                Flushing tunnel
              </text>
              <rect
                x={xForFactor(0.17)}
                y={yForElevation(968) - 6}
                width={blockWidth * 4.2}
                height={10}
                fill="#7c5a3a"
                stroke="rgba(124,90,58,0.8)"
              />

              <line
                x1={xForFactor(0.22)}
                y1={yForElevation(968) + 10}
                x2={xForFactor(0.22)}
                y2={yForElevation(948)}
                stroke="#67e8f9"
                strokeWidth={2}
                markerEnd="url(#cyan-arrow)"
              />

              <text x={xForFactor(0.88)} y={yForElevation(952) - 20} textAnchor="start">
                Access tunnel
              </text>
              <text x={xForFactor(0.88)} y={yForElevation(952) - 6} textAnchor="start">
                to gate chamber
              </text>
              <circle
                cx={xForFactor(0.86)}
                cy={yForElevation(952)}
                r={9}
                stroke="#67e8f9"
                strokeWidth={2}
                fill="transparent"
              />
              <line
                x1={xForFactor(0.86)}
                y1={yForElevation(952)}
                x2={xForFactor(0.92)}
                y2={yForElevation(970)}
                stroke="#67e8f9"
                strokeWidth={2}
                markerEnd="url(#cyan-arrow)"
              />
            </g>

            <text
              x={xForFactor(0.45)}
              y={yForElevation(1169) - 30}
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

export default RccDam2DIsoVShaped
