import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, { Background, Position, useNodesState } from 'reactflow'
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
import { RuleModal } from '../../components/simulator/RuleModal'
import { playFeedbackTone } from '../../lib/audio'
import { useSimulatorStore } from '../../store/simulatorStore'
import type { AlarmAction, AlarmEvent, CellStatus, ImpactType, SimulatorSliderKey } from '../../types/simulator'
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

const parseBlockId = (label: string) => {
  const match = label.match(/Block (\d+), Lift (\d+)/i)
  if (!match) return null
  return `B${match[1]}-L${match[2]}`
}

const impactTabs: Array<{ type: ImpactType; label: string; icon: React.ReactNode; route: string }> = [
  { type: 'schedule', label: 'Schedule', icon: <CalendarClock size={16} />, route: '/schedule' },
  { type: 'financial', label: 'Financial', icon: <DollarSign size={16} />, route: '/financial' },
  { type: 'scm', label: 'SCM', icon: <PackageSearch size={16} />, route: '/atoms/scm' },
  { type: 'collaboration', label: 'Collaborate', icon: <Users size={16} />, route: '/collaboration' },
]

const cellStatusLabels: Record<CellStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  awaiting: 'Awaiting QA',
  approved: 'Approved',
  alarm: 'Alarm',
  rejected: 'Rejected',
}

type CellFilterOption = 'all' | 'completed' | 'in_progress' | 'awaiting' | 'alarm' | 'rejected' | 'approved'

const FlowBanner = ({ state }: { state: 'IDLE' | 'MONITORING' | 'ACCEPTED' | 'REJECTED' | 'ALERT' }) => {
  let message = 'Initializing'
  if (state === 'REJECTED') message = 'Flow stopped — REJECTED · Clear alarms to resume'
  else if (state === 'ACCEPTED') message = 'Pour accepted'
  else if (state === 'MONITORING') message = 'Monitoring real-time telemetry'
  else if (state === 'ALERT') message = 'Alarm detected — waiting for operator'
  return (
    <div className={`flow-banner ${state.toLowerCase()}`}>
      <span>{message}</span>
    </div>
  )
}

