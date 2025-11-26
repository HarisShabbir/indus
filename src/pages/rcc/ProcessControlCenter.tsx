import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, { Background, Position, ReactFlowInstance, useNodesState } from 'reactflow'
import 'reactflow/dist/style.css'
import { useNavigate } from 'react-router-dom'
import { Particles } from '@tsparticles/react'
import type { Engine } from '@tsparticles/engine'
import { loadFull } from 'tsparticles'
import { motion } from 'framer-motion'
import { shallow } from 'zustand/shallow'
import { CalendarClock, DollarSign, PackageSearch, Users } from 'lucide-react'
import { AlarmTower } from '../../components/simulator/AlarmTower'
import StageNode from '../../components/simulator/StageNode'
import PipeEdge from '../../components/simulator/PipeEdge'
import { TraceabilityModal } from '../../components/simulator/TraceabilityModal'
import { BlockGrid } from '../../components/simulator/BlockGrid'
import { SliderPanel } from '../../components/simulator/SliderPanel'
import { ImpactPanel } from '../../components/simulator/ImpactPanel'
import { AIAgentPanel } from '../../components/collaborator/AIAgentPanel'
import { useSimulatorStore } from '../../store/simulatorStore'
import { playFeedbackTone } from '../../lib/audio'
import type { AlarmAction, AlarmEvent, CellStatus, ImpactType, SimulatorSliderKey } from '../../types/simulator'
import { getLiftElevationRange, RCC_BASE_ELEVATION_M, RCC_CREST_ELEVATION_M, RCC_CELL_VOLUME_M3 } from '../../lib/rccMetrics'
import './processSimulator.css'

const nodeTypes = { stageNode: StageNode }
const edgeTypes = { pipe: PipeEdge }

const baseEdges = [
  { id: 'e1', source: 'RAW_MATERIAL', target: 'BATCHING' },
  { id: 'e2', source: 'BATCHING', target: 'TRANSPORT' },
  { id: 'e3', source: 'TRANSPORT', target: 'POUR_PLACEMENT' },
  { id: 'e4', source: 'POUR_PLACEMENT', target: 'CURING' },
]

const stageSequence = ['RAW_MATERIAL', 'BATCHING', 'TRANSPORT', 'POUR_PLACEMENT', 'CURING']

const positions: Record<string, { x: number; y: number }> = {
  RAW_MATERIAL: { x: 0, y: 120 },
  BATCHING: { x: 260, y: 40 },
  TRANSPORT: { x: 520, y: 100 },
  POUR_PLACEMENT: { x: 780, y: 30 },
  CURING: { x: 1040, y: 120 },
}

const impactTabs: Array<{ type: ImpactType; label: string }> = [
  { type: 'schedule', label: 'Schedule' },
  { type: 'financial', label: 'Financial' },
  { type: 'scm', label: 'SCM' },
  { type: 'collaboration', label: 'Collaborate' },
]

const controls = [
  { key: 'schedule', label: 'Schedule', icon: <CalendarClock size={16} />, route: '/rcc/schedule' },
  { key: 'financial', label: 'Financial', icon: <DollarSign size={16} />, route: '/rcc/financials' },
  { key: 'scm', label: 'SCM', icon: <PackageSearch size={16} />, route: '/rcc/scm' },
  { key: 'collab', label: 'Collaborate', icon: <Users size={16} />, action: 'collaborate' as const },
]

const cellStatusLabels: Record<CellStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  awaiting: 'Awaiting QA',
  approved: 'Approved',
  alarm: 'Alarm',
  rejected: 'Rejected',
}

const confettiOptions = {
  fullScreen: false,
  particles: {
    number: { value: 0 },
    size: { value: 6 },
    move: { enable: true, speed: 8, direction: 'bottom', outModes: 'out' },
    color: { value: ['#22f6ff', '#ff5168', '#8bff80'] },
    shape: { type: 'square' },
    opacity: { value: { min: 0.4, max: 1 } },
  },
  emitters: {
    direction: 'top',
    rate: { delay: 0.05, quantity: 8 },
    size: { width: 0, height: 0 },
    position: { x: 50, y: 0 },
    life: { duration: 0.8, count: 1 },
  },
}

