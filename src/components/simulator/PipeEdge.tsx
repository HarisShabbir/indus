import { memo } from 'react'
import type { EdgeProps } from 'reactflow'
import { getSmoothStepPath } from 'reactflow'

type PipeEdgeData = {
  intent?: 'clear' | 'alarm' | 'downstream'
}

const statusColors: Record<string, string> = {
  alarm: '#ef4444',
  downstream: '#f97316',
  clear: '#22d3ee',
}

function PipeEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<PipeEdgeData>) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  })
  const intent = data?.intent ?? 'clear'
  const stroke = statusColors[intent] ?? statusColors.clear
  const markerId = `${id}-marker`

  return (
    <g className={`pipe-edge ${intent}`}>
      <defs>
        <marker id={markerId} markerWidth="12" markerHeight="12" viewBox="0 0 12 12" refX="10" refY="6" orient="auto">
          <path d="M0,0 L12,6 L0,12 z" fill={stroke} />
        </marker>
      </defs>
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={6}
        strokeDasharray="12 10"
        strokeLinecap="round"
        opacity={0.95}
        markerEnd={`url(#${markerId})`}
      />
    </g>
  )
}

export default memo(PipeEdge)
