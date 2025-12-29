import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import ReactFlow, {
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  type ReactFlowInstance,
  type Edge,
  type Node,
  type NodeChange,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { type ScmProcessCanvasResponse } from '../../api'
import { buildFlowGraph } from './ScmInsightToolkit'

type FlowHighlight = 'demand' | 'procurement' | 'logistics' | 'inventory'

type Props = {
  canvas: ScmProcessCanvasResponse | null
  highlight?: FlowHighlight | null
  height?: number | string
}

export function ScmFlowOverview({ canvas, highlight = null, height }: Props) {
  const seed = useMemo(() => {
    if (!canvas) return null
    return buildFlowGraph(canvas, highlight ?? 'demand')
  }, [canvas, highlight])

  const [nodes, setNodes] = useState<Node[]>(() => (seed ? seed.nodes : []))
  const [edges, setEdges] = useState<Edge[]>(() => (seed ? seed.edges : []))
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null)
  const nodePositionsRef = useRef<Record<string, { x: number; y: number }>>({})

  useEffect(() => {
    if (!seed) {
      setNodes([])
      setEdges([])
      nodePositionsRef.current = {}
      return
    }
    const restoredNodes = seed.nodes.map((node) => {
      const stored = nodePositionsRef.current[node.id]
      return stored ? { ...node, position: stored } : node
    })
    setNodes(restoredNodes)
    setEdges(seed.edges)
  }, [seed])

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((prev) => {
      const updated = applyNodeChanges(changes, prev)
      nodePositionsRef.current = updated.reduce<Record<string, { x: number; y: number }>>((acc, node) => {
        acc[node.id] = node.position
        return acc
      }, nodePositionsRef.current)
      return updated
    })
  }, [])

  const handleInit = useCallback((instance: ReactFlowInstance) => {
    setFlowInstance(instance)
    if (!Object.keys(nodePositionsRef.current).length) {
      requestAnimationFrame(() => {
        instance.fitView({ padding: 0.25 })
      })
    }
  }, [])

  useEffect(() => {
    if (!flowInstance) return
    if (!Object.keys(nodePositionsRef.current).length) {
      flowInstance.fitView({ padding: 0.25, duration: 200 })
    }
  }, [flowInstance, seed])

  if (!canvas) {
    return (
      <div className="scm-flow-surface" style={height ? { height } : undefined}>
        <div className="scm-flow-empty">
          <strong>No supply chain canvas available.</strong>
          <span>Select a process or contract with active demand, procurement, and logistics data.</span>
        </div>
      </div>
    )
  }

  if (!seed) {
    return null
  }

  return (
    <div className="scm-flow-surface" style={height ? { height } : undefined}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnScroll={false}
        snapToGrid={false}
        fitView
        fitViewOptions={{ padding: 0.24 }}
        proOptions={{ hideAttribution: true }}
        onNodesChange={handleNodesChange}
        onInit={handleInit}
      >
        <MiniMap pannable zoomable nodeColor={() => '#1e293b'} nodeStrokeColor={() => '#94a3b8'} />
        <Controls showInteractive={false} position="bottom-left" />
        <Background gap={28} color="rgba(148,163,184,0.15)" />
      </ReactFlow>
    </div>
  )
}

export default ScmFlowOverview
