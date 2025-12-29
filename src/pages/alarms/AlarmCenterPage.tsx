import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts'

import {
  acknowledgeAlert,
  createProcessHistorianEntry,
  fetchAlerts,
  fetchProgressHierarchy,
  type Alert,
  type AlertMetadata,
  type ProgressHierarchyContract,
  type ProgressHierarchyProcess,
  type ProgressHierarchyResponse,
  type ProgressHierarchySow,
} from '../../api'
import { SidebarNav, sidebarItems, ACCS_NAV_INDEX, CHANGE_NAV_INDEX, HOME_NAV_INDEX, type ThemeMode } from '../../layout/navigation'
import TopBar, { TopBarIcons } from '../../layout/TopBar'
import type { BreadcrumbItem } from '../../components/breadcrumbs/Breadcrumbs'
import TopBarGlobalActions from '../../layout/TopBarActions'
import { applyTheme, resolveInitialTheme, toggleThemeValue } from '../../utils/theme'
import { acknowledgeTowerAlarm, useAlarmTower, type TowerAlarm } from '../../state/alarmTowerStore'
import { generateClientId } from '../../utils/id'

type LocationState = {
  projectId?: string | null
  projectName?: string | null
  contractId?: string | null
  contractName?: string | null
  sowId?: string | null
  sowName?: string | null
  processId?: string | null
  processName?: string | null
  focusAlertId?: string | null
} | null

type Severity = 'critical' | 'major' | 'minor'
type StatusKey = 'open' | 'acknowledged' | 'in_progress' | 'mitigated' | 'closed'

type ScopeSelection = {
  projectId: string | null
  contractId: string | null
  sowId: string | null
  processId: string | null
}

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'Critical',
  major: 'Major',
  minor: 'Minor',
}

const STATUS_LABELS: Record<StatusKey, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  in_progress: 'In progress',
  mitigated: 'Mitigated',
  closed: 'Closed',
}

const STATUS_ORDER: StatusKey[] = ['open', 'acknowledged', 'in_progress', 'mitigated', 'closed']

const POLLING_INTERVAL_MS = 30_000

const PROCESS_LOGIC_RULES = [
  {
    id: 'supply-delay',
    title: 'Supply delay > 2d',
    stage: 'Logistics',
    description: 'Raised when convoy ETA drifts by more than two days.',
    action: 'Dispatch alternate route, notify procurement.',
    severity: 'critical' as Severity,
  },
  {
    id: 'po-cancellation',
    title: 'PO cancellation shock',
    stage: 'Procurement',
    description: 'Triggered when committed PO is cancelled without backup.',
    action: 'Activate contingency supplier and notify finance.',
    severity: 'major' as Severity,
  },
  {
    id: 'expedite',
    title: 'Expedite surge',
    stage: 'Demand',
    description: 'Late-stage rush order stressing all buffers.',
    action: 'Re-sequence schedule, confirm overtime logistics.',
    severity: 'major' as Severity,
  },
  {
    id: 'port-congestion',
    title: 'Port congestion',
    stage: 'Logistics',
    description: 'Sensors indicate choke at Karachi/rail hubs.',
    action: 'Shift to alternate port, alert customs broker.',
    severity: 'critical' as Severity,
  },
  {
    id: 'inventory-recovery',
    title: 'Inventory recovery',
    stage: 'Inventory',
    description: 'System detected replenishment cycle success.',
    action: 'Validate count, release constrained workfronts.',
    severity: 'minor' as Severity,
  },
]

const TIMELINE_PAGE_SIZE = 5
const LANE_PAGE_SIZE = 3
const TOWER_PAGE_SIZE = 5

type TowerActionId = 'acknowledge' | 'collaborate' | 'change'

const TOWER_ACTIONS: { id: TowerActionId; label: string; helper: string }[] = [
  { id: 'acknowledge', label: 'Acknowledge', helper: 'Log to process historian and clear from tower' },
  { id: 'collaborate', label: 'Collaborate', helper: 'Open workspace with alarm context' },
  { id: 'change', label: 'Change', helper: 'Jump into Change Management workspace' },
]

type PlaybookDefinition = {
  id: string
  title: string
  category: string
  severity: Severity
  summary: string
  owner: string
  resolution: string
  metrics: { label: string; value: string }[]
  steps: string[]
  guardrail: string
}

const PLAYBOOK_LIBRARY: PlaybookDefinition[] = [
  {
    id: 'schedule-critical',
    title: 'Stabilise placement slip',
    category: 'schedule',
    severity: 'critical',
    summary: 'Bring the pour back inside the ISA 18.2 guardrail by redeploying the standby pump and resequencing the delayed lifts.',
    owner: 'Construction Control Room',
    resolution: 'Target recovery ≤ 45 min',
    metrics: [
      { label: 'Impact window', value: '45m' },
      { label: 'Crews blocked', value: '3 workfronts' },
    ],
    steps: [
      'Dispatch standby pump / QC lead to the affected placement.',
      'Freeze downstream lifts for 1 hour while logistics reroutes mixers.',
      'Update slip note in DPPR and broadcast recovery ETA to tower.',
    ],
    guardrail: 'Escalate if slip exceeds 90 minutes or if two consecutive placements miss.',
  },
  {
    id: 'schedule-major',
    title: 'Re-sequence delayed lift',
    category: 'schedule',
    severity: 'major',
    summary: 'Absorb a medium-late placement by sliding non-critical rebar work and protecting time-on-vert crew hours.',
    owner: 'Area Superintendent',
    resolution: 'Target recovery ≤ 90 min',
    metrics: [
      { label: 'Buffer remaining', value: '2 lifts' },
      { label: 'Crew impact', value: '1 workfront' },
    ],
    steps: [
      'Move reinforcement crew to prep next joint while pour is stabilised.',
      'Confirm aggregate tower inventory and reset pour clock.',
      'Log mitigation in the schedule audit trail.',
    ],
    guardrail: 'If buffer <1 lift, escalate to change board.',
  },
  {
    id: 'sensor-major',
    title: 'Re-zero vibration mesh',
    category: 'sensor',
    severity: 'major',
    summary: 'Resolve telemetry drift by re-zeroing the affected channels and validating data fidelity with the control room.',
    owner: 'Field Instrumentation Lead',
    resolution: 'Target resolution in 30 min',
    metrics: [
      { label: 'Channels affected', value: '≤ 6' },
      { label: 'Drift', value: '< 8σ' },
    ],
    steps: [
      'Isolate the noisy channels and apply the re-zero script.',
      'Perform physical inspection on exposed cabling / nodes.',
      'Push verification snapshot to historians and re-arm alert.',
    ],
    guardrail: 'Escalate to controls SME if drift returns within 2h.',
  },
  {
    id: 'safety-critical',
    title: 'Safety stand-down drill',
    category: 'safety',
    severity: 'critical',
    summary: 'Keep the lift zone cold until the HSE team clears the rigging plan and confirms spotter coverage.',
    owner: 'Site HSE Lead',
    resolution: 'Target restart ≤ 60 min',
    metrics: [
      { label: 'Stop time', value: '≤ 60m' },
      { label: 'Incidents', value: '0 recordables' },
    ],
    steps: [
      'Hold toolbox talk with crew + riggers and review event timeline.',
      'Audit rigging diagram, sling condition, and exclusion zone signage.',
      'Document corrective actions and authorise controlled restart.',
    ],
    guardrail: 'Do not restart until dual spotters are assigned.',
  },
  {
    id: 'daor-major',
    title: 'Burn down DAOR backlog',
    category: 'daor',
    severity: 'major',
    summary: 'Clear the ageing DAOR packages by pairing procurement with engineering for rapid compliance fixes.',
    owner: 'SCM War Room',
    resolution: 'Target backlog < 24h',
    metrics: [
      { label: 'Open packages', value: '≤ 2' },
      { label: 'Value at risk', value: '$2.5M' },
    ],
    steps: [
      'Batch the ageing DAORs and trigger vendor compliance calls.',
      'Secure alternate transport slots for the critical lines.',
      'Update mitigation notes and alert finance on exposure swing.',
    ],
    guardrail: 'Escalate if backlog plateaus for two polling cycles.',
  },
]

const DEFAULT_PLAYBOOK: PlaybookDefinition = {
  id: 'stabilise-general',
  title: 'Stabilise alarm response',
  category: 'general',
  severity: 'major',
  summary: 'Capture the alarm context, assign ownership, and communicate a measurable recovery target.',
  owner: 'Alarm Center Lead',
  resolution: 'Target closure ≤ 2h',
  metrics: [
    { label: 'Responders', value: 'Assign 1 owner' },
    { label: 'Recovery', value: 'Define success' },
  ],
  steps: [
    'Confirm alarm metadata and ensure status reflects the real world.',
    'Assign the owner that can unblock the dominant constraint.',
    'Publish the mitigation note so tower + DPPR stay aligned.',
  ],
  guardrail: 'Escalate if ownership or ETA are not confirmed within 15 min.',
}

function normaliseSeverity(alert: Alert): Severity {
  const raw = (alert.severity ?? '').toLowerCase()
  if (raw.includes('critical')) return 'critical'
  if (raw.includes('major') || raw === 'alert') return 'major'
  if (raw.includes('minor') || raw.includes('warning')) return 'minor'

  const hints = (alert.items ?? []).map((item) => `${item.label} ${item.detail}`.toLowerCase())
  if (hints.some((text) => text.includes('critical'))) return 'critical'
  if (hints.some((text) => text.includes('major') || text.includes('high'))) return 'major'
  return 'minor'
}

