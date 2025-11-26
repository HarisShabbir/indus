import { create } from 'zustand'
import { generateClientId } from '../utils/id'
import { RuleEngine, type RuleContext } from '../lib/ruleEngine'
import { TraceabilityEngine } from '../lib/traceabilityEngine'
import { createBlockMatrix } from '../simulator/data'
import { generateStageInsight } from '../ai/responses'
import { requestCollaboratorResponse } from '../ai/collaboratorAgent'
import type {
  AlarmEvent,
  Batch,
  BlockLiftCell,
  ImpactEvent,
  ImpactType,
  Pour,
  RuleResult,
  SimulatorSliderKey,
  SliderConfig,
  StageTelemetry,
  TraceChain,
} from '../types/simulator'

const sliderConfigs: SliderConfig[] = [
  { key: 'pourTemp', label: 'Pour Temperature', min: 2, max: 24, step: 0.5, unit: '°C', description: 'Placement tower thermocouples' },
  { key: 'wetDensity', label: 'Wet Density', min: 2550, max: 2670, step: 5, unit: 'kg/m³', description: 'Lift QC core density' },
  { key: 'timeSinceLift', label: 'Time Since Last Lift', min: 24, max: 160, step: 2, unit: 'hours', description: 'Scheduler feedback loop' },
  { key: 'slump', label: 'Slump', min: 0, max: 120, step: 1, unit: 'mm', description: 'Batch tower slump meter' },
  { key: 'conveyorSpeed', label: 'Conveyor Speed', min: 1, max: 8, step: 0.1, unit: 'm/s', description: 'Telemetry from conveyor VFD' },
  { key: 'aggregateMoisture', label: 'Aggregate Moisture', min: 2, max: 10, step: 0.1, unit: '%', description: 'Stockpile sensors' },
  { key: 'waterPh', label: 'Water pH', min: 4.5, max: 9, step: 0.1, unit: 'pH', description: 'Water treatment lab' },
  { key: 'curingTemp', label: 'Curing Temperature', min: -5, max: 35, step: 0.5, unit: '°C', description: 'Lift blanket probes' },
]

const defaultValue = (key: SimulatorSliderKey, pour: Pour) => {
  switch (key) {
    case 'pourTemp':
      return pour.pour_temp_c
    case 'wetDensity':
      return pour.wet_density_kg_m3
    case 'timeSinceLift':
      return pour.time_between_lifts_hr
    case 'slump':
      return pour.slump_mm
    case 'conveyorSpeed':
      return pour.conveyor_speed_m_s
    case 'aggregateMoisture':
      return 5.2
    case 'waterPh':
      return 7.1
    case 'curingTemp':
      return 16
    default:
      return 0
  }
}

const stageMap: Record<string, SimulatorSliderKey[]> = {
  RAW_MATERIAL: ['aggregateMoisture', 'waterPh'],
  BATCHING: ['slump'],
  TRANSPORT: ['conveyorSpeed'],
  POUR_PLACEMENT: ['pourTemp', 'wetDensity', 'timeSinceLift'],
  CURING: ['curingTemp'],
}

const blockIdFromLabel = (label: string) => {
  const match = label.match(/Block (\d+), Lift (\d+)/i)
  if (!match) return null
  return `B${match[1]}-L${match[2]}`
}

const alarmKey = (ruleId: string, blockLabel: string | null) => `${ruleId}::${blockLabel ?? 'unknown'}`

export const collaboratorRoles = ['Project Manager', 'Engineer', 'SCM Coordinator', 'Supervisor', 'Crew', 'AI Assistant'] as const

export type CollaboratorRole = (typeof collaboratorRoles)[number]

export type CollaboratorPersona = 'pm' | 'assistant'

export const collaboratorPersonaMap: Record<CollaboratorRole, CollaboratorPersona> = {
  'Project Manager': 'pm',
  Engineer: 'assistant',
  'SCM Coordinator': 'assistant',
  Supervisor: 'assistant',
  Crew: 'assistant',
  'AI Assistant': 'assistant',
}