const flowParticles = {
  fullScreen: false,
  background: { color: 'transparent' },
  particles: {
    color: { value: '#2cffc4' },
    number: { value: 0 },
    size: { value: { min: 1, max: 2 } },
    opacity: { value: 0.7 },
    move: { enable: true, speed: 2.4, direction: 'right', outModes: { default: 'destroy' } },
  },
  emitters: [
    { position: { x: 10, y: 40 }, rate: { delay: 0.2, quantity: 1 }, size: { width: 0, height: 0 }, direction: 'right' },
    { position: { x: 35, y: 30 }, rate: { delay: 0.2, quantity: 1 }, size: { width: 0, height: 0 }, direction: 'right' },
    { position: { x: 60, y: 45 }, rate: { delay: 0.2, quantity: 1 }, size: { width: 0, height: 0 }, direction: 'right' },
    { position: { x: 85, y: 35 }, rate: { delay: 0.2, quantity: 1 }, size: { width: 0, height: 0 }, direction: 'right' },
  ],
}

const parseBlockId = (label: string) => {
  const match = label.match(/Block (\d+), Lift (\d+)/i)
  if (!match) return null
  return `B${match[1]}-L${match[2]}`
}

const FlowBanner = ({ state }: { state: 'IDLE' | 'MONITORING' | 'ACCEPTED' | 'REJECTED' | 'ALERT' }) => {
  let message = 'Initializing'
  if (state === 'REJECTED') message = 'Flow stopped — REJECTED · Clear alarms to resume'
  else if (state === 'ACCEPTED') message = 'Pour accepted'
  else if (state === 'MONITORING') message = 'Monitoring real-time telemetry'
  else if (state === 'ALERT') message = 'Alarm detected — awaiting action'
  return (
    <div className={`flow-banner ${state.toLowerCase()}`}>
      <span>{message}</span>
    </div>
  )
}

const computeAggregates = (
  blocks: ReturnType<typeof useSimulatorStore.getState>['blocks'],
  ruleResults: ReturnType<typeof useSimulatorStore.getState>['ruleResults'],
  impacts: ReturnType<typeof useSimulatorStore.getState>['impacts'],
  currentPour: ReturnType<typeof useSimulatorStore.getState>['currentPour'],
) => {
  const accepted = blocks.filter((cell) => cell.status === 'approved').length
  const rejected = blocks.filter((cell) => cell.status === 'rejected').length
  const live = blocks.filter((cell) => cell.status === 'in_progress' || cell.status === 'alarm').length
  const progress = blocks.length ? (accepted / blocks.length) * 100 : 0
  const failureRatio = ruleResults.length ? ruleResults.filter((result) => !result.passed).length / ruleResults.length : 0
  const schedulePenalty = impacts.schedule.length * 1.8 + rejected * 0.8
  const onTime = Math.max(52, 98 - failureRatio * 34 - schedulePenalty)
  const compliance = Math.max(60, 100 - failureRatio * 120)
  const varCeiling = Math.min(1.2, rejected * 0.35 + impacts.financial.length * 0.15 + impacts.scm.length * 0.1)
  const totalVolume = blocks.length * RCC_CELL_VOLUME_M3
  const placedVolume = accepted * RCC_CELL_VOLUME_M3
  const liveVolume = live * RCC_CELL_VOLUME_M3
  const remainingVolume = Math.max(0, totalVolume - placedVolume - liveVolume)
  const liftIndex = currentPour?.lift ?? 1
  const { top } = getLiftElevationRange(liftIndex, currentPour?.lift_depth_m ?? 0)
  const elevationPercent = ((top - RCC_BASE_ELEVATION_M) / (RCC_CREST_ELEVATION_M - RCC_BASE_ELEVATION_M)) * 100
  return {
    onTime,
    progress,
    compliance,
    valueAtRisk: `$0 → $${varCeiling.toFixed(1)}M${rejected ? ' (if current rejection stands)' : ''}`,
    volume: {
      placed: placedVolume,
      active: liveVolume,
      remaining: remainingVolume,
      total: totalVolume,
    },
    elevation: {
      current: top,
      percent: Math.min(100, Math.max(0, elevationPercent)),
    },
  }
}