function matchesTextMeta(alert: Alert, token: string) {
  const haystack = [
    alert.title,
    alert.activity,
    alert.location,
    ...(alert.items ?? []).map((item) => `${item.label} ${item.detail}`),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(token.toLowerCase())
}

function filterAlertsByScope(alerts: Alert[], scope: ScopeSelection): Alert[] {
  return alerts.filter((alert) => {
    if (scope.projectId && alert.project_id !== scope.projectId) {
      return false
    }
    const metaScope = ((alert.metadata as AlertMetadata | null)?.scope) ?? {}
    if (scope.processId) {
      const matched = metaScope?.process?.code === scope.processId
      return matched || matchesTextMeta(alert, scope.processId)
    }
    if (scope.sowId) {
      const matched = metaScope?.sow?.code === scope.sowId
      return matched || matchesTextMeta(alert, scope.sowId)
    }
    if (scope.contractId) {
      const matched = metaScope?.contract?.code === scope.contractId
      return matched || matchesTextMeta(alert, scope.contractId)
    }
    return true
  })
}

function resolveScopeLabel(scope: ScopeSelection, hierarchy: ProgressHierarchyResponse | null) {
  const project = hierarchy?.projects.find((item) => item.code === (scope.projectId ?? undefined)) ?? null
  const contract = project?.contracts.find((item) => item.code === (scope.contractId ?? undefined)) ?? null
  const sow = contract?.sows.find((item) => item.code === (scope.sowId ?? undefined)) ?? null
  const process = sow?.processes.find((item) => item.code === (scope.processId ?? undefined)) ?? null

  if (process) return `Process · ${process.name}`
  if (sow) return `SOW · ${sow.name}`
  if (contract) return `Contract · ${contract.name}`
  if (project) return `Project · ${project.name}`
  return 'Portfolio overview'
}

function resolveScopeNames(scope: ScopeSelection, hierarchy: ProgressHierarchyResponse | null) {
  const project = hierarchy?.projects.find((item) => item.code === (scope.projectId ?? undefined)) ?? null
  const contract = project?.contracts.find((item) => item.code === (scope.contractId ?? undefined)) ?? null
  const sow = contract?.sows.find((item) => item.code === (scope.sowId ?? undefined)) ?? null
  const process = sow?.processes.find((item) => item.code === (scope.processId ?? undefined)) ?? null

  return {
    projectName: project?.name ?? null,
    contractName: contract?.name ?? null,
    sowName: sow?.name ?? null,
    processName: process?.name ?? null,
  }
}

type WorkspaceAlarmPayload = {
  alarmId: string
  type: string
  severity: string
  processCode?: string | null
  scope: {
    process_id?: string | null
    sow_id?: string | null
    contract_id?: string | null
    project_id?: string | null
    portfolio_id?: string | null
    process_name?: string | null
    sow_name?: string | null
    contract_name?: string | null
    project_name?: string | null
  }
  message: string
  kpis: { coveragePct?: number | null; bufferDays?: number | null; nextDelivery?: string | null }
  links: { scheduleTaskId?: string | null; scmPO?: string | null; shipment?: string | null }
  raisedAt?: string | null
  owner?: string | null
  status?: string | null
}

const defaultKpis = {
  coveragePct: 68,
  bufferDays: -1,
  nextDelivery: new Date(Date.now() + 36 * 3_600_000).toISOString(),
}

const toWorkspaceScope = (params: {
  scopeSelection: ScopeSelection
  scopeNames: ReturnType<typeof resolveScopeNames>
  alarmScope?: TowerAlarm['scope']
  metaScope?: AlertMetadata['scope']
}) => {
  const { scopeSelection, scopeNames, alarmScope, metaScope } = params
  return {
    process_id: alarmScope?.processId ?? metaScope?.process?.code ?? scopeSelection.processId ?? null,
    sow_id: alarmScope?.sowId ?? metaScope?.sow?.code ?? scopeSelection.sowId ?? null,
    contract_id: alarmScope?.contractId ?? metaScope?.contract?.code ?? scopeSelection.contractId ?? null,
    project_id: alarmScope?.projectId ?? metaScope?.project?.code ?? scopeSelection.projectId ?? null,
    portfolio_id: alarmScope?.sourcePath ?? null,
    process_name: alarmScope?.processName ?? metaScope?.process?.name ?? scopeNames.processName ?? null,
    sow_name: alarmScope?.sowName ?? metaScope?.sow?.name ?? scopeNames.sowName ?? null,
    contract_name: alarmScope?.contractName ?? metaScope?.contract?.name ?? scopeNames.contractName ?? null,
    project_name: alarmScope?.projectName ?? metaScope?.project?.name ?? scopeNames.projectName ?? null,
  }
}

const buildTowerWorkspacePayload = (
  alarm: TowerAlarm,
  scopeSelection: ScopeSelection,
  scopeNames: ReturnType<typeof resolveScopeNames>,
): WorkspaceAlarmPayload => {
  const metadata = alarm.metadata ?? {}
  return {
    alarmId: alarm.id,
    type: (metadata.type as string | undefined) ?? alarm.stage ?? 'alarm',
    severity: alarm.severity,
    processCode: alarm.scope?.processId ?? scopeSelection.processId ?? null,
    scope: toWorkspaceScope({ scopeSelection, scopeNames, alarmScope: alarm.scope }),
    message: (metadata.message as string | undefined) ?? alarm.label,
    kpis: {
      coveragePct: (metadata.coveragePct as number | undefined) ?? defaultKpis.coveragePct,
      bufferDays: (metadata.bufferDays as number | undefined) ?? defaultKpis.bufferDays,
      nextDelivery: (metadata.nextDelivery as string | undefined) ?? defaultKpis.nextDelivery,
    },
    links: {
      scheduleTaskId: (metadata.scheduleTaskId as string | undefined) ?? null,
      scmPO: (metadata.scmPO as string | undefined) ?? null,
      shipment: (metadata.shipment as string | undefined) ?? null,
    },
    raisedAt: alarm.ts,
    owner: (metadata.owner as string | undefined) ?? null,
    status: (metadata.status as string | undefined) ?? (alarm.acknowledged ? 'Acknowledged' : 'Open'),
  }
}

const buildAlertWorkspacePayload = (
  alert: Alert,
  scopeSelection: ScopeSelection,
  scopeNames: ReturnType<typeof resolveScopeNames>,
): WorkspaceAlarmPayload => {
  const meta = (alert.metadata as AlertMetadata | null) ?? null
  const metaLinks = (meta?.links as Record<string, string | undefined> | undefined) ?? {}
  return {
    alarmId: alert.id,
    type: alert.category ?? 'alarm',
    severity: alert.severity ?? 'major',
    processCode: meta?.process?.code ?? scopeSelection.processId ?? null,
    scope: toWorkspaceScope({ scopeSelection, scopeNames, metaScope: meta?.scope }),
    message: alert.root_cause ?? alert.recommendation ?? alert.title,
    kpis: {
      coveragePct: meta?.signals?.confidence ?? defaultKpis.coveragePct,
      bufferDays: meta?.impact?.scheduleDaysAtRisk ? -meta.impact.scheduleDaysAtRisk : defaultKpis.bufferDays,
      nextDelivery: meta?.workflow?.lastUpdated ?? defaultKpis.nextDelivery,
    },
    links: {
      scheduleTaskId: metaLinks.scheduleTaskId ?? null,
      scmPO: metaLinks.scmPO ?? null,
      shipment: metaLinks.shipment ?? null,
    },
    raisedAt: alert.raised_at,
    owner: alert.owner ?? null,
    status: alert.status ?? 'Open',
  }
}

function formatDueDescriptor(dueAt?: string | null) {
  if (!dueAt) return null
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return null
  const diffHours = (due.getTime() - Date.now()) / 3_600_000
  if (diffHours < 0) {
    return { label: `Overdue ${Math.abs(diffHours).toFixed(1)}h`, tone: 'overdue' as const }
  }
  if (diffHours <= 12) {
    return { label: `Due in ${Math.max(diffHours, 0).toFixed(1)}h`, tone: 'due-soon' as const }
  }
  const days = Math.round(diffHours / 24)
  return { label: `Due in ${days}d`, tone: 'calm' as const }
}

export default function AlarmCenterPage(): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const locationState = (location.state as LocationState) ?? null

  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme())
  const [activeNavIndex, setActiveNavIndex] = useState(ACCS_NAV_INDEX)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSeverity, setSelectedSeverity] = useState<Severity | 'all'>('all')
  const [severityTableSeverity, setSeverityTableSeverity] = useState<Severity>('critical')
  const [severityTablePage, setSeverityTablePage] = useState(0)
  const [hierarchy, setHierarchy] = useState<ProgressHierarchyResponse | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [scopeSelection, setScopeSelection] = useState<ScopeSelection>(() => ({
    projectId: locationState?.projectId ?? null,
    contractId: locationState?.contractId ?? null,
    sowId: locationState?.sowId ?? null,
    processId: locationState?.processId ?? null,
  }))
  const [focusedAlertId, setFocusedAlertId] = useState<string | null>(locationState?.focusAlertId ?? null)
  const [timelinePage, setTimelinePage] = useState(0)
  const [lanePages, setLanePages] = useState<Record<StatusKey, number>>({
    open: 0,
    acknowledged: 0,
    in_progress: 0,
    mitigated: 0,
    closed: 0,
  })
  const [activeView, setActiveView] = useState<'overview' | 'operations'>('overview')
  const towerState = useAlarmTower()
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null)
  const [towerActionSelections, setTowerActionSelections] = useState<Record<string, Partial<Record<TowerActionId, boolean>>>>({})
  const projectOptions = hierarchy?.projects ?? []
  const selectedProject = projectOptions.find((project) => project.code === scopeSelection.projectId) ?? null
  const contractOptions: ProgressHierarchyContract[] = selectedProject?.contracts ?? []
  const selectedContract = contractOptions.find((contract) => contract.code === scopeSelection.contractId) ?? null
  const sowOptions: ProgressHierarchySow[] = selectedContract?.sows ?? []
  const selectedSow = sowOptions.find((sow) => sow.code === scopeSelection.sowId) ?? null
  const processOptions: ProgressHierarchyProcess[] = selectedSow?.processes ?? []

  const scopeLabel = resolveScopeLabel(scopeSelection, hierarchy)
  const scopeNames = resolveScopeNames(scopeSelection, hierarchy)

  const logProcessHistorianEntry = useCallback(
    async (alarm: TowerAlarm | WorkspaceAlarmPayload, action: TowerActionId, extraPayload?: Record<string, unknown>) => {
      const isWorkspacePayload = (alarm as WorkspaceAlarmPayload).alarmId !== undefined && !('ts' in alarm)
      const alarmId = isWorkspacePayload ? (alarm as WorkspaceAlarmPayload).alarmId : (alarm as TowerAlarm).id
      const severity = isWorkspacePayload ? (alarm as WorkspaceAlarmPayload).severity : (alarm as TowerAlarm).severity
      const title = isWorkspacePayload ? (alarm as WorkspaceAlarmPayload).message : (alarm as TowerAlarm).label
      const scopePayload = isWorkspacePayload ? (alarm as WorkspaceAlarmPayload).scope : (alarm as TowerAlarm).scope
      const resolvedScope = {
        projectId: scopePayload?.projectId ?? scopePayload?.project_id ?? scopeSelection.projectId ?? null,
        projectName: scopePayload?.projectName ?? scopePayload?.project_name ?? scopeNames.projectName ?? null,
        contractId: scopePayload?.contractId ?? scopePayload?.contract_id ?? scopeSelection.contractId ?? null,
        contractName: scopePayload?.contractName ?? scopePayload?.contract_name ?? scopeNames.contractName ?? null,
        sowId: scopePayload?.sowId ?? scopePayload?.sow_id ?? scopeSelection.sowId ?? null,
        sowName: scopePayload?.sowName ?? scopePayload?.sow_name ?? scopeNames.sowName ?? null,
        processId: scopePayload?.processId ?? scopePayload?.process_id ?? scopeSelection.processId ?? null,
        processName: scopePayload?.processName ?? scopePayload?.process_name ?? scopeNames.processName ?? null,
      }
      try {
        await createProcessHistorianEntry({
          recordId: alarmId,
          alarmId,
          recordType: action === 'change' ? 'change' : 'alarm',
          action,
          projectId: resolvedScope.projectId,
          projectName: resolvedScope.projectName,
          contractId: resolvedScope.contractId,
          contractName: resolvedScope.contractName,
          sowId: resolvedScope.sowId,
          sowName: resolvedScope.sowName,
          processId: resolvedScope.processId,
          processName: resolvedScope.processName,
          title,
          severity,
          payload: {
            alarm,
            ...extraPayload,
          },
          notes: (extraPayload?.notes as string) ?? null,
        })
      } catch (err) {
        console.error('Failed to persist process historian entry', err)
      }
    },
    [
      scopeNames.contractName,
      scopeNames.processName,
      scopeNames.projectName,
      scopeNames.sowName,
      scopeSelection.contractId,
      scopeSelection.processId,
      scopeSelection.projectId,
      scopeSelection.sowId,
    ],
  )
  const handleTowerAcknowledge = useCallback(
    async (alarmIds: string[]) => {
      if (!alarmIds.length) return
      await Promise.all(
        alarmIds.map((id) =>
          acknowledgeAlert(id).catch((error) => {
            console.error('Failed to acknowledge alarm', error)
          }),
        ),
      )
      alarmIds.forEach((id) => acknowledgeTowerAlarm(id))
    },
    [],
  )

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const handleThemeToggle = () => setTheme((prev) => toggleThemeValue(prev))

  useEffect(() => {
    let cancelled = false
    fetchProgressHierarchy()
      .then((payload) => {
        if (!cancelled) {
          setHierarchy(payload)
        }
      })
      .catch((err) => {
        console.warn('Unable to fetch hierarchy for alarm center', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hierarchy?.projects.length) return
    setScopeSelection((prev) => {
      if (prev.projectId) return prev
      const firstProject = hierarchy.projects[0]
      return {
        projectId: firstProject.code,
        contractId: null,
        sowId: null,
        processId: null,
      }
    })
  }, [hierarchy])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    const load = async () => {
      if (!scopeSelection.projectId) {
        setAlerts([])
        setLastUpdated(new Date())
        return
      }
      setLoading(true)
      setError(null)
      try {
        const response = await fetchAlerts(scopeSelection.projectId)
        if (cancelled) return
        setAlerts(response)
        setLastUpdated(new Date())
      } catch (err) {
        if (cancelled) return
        console.error('Failed to load alerts', err)
        setError('Unable to update alarms right now.')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()
    timer = setInterval(load, POLLING_INTERVAL_MS)

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [scopeSelection.projectId])

  const markActionComplete = useCallback((alarmId: string, action: TowerActionId) => {
    setTowerActionSelections((prev) => ({
      ...prev,
      [alarmId]: { ...(prev[alarmId] ?? {}), [action]: true },
    }))
  }, [])

  const buildChangeNavigationState = useCallback(
    (overrides: Record<string, unknown> = {}) => ({
      projectId: scopeSelection.projectId ?? null,
      contractId: scopeSelection.contractId ?? null,
      sowId: scopeSelection.sowId ?? null,
      processId: scopeSelection.processId ?? null,
      projectName: scopeNames.projectName ?? null,
      contractName: scopeNames.contractName ?? null,
      sowName: scopeNames.sowName ?? null,
      processName: scopeNames.processName ?? null,
      ...overrides,
      origin: {
        path: '/alarms',
        label: 'Alarms',
        chain: ['Alarms'],
        state: {
          ...scopeSelection,
          ...scopeNames,
        },
      },
    }),
    [scopeNames, scopeSelection],
  )

  const launchCollaborationWorkspace = useCallback(
    (payload: WorkspaceAlarmPayload, breadcrumbLabel?: string | null) => {
      navigate('/collaboration', {
        state: {
          threadId: payload.alarmId ?? generateClientId(),
          origin: {
            path: '/alarms',
            label: 'Alarms',
            chain: ['Alarms', breadcrumbLabel ?? payload.alarmId ?? payload.message],
            state: {
              ...scopeSelection,
              ...scopeNames,
            },
          },
          context: {
            kind: 'alarm',
            payload,
          },
        },
      })
    },
    [navigate, scopeNames, scopeSelection],
  )

  const handleAlertCollaborate = useCallback(
    (alert: Alert) => {
      const payload = buildAlertWorkspacePayload(alert, scopeSelection, scopeNames)
      launchCollaborationWorkspace(payload, alert.title)
      void logProcessHistorianEntry(payload, 'collaborate', { source: 'alarm-center', notes: 'Collaboration opened from alarm detail' })
    },
    [launchCollaborationWorkspace, logProcessHistorianEntry, scopeNames, scopeSelection],
  )

  const handleTowerActionSelection = useCallback(
    async (alarm: TowerAlarm, action: TowerActionId) => {
      if (action === 'acknowledge') {
        try {
          await handleTowerAcknowledge([alarm.id])
          await logProcessHistorianEntry(alarm, action, { source: 'response-tower' })
          markActionComplete(alarm.id, action)
        } catch (err) {
          console.error('Unable to acknowledge alarm from tower', err)
        }
      } else if (action === 'collaborate') {
        const payload = buildTowerWorkspacePayload(alarm, scopeSelection, scopeNames)
        launchCollaborationWorkspace(payload, alarm.label)
        await logProcessHistorianEntry(alarm, action, { source: 'response-tower', notes: 'Collaboration initiated' })
        markActionComplete(alarm.id, action)
      } else {
        await logProcessHistorianEntry(alarm, action, { source: 'response-tower', notes: 'Change workspace opened' })
        navigate('/change-management', {
          state: buildChangeNavigationState({
            alertId: alarm.id,
            projectId: scopeSelection.projectId ?? alarm.scope?.projectId ?? null,
            contractId: scopeSelection.contractId ?? alarm.scope?.contractId ?? null,
            sowId: scopeSelection.sowId ?? alarm.scope?.sowId ?? null,
            processId: scopeSelection.processId ?? alarm.scope?.processId ?? null,
            seedRecommendation: alarm.label,
          }),
        })
        markActionComplete(alarm.id, action)
      }
      setOpenActionMenuId(null)
    },
    [
      handleTowerAcknowledge,
      logProcessHistorianEntry,
      markActionComplete,
      navigate,
      scopeNames.contractName,
      scopeNames.processName,
      scopeNames.projectName,
      scopeNames.sowName,
      scopeSelection.contractId,
      scopeSelection.processId,
      scopeSelection.projectId,
      scopeSelection.sowId,
      launchCollaborationWorkspace,
    ],
  )


  useEffect(() => {
    if (location.pathname !== '/alarms') return
    navigate('/alarms', {
      replace: true,
      state: {
        ...scopeSelection,
        ...scopeNames,
        focusAlertId: focusedAlertId,
      },
    })
  }, [
    focusedAlertId,
    location.pathname,
    navigate,
    scopeNames.contractName,
    scopeNames.processName,
    scopeNames.projectName,
    scopeNames.sowName,
    scopeSelection,
  ])

  const scopedAlerts = useMemo(() => filterAlertsByScope(alerts, scopeSelection), [alerts, scopeSelection])

  const buckets = useMemo(
    () =>
      scopedAlerts.reduce(
        (acc, alert) => {
          const severity = normaliseSeverity(alert)
          acc[severity].push(alert)
          return acc
        },
        {
          critical: [] as Alert[],
          major: [] as Alert[],
          minor: [] as Alert[],
        },
      ),
    [scopedAlerts],
  )

  const alertsByStatus = useMemo(() => {
    const base: Record<StatusKey, Alert[]> = {
      open: [],
      acknowledged: [],
      in_progress: [],
      mitigated: [],
      closed: [],
    }
    scopedAlerts.forEach((alert) => {
      const key = (alert.status ?? 'open').toLowerCase()
      if (STATUS_ORDER.includes(key as StatusKey)) {
        base[key as StatusKey].push(alert)
      } else {
        base.open.push(alert)
      }
    })
    STATUS_ORDER.forEach((status) => {
      base[status] = base[status].sort(
        (a, b) => new Date(b.raised_at ?? 0).getTime() - new Date(a.raised_at ?? 0).getTime(),
      )
    })
    return base
  }, [scopedAlerts])

  useEffect(() => {
    setLanePages((prev) => {
      let changed = false
      const next = { ...prev }
      STATUS_ORDER.forEach((status) => {
        const totalPages = Math.max(1, Math.ceil(alertsByStatus[status].length / LANE_PAGE_SIZE))
        const current = prev[status] ?? 0
        const clamped = Math.min(current, totalPages - 1)
        if (clamped !== current) {
          next[status] = clamped
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [alertsByStatus])

  useEffect(() => {
    setSeverityTablePage(0)
  }, [severityTableSeverity])
  const laneSlices = useMemo(() => {
    return STATUS_ORDER.reduce((acc, status) => {
      const laneList = alertsByStatus[status]
      const totalPages = Math.max(1, Math.ceil(laneList.length / LANE_PAGE_SIZE))
      const page = Math.min(lanePages[status] ?? 0, totalPages - 1)
      const start = page * LANE_PAGE_SIZE
      acc[status] = {
        items: laneList.slice(start, start + LANE_PAGE_SIZE),
        page,
        totalPages,
      }
      return acc
    }, {} as Record<StatusKey, { items: Alert[]; page: number; totalPages: number }>)
  }, [alertsByStatus, lanePages])
  const setLanePage = useCallback(
    (status: StatusKey, nextPage: number) => {
      setLanePages((prev) => {
        const totalPages = Math.max(1, Math.ceil(alertsByStatus[status].length / LANE_PAGE_SIZE))
        const clamped = Math.min(Math.max(nextPage, 0), totalPages - 1)
        if (clamped === prev[status]) return prev
        return { ...prev, [status]: clamped }
      })
    },
    [alertsByStatus],
  )

  const activeAlerts = useMemo(() => {
    if (selectedSeverity === 'all') {
      return [...buckets.critical, ...buckets.major, ...buckets.minor].sort(
        (a, b) => new Date(b.raised_at ?? 0).getTime() - new Date(a.raised_at ?? 0).getTime(),
      )
    }
    return buckets[selectedSeverity].sort(
      (a, b) => new Date(b.raised_at ?? 0).getTime() - new Date(a.raised_at ?? 0).getTime(),
    )
  }, [buckets, selectedSeverity])

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(activeAlerts.length / TIMELINE_PAGE_SIZE) - 1)
    setTimelinePage((prev) => Math.min(prev, maxPage))
  }, [activeAlerts.length])

  useEffect(() => {
    if (!activeAlerts.length) {
      setFocusedAlertId(null)
      return
    }
    if (!focusedAlertId || !activeAlerts.some((alert) => alert.id === focusedAlertId)) {
      setFocusedAlertId(activeAlerts[0].id)
    }
  }, [activeAlerts, focusedAlertId])

  const focusedAlert = useMemo(
    () => activeAlerts.find((alert) => alert.id === focusedAlertId) ?? null,
    [activeAlerts, focusedAlertId],
  )
  const playbook = useMemo(() => resolvePlaybook(focusedAlert), [focusedAlert])
  const timelinePageCount = Math.max(1, Math.ceil(activeAlerts.length / TIMELINE_PAGE_SIZE))
  const pagedTimelineAlerts = useMemo(() => {
    const start = timelinePage * TIMELINE_PAGE_SIZE
    return activeAlerts.slice(start, start + TIMELINE_PAGE_SIZE)
  }, [activeAlerts, timelinePage])
  const severityTableRows = buckets[severityTableSeverity]
  const SEVERITY_TABLE_PAGE_SIZE = 6
  const severityTablePageCount = Math.max(1, Math.ceil(severityTableRows.length / SEVERITY_TABLE_PAGE_SIZE))
  const pagedSeverityRows = useMemo(() => {
    const start = severityTablePage * SEVERITY_TABLE_PAGE_SIZE
    return severityTableRows.slice(start, start + SEVERITY_TABLE_PAGE_SIZE)
  }, [severityTablePage, severityTableRows])
  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(severityTableRows.length / SEVERITY_TABLE_PAGE_SIZE) - 1)
    setSeverityTablePage((prev) => Math.min(prev, maxPage))
  }, [severityTableRows.length])

  const [towerPage, setTowerPage] = useState(0)
  const towerActive = useMemo(() => towerState.alarms.filter((alarm) => !alarm.acknowledged), [towerState.alarms])
  const towerPageCount = Math.max(1, Math.ceil(towerActive.length / TOWER_PAGE_SIZE))
  useEffect(() => {
    if (towerPage > towerPageCount - 1) {
      setTowerPage(Math.max(0, towerPageCount - 1))
    }
  }, [towerPage, towerPageCount])
  useEffect(() => {
    setOpenActionMenuId(null)
  }, [towerPage, towerActive.length])
const towerSeverityCounts = useMemo(() => {
  return towerActive.reduce(
    (acc, alarm) => {
      acc[alarm.severity] += 1
      return acc
    },
    { info: 0, warn: 0, critical: 0 },
  )
}, [towerActive])
  const towerPageAlarms = useMemo(
    () => towerActive.slice(towerPage * TOWER_PAGE_SIZE, towerPage * TOWER_PAGE_SIZE + TOWER_PAGE_SIZE),
    [towerActive, towerPage],
  )
  const towerScopeSummary = useMemo(() => {
    const buckets = new Map<string, { count: number; label: string }>()
    towerActive.forEach((alarm) => {
      const key =
        alarm.scope?.processId ??
        alarm.scope?.sowId ??
        alarm.scope?.contractId ??
        alarm.scope?.projectId ??
        alarm.stage ??
        'global'
      const label =
        alarm.scope?.processName ??
        alarm.scope?.sowName ??
        alarm.scope?.contractName ??
        alarm.scope?.projectName ??
        alarm.stage ??
        'Global'
      const bucket = buckets.get(key) ?? { count: 0, label }
      bucket.count += 1
      buckets.set(key, bucket)
    })
    return Array.from(buckets.values()).sort((a, b) => b.count - a.count).slice(0, 4)
  }, [towerActive])

const logicStatuses = useMemo(() => {
    return PROCESS_LOGIC_RULES.map((rule) => {
      const activeAlarm =
        towerActive.find((alarm) => alarm.metadata?.scenarioId === rule.id || alarm.metadata?.scenarioLabel === rule.title) ?? null
      return {
        ...rule,
        active: Boolean(activeAlarm),
        currentSeverity: (activeAlarm?.severity ?? rule.severity) as Severity,
        alarmId: activeAlarm?.id ?? null,
      }
    })
  }, [towerActive])

  const hourlyDistribution = useMemo(() => {
    const buckets = Array(24).fill(0)
    scopedAlerts.forEach((alert) => {
      const ts = new Date(alert.raised_at).getHours()
      buckets[ts] += 1
    })
    return buckets
}, [scopedAlerts])

const hourlyOption = useMemo(() => {
  const max = Math.max(...hourlyDistribution, 5)
  return {
    backgroundColor: 'transparent',
    textStyle: { color: '#94a3b8' },
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 40, bottom: 30 },
    xAxis: {
      type: 'category',
      data: Array.from({ length: 24 }, (_, idx) => `${idx}:00`),
      axisLine: { lineStyle: { color: 'rgba(148,163,184,0.35)' } },
    },
    yAxis: {
      type: 'value',
      max: max + 2,
      axisLine: { lineStyle: { color: 'rgba(148,163,184,0.35)' } },
      splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
    },
    series: [
      {
        name: 'Alarms',
        type: 'line',
        smooth: true,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(59,130,246,0.35)' },
            { offset: 1, color: 'rgba(59,130,246,0.05)' },
          ]),
        },
        lineStyle: { color: '#38bdf8', width: 2 },
        data: hourlyDistribution,
      },
    ],
  }
}, [hourlyDistribution])

