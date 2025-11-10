import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  ReactFlowInstance,
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeChange,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { logTelemetry } from './telemetry'
import { scmVisualNodeTypes } from './nodes'
import MapModal from './MapModal'
import SidePanel from './SidePanel'
import useSyntheticScm from './useSyntheticScm'
import { createAlarm, acknowledgeAlert } from '../../../api'
import { ProcessProfile, Alarm, AlarmSeverity, SimulatedEvent, Stage, SyntheticDrivers, SyntheticScmSnapshot, VolatilityLevel } from './types'
import { publishTowerAlarm, acknowledgeTowerAlarm } from '../../../state/alarmTowerStore'

const VOLATILITY_LEVELS: VolatilityLevel[] = ['low', 'medium', 'high']

const nodeIdToStage: Record<string, Stage> = {
  demand: 'Demand',
  procurement: 'Procurement',
  readiness: 'Readiness',
  logistics: 'Logistics',
  inventory: 'Inventory',
}

const formatTimestamp = (value: number) => {
  const date = new Date(value)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const DEFAULT_SEED = 4201

const EDGE_STYLE = {
  stroke: '#ffffff',
  strokeWidth: 4,
  strokeDasharray: '10 6',
}

type AlarmSummary = {
  count: number
  severity: AlarmSeverity | null
}

type ScopeInfo = {
  tenantId?: string | null
  projectId?: string | null
  projectName?: string | null
  contractId?: string | null
  contractName?: string | null
  sowId?: string | null
  sowName?: string | null
  processId?: string | null
  processName?: string | null
}

type ScmVisualExperienceProps = {
  onAlarmSummary?: (summary: AlarmSummary) => void
  scope?: ScopeInfo
  processProfile?: ProcessProfile | null
}

const buildNodes = (snapshot: SyntheticScmSnapshot | null, selectedStage: Stage | null): Node[] => {
  if (!snapshot) return []
  const hotThreshold = 1
  return [
    {
      id: 'demand',
      type: 'demand',
      position: { x: 0, y: 260 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        metrics: snapshot.demand,
        selected: selectedStage === 'Demand',
        pulse: snapshot.tick - snapshot.demand.updatedAtTick <= hotThreshold,
      },
      draggable: true,
      selectable: false,
    },
    {
      id: 'procurement',
      type: 'procurement',
      position: { x: 260, y: 260 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        metrics: snapshot.procurement,
        selected: selectedStage === 'Procurement',
        pulse: snapshot.tick - snapshot.procurement.updatedAtTick <= hotThreshold,
      },
      draggable: true,
      selectable: false,
    },
    {
      id: 'logistics',
      type: 'logistics',
      position: { x: 520, y: 260 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        metrics: snapshot.logistics,
        selected: selectedStage === 'Logistics',
        pulse: snapshot.tick - snapshot.logistics.updatedAtTick <= hotThreshold,
      },
      draggable: true,
      selectable: false,
    },
    {
      id: 'inventory',
      type: 'inventory',
      position: { x: 780, y: 260 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        metrics: snapshot.inventory,
        selected: selectedStage === 'Inventory',
        pulse: snapshot.tick - snapshot.inventory.updatedAtTick <= hotThreshold,
      },
      draggable: true,
      selectable: false,
    },
    {
      id: 'readiness',
      type: 'readiness',
      position: { x: 1040, y: 260 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        metrics: snapshot.readiness,
        selected: selectedStage === 'Readiness',
        pulse: snapshot.tick - snapshot.readiness.updatedAtTick <= hotThreshold,
      },
      draggable: true,
      selectable: false,
    },
  ]
}

const buildEdges = (snapshot: SyntheticScmSnapshot | null): Edge[] => {
  if (!snapshot) return []
  const createEdge = (id: string, source: string, target: string): Edge => ({
    id,
    source,
    target,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#ffffff', width: 22, height: 22 },
    animated: true,
    className: 'scm-visual-edge',
    style: { ...EDGE_STYLE },
  })

  return [
    createEdge('edge-demand-procurement', 'demand', 'procurement'),
    createEdge('edge-procurement-logistics', 'procurement', 'logistics'),
    createEdge('edge-logistics-inventory', 'logistics', 'inventory'),
    createEdge('edge-inventory-readiness', 'inventory', 'readiness'),
  ]
}

export const ScmVisualExperience: React.FC<ScmVisualExperienceProps> = ({ onAlarmSummary, scope, processProfile }) => {
  const { snapshot, controls } = useSyntheticScm(DEFAULT_SEED, 'medium', processProfile ?? null)
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null)
  const [seedInput, setSeedInput] = useState<string>(() => String(DEFAULT_SEED))
  const [followMovement, setFollowMovement] = useState(true)
  const [mapOpen, setMapOpen] = useState(false)
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null)
  const initialFitDoneRef = useRef(false)
  const lastLoggedStageRef = useRef<Stage | null>(null)

  const seedNodes = useMemo(() => buildNodes(snapshot, selectedStage), [snapshot, selectedStage])
  const [nodes, setNodes] = useState<Node[]>(seedNodes)
  useEffect(() => {
    setNodes((prev) => {
      if (!seedNodes.length) return seedNodes
      const positionMap = new Map(prev.map((node) => [node.id, node.position]))
      return seedNodes.map((node) => {
        const stored = positionMap.get(node.id)
        return stored ? { ...node, position: stored } : node
      })
    })
  }, [seedNodes])

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current))
  }, [])

  useEffect(() => {
    if (snapshot) {
      setSeedInput(String(snapshot.seed))
    }
  }, [snapshot?.seed])

  useEffect(() => {
    if (selectedStage && selectedStage !== lastLoggedStageRef.current) {
      logTelemetry('node_opened', { stage: selectedStage })
      lastLoggedStageRef.current = selectedStage
    }
  }, [selectedStage])

  const edges = useMemo(() => buildEdges(snapshot), [snapshot])

  useEffect(() => {
    if (flowInstance && snapshot && !initialFitDoneRef.current && nodes.length) {
      flowInstance.fitView({ padding: 0.24, duration: 400 })
      initialFitDoneRef.current = true
    }
  }, [flowInstance, snapshot, nodes])

  const handleNodeClick = useCallback(
    (_: unknown, node: Node) => {
      const stage = nodeIdToStage[node.id]
      if (stage) {
        setSelectedStage(stage)
      }
    },
    [setSelectedStage],
  )

  const handleNodeDoubleClick = useCallback(
    (_: unknown, node: Node) => {
      if (node.id === 'logistics') {
        setMapOpen(true)
        logTelemetry('map_opened', { tick: snapshot?.tick })
      }
    },
    [snapshot?.tick],
  )

  const handlePaneClick = useCallback(() => {
    setSelectedStage(null)
  }, [])

  const handleInit = useCallback((instance: ReactFlowInstance) => {
    setFlowInstance(instance)
  }, [])

  const handleFitView = useCallback(() => {
    flowInstance?.fitView({ padding: 0.24, duration: 400 })
  }, [flowInstance])

  const handleSeedChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSeedInput(event.target.value)
  }, [])

  const handleSeedSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const parsed = Number(seedInput)
      if (Number.isFinite(parsed)) {
        controls.setSeed(parsed)
      }
    },
    [controls, seedInput],
  )

  const handleVolatilityChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const index = Number(event.target.value)
      const level = VOLATILITY_LEVELS[index] ?? 'medium'
      controls.setVolatility(level)
    },
    [controls],
  )

  const handleSimulate = useCallback(
    (event: SimulatedEvent) => {
      controls.simulateEvent(event)
    },
    [controls],
  )

  const handleDriversChange = useCallback(
    (drivers: Partial<SyntheticDrivers>) => {
      controls.updateDrivers(drivers)
    },
    [controls],
  )

  const handleAcknowledgeAlarm = useCallback(
    (id: string) => {
      controls.acknowledgeAlarm(id)
      acknowledgeTowerAlarm(id)
      acknowledgeAlert(id).catch((error) => {
        console.error('Failed to acknowledge backend alarm', error)
      })
    },
    [controls],
  )

  const stageAlarms: Alarm[] = useMemo(() => {
    if (!snapshot || !selectedStage) return []
    return snapshot.alarms.filter((alarm) => alarm.stage === selectedStage)
  }, [snapshot, selectedStage])

  const publishedAlarmsRef = useRef<Set<string>>(new Set())
  const persistedAlarmsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!snapshot) return
    const currentIds = new Set<string>()
    snapshot.alarms.forEach((alarm) => {
      currentIds.add(alarm.id)
      if (!publishedAlarmsRef.current.has(alarm.id)) {
        publishedAlarmsRef.current.add(alarm.id)
        const payload = {
          id: alarm.id,
          severity: alarm.severity,
          label: alarm.message,
          stage: alarm.stage,
          source: 'scm-visual-flow',
          ts: alarm.ts,
          scope: {
            tenantId: scope?.tenantId ?? 'default',
            projectId: scope?.projectId ?? null,
            projectName: scope?.projectName ?? null,
            contractId: scope?.contractId ?? null,
            contractName: scope?.contractName ?? null,
            sowId: scope?.sowId ?? null,
            sowName: scope?.sowName ?? null,
            processId: scope?.processId ?? null,
            processName: scope?.processName ?? null,
            sourcePath: '/atoms/scm/visual',
            sourceLabel: scope?.processName ?? 'SCM Visual Flow',
          },
          metadata: {
            snapshotTick: snapshot.tick,
          },
        }
        publishTowerAlarm(payload)
        if (!persistedAlarmsRef.current.has(alarm.id) && scope?.projectId) {
          persistedAlarmsRef.current.add(alarm.id)
          createAlarm({
            id: alarm.id,
            projectId: scope.projectId,
            title: alarm.message,
            severity: alarm.severity.toUpperCase(),
            activity: alarm.stage ? `${alarm.stage} pipeline` : undefined,
            category: 'SCM',
            metadata: {
              ...payload.scope,
              scenarioId: alarm.metadata?.scenarioId ?? alarm.metadata?.scenarioLabel,
              scenarioLabel: alarm.metadata?.scenarioLabel,
              impactedStages: alarm.metadata?.impactedStages,
              generatedFrom: 'scm_visual_flow',
            },
            items: [
              {
                type: 'stage',
                label: alarm.stage,
                detail: `Status ${snapshot.statusByStage[alarm.stage] ?? 'N/A'}`,
              },
            ],
          }).catch((error) => {
            console.error('Failed to persist SCM alarm', error)
            persistedAlarmsRef.current.delete(alarm.id)
          })
        }
      }
    })
    publishedAlarmsRef.current.forEach((id) => {
      if (!currentIds.has(id)) {
        publishedAlarmsRef.current.delete(id)
        persistedAlarmsRef.current.delete(id)
      }
    })
  }, [snapshot?.alarms, snapshot?.tick, scope, snapshot?.statusByStage])

  useEffect(() => {
    if (!onAlarmSummary) return
    const alarms = snapshot?.alarms ?? []
    if (!alarms.length) {
      onAlarmSummary({ count: 0, severity: null })
      return
    }
    const severityRank: Record<AlarmSeverity, number> = { info: 0, warn: 1, critical: 2 }
    const highest = alarms.reduce((acc, alarm) => {
      return severityRank[alarm.severity] > severityRank[acc.severity] ? alarm : acc
    }, alarms[0])
    onAlarmSummary({ count: alarms.length, severity: highest.severity })
  }, [snapshot?.alarms, onAlarmSummary])

  const volatilityIndex = snapshot ? VOLATILITY_LEVELS.indexOf(snapshot.volatility) : 1
  const activeProfile = snapshot?.processProfile ?? processProfile ?? null

  const handleFollowToggle = useCallback((value: boolean) => {
    setFollowMovement(value)
  }, [])

  const overallStatus = snapshot?.overallStatus ?? 'OK'
  const lastUpdated = snapshot ? formatTimestamp(snapshot.lastUpdatedAt) : '--'

  return (
    <section className="scm-visual-experience">
      <header className="scm-visual-toolbar">
        <div className="scm-visual-toolbar__primary">
          <span className="scm-visual-process">Dam Pit Excavation</span>
          <span className={`scm-visual-status-pill status-${overallStatus.toLowerCase()}`}>{overallStatus}</span>
          <span className="scm-visual-badge">Synthetic Mode</span>
          <span className="scm-visual-updated">Updated {lastUpdated}</span>
        </div>
        <div className="scm-visual-toolbar__actions">
          <button type="button" onClick={controls.toggle}>
            {snapshot?.isRunning ? 'Pause live' : 'Play live'}
          </button>
          <button type="button" onClick={controls.reset}>
            Reset
          </button>
          <button type="button" onClick={handleFitView}>
            Fit view
          </button>
          <form onSubmit={handleSeedSubmit} className="scm-visual-toolbar__seed">
            <label htmlFor="scm-visual-seed">Seed</label>
            <input id="scm-visual-seed" type="number" value={seedInput} onChange={handleSeedChange} />
            <button type="submit">Apply</button>
          </form>
          <div className="scm-visual-toolbar__volatility">
            <label htmlFor="scm-visual-volatility">Volatility</label>
            <input
              id="scm-visual-volatility"
              type="range"
              min={0}
              max={VOLATILITY_LEVELS.length - 1}
              step={1}
              value={Math.max(0, volatilityIndex)}
              onChange={handleVolatilityChange}
            />
            <span>{snapshot?.volatility ?? 'medium'}</span>
          </div>
        </div>
      </header>

      <div className={selectedStage ? 'scm-visual-workspace has-panel' : 'scm-visual-workspace'}>
        <div className="scm-visual-canvas">
          {activeProfile ? (
            <div className="scm-visual-process-card">
              <div>
                <span>Process</span>
                <strong>{activeProfile.label}</strong>
                {activeProfile.description ? <p>{activeProfile.description}</p> : null}
              </div>
              {activeProfile.atoms.length ? (
                <ul>
                  {activeProfile.atoms.slice(0, 4).map((atom) => (
                    <li key={`${atom.name}-${atom.type}`}>
                      <strong>{atom.name}</strong>
                      <span>{atom.type}</span>
                      {atom.status ? <em>{atom.status}</em> : null}
                    </li>
                  ))}
                  {activeProfile.atoms.length > 4 ? (
                    <li className="more">+{activeProfile.atoms.length - 4} more assets</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ) : null}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={scmVisualNodeTypes}
            panOnScroll
            zoomOnScroll={false}
            zoomOnPinch
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          nodesDraggable
          nodesConnectable
          elementsSelectable={false}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onPaneClick={handlePaneClick}
          onInit={handleInit}
          onNodesChange={handleNodesChange}
          fitView
          fitViewOptions={{ padding: 0.24 }}
          >
            <MiniMap pannable zoomable nodeColor={() => '#1f2937'} nodeStrokeColor={() => '#64748b'} />
            <Controls showInteractive={false} className="scm-visual-controls" />
            <Background gap={28} size={1} color="rgba(148,163,184,0.2)" />
          </ReactFlow>
        </div>

        {selectedStage && snapshot ? (
          <SidePanel
            stage={selectedStage}
            snapshot={snapshot}
            alarms={stageAlarms}
            onClose={() => setSelectedStage(null)}
            onAcknowledge={handleAcknowledgeAlarm}
            onSimulate={handleSimulate}
            onDriversChange={handleDriversChange}
          />
        ) : null}
      </div>

      <MapModal
        open={mapOpen}
        shipments={snapshot?.logistics.shipments ?? []}
        follow={followMovement}
        onClose={() => setMapOpen(false)}
        onToggleFollow={handleFollowToggle}
      />
    </section>
  )
}

export default ScmVisualExperience
