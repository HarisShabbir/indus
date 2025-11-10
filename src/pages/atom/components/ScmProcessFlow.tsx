import React, { useEffect, useMemo, useState, useCallback } from 'react'
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  Position,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from 'reactflow'
import 'reactflow/dist/style.css'
import maplibregl, { Map } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import type { Alert, ChangeRequest, ScmProcessCanvasResponse, ScmProcessStageResponse, ScmStageNode, ScmStageResource } from '../../../api'

type StageId = 'design' | 'off_site' | 'logistics' | 'on_site'

const laneWidth = 320
const laneSpacing = 120
const resourceHeight = 110

type StageCardData = {
  stage: ScmStageNode
}

type ResourceCardData = {
  stageId: StageId
  resource: ScmStageResource
}

type StageNodeProps = NodeProps<StageCardData>
type ResourceNodeProps = NodeProps<ResourceCardData>

const stagePalette: Record<string, { base: string; accent: string }> = {
  design: { base: 'rgba(59,130,246,0.16)', accent: 'rgba(59,130,246,0.45)' },
  off_site: { base: 'rgba(14,165,233,0.16)', accent: 'rgba(14,165,233,0.45)' },
  logistics: { base: 'rgba(249,115,22,0.16)', accent: 'rgba(249,115,22,0.45)' },
  on_site: { base: 'rgba(34,197,94,0.16)', accent: 'rgba(34,197,94,0.45)' },
}

const stageOrder: StageId[] = ['design', 'off_site', 'logistics', 'on_site']

