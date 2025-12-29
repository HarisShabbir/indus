import React, { useCallback, useMemo, useState } from 'react'

type LiftStatus = 'completed' | 'in-progress' | 'at-risk' | 'not-started' | 'no-data'

export type RccDam2DProps = {
  initialStatuses?: Record<string, Record<number, LiftStatus>>
}

const BLOCK_LABELS = Array.from({ length: 32 }, (_, index) => String(index + 5).padStart(2, '0'))
const LIFT_LAYERS = [
  { index: 1, bottom: 898, top: 977, label: 'Foundation 898–977', shortLabel: 'Foundation', color: '#374151' },
  { index: 2, bottom: 977, top: 1004.5, label: 'Flushing Tunnel 977–1004.5', shortLabel: 'Flushing Tunnel', color: '#7c5a3a' },
  { index: 3, bottom: 1004.5, top: 1044.5, label: 'DG1004.50–1044.50', shortLabel: 'DG1004.50', color: '#ca8a4c' },
  { index: 4, bottom: 1044.5, top: 1097.5, label: 'DG1044.50–1097.50', shortLabel: 'DG1060.00', color: '#d4a574' },
  { index: 5, bottom: 1097.5, top: 1137.5, label: 'DG1097.50–1137.50', shortLabel: 'DG1097.5', color: '#e6b866' },
  { index: 6, bottom: 1137.5, top: 1175, label: 'Crest 1137.5–1175', shortLabel: 'Crest', color: '#fef08a' },
] as const

const STATUS_META: Record<LiftStatus, { label: string; color: string; description: string }> = {
  completed: { label: 'Completed', color: '#22c55e', description: 'Lift placed and inspected' },
  'in-progress': { label: 'In Progress', color: '#3b82f6', description: 'Concrete placement ongoing' },
  'at-risk': { label: 'At Risk', color: '#f59e0b', description: 'Needs mitigation' },
  'not-started': { label: 'Not Started', color: '#ef4444', description: 'Pending mobilization' },
  'no-data': { label: 'No Data', color: '#6b7280', description: 'Awaiting updates' },
}

const STATUS_LIST: LiftStatus[] = ['completed', 'in-progress', 'at-risk', 'not-started', 'no-data']
const MIN_ELEVATION = LIFT_LAYERS[0].bottom
const MAX_ELEVATION = LIFT_LAYERS[LIFT_LAYERS.length - 1].top
const CHART_DIMENSIONS = { width: 1500, height: 720, left: 160, top: 120, right: 80, bottom: 120 } as const

