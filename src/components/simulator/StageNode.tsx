import { memo } from 'react'
import type { NodeProps } from 'reactflow'
import { Handle, Position } from 'reactflow'
import { motion } from 'framer-motion'
import { MessageCircle } from 'lucide-react'
import type { StageTelemetry } from '../../../types/simulator'

type StageNodeData = {
  telemetry: StageTelemetry
  stageId?: string
  onOpenCollaborator?: (stageId: string) => void
  highlighted?: boolean
}

const intentClass: Record<StageTelemetry['status'], string> = {
  idle: 'idle',
  active: 'active',
  blocked: 'blocked',
}

function StageNode({ data }: NodeProps<StageNodeData>) {
  const telemetry = data.telemetry
  const highlight = data.highlighted ?? false
  const canCollaborate = typeof data.onOpenCollaborator === 'function' && data.stageId
  return (
    <motion.article
      layout
      className={`sim-node ${intentClass[telemetry.status]} ${highlight ? 'focused' : ''}`}
      initial={{ opacity: 0.6, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <Handle type="target" position={Position.Left} className="node-handle" />
      <header>
        <span className="node-label">{telemetry.label}</span>
        <span className={`node-status ${telemetry.status}`}>{telemetry.status === 'blocked' ? 'ALARM' : 'LIVE'}</span>
        {canCollaborate ? (
          <button type="button" className="node-collab" onClick={() => data.onOpenCollaborator?.(data.stageId!)} aria-label={`Open collaborator for ${telemetry.label}`}>
            <MessageCircle size={14} />
          </button>
        ) : null}
      </header>
      <div className="node-metrics">
        {telemetry.metrics.map((metric) => (
          <div key={metric.name} className={`metric ${metric.intent}`}>
            <span>{metric.name}</span>
            <strong>
              {metric.value}
              {metric.unit ? <small>{metric.unit}</small> : null}
            </strong>
          </div>
        ))}
      </div>
      <motion.div
        className="node-glow"
        animate={{ opacity: telemetry.status === 'blocked' ? [0.6, 1, 0.6] : highlight ? [0.5, 0.9, 0.5] : [0.2, 0.6, 0.2] }}
        transition={{ repeat: Infinity, duration: telemetry.status === 'blocked' ? 0.8 : highlight ? 0.9 : 1.6 }}
      />
      <Handle type="source" position={Position.Right} className="node-handle" />
    </motion.article>
  )
}

export default memo(StageNode)