export const stageRoleMap: Record<string, CollaboratorRole> = {
  RAW_MATERIAL: 'SCM Coordinator',
  BATCHING: 'Engineer',
  TRANSPORT: 'Supervisor',
  POUR_PLACEMENT: 'Crew',
  CURING: 'Project Manager',
}

const ruleEngine = new RuleEngine()
const traceEngine = new TraceabilityEngine()
const initialBlocks = createBlockMatrix()
const nowIso = () => new Date().toISOString()

const formatInsight = (stageId: string, snapshot: SimulatorSnapshot) => {
  const insight = generateStageInsight(stageId, snapshot)
  return `${insight.headline}\n${insight.reasoning}\nImpact: ${insight.impact}\nAction: ${insight.recommendation}`
}

const formatAlarmDigest = (alarms: AlarmEvent[]) => {
  if (!alarms.length) return 'No active alarms captured from the tower.'
  const lines = alarms.map((alarm) => `• [${alarm.severity}] ${alarm.ruleId} · ${alarm.description} (${alarm.block})`)
  return `Active alarms from tower:\n${lines.join('\n')}`
}

const buildRolePrompt = (role: CollaboratorRole, question: string) => {
  const personaLabel = role === 'AI Assistant' ? 'embedded AI assistant' : `the ${role}`
  return `Respond as ${personaLabel}. ${question}`
}

const buildSliderState = (pour: Pour) =>
  sliderConfigs.reduce<Record<SimulatorSliderKey, number>>((acc, cfg) => ({ ...acc, [cfg.key]: defaultValue(cfg.key, pour) }), {} as Record<SimulatorSliderKey, number>)

const buildRuleMetrics = (values: Record<SimulatorSliderKey, number>) => {
  const transportSpeed = Number((values.conveyorSpeed * 0.65).toFixed(1))
  const curingDays = Math.max(7, Math.round(values.timeSinceLift / 24))
  const variation = Number(Math.max(0.05, Math.abs(values.aggregateMoisture - 5.2) * 0.12).toFixed(2))
  return {
    pour_temp_c: values.pourTemp,
    wet_density_kg_m3: values.wetDensity,
    time_between_lifts_hr: values.timeSinceLift,
    slump_mm: values.slump,
    conveyor_speed_m_s: values.conveyorSpeed,
    aggregate_moisture_pct: values.aggregateMoisture,
    aggregate_stockpile_pct: 11.2,
    aggregate_moisture_variation_pct: variation,
    water_ph: values.waterPh,
    water_ppm: 420,
    curing_temp_c: values.curingTemp,
    curing_days_allocated: curingDays,
    transport_speed_km_hr: transportSpeed,
  }
}