const StageLaneNode: React.FC<StageNodeProps> = ({ data }) => {
  const palette = stagePalette[data.stage.id] ?? stagePalette.design
  return (
    <div
      className={`scm-stage-node status-${data.stage.status}`}
      style={{
        width: laneWidth,
        borderColor: palette.accent,
        background: `linear-gradient(145deg, ${palette.base}, rgba(15,23,42,0.92))`,
      }}
    >
      <header>
        <h3>{data.stage.title}</h3>
        <span>{data.stage.status.replace(/_/g, ' ').toUpperCase()}</span>
      </header>
      <dl>
        <div>
          <dt>Required</dt>
          <dd>{data.stage.requiredTotal.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Committed</dt>
          <dd>{data.stage.committedTotal.toLocaleString()}</dd>
        </div>
        <div>
          <dt>In transit</dt>
          <dd>{data.stage.inTransitTotal.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Available</dt>
          <dd>{data.stage.availableTotal.toLocaleString()}</dd>
        </div>
      </dl>
    </div>
  )
}

const ResourceNode: React.FC<ResourceNodeProps> = ({ data }) => {
  const palette = stagePalette[data.stageId] ?? stagePalette.design
  return (
    <div className={`scm-resource-card kind-${data.resource.kind}`} style={{ borderColor: palette.accent }}>
      <header>
        <span>{data.resource.kind.toUpperCase()}</span>
        <strong>{data.resource.name}</strong>
      </header>
      <div className="scm-resource-card__metrics">
        <span>
          Required
          <strong>{data.resource.required.toLocaleString()}</strong>
        </span>
        <span>
          Allocated
          <strong>{data.resource.committed.toLocaleString()}</strong>
        </span>
        <span>
          Transit
          <strong>{data.resource.inTransit.toLocaleString()}</strong>
        </span>
      </div>
      {data.resource.metadata?.location ? <footer>{String(data.resource.metadata.location)}</footer> : null}
    </div>
  )
}

const nodeTypes = {
  stageLane: StageLaneNode,
  resourceCard: ResourceNode,
}

type LogisticsMapModalProps = {
  shipment: ScmStageResource
  onClose: () => void
}

const locationLookup: Record<string, [number, number]> = {
  'Port Qasim': [66.9706, 24.7903],
  'Karachi Rail Hub': [67.0676, 24.8615],
  'Dam Site Laydown': [74.475, 35.713],
  'Precast Yard': [73.0605, 33.6844],
  'Dam Site Precast Zone': [74.4905, 35.707],
}

const LogisticsMapModal: React.FC<LogisticsMapModalProps> = ({ shipment, onClose }) => {
  const modalRef = React.useRef<HTMLDivElement | null>(null)
  const mapRef = React.useRef<Map | null>(null)

  useEffect(() => {
    if (!modalRef.current) return
    const center = locationLookup[shipment.metadata?.origin as string] || locationLookup[shipment.metadata?.destination as string] || [74.4, 35.7]
    const map = new maplibregl.Map({
      container: modalRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center,
      zoom: 5,
    })
    mapRef.current = map

    const addMarker = (label?: string | null, coords?: [number, number]) => {
      if (!label || !coords) return
      new maplibregl.Marker({ color: '#3b82f6' })
        .setLngLat(coords)
        .setPopup(new maplibregl.Popup().setHTML(`<strong>${label}</strong>`))
        .addTo(map)
    }

    if (shipment.metadata?.origin) {
      addMarker(String(shipment.metadata.origin), locationLookup[String(shipment.metadata.origin)] ?? undefined)
    }
    if (shipment.metadata?.destination) {
      addMarker(String(shipment.metadata.destination), locationLookup[String(shipment.metadata.destination)] ?? undefined)
    }

    return () => {
      map.remove()
    }
  }, [shipment])

  return (
    <div className="scm-map-modal">
      <div className="scm-map-modal__header">
        <div>
          <h3>Logistics tracker</h3>
          <p>{shipment.name}</p>
        </div>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="scm-map-modal__map" ref={modalRef} />
      <div className="scm-map-modal__meta">
        <div>
          <span>Status</span>
          <strong>{shipment.status.toUpperCase()}</strong>
        </div>
        {shipment.eta ? (
          <div>
            <span>ETA</span>
            <strong>{new Date(shipment.eta).toLocaleString(undefined, { dateStyle: 'medium' })}</strong>
          </div>
        ) : null}
        {shipment.metadata?.origin ? (
          <div>
            <span>Origin</span>
            <strong>{String(shipment.metadata.origin)}</strong>
          </div>
        ) : null}
        {shipment.metadata?.destination ? (
          <div>
            <span>Destination</span>
            <strong>{String(shipment.metadata.destination)}</strong>
          </div>
        ) : null}
      </div>
    </div>
  )
}

type ProcessFlowProps = {
  stageSummary: ScmProcessStageResponse | null
  loading: boolean
  error?: string | null
  alerts: Alert[]
  changeRequests: ChangeRequest[]
  canvas?: ScmProcessCanvasResponse | null
  onStageChange: (resourceId: string, stageId: StageId) => Promise<void>
  onRefresh: () => void
}

const ScmProcessFlowCanvas: React.FC<ProcessFlowProps> = ({
  stageSummary,
  loading,
  error,
  alerts,
  changeRequests,
  canvas,
  onStageChange,
  onRefresh,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedStage, setSelectedStage] = useState<ScmStageNode | null>(null)
  const [selectedResource, setSelectedResource] = useState<ScmStageResource | null>(null)
  const [mapShipment, setMapShipment] = useState<ScmStageResource | null>(null)

  const stageBoundaries = useMemo(() => {
    if (!stageSummary) return []
    return stageSummary.stages.map((stage, idx) => ({
      stageId: stage.id as StageId,
      minX: idx * (laneWidth + laneSpacing) - 20,
      maxX: idx * (laneWidth + laneSpacing) + laneWidth + 20,
    }))
  }, [stageSummary])

  const buildGraph = useCallback((): { nodes: Node[]; edges: Edge[] } => {
    if (!stageSummary) return { nodes: [], edges: [] }
    const builtNodes: Node[] = []
    const builtEdges: Edge[] = []

    stageSummary.stages.forEach((stage, idx) => {
      const positionX = idx * (laneWidth + laneSpacing)
      builtNodes.push({
        id: `stage-${stage.id}`,
        type: 'stageLane',
        position: { x: positionX, y: 0 },
        data: { stage },
        draggable: false,
        selectable: false,
      })

      stage.resources.forEach((resource, resourceIndex) => {
        builtNodes.push({
          id: `resource-${resource.id}`,
          type: 'resourceCard',
          position: {
            x: positionX,
            y: 180 + resourceIndex * resourceHeight,
          },
          data: {
            stageId: stage.id as StageId,
            resource,
          },
          draggable: true,
        })
      })

      if (idx < stageSummary.stages.length - 1) {
        const nextStage = stageSummary.stages[idx + 1]
        builtEdges.push({
          id: `edge-${stage.id}-${nextStage.id}`,
          source: `stage-${stage.id}`,
          target: `stage-${nextStage.id}`,
          type: 'smoothstep',
          animated: true,
          markerEnd: {
            type: 'arrowclosed',
          },
        })
      }
    })

    return { nodes: builtNodes, edges: builtEdges }
  }, [stageSummary])

  useEffect(() => {
    if (!stageSummary) {
      setNodes([])
      setEdges([])
      return
    }
    const graph = buildGraph()
    setNodes(graph.nodes)
    setEdges(graph.edges)
  }, [buildGraph, setEdges, setNodes, stageSummary])

  const determineStageFromPosition = (x: number): StageId | null => {
    const boundary = stageBoundaries.find((entry) => x >= entry.minX && x <= entry.maxX)
    return boundary ? boundary.stageId : null
  }

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<ResourceCardData | StageCardData>) => {
      if (node.type === 'resourceCard') {
        setSelectedResource(node.data.resource)
        const stageEntry = stageSummary?.stages.find((stage) => stage.id === node.data.stageId)
        if (stageEntry) {
          setSelectedStage(stageEntry)
        }
      } else if (node.type === 'stageLane') {
        setSelectedStage(node.data.stage)
        setSelectedResource(null)
      }
    },
    [stageSummary],
  )

  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node<ResourceCardData | StageCardData>) => {
      if (node.type === 'resourceCard' && node.data.resource.kind === 'shipment') {
        setMapShipment(node.data.resource)
      }
    },
    [],
  )

  const handleDragStop = useCallback(
    async (_: React.MouseEvent, node: Node<ResourceCardData | StageCardData>) => {
      if (node.type !== 'resourceCard') return
      const targetStage = determineStageFromPosition(node.position.x)
      if (!targetStage || targetStage === node.data.stageId) {
        onRefresh()
        return
      }
      await onStageChange(node.data.resource.resourceId, targetStage)
    },
    [determineStageFromPosition, onRefresh, onStageChange],
  )

  const relatedAlerts = useMemo(() => {
    if (!selectedResource) return []
    return alerts.filter((alert) => {
      const metadata = alert.metadata as Record<string, unknown> | undefined
      const resourceId = metadata?.resourceId
      const itemCode = metadata?.itemCode
      return resourceId === selectedResource.resourceId || itemCode === selectedResource.code
    })
  }, [alerts, selectedResource])

  const relatedChanges = useMemo(() => {
    if (!selectedResource) return []
    return changeRequests.filter((request) => {
      const reason = (request.reason || '').toLowerCase()
      return (
        reason.includes((selectedResource.code ?? '').toLowerCase()) || reason.includes(selectedResource.name.toLowerCase())
      )
    })
  }, [changeRequests, selectedResource])

  return (
    <div className="scm-process-flow">
      {loading ? <div className="scm-process-flow__status">Loading supply network…</div> : null}
      {error ? <div className="scm-process-flow__status error">{error}</div> : null}
      <div className="scm-process-flow__canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onNodeDragStop={handleDragStop}
          panOnDrag={false}
          zoomOnScroll={false}
          fitView
          nodesDraggable
          nodeTypes={nodeTypes}
          connectOnClick={false}
        >
          <Background color="rgba(148,163,184,0.25)" gap={28} />
          <Controls showInteractive={false} />
        </ReactFlow>
        {!stageSummary && !loading ? <div className="scm-process-flow__empty">Stage data will appear once a process is selected.</div> : null}
      </div>

      <aside className="scm-process-panel">
        {selectedStage ? (
          <div className="scm-stage-panel">
            <header>
              <h2>{selectedStage.title}</h2>
              <span className={`status-chip status-${selectedStage.status}`}>{selectedStage.status.toUpperCase()}</span>
            </header>
            <dl>
              <div>
                <dt>Required</dt>
                <dd>{selectedStage.requiredTotal.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Committed</dt>
                <dd>{selectedStage.committedTotal.toLocaleString()}</dd>
              </div>
              <div>
                <dt>In transit</dt>
                <dd>{selectedStage.inTransitTotal.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Available</dt>
                <dd>{selectedStage.availableTotal.toLocaleString()}</dd>
              </div>
            </dl>
            <section>
              <h3>Resources</h3>
              <ul>
                {selectedStage.resources.map((resource) => (
                  <li key={resource.id} className={selectedResource?.resourceId === resource.resourceId ? 'active' : ''}>
                    <button type="button" onClick={() => setSelectedResource(resource)}>
                      <span className="title">{resource.name}</span>
                      <span className="metrics">
                        <strong>{resource.committed.toLocaleString()}</strong>
                        <span>{resource.status.replace(/_/g, ' ')}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : (
          <div className="scm-stage-panel placeholder">
            <p>Select a stage to see resourcing details.</p>
          </div>
        )}

        <div className="scm-resource-panel">
          {selectedResource ? (
            <>
              <header>
                <h3>{selectedResource.name}</h3>
                <span className="status-chip">{selectedResource.status.toUpperCase()}</span>
              </header>
              <div className="scm-resource-panel__metrics">
                <div>
                  <span>Required</span>
                  <strong>{selectedResource.required.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Committed</span>
                  <strong>{selectedResource.committed.toLocaleString()}</strong>
                </div>
                <div>
                  <span>In transit</span>
                  <strong>{selectedResource.inTransit.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Available</span>
                  <strong>{selectedResource.available.toLocaleString()}</strong>
                </div>
              </div>
              {selectedResource.metadata?.location ? (
                <p className="scm-resource-panel__meta">Location: {String(selectedResource.metadata.location)}</p>
              ) : null}
              {selectedResource.kind === 'shipment' ? (
                <button type="button" className="scm-resource-panel__action" onClick={() => setMapShipment(selectedResource)}>
                  Open logistics map
                </button>
              ) : null}

              <section>
                <h4>Related alerts</h4>
                {relatedAlerts.length ? (
                  <ul>
                    {relatedAlerts.map((alert) => (
                      <li key={alert.id}>
                        <strong>{alert.title}</strong>
                        <span>{alert.severity.toUpperCase()}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No linked alarms.</p>
                )}
              </section>

              <section>
                <h4>Change requests</h4>
                {relatedChanges.length ? (
                  <ul>
                    {relatedChanges.map((request) => (
                      <li key={request.id}>
                        <strong>{request.reason ?? 'Change request'}</strong>
                        <span>{request.status?.toUpperCase() ?? 'PENDING'}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No CAB actions tied to this resource.</p>
                )}
              </section>
            </>
          ) : (
            <div className="placeholder">
              <p>Select a resource to see allocations, linked alarms, and change requests.</p>
            </div>
          )}
        </div>
      </aside>

      {mapShipment ? <LogisticsMapModal shipment={mapShipment} onClose={() => setMapShipment(null)} /> : null}
    </div>
  )
}

const ScmProcessFlow: React.FC<ProcessFlowProps> = (props) => (
  <ReactFlowProvider>
    <ScmProcessFlowCanvas {...props} />
  </ReactFlowProvider>
)

export default ScmProcessFlow