const buildDefaultStatuses = (): Record<string, Record<number, LiftStatus>> => {
  const dataset: Record<string, Record<number, LiftStatus>> = {}
  BLOCK_LABELS.forEach((blockId, blockIndex) => {
    const progressGradient = blockIndex / (BLOCK_LABELS.length - 1)
    const record: Record<number, LiftStatus> = {}
    LIFT_LAYERS.forEach((layer, layerIndex) => {
      const elevationFactor = layerIndex / (LIFT_LAYERS.length - 1)
      const statusScore = progressGradient * 1.4 - elevationFactor * 0.35
      let status: LiftStatus
      if (statusScore >= 1) {
        status = 'completed'
      } else if (statusScore >= 0.7) {
        status = 'in-progress'
      } else if (statusScore >= 0.45) {
        status = 'at-risk'
      } else if (statusScore >= 0.2) {
        status = 'not-started'
      } else {
        status = 'no-data'
      }
      record[layer.index] = status
    })
    dataset[blockId] = record
  })

  ;[
    { block: '09', lift: 3, status: 'at-risk' },
    { block: '10', lift: 2, status: 'in-progress' },
    { block: '12', lift: 4, status: 'completed' },
    { block: '15', lift: 2, status: 'completed' },
    { block: '17', lift: 3, status: 'in-progress' },
    { block: '19', lift: 1, status: 'at-risk' },
    { block: '20', lift: 2, status: 'completed' },
    { block: '21', lift: 5, status: 'in-progress' },
    { block: '22', lift: 6, status: 'not-started' },
    { block: '23', lift: 2, status: 'at-risk' },
    { block: '24', lift: 3, status: 'in-progress' },
    { block: '26', lift: 4, status: 'at-risk' },
    { block: '27', lift: 1, status: 'not-started' },
    { block: '29', lift: 2, status: 'no-data' },
    { block: '31', lift: 5, status: 'not-started' },
    { block: '33', lift: 2, status: 'in-progress' },
    { block: '35', lift: 4, status: 'at-risk' },
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

export const RccDam2D: React.FC<RccDam2DProps> = ({ initialStatuses }) => {
  const [statusVisibility, setStatusVisibility] = useState<Record<LiftStatus, boolean>>(() => ({ ...INITIAL_VISIBILITY }))

  const normalizedStatuses = useMemo(() => {
    return BLOCK_LABELS.reduce((acc, blockId) => {
      const defaultBlock = DEFAULT_STATUS_DATA[blockId] ?? {}
      const incoming = initialStatuses?.[blockId]
      const record: Record<number, LiftStatus> = {}
      LIFT_LAYERS.forEach((layer) => {
        const custom = isLiftStatus(incoming?.[layer.index]) ? (incoming?.[layer.index] as LiftStatus) : undefined
        record[layer.index] = custom ?? defaultBlock[layer.index] ?? 'no-data'
      })
      acc[blockId] = record
      return acc
    }, {} as Record<string, Record<number, LiftStatus>>)
  }, [initialStatuses])

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
          layer,
          x,
          y: yTop,
          width: blockWidth,
          height: yBottom - yTop,
          status: normalizedStatuses[blockId][layer.index],
        }
      }),
    )
  }, [blockWidth, normalizedStatuses, yForElevation, chart.left])

  const statusCounts = useMemo(() => {
    return blockCells.reduce(
      (acc, cell) => {
        acc[cell.status] += 1
        return acc
      },
      STATUS_LIST.reduce((acc, status) => Object.assign(acc, { [status]: 0 }), {} as Record<LiftStatus, number>),
    )
  }, [blockCells])

  const crestPoints = useMemo(() => {
    return Array.from({ length: BLOCK_LABELS.length + 1 }, (_, index) => {
      const t = index / BLOCK_LABELS.length
      const bankRamp = t < 0.12 ? (0.12 - t) * 110 : t > 0.88 ? (t - 0.88) * 110 : 0
      const crestUndulation = Math.sin((t - 0.5) * Math.PI) * 6
      const crestElevation = 1175 - bankRamp - crestUndulation
      return {
        x: chart.left + index * blockWidth,
        y: yForElevation(crestElevation),
      }
    })
  }, [blockWidth, chart.left, yForElevation])

  const foundationPoints = useMemo(() => {
    return Array.from({ length: BLOCK_LABELS.length + 1 }, (_, index) => {
      const t = index / BLOCK_LABELS.length
      const valley = Math.pow(Math.cos((t - 0.5) * Math.PI), 2)
      const bankLift = Math.pow(Math.abs(t - 0.5) * 2, 1.35) * 160
      const foundationElevation = 898 + bankLift + valley * 22
      return {
        x: chart.left + index * blockWidth,
        y: yForElevation(foundationElevation),
      }
    })
  }, [blockWidth, chart.left, yForElevation])

  const damOutlinePath = useMemo(() => {
    if (!crestPoints.length || !foundationPoints.length) return ''
    const crestSegment = crestPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
    const foundationSegment = foundationPoints
      .slice()
      .reverse()
      .map((point) => `L ${point.x} ${point.y}`)
      .join(' ')
    return `${crestSegment} ${foundationSegment} Z`
  }, [crestPoints, foundationPoints])

  const clipPathId = useMemo(() => `damShape-${Math.random().toString(36).slice(2, 9)}`, [])

  const toggleStatus = (status: LiftStatus) => {
    setStatusVisibility((prev) => ({ ...prev, [status]: !prev[status] }))
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/70">
        <div className="border-b border-slate-100 px-6 py-4">
          <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">Construction Overview</p>
          <h2 className="text-xl font-semibold text-slate-900">2D Isometric RCC Gravity Dam</h2>
          <p className="text-sm text-slate-500">Toggle status overlays to study the live progress of each lift across all 32 blocks.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 px-6 py-5 text-sm text-slate-600 sm:grid-cols-3 lg:grid-cols-5">
          {STATUS_LIST.map((status) => (
            <label
              key={status}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 shadow-sm transition hover:border-slate-300 ${
                statusVisibility[status] ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-80'
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
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: STATUS_META[status].color }}
                    aria-hidden
                  />
                  {STATUS_META[status].label}
                </span>
                <span className="text-xs text-slate-500">{STATUS_META[status].description}</span>
              </span>
              <span className="text-xs font-semibold text-slate-400">{statusCounts[status]}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-4 shadow-2xl shadow-slate-900/60">
        <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-4">
          <svg
            viewBox={`0 0 ${chart.width} ${chart.height}`}
            role="img"
            aria-labelledby="dam2dTitle dam2dDesc"
            className="h-full w-full"
          >
            <title id="dam2dTitle">RCC gravity dam 2D construction dashboard</title>
            <desc id="dam2dDesc">
              Cross-section of a 32 block dam from block 05 to 36 showing lift layers, outlets, tunnels, and construction statuses.
            </desc>
            <defs>
              <clipPath id={clipPathId}>
                <path d={damOutlinePath} />
              </clipPath>
              <linearGradient id="damGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#f8fafc" stopOpacity="0.08" />
                <stop offset="50%" stopColor="#93c5fd" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#075985" stopOpacity="0.12" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width={chart.width} height={chart.height} fill="#020617" />

            <g clipPath={`url(#${clipPathId})`}>
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
                    opacity={0.28}
                  />
                )
              })}
              {LIFT_LAYERS.map((layer) => (
                <line
                  key={`${layer.index}-divider`}
                  x1={chart.left}
                  x2={chart.left + innerWidth}
                  y1={yForElevation(layer.bottom)}
                  y2={yForElevation(layer.bottom)}
                  stroke="rgba(255,255,255,0.15)"
                  strokeDasharray="4 8"
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
                    strokeDasharray="2 10"
                  />
                )
              })}
              {blockCells.map((cell) => {
                const statusColor = STATUS_META[cell.status].color
                const visible = statusVisibility[cell.status]
                return (
                  <g key={cell.id}>
                    <rect
                      x={cell.x + 2}
                      y={cell.y + 2}
                      width={cell.width - 4}
                      height={cell.height - 4}
                      fill={statusColor}
                      opacity={visible ? 0.82 : 0}
                      className="transition-opacity duration-300 ease-in-out hover:opacity-100"
                    >
                      <title>
                        Block {cell.blockId}, Lift {cell.liftIndex} · {STATUS_META[cell.status].label}
                      </title>
                    </rect>
                  </g>
                )
              })}
            </g>

            <path d={damOutlinePath} fill="none" stroke="rgba(148,163,184,0.8)" strokeWidth={3} />
            <path d={damOutlinePath} fill="url(#damGradient)" opacity={0.08} />

            <g fontFamily="Inter, sans-serif" fontSize="12" textAnchor="middle" fill="#f8fafc">
              {BLOCK_LABELS.map((blockId, index) => {
                const x = chart.left + index * blockWidth + blockWidth / 2
                return (
                  <text key={blockId} x={x} y={chart.top - 18} className="tracking-wide">
                    {blockId}
                  </text>
                )
              })}
              <text x={chart.left + 40} y={chart.top - 42} textAnchor="start" fontSize="16" fontWeight="600">
                Left Bank
              </text>
              <text x={chart.left + innerWidth - 40} y={chart.top - 42} textAnchor="end" fontSize="16" fontWeight="600">
                Right Bank
              </text>
            </g>

            <text
              x={chart.left + innerWidth / 2}
              y={yForElevation(1175) - 20}
              textAnchor="middle"
              fontSize="18"
              fontWeight="700"
              fill="#fef9c3"
            >
              Dam Crest 1175.00
            </text>

            {LIFT_LAYERS.map((layer) => {
              const y = (yForElevation(layer.top) + yForElevation(layer.bottom)) / 2
              return (
                <text
                  key={`label-${layer.index}`}
                  x={chart.left - 20}
                  y={y}
                  textAnchor="end"
                  fontSize="12"
                  fill="#cbd5f5"
                >
                  {layer.shortLabel}
                </text>
              )
            })}

            {[977, 1004.5, 1044.5, 1060, 1097.5, 1137.5].map((elevation) => (
              <g key={`tick-${elevation}`}>
                <line
                  x1={chart.left - 8}
                  x2={chart.left - 2}
                  y1={yForElevation(elevation)}
                  y2={yForElevation(elevation)}
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                />
                <text x={chart.left - 12} y={yForElevation(elevation) - 4} textAnchor="end" fontSize="10" fill="#94a3b8">
                  {elevation.toFixed(2)}
                </text>
              </g>
            ))}
            <text x={chart.left - 12} y={yForElevation(898) + 12} textAnchor="end" fontSize="12" fill="#f8fafc">
              898.00 Foundation
            </text>

            <g>
              <rect
                x={chart.left + innerWidth * 0.52}
                y={yForElevation(1025)}
                width={blockWidth * 5}
                height={18}
                fill="rgba(59,130,246,0.25)"
                stroke="rgba(59,130,246,0.6)"
                rx={3}
              />
              <text
                x={chart.left + innerWidth * 0.52 + blockWidth * 2.5}
                y={yForElevation(1025) - 10}
                textAnchor="middle"
                fontSize="12"
                fill="#bae6fd"
              >
                8.5×11m Outlets
              </text>
            </g>

            <g>
              <rect
                x={chart.left + innerWidth * 0.12}
                y={yForElevation(970)}
                width={blockWidth * 3}
                height={12}
                fill="rgba(124,90,58,0.5)"
                stroke="rgba(124,90,58,0.8)"
                rx={3}
              />
              <text
                x={chart.left + innerWidth * 0.12 + blockWidth * 1.5}
                y={yForElevation(970) - 8}
                textAnchor="middle"
                fontSize="12"
                fill="#fde68a"
              >
                Flushing Tunnel
              </text>
            </g>

            <g>
              <circle
                cx={chart.left + innerWidth * 0.18}
                cy={yForElevation(1016)}
                r={10}
                stroke="#e0f2fe"
                strokeWidth={2}
                fill="transparent"
              />
              <text x={chart.left + innerWidth * 0.18} y={yForElevation(1016) - 16} textAnchor="middle" fontSize="11" fill="#f8fafc">
                Headrace Tunnel
              </text>
            </g>

            <g>
              <circle
                cx={chart.left + innerWidth * 0.85}
                cy={yForElevation(955)}
                r={9}
                stroke="#bae6fd"
                strokeWidth={2}
                fill="transparent"
              />
              <text x={chart.left + innerWidth * 0.85} y={yForElevation(955) - 14} textAnchor="middle" fontSize="11" fill="#f0f9ff">
                Access Tunnel
              </text>
              <text x={chart.left + innerWidth * 0.85} y={yForElevation(955) - 2} textAnchor="middle" fontSize="10" fill="#e0f2fe">
                Gate Chamber
              </text>
            </g>
          </svg>
        </div>
      </div>
    </div>
  )
}

export default RccDam2D