const formatVolume = (value: number) => {
  if (!value) return '0 m³'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M m³`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k m³`
  return `${value.toFixed(0)} m³`
}

export default function ProcessControlCenter() {
  const navigate = useNavigate()
  const [highlightedCell, setHighlightedCell] = useState<string | null>(null)
  const highlightTimer = useRef<number | null>(null)
  const simMainRef = useRef<HTMLDivElement | null>(null)
  const [flowHeight, setFlowHeight] = useState(360)
  const [flowFocus, setFlowFocus] = useState<string | null>(null)
  const [activeImpactTab, setActiveImpactTab] = useState<ImpactType | null>(null)
  const particlesInit = useCallback(async (engine: Engine) => {
    await loadFull(engine)
  }, [])
  const {
    sliderConfigs,
    sliderValues,
    stageTelemetry,
    ruleResults,
    blocks,
    activeCell,
    banner,
    alarms,
    collaboratorAlarms,
    autoAdvance,
    nextAutoTimestamp,
    init,
    updateSlider,
    finalizePour,
    rework,
    toggleAuto,
    dismissAlarm,
    openTrace,
    traceModal,
    closeTrace,
    traceChain,
    initialized,
    loading,
    error,
    confettiKey,
    feedbackToken,
    currentBatch,
    currentPour,
    advanceToCell,
    impacts,
    acknowledgeImpact,
    collaboratorOpen,
    collaboratorStage,
    collaboratorThread,
    openCollaborator,
    closeCollaborator,
    askCollaborator,
    collaboratorRole,
    setCollaboratorRole,
    openCollaboratorFromAlarm,
  } = useSimulatorStore(
    (state) => ({
      sliderConfigs: state.sliderConfigs,
      sliderValues: state.sliderValues,
      stageTelemetry: state.stageTelemetry,
      ruleResults: state.ruleResults,
      blocks: state.blocks,
      activeCell: state.activeCell,
      banner: state.banner,
      alarms: state.alarms,
      collaboratorAlarms: state.collaboratorAlarms,
      autoAdvance: state.autoAdvance,
      nextAutoTimestamp: state.nextAutoTimestamp,
      init: state.init,
      updateSlider: state.updateSlider,
      finalizePour: state.finalizePour,
      rework: state.rework,
      toggleAuto: state.toggleAuto,
      dismissAlarm: state.dismissAlarm,
      openTrace: state.openTrace,
      traceModal: state.traceModal,
      closeTrace: state.closeTrace,
      traceChain: state.activeTrace,
      initialized: state.initialized,
      loading: state.loading,
      error: state.error,
      confettiKey: state.confettiKey,
      feedbackToken: state.feedbackToken,
      currentBatch: state.currentBatch,
      currentPour: state.currentPour,
      advanceToCell: state.advanceToCell,
      impacts: state.impacts,
      acknowledgeImpact: state.acknowledgeImpact,
      collaboratorOpen: state.collaboratorOpen,
      collaboratorStage: state.collaboratorStage,
      collaboratorThread: state.collaboratorThread,
      openCollaborator: state.openCollaborator,
      closeCollaborator: state.closeCollaborator,
      askCollaborator: state.askCollaborator,
      collaboratorRole: state.collaboratorRole,
      setCollaboratorRole: state.setCollaboratorRole,
      openCollaboratorFromAlarm: state.openCollaboratorFromAlarm,
    }),
    shallow,
  )

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null)
  const [viewportSettled, setViewportSettled] = useState(false)
  const hasFailure = useMemo(() => ruleResults.some((result) => !result.passed), [ruleResults])

  useEffect(() => {
    init().catch(() => null)
  }, [init])

  const handleFlowInit = useCallback((instance: ReactFlowInstance) => {
    setFlowInstance(instance)
    setViewportSettled(false)
  }, [])

  useEffect(() => {
    setNodes((current) => {
      const lookup = new Map(current.map((node) => [node.id, node]))
      return stageTelemetry.map((stage) => {
        const existing = lookup.get(stage.id)
        return {
          id: stage.id,
          type: 'stageNode' as const,
          data: {
            telemetry: stage,
            stageId: stage.id,
            onOpenCollaborator: openCollaborator,
            highlighted: Boolean(flowFocus),
          },
          position: existing?.position ?? positions[stage.id] ?? { x: 0, y: 0 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        }
      })
    })
  }, [stageTelemetry, setNodes, openCollaborator, flowFocus])

  useEffect(() => {
    if (!flowInstance || !initialized || viewportSettled || !nodes.length) return
    let zoomRaf: number | null = null
    const fitRaf = window.requestAnimationFrame(() => {
      flowInstance.fitView({ padding: 0.2, includeHiddenNodes: true, duration: 600 })
      zoomRaf = window.requestAnimationFrame(() => {
        const baseZoom = flowInstance.getZoom?.() ?? flowInstance.getViewport().zoom
        const targetZoom = Math.min(1.2, Math.max(baseZoom, 1.08))
        flowInstance.zoomTo(targetZoom, { duration: 500 })
        setViewportSettled(true)
      })
    })
    return () => {
      window.cancelAnimationFrame(fitRaf)
      if (zoomRaf) window.cancelAnimationFrame(zoomRaf)
    }
  }, [flowInstance, initialized, nodes.length, viewportSettled])

  const stageStatusLookup = useMemo(() => {
    const map = new Map<string, string>()
    stageTelemetry.forEach((stage) => map.set(stage.id, stage.status))
    return map
  }, [stageTelemetry])

  const firstAlarmIndex = stageSequence.findIndex((stageId) => stageStatusLookup.get(stageId) === 'blocked')
  const edges = useMemo(
    () =>
      baseEdges.map((edge) => {
        const targetIndex = stageSequence.indexOf(edge.target)
        const sourceIndex = stageSequence.indexOf(edge.source)
        let intent: 'clear' | 'alarm' | 'downstream' = 'clear'
        if (firstAlarmIndex >= 0) {
          if (targetIndex === firstAlarmIndex) intent = 'alarm'
          else if (sourceIndex >= firstAlarmIndex) intent = 'downstream'
        }
        return {
          ...edge,
          type: 'pipe' as const,
          data: { intent },
        }
      }),
    [stageStatusLookup, firstAlarmIndex],
  )

  useEffect(() => {
    if (!initialized || !autoAdvance || banner !== 'MONITORING' || hasFailure || !nextAutoTimestamp) return
    const delay = Math.max(1500, nextAutoTimestamp - Date.now())
    const id = window.setTimeout(() => finalizePour(), delay)
    return () => window.clearTimeout(id)
  }, [autoAdvance, banner, finalizePour, hasFailure, initialized, nextAutoTimestamp])

  useEffect(() => {
    if (!feedbackToken) return
    try {
      playFeedbackTone(feedbackToken)
    } catch (err) {
      console.warn('audio blocked', err)
    }
  }, [feedbackToken])

  useEffect(() => {
    if (!flowFocus) return
    const id = window.setTimeout(() => setFlowFocus(null), 3500)
    return () => window.clearTimeout(id)
  }, [flowFocus])

  const highlightCell = useCallback(
    (cellId: string | null) => {
      if (!cellId) return
      setHighlightedCell(cellId)
      setFlowFocus(cellId)
      if (highlightTimer.current) {
        window.clearTimeout(highlightTimer.current)
      }
      highlightTimer.current = window.setTimeout(() => setHighlightedCell(null), 3000)
    },
    [setFlowFocus],
  )

  useEffect(
    () => () => {
      if (highlightTimer.current) {
        window.clearTimeout(highlightTimer.current)
      }
    },
    [],
  )

  const handleAlarmAction = (alarm: AlarmEvent, action: AlarmAction) => {
    if (action.href) {
      navigate(action.href)
      return
    }
    if (action.actionId === 'rework') {
      rework()
      return
    }
    if (action.actionId === 'trace') {
      openTrace()
      return
    }
    if (action.actionId === 'highlight') {
      const blockId = parseBlockId(alarm.block)
      highlightCell(blockId)
    }
  }

  const handleCellSelect = (cellId: string) => {
    highlightCell(cellId)
    advanceToCell(cellId)
  }

  const batchLabel = currentBatch ? `${currentBatch.id} · ${currentBatch.vendorMix.join(', ')}` : null
  const blockLabel = currentPour ? `Block ${currentPour.block}, Lift ${currentPour.lift}` : 'Assigning pour…'
  const aggregates = useMemo(() => computeAggregates(blocks, ruleResults, impacts, currentPour), [blocks, ruleResults, impacts, currentPour])

  const controlCounts = {
    schedule: impacts.schedule.length,
    financial: impacts.financial.length,
    scm: impacts.scm.length,
  }
  const activeStatusLabel = activeCell ? cellStatusLabels[activeCell.status] : 'Unassigned'
  const activeStatusClass = activeCell?.status ?? 'pending'
  const startResize = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      const container = simMainRef.current
      const startY = event.clientY
      const startHeight = flowHeight
      const rect = container?.getBoundingClientRect()
      const containerHeight = rect?.height ?? 900
      const minHeight = 320
      const maxHeight = Math.max(minHeight + 160, containerHeight - 220)
      const handleMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientY - startY
        const next = Math.min(maxHeight, Math.max(minHeight, startHeight + delta))
        setFlowHeight(next)
      }
      const stop = () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', stop)
      }
      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', stop)
    },
    [flowHeight],
  )

  const handleControlClick = (control: (typeof controls)[number]) => {
    if (control.action === 'collaborate') {
      openCollaborator(collaboratorStage ?? 'POUR_PLACEMENT')
      return
    }
    if (control.route) {
      navigate(control.route)
    }
  }

  const stageLabel = stageTelemetry.find((stage) => stage.id === (collaboratorStage ?? 'POUR_PLACEMENT'))?.label ?? 'Placement'
  const hasAlarmCell = blocks.some((cell) => cell.status === 'alarm')
  const displayBanner = banner === 'REJECTED' && (!alarms.length || !hasAlarmCell) ? 'MONITORING' : banner
  const rootClass = `rcc-simulator-shell ${displayBanner === 'REJECTED' ? 'rejected' : ''}`

  return (
    <div className={rootClass}>
      <SliderPanel
        configs={sliderConfigs}
        values={sliderValues}
        onChange={(key: SimulatorSliderKey, value: number) => updateSlider(key, value)}
        autoAdvance={autoAdvance}
        nextAutoTimestamp={nextAutoTimestamp}
        onToggleAuto={toggleAuto}
        onOpenTrace={openTrace}
        batchLabel={batchLabel}
      />
      <main className="sim-main" ref={simMainRef}>
        <section className="project-banner">
          <div>
            <small>Project On-Time Probability</small>
            <strong>{aggregates.onTime.toFixed(1)}%</strong>
          </div>
          <div>
            <small>RCC Progress</small>
            <strong>{aggregates.progress.toFixed(1)}%</strong>
          </div>
          <div>
            <small>Compliance Score</small>
            <strong>{aggregates.compliance.toFixed(1)}%</strong>
          </div>
          <div>
            <small>Value at Risk</small>
            <strong>{aggregates.valueAtRisk}</strong>
          </div>
          <div>
            <small>Volume Placed</small>
            <strong>{formatVolume(aggregates.volume.placed)}</strong>
            <span>of {formatVolume(aggregates.volume.total)}</span>
          </div>
          <div>
            <small>Active Volume</small>
            <strong>{formatVolume(aggregates.volume.active)}</strong>
            <span>Remaining {formatVolume(aggregates.volume.remaining)}</span>
          </div>
          <div>
            <small>Avg. Elevation</small>
            <strong>{aggregates.elevation.current.toFixed(1)} m</strong>
            <span>{aggregates.elevation.percent.toFixed(0)}% of crest</span>
          </div>
        </section>
        <div className="top-control-panel">
          {controls.map((control) => (
            <button key={control.key} type="button" onClick={() => handleControlClick(control)}>
              {control.icon}
              <span>{control.label}</span>
              {control.route ? <strong>{controlCounts[control.key as keyof typeof controlCounts] ?? 0}</strong> : null}
            </button>
          ))}
        </div>
        <div className="sim-top" style={{ flex: '0 0 auto', height: `${flowHeight}px` }}>
          {loading && !initialized ? <div className="sim-loading">Preparing RCC control center…</div> : null}
          {error ? <div className="sim-error">{error}</div> : null}
          {initialized ? (
            <div className="sim-flow">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onInit={handleFlowInit}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                nodesConnectable={false}
                nodesDraggable
                elementsSelectable={false}
                panOnDrag
                zoomOnScroll
                zoomOnPinch
                zoomOnDoubleClick
                proOptions={{ hideAttribution: true }}
              >
                <Particles className="flow-particles" init={particlesInit} options={flowParticles} />
                <Background color="#0b3d68" gap={24} />
              </ReactFlow>
              <FlowBanner state={displayBanner} />
              <motion.div className="flow-meta" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <span>{blockLabel}</span>
                {currentBatch ? <small>Batch {currentBatch.id}</small> : null}
                {traceChain ? <small>Vendor: {traceChain.vendor.name}</small> : null}
                <small className={`cell-status-pill ${activeStatusClass}`}>{activeStatusLabel}</small>
              </motion.div>
              {confettiKey ? <Particles key={confettiKey} className="confetti" init={particlesInit} options={confettiOptions} /> : null}
            </div>
          ) : null}
        </div>
        <div className="canvas-resize-handle" role="separator" aria-orientation="horizontal" onMouseDown={startResize}>
          <span />
        </div>
        <div className="sim-bottom" style={{ flex: '1 1 auto' }}>
          <div className="block-panel">
            <header>
              <div>
                <strong>Blocks · Lifts</strong>
                <span>{blocks.length} cells</span>
              </div>
              <div className="block-status">
                <small>State</small>
                <span className={activeStatusClass}>{activeStatusLabel}</span>
                <button type="button" onClick={() => highlightCell(activeCell?.id ?? null)}>Highlight active</button>
              </div>
            </header>
            <BlockGrid blocks={blocks} activeId={activeCell?.id ?? null} highlightedId={highlightedCell} onSelect={(cellId) => handleCellSelect(cellId)} />
          </div>
        </div>
      </main>
      {collaboratorOpen ? (
        <AIAgentPanel
          stageId={collaboratorStage}
          stageTelemetry={stageTelemetry}
          thread={collaboratorThread}
          role={collaboratorRole}
          alarms={collaboratorAlarms.length ? collaboratorAlarms : alarms}
          onRoleChange={(role) => setCollaboratorRole(role)}
          onAsk={(question) => askCollaborator(question)}
          onClose={closeCollaborator}
        />
      ) : (
        <AlarmTower
          alarms={alarms}
          onAction={handleAlarmAction}
          onDismiss={dismissAlarm}
          onGoToCenter={() => navigate('/alarms')}
          onOpenCollaborator={(alarm) => {
            if (alarm) openCollaboratorFromAlarm(alarm)
            else openCollaborator('POUR_PLACEMENT')
          }}
        />
      )}
      <TraceabilityModal chain={traceModal} onClose={closeTrace} projectProgress={aggregates.progress} />
      {activeImpactTab ? (
        <ImpactPanel
          type={activeImpactTab}
          events={impacts[activeImpactTab]}
          onClose={() => setActiveImpactTab(null)}
          onNavigate={() => navigate(
              activeImpactTab === 'schedule' ? '/rcc/schedule' : activeImpactTab === 'financial' ? '/rcc/financials' : activeImpactTab === 'scm' ? '/rcc/scm' : '/collaboration',
            )}
          onDismiss={(id) => acknowledgeImpact(activeImpactTab, id)}
        />
      ) : null}
    </div>
  )
}