const last7Days = useMemo(() => {
  const days: string[] = []
  const now = new Date()
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(now)
    date.setDate(now.getDate() - i)
    days.push(date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))
  }
  return days
}, [])

const dailySeveritySeries = useMemo(() => {
  const template = last7Days.map(() => ({ critical: 0, major: 0, minor: 0 }))
  scopedAlerts.forEach((alert) => {
    const dayLabel = new Date(alert.raised_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    const index = last7Days.indexOf(dayLabel)
    if (index >= 0) {
      const sev = normaliseSeverity(alert)
      template[index][sev] += 1
    }
  })
  return template
}, [scopedAlerts, last7Days])

function resolvePlaybook(alert: Alert | null): PlaybookDefinition {
  if (!alert) return DEFAULT_PLAYBOOK
  const severity = normaliseSeverity(alert)
  const category = (alert.category ?? 'general').toLowerCase()
  const directMatch =
    PLAYBOOK_LIBRARY.find((entry) => entry.severity === severity && category.includes(entry.category)) ??
    PLAYBOOK_LIBRARY.find((entry) => category.includes(entry.category))
  return directMatch ?? DEFAULT_PLAYBOOK
}

const categoryDistribution = useMemo(() => {
  const map = new Map<string, number>()
  scopedAlerts.forEach((alert) => {
    const key = alert.category ?? 'Other'
    map.set(key, (map.get(key) ?? 0) + 1)
  })
  return Array.from(map.entries())
    .map(([category, count]) => ({ name: category, value: count }))
    .sort((a, b) => b.value - a.value)
}, [scopedAlerts])

const dailyStackOption = useMemo(() => ({
  backgroundColor: 'transparent',
  textStyle: { color: '#cbd5f5' },
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  legend: { data: ['Critical', 'Major', 'Minor'], textStyle: { color: '#cbd5f5' } },
  grid: { left: 50, right: 20, top: 40, bottom: 40 },
  xAxis: {
    type: 'category',
    data: last7Days,
    axisLine: { lineStyle: { color: 'rgba(148,163,184,0.35)' } },
  },
  yAxis: {
    type: 'value',
    axisLine: { lineStyle: { color: 'rgba(148,163,184,0.35)' } },
    splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
  },
  series: ['critical', 'major', 'minor'].map((sev) => ({
    name: sev === 'critical' ? 'Critical' : sev === 'major' ? 'Major' : 'Minor',
    type: 'bar',
    stack: 'severity',
    emphasis: { focus: 'series' },
    data: dailySeveritySeries.map((day) => day[sev as keyof typeof day]),
  })),
}), [dailySeveritySeries, last7Days])

const avgPerHour =
  scopedAlerts.length && scopedAlerts[scopedAlerts.length - 1]?.raised_at
    ? scopedAlerts.length / Math.max((Date.now() - new Date(scopedAlerts[scopedAlerts.length - 1].raised_at).getTime()) / 3_600_000, 1)
    : 0
const floodRatio = useMemo(() => {
  if (!scopedAlerts.length) return 0
  let burstEvents = 0
  scopedAlerts.forEach((alert) => {
    const ts = new Date(alert.raised_at).getTime()
    const windowStart = ts - 600000
    const count = scopedAlerts.filter((candidate) => {
      const candidateTs = new Date(candidate.raised_at).getTime()
      return candidateTs >= windowStart && candidateTs <= ts
    }).length
    if (count >= 10) {
      burstEvents += 1
    }
  })
  return (burstEvents / scopedAlerts.length) * 100
}, [scopedAlerts])

const categoryOption = useMemo(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
  legend: {
    orient: 'horizontal',
    bottom: 0,
    left: 'center',
    textStyle: { color: '#cbd5f5' },
    itemGap: 16,
    icon: 'circle',
  },
  series: [
    {
      name: 'Categories',
      type: 'pie',
      radius: ['45%', '70%'],
      center: ['50%', '42%'],
      avoidLabelOverlap: false,
      itemStyle: { borderWidth: 1, borderColor: '#0f172a' },
      label: { show: false },
      labelLine: { show: false },
      data: categoryDistribution.length ? categoryDistribution : [{ value: 1, name: 'No data' }],
    },
  ],
}), [categoryDistribution])