const buildStageTelemetry = (values: Record<SimulatorSliderKey, number>, results: RuleResult[]): StageTelemetry[] => {
  const failingByMetric = new Set(results.filter((res) => !res.passed).map((res) => res.rule.metric))
  return [
    {
      id: 'RAW_MATERIAL',
      label: 'Raw Material',
      status: failingByMetric.has('aggregate_moisture_pct') || failingByMetric.has('water_ph') ? 'blocked' : 'active',
      metrics: [
        { name: 'Aggregate Moisture', value: `${values.aggregateMoisture.toFixed(1)}`, unit: '%', intent: failingByMetric.has('aggregate_moisture_pct') ? 'alarm' : 'ok' },
        { name: 'Water pH', value: values.waterPh.toFixed(1), intent: failingByMetric.has('water_ph') ? 'alarm' : 'ok' },
      ],
    },
    {
      id: 'BATCHING',
      label: 'Batching',
      status: failingByMetric.has('mixing_time_sec') || failingByMetric.has('batch_temp_diff_c') ? 'blocked' : 'active',
      metrics: [
        { name: 'Batch ΔT', value: `${(values.pourTemp - 3).toFixed(1)}`, unit: '°C', intent: failingByMetric.has('batch_temp_diff_c') ? 'alarm' : 'ok' },
        { name: 'Slump', value: values.slump.toFixed(0), unit: 'mm', intent: failingByMetric.has('slump_mm') ? 'alarm' : 'ok' },
      ],
    },
    {
      id: 'TRANSPORT',
      label: 'Transport',
      status: failingByMetric.has('conveyor_speed_m_s') || failingByMetric.has('transport_speed_km_hr') ? 'blocked' : 'active',
      metrics: [
        { name: 'Conveyor', value: values.conveyorSpeed.toFixed(1), unit: 'm/s', intent: failingByMetric.has('conveyor_speed_m_s') ? 'alarm' : 'ok' },
      ],
    },
    {
      id: 'POUR_PLACEMENT',
      label: 'Placement',
      status: failingByMetric.has('pour_temp_c') || failingByMetric.has('wet_density_kg_m3') || failingByMetric.has('time_between_lifts_hr') ? 'blocked' : 'active',
      metrics: [
        { name: 'Pour Temp', value: values.pourTemp.toFixed(1), unit: '°C', intent: failingByMetric.has('pour_temp_c') ? 'alarm' : 'ok' },
        { name: 'Wet Density', value: values.wetDensity.toFixed(0), unit: 'kg/m³', intent: failingByMetric.has('wet_density_kg_m3') ? 'alarm' : 'ok' },
      ],
    },
    {
      id: 'CURING',
      label: 'Curing',
      status: failingByMetric.has('curing_temp_c') ? 'blocked' : 'active',
      metrics: [
        { name: 'Curing Temp', value: values.curingTemp.toFixed(1), unit: '°C', intent: failingByMetric.has('curing_temp_c') ? 'alarm' : 'ok' },
      ],
    },
  ]
}

type SimulatorState = {
  initialized: boolean
  loading: boolean
  error: string | null
  sliderConfigs: SliderConfig[]
  sliderValues: Record<SimulatorSliderKey, number>
  blocks: BlockLiftCell[]
  activeCell: BlockLiftCell | null
  currentBatch: Batch | null
  currentPour: Pour | null
  ruleResults: RuleResult[]
  stageTelemetry: StageTelemetry[]
  banner: 'IDLE' | 'MONITORING' | 'ACCEPTED' | 'REJECTED' | 'ALERT'
  alarms: AlarmEvent[]
  autoAdvance: boolean
  nextAutoTimestamp: number | null
  activeTrace: TraceChain | null
  traceModal: TraceChain | null
  feedbackToken: string | null
  confettiKey: number
  impacts: Record<ImpactType, ImpactEvent[]>
  collaboratorOpen: boolean
  collaboratorStage: string | null
  collaboratorThread: CollaboratorMessage[]
  collaboratorRole: CollaboratorRole
  collaboratorAlarms: AlarmEvent[]
  rules: RuleDescriptor[]
  init: () => Promise<void>
  updateSlider: (key: SimulatorSliderKey, value: number) => void
  evaluate: (reason?: string) => void
  finalizePour: () => void
  rework: () => void
  toggleAuto: () => void
  dismissAlarm: (id: string) => void
  openTrace: () => void
  closeTrace: () => void
  advanceToCell: (cellId: string) => void
  acknowledgeImpact: (type: ImpactType, id: string) => void
  openCollaborator: (stageId: string, context?: { alarm?: AlarmEvent }) => void
  openCollaboratorFromAlarm: (alarm: AlarmEvent) => void
  closeCollaborator: () => void
  askCollaborator: (question: string) => Promise<void>
  approveActiveCell: () => void
  rejectActiveCell: () => void
  updateRule: (ruleId: string, patch: Partial<RuleDescriptor>) => void
  setCollaboratorRole: (role: CollaboratorRole) => void
}

export type CollaboratorMessage = {
  id: string
  author: 'user' | 'ai'
  text: string
  timestamp: string
}

export type SimulatorSnapshot = {
  ruleResults: RuleResult[]
  currentPour: Pour | null
  activeTrace: TraceChain | null
  impacts: Record<ImpactType, ImpactEvent[]>
}