export default function ProcessSimulator() {
  const navigate = useNavigate()
  const [highlightedCell, setHighlightedCell] = useState<string | null>(null)
  const highlightTimer = useRef<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<CellFilterOption>('all')
  const [decisionChoice, setDecisionChoice] = useState<'approve' | 'reject'>('approve')
  const [rulesOpen, setRulesOpen] = useState(false)
  const simMainRef = useRef<HTMLDivElement | null>(null)
  const [flowHeight, setFlowHeight] = useState(360)
  const statusFilters: Array<{ key: CellFilterOption; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'completed', label: 'Completed' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'awaiting', label: 'Awaiting 72h' },
    { key: 'alarm', label: 'With alarms' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
  ]
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
    approveActiveCell,
    rejectActiveCell,
    rules,
    updateRule,
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
      approveActiveCell: state.approveActiveCell,
      rejectActiveCell: state.rejectActiveCell,
      rules: state.rules,
      updateRule: state.updateRule,
      collaboratorRole: state.collaboratorRole,
      setCollaboratorRole: state.setCollaboratorRole,
      openCollaboratorFromAlarm: state.openCollaboratorFromAlarm,
    }),
    shallow,
  )

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const hasFailure = useMemo(() => ruleResults.some((result) => !result.passed), [ruleResults])

  useEffect(() => {
    init().catch(() => null)
  }, [init])

  useEffect(() => {
    setNodes((current) => {
      const lookup = new Map(current.map((node) => [node.id, node]))
      return stageTelemetry.map((stage) => {
        const existing = lookup.get(stage.id)
        return {
          id: stage.id,
          type: 'stageNode' as const,
          data: { telemetry: stage, highlighted: Boolean(activeCell) },
          position: existing?.position ?? positions[stage.id] ?? { x: 0, y: 0 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        }
      })
    })
  }, [stageTelemetry, setNodes, activeCell])
  const stageStatusLookup = useMemo(() => {
    const map = new Map<string, string>()
    stageTelemetry.forEach((stage) => map.set(stage.id, stage.status))
    return map
  }, [stageTelemetry])
  const firstAlarmIndex = stageSequence.findIndex((stageId) => stageStatusLookup.get(stageId) === 'blocked')

  const edges = useMemo(() => {
    return baseEdges.map((edge) => {
      const targetIndex = stageSequence.indexOf(edge.target)
      const sourceIndex = stageSequence.indexOf(edge.source)
      let intent: 'clear' | 'alarm' | 'downstream' = 'clear'
      if (firstAlarmIndex >= 0) {
        if (targetIndex === firstAlarmIndex) {
          intent = 'alarm'
        } else if (sourceIndex >= firstAlarmIndex) {
          intent = 'downstream'
        }
      }
      return {
        ...edge,
        type: 'pipe' as const,
        data: {
          intent,
        },
      }
    })
  }, [firstAlarmIndex])

  useEffect(() => {
    if (!initialized || !autoAdvance || !activeCell || activeCell.status !== 'in_progress' || banner !== 'MONITORING' || hasFailure || !nextAutoTimestamp) return
    const delay = Math.max(1500, nextAutoTimestamp - Date.now())
    const id = window.setTimeout(() => finalizePour(), delay)
    return () => window.clearTimeout(id)
  }, [autoAdvance, banner, finalizePour, hasFailure, initialized, nextAutoTimestamp, activeCell])

  useEffect(() => {
    if (!feedbackToken) return
    try {
      playFeedbackTone(feedbackToken)
    } catch (err) {
      console.warn('audio blocked', err)
    }
  }, [feedbackToken])

  const highlightCell = useCallback((cellId: string | null) => {
    if (!cellId) return
    setHighlightedCell(cellId)
    if (highlightTimer.current) {
      window.clearTimeout(highlightTimer.current)
    }
    highlightTimer.current = window.setTimeout(() => setHighlightedCell(null), 3000)
  }, [])

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

  const batchLabel = currentBatch ? `${currentBatch.id} · ${currentBatch.vendorMix.join(', ')}` : null
  const blockLabel = currentPour ? `Block ${currentPour.block}, Lift ${currentPour.lift}` : 'Assigning pour…'
  const overallProgress = useMemo(
    () => (blocks.length ? (blocks.filter((cell) => cell.status === 'approved').length / blocks.length) * 100 : 0),
    [blocks],
  )
  const showDecisionPanel = !!(activeCell && (activeCell.status === 'awaiting' || activeCell.status === 'alarm'))
  const [activeImpactTab, setActiveImpactTab] = useState<ImpactType | null>(null)
  const hasAlarmCell = blocks.some((cell) => cell.status === 'alarm')
  const displayBanner = banner === 'REJECTED' && (!alarms.length || !hasAlarmCell) ? 'MONITORING' : banner
  const activeStatusLabel = activeCell ? cellStatusLabels[activeCell.status] : 'Unassigned'
  const activeStatusClass = activeCell?.status ?? 'pending'
  const handleDecisionSubmit = () => {
    if (decisionChoice === 'approve') {
      approveActiveCell()
    } else {
      rejectActiveCell()
    }
  }
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

  const handleCellSelect = (cellId: string) => {
    highlightCell(cellId)
    advanceToCell(cellId)
  }

  return (
    <div className="rcc-simulator-shell">
      <SliderPanel
        configs={sliderConfigs}
        values={sliderValues}
        onChange={(key: SimulatorSliderKey, value: number) => updateSlider(key, value)}
        autoAdvance={autoAdvance}
        nextAutoTimestamp={nextAutoTimestamp}
        onToggleAuto={toggleAuto}
        onOpenTrace={openTrace}
        batchLabel={batchLabel}
        onOpenRules={() => setRulesOpen(true)}
      />
      <main className="sim-main" ref={simMainRef}>
        <div className="sim-top" style={{ flex: '0 0 auto', height: `${flowHeight}px` }}>
          {loading && !initialized ? <div className="sim-loading">Preparing RCC simulator…</div> : null}
          {error ? <div className="sim-error">{error}</div> : null}
          {initialized ? (
            <div className="sim-flow">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                nodesDraggable
                elementsSelectable={false}
                panOnDrag
                zoomOnScroll
                zoomOnPinch
                zoomOnDoubleClick
                proOptions={{ hideAttribution: true }}
              >
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
            <div className="status-filter-bar">
              {statusFilters.map((option) => (
                <button key={option.key} type="button" className={statusFilter === option.key ? 'active' : ''} onClick={() => setStatusFilter(option.key)}>
                  {option.label}
                </button>
              ))}
            </div>
            <BlockGrid
              blocks={blocks}
              activeId={activeCell?.id ?? null}
              highlightedId={highlightedCell}
              filter={statusFilter}
              onSelect={(cellId) => handleCellSelect(cellId)}
            />
            {showDecisionPanel ? (
              <div className="decision-panel">
                <div>
                  <strong>Decision · {activeCell ? `Block ${activeCell.block}, Lift ${activeCell.lift}` : ''}</strong>
                  <div className="choices">
                    <label>
                      <input type="radio" checked={decisionChoice === 'approve'} onChange={() => setDecisionChoice('approve')} /> Approve
                    </label>
                    <label>
                      <input type="radio" checked={decisionChoice === 'reject'} onChange={() => setDecisionChoice('reject')} /> Reject
                    </label>
                  </div>
                </div>
                <button type="button" className="submit" onClick={handleDecisionSubmit}>
                  Submit
                </button>
              </div>
            ) : null}
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
            if (alarm) {
              openCollaboratorFromAlarm(alarm)
            } else {
              openCollaborator('POUR_PLACEMENT')
            }
          }}
        />
      )}
      <TraceabilityModal chain={traceModal} onClose={closeTrace} projectProgress={overallProgress} />
      {rulesOpen ? <RuleModal rules={rules} onClose={() => setRulesOpen(false)} onUpdate={updateRule} /> : null}
      {activeImpactTab ? (
        <ImpactPanel
          type={activeImpactTab}
          events={impacts[activeImpactTab]}
          onClose={() => setActiveImpactTab(null)}
          onNavigate={() => navigate(impactTabs.find((tab) => tab.type === activeImpactTab)?.route ?? '/')}
          onDismiss={(id) => acknowledgeImpact(activeImpactTab, id)}
        />
      ) : null}
    </div>
  )
}