const buildGaugeOption = (value: number, title: string, max: number, unit = '') => ({
  tooltip: { formatter: '{b}: {c}' },
  series: [
    {
      type: 'gauge',
      startAngle: 200,
      endAngle: -20,
      min: 0,
      max,
      splitNumber: 4,
      axisLine: { lineStyle: { width: 8, color: [[0.33, '#22c55e'], [0.66, '#facc15'], [1, '#ef4444']] } },
      pointer: { width: 4 },
      detail: { formatter: `{value}${unit}`, color: '#e2e8f0', fontSize: 16 },
      title: { offsetCenter: [0, '60%'], color: '#94a3b8', fontSize: 12 },
      data: [{ value: Number(value.toFixed(1)), name: title }],
    },
  ],
})

const avgGaugeOption = useMemo(() => buildGaugeOption(avgPerHour, 'Avg alarms/hour', Math.max(10, avgPerHour * 1.5 + 5)), [avgPerHour])
const floodGaugeOption = useMemo(() => buildGaugeOption(floodRatio, '% time in flood', 100, '%'), [floodRatio])

  const totalCount = scopedAlerts.length

  const statusSummary = useMemo(() => {
    const base: Record<StatusKey, number> = {
      open: 0,
      acknowledged: 0,
      in_progress: 0,
      mitigated: 0,
      closed: 0,
    }
    scopedAlerts.forEach((alert) => {
      const key = (alert.status ?? 'open').toLowerCase()
      if (STATUS_ORDER.includes(key as StatusKey)) {
        base[key as StatusKey] += 1
      }
    })
    return base
  }, [scopedAlerts])

  const categorySummary = useMemo(() => {
    const map = new Map<string, number>()
    scopedAlerts.forEach((alert) => {
      const key = alert.category ?? 'Other'
      map.set(key, (map.get(key) ?? 0) + 1)
    })
    return Array.from(map.entries())
      .map(([category, count]) => ({
        category,
        count,
        share: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
  }, [scopedAlerts, totalCount])

  const topCategories = categorySummary.slice(0, 3)

  const timeMetrics = useMemo(() => {
    let denominator = 0
    let dueSoon = 0
    let overdue = 0
    const nowTs = Date.now()
    scopedAlerts.forEach((alert) => {
      const status = (alert.status ?? 'open').toLowerCase()
      if (status === 'mitigated' || status === 'closed') return
      if (!alert.due_at) return
      const due = new Date(alert.due_at).getTime()
      if (Number.isNaN(due)) return
      const diffHours = (due - nowTs) / 3_600_000
      denominator += 1
      if (diffHours < 0) overdue += 1
      else if (diffHours <= 12) dueSoon += 1
    })
    return {
      dueSoon,
      overdue,
    }
  }, [scopedAlerts])

  const breadcrumbs = useMemo(() => {
    const items: BreadcrumbItem[] = []
    if (towerState.lastOrigin) {
      const originPath = towerState.lastOrigin.path
      const originState = towerState.lastOrigin.state
      items.push({
        label: towerState.lastOrigin.label ?? 'Back',
        onClick: () => navigate(originPath ?? '/', { state: originState }),
      })
    } else {
      items.push({ label: 'Dashboard', onClick: () => navigate('/', { state: { openView: 'dashboard' } }) })
    }

    if (scopeNames.projectName) {
      items.push({
        label: scopeNames.projectName,
        onClick: () =>
          setScopeSelection((prev) => ({
            projectId: prev.projectId,
            contractId: null,
            sowId: null,
            processId: null,
          })),
      })
    }
    if (scopeNames.contractName) {
      items.push({
        label: scopeNames.contractName,
        onClick: () =>
          setScopeSelection((prev) => ({
            projectId: prev.projectId,
            contractId: prev.contractId,
            sowId: null,
            processId: null,
          })),
      })
    }
    if (scopeNames.sowName) {
      items.push({
        label: scopeNames.sowName,
        onClick: () =>
          setScopeSelection((prev) => ({
            projectId: prev.projectId,
            contractId: prev.contractId,
            sowId: prev.sowId,
            processId: null,
          })),
      })
    }
    if (scopeNames.processName) {
      items.push({
        label: scopeNames.processName,
      })
    }

    items.push({ label: 'Alarm Center', isCurrent: true })
    return items
  }, [navigate, scopeNames.contractName, scopeNames.processName, scopeNames.projectName, scopeNames.sowName, towerState.lastOrigin])

  const focusedMetadata = (focusedAlert?.metadata as AlertMetadata | null) ?? null
  const focusedImpact = focusedMetadata?.impact ?? null
  const focusedSignals = focusedMetadata?.signals ?? null
  const focusedStatusKey = (focusedAlert?.status?.toLowerCase() ?? 'open') as StatusKey

  return (
    <div className="alarm-center" data-theme={theme}>
      <SidebarNav
        activeIndex={activeNavIndex}
        onSelect={(index) => {
          setActiveNavIndex(index)
          if (index === HOME_NAV_INDEX) {
            navigate('/')
            return
          }
          if (index === CHANGE_NAV_INDEX) {
            navigate('/change-management', {
              state: buildChangeNavigationState(),
            })
            return
          }
        }}
        theme={theme}
        onToggleTheme={handleThemeToggle}
      />
      <div className="app-shell topbar-layout">
        <TopBar
          breadcrumbs={breadcrumbs}
          actions={<TopBarGlobalActions theme={theme} onToggleTheme={handleThemeToggle} scope={{ ...scopeSelection, ...scopeNames }} />}
        />
        <div className="alarm-center__layout">
          <main className="alarm-center__body">
            <section className="alarm-toolbar">
              <div className="scope-selector">
                <label>
                  <span>Project</span>
                  <select
                    value={scopeSelection.projectId ?? ''}
                    onChange={(event) =>
                      setScopeSelection({
                        projectId: event.target.value || null,
                        contractId: null,
                        sowId: null,
                        processId: null,
                      })
                    }
                  >
                    <option value="">Select project</option>
                    {projectOptions.map((project) => (
                      <option key={project.code} value={project.code}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Contract</span>
                  <select
                    value={scopeSelection.contractId ?? ''}
                    onChange={(event) =>
                      setScopeSelection((prev) => ({
                        projectId: prev.projectId,
                        contractId: event.target.value || null,
                        sowId: null,
                        processId: null,
                      }))
                    }
                    disabled={!selectedProject || !contractOptions.length}
                  >
                    <option value="">{contractOptions.length ? 'Select contract' : 'No contracts available'}</option>
                    {contractOptions.map((contract) => (
                      <option key={contract.code} value={contract.code}>
                        {contract.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>SOW</span>
                  <select
                    value={scopeSelection.sowId ?? ''}
                    onChange={(event) =>
                      setScopeSelection((prev) => ({
                        projectId: prev.projectId,
                        contractId: prev.contractId,
                        sowId: event.target.value || null,
                        processId: null,
                      }))
                    }
                    disabled={!selectedContract || !sowOptions.length}
                  >
                    <option value="">{sowOptions.length ? 'Select SOW' : 'No SOWs available'}</option>
                    {sowOptions.map((sow) => (
                      <option key={sow.code} value={sow.code}>
                        {sow.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Process</span>
                  <select
                    value={scopeSelection.processId ?? ''}
                    onChange={(event) =>
                      setScopeSelection((prev) => ({
                        projectId: prev.projectId,
                        contractId: prev.contractId,
                        sowId: prev.sowId,
                        processId: event.target.value || null,
                      }))
                    }
                    disabled={!selectedSow || !processOptions.length}
                  >
                    <option value="">{processOptions.length ? 'Select process' : 'No processes available'}</option>
                    {processOptions.map((process) => (
                      <option key={process.code} value={process.code}>
                        {process.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <div className="alarm-view-tabs" role="tablist" aria-label="Alarm center views">
              {[
                { id: 'overview' as const, label: 'Overview', helper: 'Analytics & guardrails' },
                { id: 'operations' as const, label: 'Response tower', helper: 'and workroom' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeView === tab.id}
                  className={`alarm-view-tabs__btn ${activeView === tab.id ? 'is-active' : ''}`}
                  onClick={() => setActiveView(tab.id)}
                >
                  <strong>{tab.label}</strong>
                  <span>{tab.helper}</span>
                </button>
              ))}
            </div>

            {error ? <div className="alarm-error">{error}</div> : null}

        <div className={`alarm-view alarm-view--overview ${activeView === 'overview' ? 'is-active' : ''}`} aria-hidden={activeView !== 'overview'}>
          <section className="alarm-analytics">
            <header>
              <div>
                <h3>Alarm analytics</h3>
                <p>ISA 18.2 guardrails · hourly trend, 7-day severity, categories, and gauges.</p>
              </div>
            </header>
            <div className="alarm-analytics__grid">
              <div className="alarm-analytics__card alarm-analytics__card--wide">
                <ReactECharts style={{ height: 260 }} option={hourlyOption} />
              </div>
              <div className="alarm-analytics__card">
                <ReactECharts style={{ height: 260 }} option={dailyStackOption} />
              </div>
              <div className="alarm-analytics__card">
                <ReactECharts style={{ height: 260 }} option={categoryOption} />
              </div>
              <div className="alarm-analytics__gauges">
                <ReactECharts style={{ height: 180 }} option={avgGaugeOption} />
                <ReactECharts style={{ height: 180 }} option={floodGaugeOption} />
              </div>
            </div>
          </section>

          <section className="alarm-hero">
            <div className="alarm-hero__primary">
              <div>
                <h1>Alarm Control Tower</h1>
                <p>{scopeLabel}</p>
              </div>
              <div className="alarm-hero__rings">
                {(['critical', 'major', 'minor'] as Severity[]).map((severity) => {
                  const isActive = selectedSeverity === severity
                  const ringValue =
                    severity === 'critical'
                      ? towerSeverityCounts.critical
                      : severity === 'major'
                        ? towerSeverityCounts.warn
                        : towerSeverityCounts.info
                  const scopeCount = buckets[severity].length
                  return (
                    <button
                      key={severity}
                      type="button"
                      className={`alarm-ring severity-${severity} ${isActive ? 'active' : ''}`}
                      onClick={() => setSelectedSeverity(isActive ? 'all' : severity)}
                    >
                      <span>{SEVERITY_LABELS[severity]}</span>
                      <strong>{ringValue}</strong>
                      <small>{scopeCount} in scope</small>
                    </button>
                  )
                })}
              </div>
              <div className="alarm-hero__context">
                {[{
                  label: 'Project',
                  value: scopeNames.projectName ?? '—',
                },
                {
                  label: 'Contract',
                  value: scopeNames.contractName ?? '—',
                },
                {
                  label: 'SOW',
                  value: scopeNames.sowName ?? '—',
                },
                {
                  label: 'Process',
                  value: scopeNames.processName ?? '—',
                }].map((item) => (
                  <span key={item.label}>
                    <small>{item.label}</small>
                    <strong>{item.value}</strong>
                  </span>
                ))}
              </div>
              <div className="alarm-hero__meta">
                <span>{loading ? 'Refreshing…' : `${totalCount} alarms in scope`}</span>
                {lastUpdated ? <span>Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> : null}
              </div>
            </div>
            <div className="alarm-hero__metrics">
              <div className="alarm-hero__metric">
                <span>Active workload</span>
                <strong>{statusSummary.open + statusSummary.acknowledged + statusSummary.in_progress}</strong>
                <small>
                  {buckets.critical.length} critical · {buckets.major.length} major
                </small>
              </div>
              <div className="alarm-hero__metric">
                <span>Due within 12h</span>
                <strong>{timeMetrics.dueSoon}</strong>
                <small>{timeMetrics.overdue} overdue</small>
              </div>
              <div className="alarm-hero__metric">
                <span>Active logic</span>
                <strong>{logicStatuses.filter((logic) => logic.active).length}</strong>
                <small>{logicStatuses.filter((logic) => logic.active).map((logic) => logic.title).join(', ') || 'All nominal'}</small>
              </div>
              <div className="alarm-hero__metric alarm-hero__metric--list">
                <span>Top categories</span>
                <ul>
                  {topCategories.length ? (
                    topCategories.map((item) => (
                      <li key={item.category}>
                        <strong>{item.category}</strong>
                        <span>
                          {item.count} · {item.share}%
                        </span>
                      </li>
                    ))
                  ) : (
                    <li>No dominant category</li>
                  )}
                </ul>
              </div>
            </div>
          </section>

          <section className="alarm-action-bar">
            <div className="alarm-action-bar__info">
              <h4>Live response cockpit</h4>
              <p>SCM, atom, and schedule alarms in one place. Orchestrate responses in seconds.</p>
            </div>
            <div className="alarm-action-bar__actions">
              <button type="button" onClick={() => handleTowerAcknowledge(towerActive.map((alarm) => alarm.id))} disabled={!towerActive.length}>
                Acknowledge all ({towerActive.length})
              </button>
              <button
                type="button"
                onClick={() =>
                  navigate('/change-management', {
                    state: buildChangeNavigationState(),
                  })
                }
              >
                Launch change workspace
              </button>
              <button
                type="button"
                onClick={() => setSelectedSeverity('critical')}
                className={selectedSeverity === 'critical' ? 'is-primary' : undefined}
              >
                Critical focus
              </button>
            </div>
          </section>
        </div>

        <div
          className={`alarm-view alarm-view--operations ${activeView === 'operations' ? 'is-active' : ''}`}
          aria-hidden={activeView !== 'operations'}
        >
          <section className="alarm-tower-panel">
            <header>
              <h2>Response tower &amp; workroom</h2>
              <p>Real-time signals across atoms, processes, SOWs, contracts, and projects with guided actions.</p>
            </header>
            <div className="alarm-tower-panel__severity">
              <div className="tower-token critical">
                <span>Critical</span>
                <strong>{towerSeverityCounts.critical}</strong>
              </div>
              <div className="tower-token warn">
                <span>Major</span>
                <strong>{towerSeverityCounts.warn}</strong>
              </div>
              <div className="tower-token info">
                <span>Minor</span>
                <strong>{towerSeverityCounts.info}</strong>
              </div>
            </div>
            <div className="alarm-tower-panel__scopes">
              {towerScopeSummary.length ? (
                towerScopeSummary.map((item) => (
                  <div key={item.label} className="tower-scope">
                    <span>{item.label}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))
              ) : (
                <div className="tower-scope tower-scope--empty">
                  <span>No dominant scope</span>
                </div>
              )}
            </div>
            <ul className="alarm-tower-panel__feed">
              {towerPageAlarms.length ? (
                towerPageAlarms.map((alarm) => (
                  <li key={alarm.id}>
                    <div className="tower-feed__main">
                      <span className={`tower-pill severity-${alarm.severity}`}>{alarm.severity.toUpperCase()}</span>
                      <div className="tower-feed__detail">
                        <strong>{alarm.label}</strong>
                        <small>
                          {alarm.scope?.processName ??
                            alarm.scope?.sowName ??
                            alarm.scope?.contractName ??
                            alarm.scope?.projectName ??
                            'Global'}{' '}
                          · {new Date(alarm.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </small>
                      </div>
                    </div>
                    <div className="tower-feed__actions">
                      <div className={`tower-action-menu ${openActionMenuId === alarm.id ? 'is-open' : ''}`}>
                        <button
                          type="button"
                          className="tower-action-menu__trigger"
                          aria-haspopup="true"
                          aria-expanded={openActionMenuId === alarm.id}
                          onClick={() => setOpenActionMenuId((prev) => (prev === alarm.id ? null : alarm.id))}
                        >
                          Action
                          <span aria-hidden="true">▾</span>
                        </button>
                        {openActionMenuId === alarm.id ? (
                          <div className="tower-action-menu__dropdown" role="menu">
                            {TOWER_ACTIONS.map((option) => {
                              const checked = Boolean(towerActionSelections[alarm.id]?.[option.id])
                              return (
                                <label key={option.id} className="tower-action-menu__option">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      if (!checked) {
                                        void handleTowerActionSelection(alarm, option.id)
                                      }
                                    }}
                                  />
                                  <div>
                                    <strong>{option.label}</strong>
                                    <span>{option.helper}</span>
                                  </div>
                                </label>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))
              ) : (
                <li className="tower-feed__empty">No live SCM alarms. The tower will populate as events stream in.</li>
              )}
            </ul>
            <div className="tower-collaboration-cta">
              <div>
                <strong>Collaboration workspace</strong>
                <p>Open the alarm-aware workroom to share context, actions, and AI summaries.</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  navigate('/collaboration', {
                    state: {
                      threadId: generateClientId(),
                      origin: {
                        path: '/alarms',
                        label: 'Alarms',
                        chain: ['Alarms'],
                      },
                      context: {
                        kind: 'page',
                        payload: {
                          title: 'Alarm tower snapshot',
                          path: '/alarms',
                          timestamp: new Date().toISOString(),
                          scope: {
                            ...scopeSelection,
                            ...scopeNames,
                          },
                          filters: {
                            severity: selectedSeverity,
                          },
                        },
                      },
                    },
                  })
                }
              >
                Launch workspace
              </button>
            </div>
            <div className="tower-pagination">
              <button type="button" onClick={() => setTowerPage((prev) => Math.max(0, prev - 1))} disabled={towerPage === 0}>
                Previous
              </button>
              <span>
                Page {Math.min(towerPage + 1, towerPageCount)} / {towerPageCount}
              </span>
              <button
                type="button"
                onClick={() => setTowerPage((prev) => Math.min(towerPageCount - 1, prev + 1))}
                disabled={towerPage >= towerPageCount - 1}
              >
                Next
              </button>
            </div>
          </section>

          <section className="alarm-logic-grid">
            <header>
              <div>
                <h3>Process alarm logic</h3>
                <p>Inspired by Emerson DeltaV guardrails. Each rule tracks a process-variable and pushes guided actions.</p>
              </div>
            </header>
            <div className="logic-grid">
              {logicStatuses.map((rule) => (
                <button
                  key={rule.id}
                  type="button"
                  className={`logic-card ${rule.active ? 'is-active' : ''} severity-${rule.currentSeverity}`}
                  onClick={() => {
                    if (rule.alarmId) {
                      handleTowerAcknowledge([rule.alarmId])
                    } else {
                      setSelectedSeverity(rule.severity)
                    }
                  }}
                >
                  <div className="logic-card__header">
                    <span>{rule.stage}</span>
                    <strong>{rule.title}</strong>
                  </div>
                  <p>{rule.description}</p>
                  <footer>
                    <div>
                      <small>Guided action</small>
                      <span>{rule.action}</span>
                    </div>
                    <span className="logic-card__status">{rule.active ? 'Active' : 'Normal'}</span>
                  </footer>
                </button>
              ))}
            </div>
          </section>

          {totalCount === 0 ? (
            <div className="alarm-empty-state" role="status">
              <strong>No active alarms in this scope.</strong>
              <span>SCM and field telemetry are nominal. Keep monitoring or widen the scope to review historical alerts.</span>
              <button
                type="button"
                onClick={() =>
                  navigate('/change-management', {
                    state: buildChangeNavigationState(),
                  })
                }
              >
                Open change workspace
              </button>
            </div>
          ) : null}

          <section className="alarm-severity-table" aria-label="Severity table">
            <header>
              <div>
                <h3>Severity table</h3>
                <p>Review critical, major, and minor alarms without scrolling.</p>
              </div>
              <div className="alarm-severity-table__tabs" role="tablist" aria-label="Severity filter">
                {(['critical', 'major', 'minor'] as Severity[]).map((severity) => (
                  <button
                    key={severity}
                    type="button"
                    role="tab"
                    aria-selected={severityTableSeverity === severity}
                    className={severityTableSeverity === severity ? 'is-active' : undefined}
                    onClick={() => setSeverityTableSeverity(severity)}
                  >
                    <span>{SEVERITY_LABELS[severity]}</span>
                    <small>{buckets[severity].length}</small>
                  </button>
                ))}
              </div>
            </header>
            <div className="alarm-severity-table__wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Scope</th>
                    <th>Raised</th>
                    <th>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedSeverityRows.length ? (
                    pagedSeverityRows.map((alert) => {
                      const severity = normaliseSeverity(alert)
                      const raised = alert.raised_at ? new Date(alert.raised_at).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: '2-digit' }) : '—'
                      const scopeMeta = (alert.metadata as AlertMetadata | null)?.scope
                      const scopeLabel =
                        scopeMeta?.process?.name ??
                        scopeMeta?.sow?.name ??
                        scopeMeta?.contract?.name ??
                        scopeMeta?.project?.name ??
                        alert.location ??
                        alert.activity ??
                        '—'
                      const statusKey = (alert.status ?? 'open').toLowerCase() as StatusKey
                      return (
                        <tr key={`severity-table-${alert.id}`}>
                          <td>
                            <span className={`badge severity-${severity}`}>{SEVERITY_LABELS[severity]}</span>
                          </td>
                          <td>
                            <button type="button" onClick={() => setFocusedAlertId(alert.id)}>
                              {alert.title}
                            </button>
                          </td>
                          <td>
                            <span className={`status-chip status-${statusKey}`}>{STATUS_LABELS[statusKey] ?? alert.status}</span>
                          </td>
                          <td>{scopeLabel}</td>
                          <td>{raised}</td>
                          <td>{alert.owner ?? '—'}</td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={6}>No {SEVERITY_LABELS[severityTableSeverity]} alarms in this scope.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="alarm-severity-table__pagination">
              <button
                type="button"
                onClick={() => setSeverityTablePage((prev) => Math.max(0, prev - 1))}
                disabled={severityTablePage === 0 || !severityTableRows.length}
              >
                Previous
              </button>
              <span>
                {severityTableRows.length
                  ? `Page ${Math.min(severityTablePage + 1, severityTablePageCount)} / ${severityTablePageCount}`
                  : 'No pages'}
              </span>
              <button
                type="button"
                onClick={() => setSeverityTablePage((prev) => Math.min(severityTablePageCount - 1, prev + 1))}
                disabled={severityTablePage >= severityTablePageCount - 1 || !severityTableRows.length}
              >
                Next
              </button>
            </div>
          </section>

          <section className="alarm-panels">
            <div className="alarm-panels__main">
              <div className="alarm-kanban">
                {STATUS_ORDER.filter((status) => status !== 'closed').map((status) => {
                  const laneMeta = laneSlices[status]
                  const laneAlerts = laneMeta?.items ?? []
                  const totalLane = alertsByStatus[status].length
                  const totalPages = laneMeta?.totalPages ?? 1
                  return (
                    <article key={status} className={`alarm-lane status-${status}`}>
                      <header>
                        <div className="lane-header__title">
                          <span>{STATUS_LABELS[status]}</span>
                          <strong>{totalLane}</strong>
                        </div>
                        <div className="lane-pagination">
                          <button type="button" onClick={() => setLanePage(status, (laneMeta?.page ?? 0) - 1)} disabled={(laneMeta?.page ?? 0) === 0}>
                            ‹
                          </button>
                          <span>
                            {totalLane ? (laneMeta?.page ?? 0) + 1 : 0}/{totalPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => setLanePage(status, (laneMeta?.page ?? 0) + 1)}
                            disabled={(laneMeta?.page ?? 0) >= totalPages - 1 || totalLane === 0}
                          >
                            ›
                          </button>
                        </div>
                      </header>
                      <ul>
                        {laneAlerts.map((alert) => {
                          const severity = normaliseSeverity(alert)
                          const dueDescriptor = formatDueDescriptor(alert.due_at)
                          return (
                            <li
                              key={alert.id}
                              className={`alarm-lane__card severity-${severity}`}
                              onClick={() => setFocusedAlertId(alert.id)}
                            >
                              <h4>{alert.title}</h4>
                              <p>{alert.location ?? alert.activity ?? 'No location specified'}</p>
                              <footer>
                                <span>{STATUS_LABELS[(alert.status?.toLowerCase() as StatusKey) ?? 'open']}</span>
                                {dueDescriptor ? <span>{dueDescriptor.label}</span> : null}
                              </footer>
                            </li>
                          )
                        })}
                        {!laneAlerts.length ? <li className="alarm-lane__empty">Lane clear</li> : null}
                      </ul>
                    </article>
                  )
                })}
              </div>

              <div className="alarm-timeline">
                <header>
                  <h2>Live alarm stream</h2>
                  <span>{selectedSeverity === 'all' ? 'All severities' : `${SEVERITY_LABELS[selectedSeverity]} focus`}</span>
                </header>
                <ul>
                  {pagedTimelineAlerts.map((alert) => {
                    const severity = normaliseSeverity(alert)
                    const statusKey = (alert.status ?? 'open').toLowerCase() as StatusKey
                    const statusLabel = STATUS_LABELS[statusKey] ?? (alert.status ?? 'Open')
                    const dueDescriptor = formatDueDescriptor(alert.due_at)
                    const raisedAt = alert.raised_at ? new Date(alert.raised_at).toLocaleString() : '—'
                    const isSelected = focusedAlertId === alert.id
                    return (
                      <li
                        key={alert.id}
                        className={`alarm-timeline__item ${isSelected ? 'selected' : ''}`}
                        onClick={() => setFocusedAlertId(alert.id)}
                      >
                        <div className="alarm-timeline__marker" />
                        <div className="alarm-timeline__body">
                          <div className="alarm-timeline__header">
                            <span className={`badge severity-${severity}`}>{SEVERITY_LABELS[severity]}</span>
                            <span className={`status-chip status-${statusKey}`}>{statusLabel}</span>
                            {dueDescriptor ? <span className={`due-chip due-chip--${dueDescriptor.tone}`}>{dueDescriptor.label}</span> : null}
                          </div>
                          <h3>{alert.title}</h3>
                          <p>{alert.root_cause ?? alert.recommendation ?? alert.activity ?? 'No summary provided.'}</p>
                          <div className="alarm-timeline__actions">
                            <button
                              type="button"
                              className="alarm-collaborate-btn"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleAlertCollaborate(alert)
                              }}
                            >
                              Collaborate
                            </button>
                            <small>Raised {raisedAt}</small>
                          </div>
                          <footer>
                            <span>{alert.location ?? alert.activity ?? 'Scope pending'}</span>
                            {alert.owner ? <span>Owner: {alert.owner}</span> : null}
                          </footer>
                        </div>
                      </li>
                    )
                  })}
                  {!pagedTimelineAlerts.length ? <li className="alarm-timeline__empty">No alarms match the current view.</li> : null}
                </ul>
                <div className="timeline-pagination">
                  <button
                    type="button"
                    onClick={() => setTimelinePage((prev) => Math.max(0, prev - 1))}
                    disabled={timelinePage === 0 || !activeAlerts.length}
                  >
                    Previous
                  </button>
                  <span>
                    {activeAlerts.length ? `Page ${Math.min(timelinePage + 1, timelinePageCount)} / ${timelinePageCount}` : 'No pages'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTimelinePage((prev) => Math.min(timelinePageCount - 1, prev + 1))}
                    disabled={timelinePage >= timelinePageCount - 1 || !activeAlerts.length}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>

            <aside className="alarm-detail">
              {focusedAlert ? (
                <div className="alarm-detail__card">
                  <header>
                    <span className={`badge severity-${normaliseSeverity(focusedAlert)}`}>{SEVERITY_LABELS[normaliseSeverity(focusedAlert)]}</span>
                    <span className={`status-chip status-${focusedStatusKey}`}>{STATUS_LABELS[focusedStatusKey]}</span>
                  </header>
                  <h2>{focusedAlert.title}</h2>
                  <p className="alarm-detail__lead">{focusedAlert.recommendation ?? focusedAlert.root_cause ?? 'Review alarm context and assign mitigation.'}</p>
                  <dl className="alarm-detail__meta">
                    {focusedAlert.raised_at ? (
                      <div>
                        <dt>Raised</dt>
                        <dd>{new Date(focusedAlert.raised_at).toLocaleString()}</dd>
                      </div>
                    ) : null}
                    {focusedAlert.due_at ? (
                      <div>
                        <dt>Due</dt>
                        <dd>{new Date(focusedAlert.due_at).toLocaleString()}</dd>
                      </div>
                    ) : null}
                    {focusedAlert.location ? (
                      <div>
                        <dt>Location</dt>
                        <dd>{focusedAlert.location}</dd>
                      </div>
                    ) : null}
                    {focusedAlert.activity ? (
                      <div>
                        <dt>Activity</dt>
                        <dd>{focusedAlert.activity}</dd>
                      </div>
                    ) : null}
                    {focusedAlert.owner ? (
                      <div>
                        <dt>Owner</dt>
                        <dd>{focusedAlert.owner}</dd>
                      </div>
                    ) : null}
                    {focusedMetadata?.workflow?.status ? (
                      <div>
                        <dt>Workflow</dt>
                        <dd>{focusedMetadata.workflow.status}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {focusedImpact ? (
                    <div className="alarm-detail__panel">
                      <h3>Impact</h3>
                      <ul>
                        {focusedImpact.scheduleDaysAtRisk !== null && focusedImpact.scheduleDaysAtRisk !== undefined ? (
                          <li>
                            <strong>{focusedImpact.scheduleDaysAtRisk}</strong>
                            <span>Schedule days at risk</span>
                          </li>
                        ) : null}
                        {focusedImpact.costExposureK !== null && focusedImpact.costExposureK !== undefined ? (
                          <li>
                            <strong>${focusedImpact.costExposureK}k</strong>
                            <span>Cost exposure</span>
                          </li>
                        ) : null}
                        {focusedImpact.productivityLossHours !== null && focusedImpact.productivityLossHours !== undefined ? (
                          <li>
                            <strong>{focusedImpact.productivityLossHours}</strong>
                            <span>Productivity hours</span>
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  ) : null}
                  {focusedSignals ? (
                    <div className="alarm-detail__panel">
                      <h3>Signals</h3>
                      <ul>
                        {focusedSignals.source ? (
                          <li>
                            <strong>Source</strong>
                            <span>{focusedSignals.source}</span>
                          </li>
                        ) : null}
                        {focusedSignals.tag ? (
                          <li>
                            <strong>Tag</strong>
                            <span>{focusedSignals.tag}</span>
                          </li>
                        ) : null}
                        {focusedSignals.lastReading ? (
                          <li>
                            <strong>Last reading</strong>
                            <span>{focusedSignals.lastReading}</span>
                          </li>
                        ) : null}
                        {focusedSignals.confidence ? (
                          <li>
                            <strong>Confidence</strong>
                            <span>{focusedSignals.confidence}%</span>
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  ) : null}
                  {focusedAlert.items?.length ? (
                    <div className="alarm-detail__panel">
                      <h3>Contributing factors</h3>
                      <ul>
                        {focusedAlert.items.map((item, index) => (
                          <li key={`${focusedAlert.id}-${index}`}>
                            <strong>{item.label}</strong>
                            <span>{item.detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="alarm-detail__actions">
                    <button type="button" className="secondary alarm-collaborate-btn" onClick={() => handleAlertCollaborate(focusedAlert)}>
                      Collaborate
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        navigate('/change-management', {
                          state: buildChangeNavigationState({
                            alertId: focusedAlert.id,
                            projectId: scopeSelection.projectId ?? focusedAlert.metadata?.scope?.projectId ?? null,
                            contractId: scopeSelection.contractId ?? focusedAlert.metadata?.scope?.contractId ?? null,
                            sowId: scopeSelection.sowId ?? focusedAlert.metadata?.scope?.sowId ?? null,
                            processId: scopeSelection.processId ?? focusedAlert.metadata?.scope?.processId ?? null,
                            seedRecommendation: focusedAlert.recommendation ?? focusedAlert.root_cause ?? '',
                          }),
                        })
                      }
                    >
                      Launch change action
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        navigate('/atoms/scm', {
                          state: {
                            tenantId: 'default',
                            projectId: scopeSelection.projectId,
                            contractId: scopeSelection.contractId,
                            sowId: scopeSelection.sowId,
                            processId: scopeSelection.processId,
                            source: 'ccc',
                          },
                        })
                      }
                    >
                      Open SCM workspace
                    </button>
                  </div>
                </div>
              ) : (
                <div className="alarm-detail__empty">
                  <h3>Select an alarm</h3>
                  <p>Choose an item from the stream to view context, root cause, and next actions.</p>
                </div>
              )}
            </aside>
          </section>
        </div>
        </main>
        <aside className="alarm-right-rail">
          <section className="alarm-sop-card">
            <header>
              <TopBarIcons.ClipboardCheck />
              <div>
                <h3>Playbooks</h3>
                <span>Alarm SOPs</span>
              </div>
            </header>
            <small className="alarm-sop-card__hint">
              {focusedAlert ? `Aligned to ${focusedAlert.title}` : 'Select an alarm to load a tailored SOP.'}
            </small>
            <div className="alarm-sop-card__meta">
              <span className={`badge severity-${playbook.severity}`}>{SEVERITY_LABELS[playbook.severity]}</span>
              <div>
                <small>Owner</small>
                <strong>{playbook.owner}</strong>
              </div>
              <div>
                <small>Resolution</small>
                <strong>{playbook.resolution}</strong>
              </div>
            </div>
            <p>{playbook.summary}</p>
            <ul className="alarm-sop-card__stats">
              {playbook.metrics.map((metric) => (
                <li key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </li>
              ))}
            </ul>
            <ol>
              {playbook.steps.map((step, index) => (
                <li key={`${playbook.id}-step-${index}`}>{step}</li>
              ))}
            </ol>
            <div className="alarm-sop-card__footer">
              <span>{playbook.guardrail}</span>
              <button type="button" onClick={() => setSelectedSeverity(playbook.severity)}>
                Focus {SEVERITY_LABELS[playbook.severity]}
              </button>
            </div>
          </section>

          <div className="alarm-right-rail__actions">
            {[
              {
                id: 'home',
                label: 'Portfolio Home',
                icon: <TopBarIcons.Radar />,
                helper: 'Back to dashboard',
                onClick: () => navigate('/', { state: { openView: 'dashboard' } }),
              },
              {
                id: 'scm',
                label: 'SCM Visual',
                icon: <TopBarIcons.Chart />,
                helper: 'Live process canvas',
                onClick: () => navigate('/atoms/scm/visual', { state: scopeSelection }),
              },
              {
                id: 'change',
                label: 'Change Mgmt',
                icon: <TopBarIcons.Users />,
                helper: 'Launch CR workspace',
                onClick: () => navigate('/change-management', { state: buildChangeNavigationState() }),
              },
            ].map((action) => (
              <button
                key={action.id}
                type="button"
                className="alarm-right-rail__btn"
                onClick={action.onClick}
                aria-label={action.label}
              >
                {action.icon}
                <div>
                  <strong>{action.label}</strong>
                  <span>{action.helper}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>
      </div>
      </div>
    </div>
  )
}