export const useSimulatorStore = create<SimulatorState>((set, get) => {
  const pushImpact = (type: ImpactType, event: ImpactEvent) =>
    set((state) => ({
      impacts: {
        ...state.impacts,
        [type]: [event, ...state.impacts[type]].slice(0, 10),
      },
    }))

  return {
    initialized: false,
    loading: false,
    error: null,
    sliderConfigs,
    sliderValues: sliderConfigs.reduce<Record<SimulatorSliderKey, number>>((acc, cfg) => ({ ...acc, [cfg.key]: 0 }), {} as Record<SimulatorSliderKey, number>),
    blocks: initialBlocks,
    activeCell: null,
    currentBatch: null,
    currentPour: null,
    ruleResults: [],
    stageTelemetry: [],
    banner: 'IDLE',
    alarms: [],
    autoAdvance: true,
    nextAutoTimestamp: null,
    activeTrace: null,
    traceModal: null,
    feedbackToken: null,
    confettiKey: 0,
    impacts: {
      schedule: [],
      financial: [],
      scm: [],
      collaboration: [],
    },
    collaboratorOpen: false,
    collaboratorStage: null,
    collaboratorThread: [],
    collaboratorRole: stageRoleMap.POUR_PLACEMENT,
    collaboratorAlarms: [],
    rules: [],
    async init() {
    if (get().initialized) return
    set({ loading: true, error: null })
    try {
      await ruleEngine.loadRules()
      const rules = ruleEngine.getRules()
      const blocks = createBlockMatrix()
      const activeCell = blocks.find((cell) => cell.status === 'in_progress') ?? blocks[0]
      const { pour, batch } = traceEngine.assignPour(activeCell)
      const sliderValues = buildSliderState(pour)
      const metrics = buildRuleMetrics(sliderValues)
      const ruleContext: RuleContext = { metrics, pour, batch, clock: new Date() }
      const ruleResults = ruleEngine.evaluate(ruleContext)
      set({
        initialized: true,
        loading: false,
        blocks,
        activeCell,
        currentBatch: batch,
        currentPour: pour,
        sliderValues,
        ruleResults,
        stageTelemetry: buildStageTelemetry(sliderValues, ruleResults),
        banner: 'MONITORING',
        nextAutoTimestamp: Date.now() + 45_000,
        activeTrace: traceEngine.buildTrace(pour, batch),
        rules,
      })
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Unable to bootstrap simulator' })
    }
    },
    updateSlider(key, value) {
    const state = get()
    const sliderValues = { ...state.sliderValues, [key]: value }
    set({ sliderValues })
    get().evaluate('slider')
    },
    evaluate() {
    const state = get()
    if (!state.currentPour || !state.currentBatch) return
    const metrics = buildRuleMetrics(state.sliderValues)
    const ruleContext: RuleContext = { metrics, pour: state.currentPour, batch: state.currentBatch, clock: new Date() }
    const ruleResults = ruleEngine.evaluate(ruleContext)
    const failing = ruleResults.filter((result) => !result.passed)
    const prevFailIds = new Set(state.ruleResults.filter((result) => !result.passed).map((item) => item.rule.rule_id))
    const activeCellId = state.activeCell?.id
    const activeBlockLabel = `Block ${state.currentPour.block}, Lift ${state.currentPour.lift}`
    let banner: SimulatorState['banner'] = failing.length ? 'REJECTED' : 'MONITORING'
    let blocks = state.blocks
    let alarms: AlarmEvent[] = []
    let feedbackToken: string | null = null
    if (failing.length) {
      if (state.banner !== 'REJECTED') {
        feedbackToken = `reject-${Date.now()}`
      }
      const failingKeys = new Set(failing.map((fail) => alarmKey(fail.rule.rule_id, activeBlockLabel)))
      alarms = state.alarms.filter((alarm) => failingKeys.has(alarmKey(alarm.ruleId, alarm.block)))
      blocks = state.blocks.map((cell) => {
        if (cell.id !== activeCellId || cell.status === 'rejected') return cell
        return { ...cell, status: 'alarm' }
      })
      const existingAlarmKeys = new Set(alarms.map((alarm) => alarmKey(alarm.ruleId, alarm.block)))
      if (state.currentPour && state.currentBatch) {
        const trace = traceEngine.buildTrace(state.currentPour, state.currentBatch)
        const blockLabel = activeBlockLabel
        const newFailures = failing.filter(
          (fail) => !prevFailIds.has(fail.rule.rule_id) && !existingAlarmKeys.has(alarmKey(fail.rule.rule_id, blockLabel)),
        )
        if (newFailures.length) {
          newFailures.forEach((fail) => {
            alarms = [
              {
                id: generateClientId(),
                timestamp: new Date().toISOString(),
                severity: fail.rule.severity,
                ruleId: fail.rule.rule_id,
                stageId: fail.rule.process_stage,
                description: fail.rule.rule_description,
                block: blockLabel,
                traceMessage: `Caused by ${trace.lot.material} Lot ${trace.lot.id} from ${trace.vendor.name}`,
                actions: [
                  { label: 'Alarm Center', href: '/alarms' },
                  { label: 'Schedule Impact', href: '/schedule' },
                  { label: 'SCM Action', href: `/atoms/scm?v=${trace.lot.id}` },
                  { label: 'Trace Chain', actionId: 'trace' },
                  { label: 'Reject & Rework', actionId: 'rework' },
                  { label: 'Highlight in 3D', actionId: 'highlight' },
                ],
              },
              ...alarms,
            ]
            const impactPayload = {
              id: generateClientId(),
              type: 'schedule' as ImpactType,
              ruleId: fail.rule.rule_id,
              severity: fail.rule.severity,
              title: `${fail.rule.rule_id} ${fail.rule.rule_description}`,
              description: `${blockLabel} stalled · ${fail.message}`,
              block: blockLabel,
              timestamp: new Date().toISOString(),
            }
            pushImpact('schedule', impactPayload)
            pushImpact('financial', {
              ...impactPayload,
              id: generateClientId(),
              type: 'financial',
              title: 'Payment delayed',
              description: `${blockLabel} · IPC held until pour reworked`,
            })
            pushImpact('scm', {
              ...impactPayload,
              id: generateClientId(),
              type: 'scm',
              title: 'Vendor escalation',
              description: `${trace.vendor.name} lot ${trace.lot.id} flagged`,
            })
            pushImpact('collaboration', {
              ...impactPayload,
              id: generateClientId(),
              type: 'collaboration',
              title: 'Crew notified',
              description: `Collab board created for ${blockLabel}`,
            })
          })
        }
      }
    } else {
      let updatedActiveCell = state.activeCell
      if (state.banner === 'REJECTED') {
        feedbackToken = `recover-${Date.now()}`
      }
      const timeSinceLift = state.sliderValues.timeSinceLift
      blocks = state.blocks.map((cell) => {
        if (cell.id !== activeCellId) return cell
        if (cell.status === 'rejected') return cell
        if (cell.status === 'alarm') {
          const approvedCell = { ...cell, status: 'approved', approved: true }
          if (updatedActiveCell?.id === cell.id) {
            updatedActiveCell = approvedCell
          }
          return approvedCell
        }
        if (cell.status === 'awaiting' && cell.approved && timeSinceLift >= 72) {
          return { ...cell, status: 'approved' }
        }
        if (cell.status === 'pending') {
          return { ...cell, status: 'in_progress' }
        }
        return cell
      })
    }
    const activeAlarmBlocks = new Set(alarms.map((alarm) => blockIdFromLabel(alarm.block)).filter((value): value is string => Boolean(value)))
    blocks = blocks.map((cell) => {
      if (cell.status !== 'alarm') return cell
      if (activeAlarmBlocks.has(cell.id)) return cell
      return { ...cell, status: 'approved', approved: true }
    })
    const activeTrace = state.currentPour && state.currentBatch ? traceEngine.buildTrace(state.currentPour, state.currentBatch) : state.activeTrace
    let newActiveCell = activeCellId ? blocks.find((cell) => cell.id === activeCellId) ?? state.activeCell : state.activeCell
    if (newActiveCell?.status === 'alarm' && !activeAlarmBlocks.has(newActiveCell.id)) {
      newActiveCell = { ...newActiveCell, status: 'approved', approved: true }
    }
    set({
      sliderValues: state.sliderValues,
      ruleResults,
      stageTelemetry: buildStageTelemetry(state.sliderValues, ruleResults),
      banner,
      blocks,
      alarms,
      feedbackToken: feedbackToken ?? state.feedbackToken,
      activeTrace,
      activeCell: newActiveCell,
    })
    },
    finalizePour() {
    const state = get()
    if (!state.currentPour || !state.currentBatch || !state.activeCell) return
    const hasFailure = state.ruleResults.some((result) => !result.passed)
    if (hasFailure) return
    const readyOffset = Math.max(0, 72 - state.sliderValues.timeSinceLift)
    const readyAt = new Date(Date.now() + readyOffset * 3600 * 1000).toISOString()
    const blocks = state.blocks.map((cell) => {
      if (cell.id !== state.activeCell?.id) return cell
      return {
        ...cell,
        status: 'awaiting',
        batchId: state.currentBatch?.id,
        vendorLabel: state.currentBatch?.vendorMix.join(', '),
        readyAt,
        approved: false,
      }
    })
    const nextCell = blocks.find((cell) => cell.status === 'pending') ?? null
    traceEngine.rotatePipeline()
    if (!nextCell) {
      set({
        blocks,
        banner: 'ACCEPTED',
        confettiKey: state.confettiKey + 1,
        feedbackToken: `success-${Date.now()}`,
        activeTrace: null,
      })
      return
    }
    nextCell.status = 'in_progress'
    const existingPour = traceEngine.getPour(nextCell.id)
    const { pour, batch } = existingPour ? { pour: existingPour, batch: traceEngine.getBatchForPour(existingPour) } : traceEngine.assignPour(nextCell)
    const sliderValues = buildSliderState(pour)
    const metrics = buildRuleMetrics(sliderValues)
    const ruleResults = ruleEngine.evaluate({ metrics, pour, batch, clock: new Date() })
    set({
      blocks,
      activeCell: nextCell,
      currentBatch: batch,
      currentPour: pour,
      sliderValues,
      ruleResults,
      stageTelemetry: buildStageTelemetry(sliderValues, ruleResults),
      banner: 'MONITORING',
      confettiKey: state.confettiKey + 1,
      feedbackToken: `success-${Date.now()}`,
      nextAutoTimestamp: Date.now() + (30_000 + Math.random() * 30_000),
      activeTrace: traceEngine.buildTrace(pour, batch),
    })
    },
    rework() {
    const state = get()
    if (!state.activeCell) return
    const blockLabel = `Block ${state.activeCell.block}, Lift ${state.activeCell.lift}`
    const blocks = state.blocks.map((cell) =>
      cell.id === state.activeCell?.id ? { ...cell, status: 'in_progress', approved: false, readyAt: null } : cell,
    )
    set({
      blocks,
      alarms: state.alarms.filter((alarm) => alarm.block !== blockLabel),
      banner: 'MONITORING',
      feedbackToken: null,
    })
    get().evaluate('rework')
    },
    toggleAuto() {
    const { autoAdvance } = get()
    set({ autoAdvance: !autoAdvance, nextAutoTimestamp: !autoAdvance ? Date.now() + 35_000 : null })
    },
    dismissAlarm(id: string) {
    set((state) => {
      const alarms = state.alarms.filter((alarm) => alarm.id !== id)
      const activeAlarmBlocks = new Set(alarms.map((alarm) => blockIdFromLabel(alarm.block)).filter((value): value is string => Boolean(value)))
      let banner = state.banner
      let blocks = state.blocks
      let activeCell = state.activeCell
      let ruleResults = state.ruleResults
      let stageTelemetry = state.stageTelemetry
      blocks = state.blocks.map((cell) => {
        if (cell.status !== 'alarm') return cell
        const stillActive = activeAlarmBlocks.has(cell.id)
        if (stillActive) return cell
        return { ...cell, status: 'approved', approved: true }
      })
      if (activeCell && activeCell.status === 'alarm' && !activeAlarmBlocks.has(activeCell.id)) {
        activeCell = { ...activeCell, status: 'approved', approved: true }
      }
      if (alarms.length === 0) {
        banner = 'MONITORING'
        ruleResults = state.ruleResults.map((result) => ({ ...result, passed: true }))
        stageTelemetry = buildStageTelemetry(state.sliderValues, ruleResults)
      }
      return { alarms, banner, blocks, activeCell, ruleResults, stageTelemetry }
    })
    },
    openTrace() {
    const state = get()
    if (!state.activeTrace) return
    set({ traceModal: state.activeTrace })
    },
    closeTrace() {
    set({ traceModal: null })
    },
    advanceToCell(cellId: string) {
    const state = get()
    const blocks = state.blocks.map((cell) => {
      if (cell.id !== cellId) return cell
      if (cell.status === 'pending') {
        return { ...cell, status: 'in_progress' }
      }
      return cell
    })
    const target = blocks.find((cell) => cell.id === cellId)
    if (!target) return
    const existingPour = traceEngine.getPour(target.id)
    const { pour, batch } = existingPour ? { pour: existingPour, batch: traceEngine.getBatchForPour(existingPour) } : traceEngine.assignPour(target)
    const sliderValues = buildSliderState(pour)
    const ruleResults = ruleEngine.evaluate({ metrics: buildRuleMetrics(sliderValues), pour, batch, clock: new Date() })
    set({
      blocks,
      activeCell: target,
      currentBatch: batch,
      currentPour: pour,
      sliderValues,
      ruleResults,
      stageTelemetry: buildStageTelemetry(sliderValues, ruleResults),
      banner: 'MONITORING',
      nextAutoTimestamp: Date.now() + 40_000,
      activeTrace: traceEngine.buildTrace(pour, batch),
    })
    },
    acknowledgeImpact(type, id) {
      set((state) => ({
        impacts: {
          ...state.impacts,
          [type]: state.impacts[type].filter((impact) => impact.id !== id),
        },
      }))
    },
    openCollaborator(stageId, context) {
      const state = get()
      const snapshot = buildSnapshot(state)
      const initial = formatInsight(stageId, snapshot)
      const digest = formatAlarmDigest(state.alarms)
      const role = stageRoleMap[stageId] ?? state.collaboratorRole
      const alarmNote = context?.alarm ? `🚨 ${context.alarm.ruleId}: ${context.alarm.description}` : null
      const intro = [alarmNote, digest, initial].filter(Boolean).join('\n\n')
      set({
        collaboratorOpen: true,
        collaboratorStage: stageId,
        collaboratorRole: role,
        collaboratorAlarms: state.alarms,
        collaboratorThread: [
          {
            id: generateClientId(),
            author: 'ai',
            text: intro,
            timestamp: nowIso(),
          },
        ],
      })
    },
    openCollaboratorFromAlarm(alarm) {
      const stageId = alarm.stageId ?? 'POUR_PLACEMENT'
      get().openCollaborator(stageId, { alarm })
    },
    closeCollaborator() {
      set({ collaboratorOpen: false, collaboratorStage: null, collaboratorAlarms: [] })
    },
    async askCollaborator(question) {
      const state = get()
      const trimmed = question.trim()
      if (!trimmed) return
      const stageId = state.collaboratorStage ?? 'POUR_PLACEMENT'
      const snapshot = buildSnapshot(state)
      const stageLabel = state.stageTelemetry.find((stage) => stage.id === stageId)?.label ?? stageId
      const persona = collaboratorPersonaMap[state.collaboratorRole] ?? 'assistant'
      const blockLabel = state.currentPour ? `Block ${state.currentPour.block}, Lift ${state.currentPour.lift}` : null
      const stageAlarm = state.collaboratorAlarms.find((alarm) => alarm.stageId === stageId) ?? state.collaboratorAlarms[0] ?? null
      const intent: 'notify' | 'advise' | 'both' = stageAlarm ? 'both' : 'advise'
      const userMessage: CollaboratorMessage = { id: generateClientId(), author: 'user', text: trimmed, timestamp: nowIso() }
      const placeholderId = generateClientId()
      const history = [...state.collaboratorThread, userMessage].slice(-8).map((message) => ({
        role: message.author === 'user' ? 'user' : 'assistant',
        content: message.text,
      }))
      set((current) => ({
        collaboratorThread: [
          ...current.collaboratorThread,
          userMessage,
          { id: placeholderId, author: 'ai', text: 'Synthesizing guidance…', timestamp: nowIso() },
        ],
      }))
      const contextPayload = {
        scope: {
          project_name: 'RCC Dam Controls',
          process_id: stageId,
          process_name: stageLabel,
          block_label: blockLabel,
        },
        alarm: stageAlarm,
        alarms: state.collaboratorAlarms,
        pour: snapshot.currentPour,
        trace: snapshot.activeTrace,
        impacts: snapshot.impacts,
        sliderValues: state.sliderValues,
        collaborator_role: state.collaboratorRole,
      }
      const promptForAgent = buildRolePrompt(state.collaboratorRole, trimmed)
      const fallback = formatInsight(stageId, snapshot)
      const remoteReply = await requestCollaboratorResponse({
        prompt: promptForAgent,
        persona,
        intent,
        context: { payload: contextPayload },
        history,
      })
      const aiReply = remoteReply ?? `${fallback}\n\n(Realtime collaborator offline — showing simulator insight.)`
      set((current) => ({
        collaboratorThread: current.collaboratorThread.map((message) =>
          message.id === placeholderId ? { ...message, text: aiReply, timestamp: nowIso() } : message,
        ),
      }))
    },
    setCollaboratorRole(role) {
      set({ collaboratorRole: role })
    },
    approveActiveCell() {
      const state = get()
      if (!state.activeCell) return
      const timeSinceLift = state.sliderValues.timeSinceLift
      const blocks = state.blocks.map((cell) => {
        if (cell.id !== state.activeCell?.id) return cell
        if (cell.status === 'rejected') return cell
        const ready = timeSinceLift >= 72
        if (ready) {
          return { ...cell, status: 'approved', approved: true }
        }
        return { ...cell, status: cell.status === 'alarm' ? 'awaiting' : cell.status, approved: true }
      })
      set({ blocks, banner: 'MONITORING' })
      get().evaluate()
    },
    rejectActiveCell() {
      const state = get()
      if (!state.activeCell) return
      const blocks = state.blocks.map((cell) => (cell.id === state.activeCell?.id ? { ...cell, status: 'rejected', approved: false } : cell))
      const blockLabel = `Block ${state.activeCell.block}, Lift ${state.activeCell.lift}`
      set({
        blocks,
        banner: 'REJECTED',
        alarms: [
          {
            id: generateClientId(),
            timestamp: new Date().toISOString(),
            severity: 'HIGH',
            ruleId: 'MANUAL',
            stageId: 'POUR_PLACEMENT',
            description: `Manual rejection recorded for ${blockLabel}`,
            block: blockLabel,
            traceMessage: 'Operator override',
            actions: [{ label: 'Alarm Center', href: '/alarms' }],
          },
          ...state.alarms,
        ],
        feedbackToken: `reject-${Date.now()}`,
      })
    },
    updateRule(ruleId, patch) {
      ruleEngine.updateRule(ruleId, patch)
      set((current) => ({
        rules: ruleEngine.getRules(),
      }))
      get().evaluate()
    },
  }
})
const buildSnapshot = (state: SimulatorState): SimulatorSnapshot => ({
  ruleResults: state.ruleResults,
  currentPour: state.currentPour,
  activeTrace: state.activeTrace,
  impacts: state.impacts,
})
