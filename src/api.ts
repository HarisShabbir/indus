import { API_URL } from './config'
import {
  getFinancialFallbackAllocation,
  getFinancialFallbackExpenses,
  getFinancialFallbackFundFlow,
  getFinancialFallbackIncoming,
  getFinancialFallbackOutgoing,
  getFinancialFallbackSummary,
} from './data/financialFallback'
import {
  getContractKpiLatestDetailedFallback,
  getContractKpiLatestFallback,
  getContractKpiSeriesFallback,
} from './data/kpiFallback'
import { getScheduleFallback } from './data/scheduleFallback'
import { getAlertsFallback } from './data/alertsFallback'
import { getProjectControlCenterFallback } from './data/controlCenterFallback'
import { getProgressHierarchyFallback } from './data/progressHierarchyFallback'
import type { GanttTask } from './types'

export type Project = {
  id: string
  name: string
  lat: number
  lng: number
  status_pct: number
  phase: string
  alerts: number
  status_label?: string
  image?: string
  address?: string
  geofence_radius_m?: number
}

export type ContractSite = {
  id: string
  project_id: string
  name: string
  phase: string
  discipline?: string
  lat: number
  lng: number
  status_pct: number
  status_label?: string
  alerts: number
  image?: string
}

export type WorkOutputMetric = {
  label: string
  status: string
  percent?: number
}

export type MilestoneMetric = {
  label: string
  status: string
}

export type QualityMetric = {
  label: string
  closed: number
  open: number
  target?: string
}

export type WorkInProgressMetric = {
  contract: string
  status: string
  percent: number
}

export type SpiMetric = {
  value: number
  status: string
  runway_days: number
  burn_rate_days: number
  cash_flow: number
}

export type ProjectControlCenterPayload = {
  project: Project
  contracts: ContractSite[]
  metrics: {
    physical: { actual: number; planned: number }
    workOutputs: WorkOutputMetric[]
    milestones: MilestoneMetric[]
    quality: QualityMetric[]
    workInProgress: WorkInProgressMetric[]
    spi: SpiMetric
  }
}

export type ProjectAnalytics = {
  total_projects: number
  phase_breakdown: Record<string, number>
  average_progress: number
  alerts_total: number
}

export type AlertItem = { type: string; label: string; detail: string }
export type AlertScopeNode = { code: string; name: string }
export type AlertMetadata = {
  scope?: {
    project?: AlertScopeNode | null
    contract?: AlertScopeNode | null
    sow?: AlertScopeNode | null
    process?: AlertScopeNode | null
    level?: string | null
  }
  signals?: {
    source?: string | null
    tag?: string | null
    lastReading?: number | null
    confidence?: number | null
  }
  impact?: {
    scheduleDaysAtRisk?: number | null
    costExposureK?: number | null
    productivityLossHours?: number | null
    description?: string | null
  }
  workflow?: {
    status?: string | null
    owner?: string | null
    slaHours?: number | null
    lastUpdated?: string | null
    changeRequestId?: string | null
  }
  [key: string]: unknown
}
export type Alert = {
  id: string
  project_id: string
  title: string
  location?: string
  activity?: string
  severity?: string
  category?: string | null
  status?: string | null
  owner?: string | null
  root_cause?: string | null
  recommendation?: string | null
  acknowledged_at?: string | null
  due_at?: string | null
  cleared_at?: string | null
  raised_at: string
  metadata?: AlertMetadata | null
  items: AlertItem[]
}

export type ProjectCreatePayload = {
  name: string
  phase: string
  status_pct: number
  alerts?: number
  status_label?: string
  image?: string
  address?: string
  geofence_radius_m?: number
  lat?: number
  lng?: number
}

export type KpiLatestPoint = {
  ts_date: string
  actual: number | null
  planned: number | null
}

export type ContractKpiLatestResponse = {
  metrics: Record<string, KpiLatestPoint>
}

export type KpiSeriesResponse = {
  metric_code: string
  dates: string[]
  actual: Array<number | null>
  planned: Array<number | null>
}

export type ContractRightPanelLatest = {
  latest: Record<string, number | null>
}

export type ContractRightPanelSeries = {
  dates: string[]
  actual: Array<number | null>
  planned: Array<number | null>
}

export type ScheduleResponse = {
  tasks: GanttTask[]
}

export type ProcessScheduleItem = {
  id: string
  sowId: string
  name: string
  startPlanned: string
  endPlanned: string
  percentComplete: number
  spi?: number | null
  cpi?: number | null
}

export type SOWScheduleItem = {
  id: string
  contractId: string
  code: string
  name: string
  startPlanned: string
  endPlanned: string
  percentComplete: number
  spi?: number | null
  cpi?: number | null
  processes: ProcessScheduleItem[]
}

export type ContractSchedule = {
  id: string
  code: string
  name: string
  baselineVersion?: string
  updatedAt: string
  sows: SOWScheduleItem[]
  peerContracts?: Array<{ id: string; code: string; name: string }>
  placeholder?: boolean
  windowHint?: { start: string; end: string }
  offlineFallback?: boolean
}

export type ScheduleKpiResponse = {
  spi?: number | null
  cpi?: number | null
  ev?: number | null
  pv?: number | null
  ac?: number | null
  progressActual?: number | null
  progressPlanned?: number | null
  trend?: Array<{ date: string; spi: number | null }>
}


export type FinancialSummary = {
  ev: number | null
  pv: number | null
  ac: number | null
  spi: number | null
  cpi: number | null
  burn_rate: number | null
  variance_abs: number | null
  variance_pct: number | null
  as_of: string | null
}

export type FinancialAllocationRow = {
  description: string
  amount: number | null
  status: string | null
  contractId?: string | null
}

export type FinancialAllocationResponse = {
  project: FinancialAllocationRow
  contracts: FinancialAllocationRow[]
}

export type FinancialExpenseRow = {
  description: string
  contractCode?: string | null
  actual: number | null
  paid: number | null
  balance: number | null
  status: string | null
  children: FinancialExpenseRow[]
}

export type FinancialFundFlow = {
  nodes: Array<{ id: string; label: string; type: string }>
  links: Array<{ source: string; target: string; value: number }>
}

export type FinancialIncomingRow = {
  id: string
  accountName: string
  fundsDeposited: number | null
  dateOfDeposit: string | null
}

export type FinancialExpectedIncomingRow = {
  id: string
  accountName: string
  fundsExpected: number | null
  expectedDateOfDeposit: string | null
}

export type FinancialIncomingResponse = {
  available: FinancialIncomingRow[]
  expected: FinancialExpectedIncomingRow[]
}

export type FinancialOutgoingRow = {
  id: string
  accountName: string
  expenseValue: number | null
  dateOfExpense: string | null
}

export type FinancialExpectedOutgoingRow = {
  id: string
  accountName: string
  expectedExpenseValue: number | null
  expectedDateOfExpense: string | null
}

export type FinancialOutgoingResponse = {
  actual: FinancialOutgoingRow[]
  expected: FinancialExpectedOutgoingRow[]
}

export type AtomFinancialRange = {
  start: string
  end: string
  preset?: string | null
}

export type AtomFinancialFilters = {
  basis: string[]
  location?: string | null
  atomType?: string | null
  shift?: string | null
  billable?: string | null
  groupBy?: string | null
}

export type AtomFinancialFilterOption = {
  id: string
  label: string
  count?: number | null
}

export type AtomFinancialAvailableFilters = {
  basis: AtomFinancialFilterOption[]
  locations: AtomFinancialFilterOption[]
  atomTypes: AtomFinancialFilterOption[]
  shifts: AtomFinancialFilterOption[]
  statuses: AtomFinancialFilterOption[]
}

export type AtomFinancialKpis = {
  busyHours: number
  idleHours: number
  billableHours: number
  nonBillableHours: number
  utilizationPct: number
  earned: number
  timeEarned: number
  volumeEarned: number
  sensorEarned: number
  averageRate: number | null
  volumeBilled: number
}

export type AtomFinancialBasisBreakdown = {
  basis: string
  earned: number
  billableHours: number
  busyHours: number
  idleHours: number
  utilizationPct: number
  volume?: number | null
  allocationCount: number
}

export type AtomFinancialGroupingRow = {
  key: string
  code?: string | null
  name?: string | null
  earned: number
  billableHours: number
  busyHours: number
  idleHours: number
  utilizationPct: number
  volume?: number | null
  atomCount: number
  allocationCount: number
}

export type AtomFinancialTrendPoint = {
  date: string
  earned: number
  billableHours: number
  busyHours: number
  idleHours: number
  utilizationPct: number
}

export type AtomFinancialTrend = {
  earnedVsBillable: AtomFinancialTrendPoint[]
  utilization: AtomFinancialTrendPoint[]
}

export type AtomFinancialReconciliation = {
  plannedEarned: number
  actualEarned: number
  variance: number
  variancePct?: number | null
  plannedHours?: number | null
  actualHours?: number | null
  messages: string[]
}

export type AtomFinancialFlags = {
  missingRates: string[]
  zeroDuration: string[]
  overlaps: string[]
  highlights: string[]
}

export type AtomFinancialAllocation = {
  allocationId: string
  allocationDate: string
  atomId: string
  atomName: string
  atomType: string
  atomCategory: string
  contractCode?: string | null
  sowCode?: string | null
  processCode?: string | null
  processName?: string | null
  basis: 'time' | 'volume' | 'sensor'
  start?: string | null
  end?: string | null
  busyHours: number
  idleHours: number
  billableHours: number
  nonBillableHours: number
  quantity?: number | null
  quantityUnit?: string | null
  rate?: number | null
  rateUnit?: string | null
  standbyRate?: number | null
  overtimeMultiplier?: number | null
  surchargeMultiplier?: number | null
  earned: number
  plannedEarned?: number | null
  utilizationPct?: number | null
  location?: string | null
  shift?: string | null
  status?: string | null
  notes?: string | null
  nonBillableReason?: string | null
  sensorCondition?: string | null
  billable: boolean
  overlap: boolean
  formula?: string | null
  tags: string[]
}

export type AtomFinancialAllocationsPayload = {
  items: AtomFinancialAllocation[]
  total: number
}

export type AtomFinancialScopeInfo = {
  level: string
  id?: string | null
  code?: string | null
  name?: string | null
}

export type AtomFinancialScopeBlock = {
  scope: AtomFinancialScopeInfo
  kpis: AtomFinancialKpis
  basisBreakdown: AtomFinancialBasisBreakdown[]
  groupings: Record<string, AtomFinancialGroupingRow[]>
  trend: AtomFinancialTrend
  reconciliation: AtomFinancialReconciliation
  allocations: AtomFinancialAllocationsPayload
  flags: AtomFinancialFlags
}

export type AtomFinancialViewResponse = {
  generatedAt: string
  range: AtomFinancialRange
  scopeOrder: string[]
  selectedAtomId?: string | null
  selectedAtomName?: string | null
  filters: AtomFinancialFilters
  availableFilters: AtomFinancialAvailableFilters
  scopes: Record<string, AtomFinancialScopeBlock>
}

export type AtomCategory =
  | 'actors'
  | 'materials'
  | 'machinery'
  | 'consumables'
  | 'tools'
  | 'equipment'
  | 'systems'
  | 'technologies'
  | 'financials'

export type AtomRepositoryNode = {
  id: string
  parentId: string | null
  level: 'category' | 'group' | 'type' | 'atom'
  name: string
  category: AtomCategory
  total: number
  engaged: number
  idle: number
}

export type AtomRepositoryResponse = {
  asOf: string
  nodes: AtomRepositoryNode[]
}

export type AtomSummaryCard = {
  category: AtomCategory
  label: string
  total: number
  engaged: number
  idle: number
  trend: number[]
  totalCost?: number | null
  engagedCost?: number | null
}

export type AtomSummaryScope = {
  level: 'project' | 'contract' | 'sow' | 'process'
  entityId: string
  projectId: string
  contractId?: string | null
  sowId?: string | null
  processId?: string | null
}

export type AtomSummaryResponse = {
  asOf: string
  scope: AtomSummaryScope
  cards: AtomSummaryCard[]
}

export type AtomDeploymentRecord = {
  deploymentId: string
  atomId: string
  atomName: string
  atomType: string
  category: AtomCategory
  processId: string
  processName: string
  startTs: string
  endTs: string | null
  status: string
}

export type AtomJourneyEvent = {
  status: 'warehouse' | 'in_transit' | 'on_site' | 'engaged'
  ts: string
}

export type AtomDeploymentItemReport = {
  atomId: string
  serial?: string | null
  deploymentStart?: string | null
  hoursCompleted?: number | null
  latestTelemetry?: Record<string, unknown> | null
  journey: AtomJourneyEvent[]
  unitCost?: number | null
}

export type AtomDeploymentGroupReport = {
  atomType: string
  model: string
  vendor?: string | null
  capacity?: Record<string, unknown> | null
  count: number
  deploymentStartEarliest?: string | null
  hoursCompleted?: number | null
  workCompleted?: {
    qtyDone?: number | null
    percentComplete?: number | null
    ev?: number | null
    pv?: number | null
    ac?: number | null
  } | null
  journeyStatus?: string | null
  deploymentStatus?: string | null
  processId?: string | null
  processCode?: string | null
  processName?: string | null
  sowId?: string | null
  sowCode?: string | null
  sowName?: string | null
  contractId?: string | null
  contractCode?: string | null
  contractName?: string | null
  value?: number | null
  items: AtomDeploymentItemReport[]
}

export type AtomDeploymentReportResponse = {
  scope: AtomSummaryScope
  status: 'active' | 'idle'
  groups: AtomDeploymentGroupReport[]
  totals: Record<string, number>
  asOf: string
  pagination?: {
    page: number
    size: number
    totalGroups: number
  }
}

export type AtomManifestationAttribute = {
  id: string
  vendor: string
  machineType: string
  model: string
  name: string
  value: string | null
  units: string | null
  validation: string | null
}

export type AtomManifestationResponse = {
  vendor: string
  machineType: string
  model: string
  attributes: AtomManifestationAttribute[]
  count: number
  asOf: string
}

export type ProgressHierarchyProcess = {
  code: string
  name: string
}

export type ProgressHierarchySow = {
  code: string
  name: string
  processes: ProgressHierarchyProcess[]
}

export type ProgressHierarchyContract = {
  code: string
  name: string
  sows: ProgressHierarchySow[]
}

export type ProgressHierarchyProject = {
  code: string
  name: string
  contracts: ProgressHierarchyContract[]
}

export type ProgressHierarchyResponse = {
  projects: ProgressHierarchyProject[]
  asOf: string
}

export type AtomDeploymentResponse = {
  asOf: string
  deployments: AtomDeploymentRecord[]
}

export type AtomDeploymentMutation = {
  atomId: string
  processId: string
  action: 'assign' | 'unassign'
  startTs?: string
  endTs?: string
}

export type AtomProductivityLog = {
  logId: string
  atomId: string
  atomName: string
  atomType: string
  category: AtomCategory
  scopeLevel: 'project' | 'contract' | 'sow' | 'process'
  scopeCode: string
  logDate: string
  shift: string
  productiveHours: number
  idleHours: number
  totalHours: number
  utilisationRatio: number | null
  outputQuantity: number | null
  outputUnit: string | null
  qualityScore: number | null
  notes?: string | null
}

export type AtomProductivityTrendPoint = {
  logDate: string
  productiveHours: number
  idleHours: number
  outputQuantity: number | null
}

export type AtomProductivitySummary = {
  totalLogs: number
  totalProductiveHours: number
  totalIdleHours: number
  averageUtilisation: number | null
  totalOutputQuantity: number | null
}

export type AtomProductivityResponse = {
  asOf: string
  scope: AtomSummaryScope
  summary: AtomProductivitySummary
  logs: AtomProductivityLog[]
  trend: AtomProductivityTrendPoint[]
}

export type AtomDetailInfo = {
  atomId: string
  name: string
  category: AtomCategory
  typeName: string
  groupName?: string | null
  unit?: string | null
  contractor?: string | null
  homeCode?: string | null
  homeLevel?: string | null
  spec: Record<string, unknown>
}

export type AtomAttribute = {
  id: string
  label: string
  value: Record<string, unknown>
}

export type AtomMobilizationRecord = {
  id: string
  location?: string | null
  status: string
  mobilizedOn: string
  demobilizedOn?: string | null
  metadata: Record<string, unknown>
}

export type AtomDetailResponse = {
  asOf: string
  info: AtomDetailInfo
  attributes: AtomAttribute[]
  mobilization: AtomMobilizationRecord[]
  productivity: AtomProductivityTrendPoint[]
}

export type AtomStatusTile = {
  id: string
  label: string
  value: string
  caption?: string | null
  change?: number | null
  changeDirection: 'up' | 'down' | 'flat'
  severity: 'good' | 'warning' | 'critical' | 'neutral'
}

export type AtomTrendPointCompact = {
  date: string
  value: number
}

export type AtomTrendSeries = {
  id: string
  label: string
  unit?: string | null
  points: AtomTrendPointCompact[]
}

export type AtomExecutionMetric = {
  id: string
  label: string
  value: number
  unit?: string | null
  formatted: string
  change?: number | null
  changeDirection: 'up' | 'down' | 'flat'
  sparkline?: AtomTrendSeries | null
}

export type AtomExecutionCallouts = {
  positives: string[]
  watch: string[]
}

export type AtomMobilizationExperience = {
  records: AtomMobilizationRecord[]
  tiles: AtomStatusTile[]
  trend?: AtomTrendSeries | null
}

export type AtomExecutionExperience = {
  metrics: AtomExecutionMetric[]
  trendHighlights: AtomTrendSeries[]
  callouts: AtomExecutionCallouts
}

export type AtomExperienceResponse = {
  asOf: string
  info: AtomDetailInfo
  attributes: AtomAttribute[]
  mobilization: AtomMobilizationExperience
  execution: AtomExecutionExperience
}

export type AtomScheduleUpcoming = {
  scheduleId: string
  label: string
  plannedStart?: string | null
  plannedFinish?: string | null
  daysToStart?: number | null
}

export type AtomScheduleItem = {
  scheduleId: string
  atomId: string
  atomName: string
  atomType: string
  category: AtomCategory
  groupName?: string | null
  contractCode?: string | null
  sowCode?: string | null
  processCode?: string | null
  processName?: string | null
  processId?: string | null
  plannedStart?: string | null
  plannedFinish?: string | null
  actualStart?: string | null
  actualFinish?: string | null
  percentComplete?: number | null
  varianceDays?: number | null
  status?: string | null
  criticality?: string | null
  milestone?: string | null
  notes?: string | null
  dependencies: string[]
  conflictTypes: string[]
}

export type AtomScheduleSummary = {
  total: number
  onTrack: number
  atRisk: number
  delayed: number
  completed: number
  averageProgress?: number | null
  averageVariance?: number | null
  asOf: string
  upcoming: AtomScheduleUpcoming[]
  startsNextSeven: number
  finishesNextSeven: number
  risksNextSeven: number
}

export type AtomScheduleConflict = {
  conflictType: string
  scheduleIds: string[]
  message: string
}

export type AtomScheduleResponse = {
  scope: AtomSummaryScope
  summary: AtomScheduleSummary
  items: AtomScheduleItem[]
  conflicts: AtomScheduleConflict[]
  criticalPath: string[]
}

export type AtomScheduleTimeSlot = {
  start: string
  end: string
  process?: string | null
  location?: string | null
  status: 'busy' | 'idle' | 'monitoring' | 'completed' | 'extended'
  durationMinutes: number
  startMinutes?: number | null
  endMinutes?: number | null
  notes?: string | null
}

export type AtomScheduleVolumeSlot = {
  material?: string | null
  quantity?: number | null
  unit?: string | null
  process?: string | null
  window?: string | null
  status?: string | null
}

export type AtomScheduleSensorSlot = {
  label: string
  state?: string | null
  elapsedHours?: number | null
  targetHours?: number | null
  status?: string | null
}

export type AtomScheduleDailyRecord = {
  scheduleId: string
  scheduleDate: string
  totalBusyMinutes: number
  totalIdleMinutes: number
  totalAllocations: number
  volumeCommitted?: number | null
  volumeUnit?: string | null
  notes?: string | null
  timeSlots: AtomScheduleTimeSlot[]
  volumeSlots: AtomScheduleVolumeSlot[]
  sensorSlots: AtomScheduleSensorSlot[]
}

export type AtomScheduleDailySummary = {
  scheduleDate: string
  totalBusyMinutes: number
  totalIdleMinutes: number
  totalAllocations: number
  volumeCommitted?: number | null
  volumeUnit?: string | null
}

export type AtomScheduleDailyResponse = {
  atomId: string
  atomName: string
  category?: AtomCategory | null
  records: AtomScheduleDailyRecord[]
  availableDates: string[]
  summary?: AtomScheduleDailySummary | null
}

export type AtomScheduleCreatePayload = {
  tenantId: string
  projectId: string
  contractId?: string | null
  sowId?: string | null
  processId?: string | null
  atomId: string
  milestone?: string | null
  status?: string | null
  criticality?: string | null
  plannedStart: string
  plannedFinish: string
  notes?: string | null
  percentComplete?: number | null
}

export type AtomScheduleUpdatePayload = {
  plannedStart?: string | null
  plannedFinish?: string | null
  actualStart?: string | null
  actualFinish?: string | null
  percentComplete?: number | null
  status?: string | null
  notes?: string | null
  criticality?: string | null
}

export type AtomPaymentCategorySummary = {
  category: AtomCategory
  label: string
  committed: number
  paid: number
  outstanding: number
  overdue: number
}

export type AtomPaymentRecord = {
  paymentId: string
  atomId: string
  atomName: string
  atomType: string
  category: AtomCategory
  groupName?: string | null
  vendor?: string | null
  invoiceNumber?: string | null
  paymentMilestone?: string | null
  contractCode?: string | null
  sowCode?: string | null
  processCode?: string | null
  dueDate?: string | null
  paidDate?: string | null
  amount: number
  currency: string
  status: string
  varianceDays?: number | null
  notes?: string | null
}

export type AtomPaymentSummary = {
  committed: number
  paid: number
  outstanding: number
  overdueCount: number
  pendingCount: number
  averagePaymentDays?: number | null
  latestPaymentDate?: string | null
  asOf: string
}

export type AtomPaymentResponse = {
  scope: AtomSummaryScope
  summary: AtomPaymentSummary
  categories: AtomPaymentCategorySummary[]
  records: AtomPaymentRecord[]
}

export type ProgressSummaryResponse = {
  ev: number
  pv: number
  ac: number
  spi: number | null
  cpi: number | null
  percentComplete: number | null
  slips: number
  nextActivities: Array<{
    processId: string
    name: string
    plannedStart: string | null
    ready: boolean
  }>
  asOf: string
}

export type ScheduleSummaryResponse = {
  scopeLevel: string
  scopeCode: string
  plannedStart: string | null
  plannedFinish: string | null
  actualStart: string | null
  actualFinish: string | null
  durationVarianceDays: number | null
  percentComplete: number | null
  asOf: string
  nextActivities: ProgressSummaryResponse['nextActivities']
}

export type FinancialSummaryResponseV2 = {
  ev: number
  pv: number
  ac: number
  spi: number | null
  cpi: number | null
  costVariance: number | null
  scheduleVariance: number | null
  burnRate: number | null
  asOf: string
}

export type WeatherPoint = {
  id: string
  name: string
  lat: number
  lng: number
  entityType: 'project' | 'contract'
  temperatureC: number | null
  windSpeedKph: number | null
  weatherCode: number | null
  weatherDescription: string | null
  icon: string
  observedAt: string
  source: 'open-meteo' | 'fallback'
}

export type WeatherSummary = {
  generatedAt: string
  projects: WeatherPoint[]
  contracts: WeatherPoint[]
}

export type ScheduleWhatIfResponse = {
  projectedFinish: string
  deltaDays: number
  spiProjected?: number | null
  notes?: string[]
}

export type ProgressNextActivity = {
  processId: string
  name: string
  plannedStart: string | null
  ready: boolean
}

export type ProgressSummary = {
  ev: number
  pv: number
  ac: number
  spi: number | null
  cpi: number | null
  percentComplete: number | null
  slips: number
  nextActivities: ProgressNextActivity[]
  asOf: string
}

export type ProgressSummaryRequest = {
  projectId: string
  contractId?: string | null
  sowId?: string | null
  processId?: string | null
  tenantId?: string | null
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const message = await res.text()
    throw new Error(message || 'Unexpected API error')
  }
  return res.json() as Promise<T>
}

export async function fetchProjects(phase?: string): Promise<Project[]> {
  const res = await fetch(`${API_URL}/api/projects${phase ? `?phase=${encodeURIComponent(phase)}` : ''}`)
  return handleResponse<Project[]>(res)
}

export async function fetchProjectAnalytics(): Promise<ProjectAnalytics> {
  const res = await fetch(`${API_URL}/api/projects/analytics`)
  return handleResponse<ProjectAnalytics>(res)
}

export async function createProject(payload: ProjectCreatePayload): Promise<Project> {
  const res = await fetch(`${API_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleResponse<Project>(res)
}

export async function fetchAlerts(projectId?: string): Promise<Alert[]> {
  try {
    const res = await fetch(`${API_URL}/api/alerts${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`)
    return await handleResponse<Alert[]>(res)
  } catch (error) {
    console.warn('Using fallback alerts:', error)
    return getAlertsFallback(projectId)
  }
}

export async function fetchProjectControlCenter(projectId: string): Promise<ProjectControlCenterPayload> {
  try {
    const res = await fetch(`${API_URL}/api/projects/${encodeURIComponent(projectId)}/control-center`)
    return await handleResponse<ProjectControlCenterPayload>(res)
  } catch (error) {
    const fallback = getProjectControlCenterFallback(projectId)
    if (fallback) {
      console.warn(`Using fallback project control center for ${projectId}:`, error)
      return fallback
    }
    throw error
  }
}

export async function fetchContractKpiLatestDetailed(contractId: string): Promise<ContractKpiLatestResponse> {
  try {
    const res = await fetch(`${API_URL}/api/kpi/contract/${encodeURIComponent(contractId)}/latest`)
    return await handleResponse<ContractKpiLatestResponse>(res)
  } catch (error) {
    const fallback = getContractKpiLatestDetailedFallback(contractId)
    if (fallback) {
      console.warn(`Using fallback contract KPI snapshot for ${contractId}:`, error)
      return fallback
    }
    throw error
  }
}

export async function fetchContractKpiLatest(contractId: string): Promise<ContractRightPanelLatest> {
  try {
    const res = await fetch(`${API_URL}/api/contract/${encodeURIComponent(contractId)}/right-panel/latest`)
    return await handleResponse<ContractRightPanelLatest>(res)
  } catch (error) {
    const fallback = getContractKpiLatestFallback(contractId)
    if (fallback) {
      console.warn(`Using fallback contract right-panel metrics for ${contractId}:`, error)
      return fallback
    }
    throw error
  }
}

export async function fetchContractKpiSeries(contractId: string, metric: string, days = 90): Promise<ContractRightPanelSeries> {
  try {
    const res = await fetch(
      `${API_URL}/api/contract/${encodeURIComponent(contractId)}/right-panel/series?metric=${encodeURIComponent(metric)}&days=${days}`,
    )
    return await handleResponse<ContractRightPanelSeries>(res)
  } catch (error) {
    const fallback = getContractKpiSeriesFallback(contractId, metric)
    if (fallback) {
      console.warn(`Using fallback contract KPI series for ${contractId} (${metric}):`, error)
      return fallback
    }
    throw error
  }
}

export async function fetchProcessKpiSeries(processId: string, metric: string, days = 60): Promise<KpiSeriesResponse> {
  const res = await fetch(
    `${API_URL}/api/kpi/process/${encodeURIComponent(processId)}/series?metric=${encodeURIComponent(metric)}&days=${days}`,
  )
  return handleResponse<KpiSeriesResponse>(res)
}

export async function fetchSowKpiLatest(sowId: string): Promise<ContractKpiLatestResponse> {
  const res = await fetch(`${API_URL}/api/kpi/sow/${encodeURIComponent(sowId)}/latest`)
  return handleResponse<ContractKpiLatestResponse>(res)
}

async function fetchSchedule(scope: 'project' | 'contract' | 'sow' | 'process', id: string): Promise<GanttTask[]> {
  try {
    const res = await fetch(`${API_URL}/api/schedule/${scope}/${encodeURIComponent(id)}`)
    const payload = await handleResponse<ScheduleResponse>(res)
    return payload.tasks
  } catch (error) {
    const fallback = getScheduleFallback(scope, id)
    if (fallback) {
      console.warn(`Using fallback schedule data for ${scope}:${id}:`, error)
      return fallback
    }
    throw error
  }
}

export const fetchProjectSchedule = (projectId: string) => fetchSchedule('project', projectId)
export const fetchContractSchedule = (contractId: string) => fetchSchedule('contract', contractId)
export const fetchSowSchedule = (sowId: string) => fetchSchedule('sow', sowId)
export const fetchProcessSchedule = (processId: string) => fetchSchedule('process', processId)

const DEFAULT_TENANT_ID = 'default'

const buildProgressQuery = (params: ProgressSummaryRequest) => {
  if (!params.projectId) {
    throw new Error('projectId is required for progress summary requests')
  }
  const { projectId, tenantId, contractId, sowId, processId } = params
  const search = new URLSearchParams({
    tenantId: (tenantId ?? DEFAULT_TENANT_ID) || DEFAULT_TENANT_ID,
    projectId,
  })
  if (contractId) {
    search.append('contractId', contractId)
  }
  if (sowId) {
    search.append('sowId', sowId)
  }
  if (processId) {
    search.append('processId', processId)
  }
  return search.toString()
}

export async function fetchProgressSummaryV2(
  params: ProgressSummaryRequest,
  signal?: AbortSignal,
): Promise<ProgressSummaryResponse> {
  const res = await fetch(`${API_URL}/api/v2/progress/summary?${buildProgressQuery(params)}`, { signal })
  return handleResponse<ProgressSummaryResponse>(res)
}

export async function fetchScheduleSummaryV2(
  params: ProgressSummaryRequest,
  signal?: AbortSignal,
): Promise<ScheduleSummaryResponse> {
  const res = await fetch(`${API_URL}/api/v2/schedule/summary?${buildProgressQuery(params)}`, { signal })
  return handleResponse<ScheduleSummaryResponse>(res)
}

export async function fetchFinancialSummaryV2(
  projectId: string,
  contractId?: string | null,
  tenantId: string = DEFAULT_TENANT_ID,
  signal?: AbortSignal,
): Promise<FinancialSummaryResponseV2> {
  const res = await fetch(
    `${API_URL}/api/v2/financial/summary?${buildFinancialQuery(projectId, contractId ?? undefined, tenantId)}`,
    { signal },
  )
  return handleResponse<FinancialSummaryResponseV2>(res)
}

export async function postDPPRBulk(payload: {
  tenantId?: string
  rows: Array<{
    entityId: string
    reportDate: string
    qtyDone?: number | null
    qtyPlanned?: number | null
    ev?: number | null
    pv?: number | null
    ac?: number | null
    notes?: string | null
  }>
}): Promise<{ updated: number; asOf: string }> {
  const res = await fetch(`${API_URL}/api/v2/progress/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: payload.tenantId ?? DEFAULT_TENANT_ID,
      rows: payload.rows,
    }),
  })
  return handleResponse<{ updated: number; asOf: string }>(res)
}

export type ProgressSummary = ProgressSummaryResponse
export const fetchProgressSummary = fetchProgressSummaryV2

const buildFinancialQuery = (projectId: string, contractId?: string | null, tenantId: string = DEFAULT_TENANT_ID) => {
  const params = new URLSearchParams({ tenantId, projectId })
  if (contractId) {
    params.append('contractId', contractId)
  }
  return params.toString()
}

export async function fetchFinancialSummary(projectId: string, contractId?: string | null, tenantId: string = DEFAULT_TENANT_ID): Promise<FinancialSummary> {
  try {
    const res = await fetch(`${API_URL}/api/v2/financial/summary?${buildFinancialQuery(projectId, contractId, tenantId)}`)
    return await handleResponse<FinancialSummary>(res)
  } catch (error) {
    const fallback = getFinancialFallbackSummary(projectId, contractId ?? undefined)
    if (fallback) {
      console.warn('Using fallback financial summary', { projectId, contractId, error })
      return fallback
    }
    throw error
  }
}

export async function fetchFinancialAllocation(projectId: string, tenantId: string = DEFAULT_TENANT_ID): Promise<FinancialAllocationResponse> {
  try {
    const res = await fetch(`${API_URL}/api/v2/financial/fund-allocation?${buildFinancialQuery(projectId, null, tenantId)}`)
    return await handleResponse<FinancialAllocationResponse>(res)
  } catch (error) {
    const fallback = getFinancialFallbackAllocation(projectId)
    if (fallback) {
      console.warn('Using fallback fund allocation', { projectId, error })
      return fallback
    }
    throw error
  }
}

export async function fetchFinancialExpenses(projectId: string, contractId?: string | null, tenantId: string = DEFAULT_TENANT_ID): Promise<FinancialExpenseRow[]> {
  try {
    const res = await fetch(`${API_URL}/api/v2/financial/expenses?${buildFinancialQuery(projectId, contractId, tenantId)}`)
    return await handleResponse<FinancialExpenseRow[]>(res)
  } catch (error) {
    const fallback = getFinancialFallbackExpenses(projectId, contractId ?? undefined)
    if (fallback) {
      console.warn('Using fallback expenses', { projectId, contractId, error })
      return fallback
    }
    throw error
  }
}

export async function fetchFinancialFundFlow(projectId: string, contractId?: string | null, tenantId: string = DEFAULT_TENANT_ID): Promise<FinancialFundFlow> {
  try {
    const res = await fetch(`${API_URL}/api/v2/financial/fund-flow?${buildFinancialQuery(projectId, contractId, tenantId)}`)
    return await handleResponse<FinancialFundFlow>(res)
  } catch (error) {
    const fallback = getFinancialFallbackFundFlow(projectId, contractId ?? undefined)
    if (fallback) {
      console.warn('Using fallback fund flow', { projectId, contractId, error })
      return fallback
    }
    throw error
  }
}

export async function fetchFinancialIncoming(projectId: string, tenantId: string = DEFAULT_TENANT_ID): Promise<FinancialIncomingResponse> {
  try {
    const res = await fetch(`${API_URL}/api/v2/financial/incoming?${buildFinancialQuery(projectId, null, tenantId)}`)
    return await handleResponse<FinancialIncomingResponse>(res)
  } catch (error) {
    const fallback = getFinancialFallbackIncoming(projectId)
    if (fallback) {
      console.warn('Using fallback incoming funds', { projectId, error })
      return fallback
    }
    throw error
  }
}

export async function fetchFinancialOutgoing(projectId: string, contractId?: string | null, tenantId: string = DEFAULT_TENANT_ID): Promise<FinancialOutgoingResponse> {
  try {
    const res = await fetch(`${API_URL}/api/v2/financial/outgoing?${buildFinancialQuery(projectId, contractId, tenantId)}`)
    return await handleResponse<FinancialOutgoingResponse>(res)
  } catch (error) {
    const fallback = getFinancialFallbackOutgoing(projectId, contractId ?? undefined)
    if (fallback) {
      console.warn('Using fallback outgoing funds', { projectId, contractId, error })
      return fallback
    }
    throw error
  }
}

const buildAtomQuery = (params: Record<string, string | null | undefined>) => {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value)
    }
  })
  return query.toString()
}

export async function fetchAtomRepository(params: {
  tenantId?: string
  projectId: string
  contractId?: string | null
}): Promise<AtomRepositoryResponse> {
  const query = buildAtomQuery({
    tenantId: params.tenantId ?? DEFAULT_TENANT_ID,
    projectId: params.projectId,
    contractId: params.contractId ?? undefined,
  })
  const res = await fetch(`${API_URL}/api/v2/atoms/repository?${query}`)
  return handleResponse<AtomRepositoryResponse>(res)
}

export async function fetchAtomSummary(params: {
  tenantId?: string
  projectId: string
  contractId?: string | null
  sowId?: string | null
  processId?: string | null
}): Promise<AtomSummaryResponse> {
  const query = buildAtomQuery({
    tenantId: params.tenantId ?? DEFAULT_TENANT_ID,
    projectId: params.projectId,
    contractId: params.contractId ?? undefined,
    sowId: params.sowId ?? undefined,
    processId: params.processId ?? undefined,
  })
  const res = await fetch(`${API_URL}/api/v2/atoms/summary?${query}`)
  return handleResponse<AtomSummaryResponse>(res)
}

export async function fetchAtomDeployments(params: {
  tenantId?: string
  projectId: string
  contractId?: string | null
  sowId?: string | null
  processId?: string | null
}): Promise<AtomDeploymentResponse> {
  const query = buildAtomQuery({
    tenantId: params.tenantId ?? DEFAULT_TENANT_ID,
    projectId: params.projectId,
    contractId: params.contractId ?? undefined,
    sowId: params.sowId ?? undefined,
    processId: params.processId ?? undefined,
  })
  const res = await fetch(`${API_URL}/api/v2/atoms/deployments?${query}`)
  return handleResponse<AtomDeploymentResponse>(res)
}

export async function fetchAtomProductivity(params: {
  tenantId?: string
  projectId: string
  contractId?: string | null
  sowId?: string | null
  processId?: string | null
  category?: string | null
  startDate?: string | Date | null
  endDate?: string | Date | null
  limit?: number
}): Promise<AtomProductivityResponse> {
  const normalizeDate = (value?: string | Date | null) => {
    if (!value) return undefined
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10)
    }
    return value
  }

  const query = buildAtomQuery({
    tenantId: params.tenantId ?? DEFAULT_TENANT_ID,
    projectId: params.projectId,
    contractId: params.contractId ?? undefined,
    sowId: params.sowId ?? undefined,
    processId: params.processId ?? undefined,
    category: params.category ?? undefined,
    startDate: normalizeDate(params.startDate),
    endDate: normalizeDate(params.endDate),
    limit: params.limit ? String(params.limit) : undefined,
  })
  const res = await fetch(`${API_URL}/api/v2/atoms/productivity?${query}`)
  return handleResponse<AtomProductivityResponse>(res)
}

export async function fetchAtomDeploymentReport(params: {
  tenantId?: string
  projectId: string
  contractId?: string | null
  sowId?: string | null
  processId?: string | null
  status?: 'active' | 'idle'
  page?: number
  size?: number
  sort?: string | null
  category?: string | null
}): Promise<AtomDeploymentReportResponse> {
  const search = buildAtomQuery({
    tenantId: params.tenantId ?? DEFAULT_TENANT_ID,
    projectId: params.projectId,
    contractId: params.contractId ?? undefined,
    sowId: params.sowId ?? undefined,
    processId: params.processId ?? undefined,
    status: params.status ?? 'active',
    page: params.page ? String(params.page) : undefined,
    size: params.size ? String(params.size) : undefined,
    sort: params.sort ?? undefined,
    category: params.category ?? undefined,
  })
  const res = await fetch(`${API_URL}/api/v2/atoms/deployments/report?${search}`)
  return handleResponse<AtomDeploymentReportResponse>(res)
}

export async function fetchAtomSchedule(
  params: {
    tenantId?: string
    projectId: string
    contractId?: string | null
    sowId?: string | null
    processId?: string | null
  },
  signal?: AbortSignal,
): Promise<AtomScheduleResponse> {
  const query = buildAtomQuery({
    tenantId: params.tenantId ?? DEFAULT_TENANT_ID,
    projectId: params.projectId,
    contractId: params.contractId ?? undefined,
    sowId: params.sowId ?? undefined,
    processId: params.processId ?? undefined,
  })
  const res = await fetch(`${API_URL}/api/v2/atoms/schedule?${query}`, { signal })
  return handleResponse<AtomScheduleResponse>(res)
}

export async function createAtomScheduleAllocation(payload: AtomScheduleCreatePayload, actor?: string): Promise<AtomScheduleItem> {
  const res = await fetch(`${API_URL}/api/v2/atoms/schedule`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(actor ? { 'X-User-Id': actor } : {}),
    },
    body: JSON.stringify(payload),
  })
  return handleResponse<AtomScheduleItem>(res)
}

export async function updateAtomScheduleAllocation(
  scheduleId: string,
  payload: AtomScheduleUpdatePayload,
  actor?: string,
): Promise<AtomScheduleItem> {
  const res = await fetch(`${API_URL}/api/v2/atoms/schedule/${encodeURIComponent(scheduleId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(actor ? { 'X-User-Id': actor } : {}),
    },
    body: JSON.stringify(payload),
  })
  return handleResponse<AtomScheduleItem>(res)
}

export async function deleteAtomScheduleAllocation(scheduleId: string, actor?: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v2/atoms/schedule/${encodeURIComponent(scheduleId)}`, {
    method: 'DELETE',
    headers: {
      ...(actor ? { 'X-User-Id': actor } : {}),
    },
  })
  if (!res.ok) {
    const message = await res.text()
    throw new Error(message || 'Failed to delete schedule allocation')
  }
}

export async function fetchAtomDailySchedule(
  atomId: string,
  tenantId: string = DEFAULT_TENANT_ID,
  limit = 14,
): Promise<AtomScheduleDailyResponse> {
  const search = new URLSearchParams({ tenantId, limit: String(limit) })
  const res = await fetch(`${API_URL}/api/v2/atoms/${encodeURIComponent(atomId)}/schedule/daily?${search.toString()}`)
  return handleResponse<AtomScheduleDailyResponse>(res)
}

export async function fetchAtomPayments(
  params: {
    tenantId?: string
    projectId: string
    contractId?: string | null
    sowId?: string | null
    processId?: string | null
  },
  signal?: AbortSignal,
): Promise<AtomPaymentResponse> {
  const query = buildAtomQuery({
    tenantId: params.tenantId ?? DEFAULT_TENANT_ID,
    projectId: params.projectId,
    contractId: params.contractId ?? undefined,
    sowId: params.sowId ?? undefined,
    processId: params.processId ?? undefined,
  })
  const res = await fetch(`${API_URL}/api/v2/atoms/payments?${query}`, { signal })
  return handleResponse<AtomPaymentResponse>(res)
}

export async function fetchAtomFinancialView(
  params: {
    tenantId?: string | null
    projectId: string
    contractId?: string | null
    sowId?: string | null
    processId?: string | null
    atomId?: string | null
    startDate?: string | null
    endDate?: string | null
    basis?: string[] | null
    location?: string | null
    atomType?: string | null
    shift?: string | null
    billable?: string | null
    groupBy?: string | null
  },
  signal?: AbortSignal,
): Promise<AtomFinancialViewResponse> {
  const query = new URLSearchParams({
    tenantId: params.tenantId ?? DEFAULT_TENANT_ID,
    projectId: params.projectId,
  })
  if (params.contractId) query.set('contractId', params.contractId)
  if (params.sowId) query.set('sowId', params.sowId)
  if (params.processId) query.set('processId', params.processId)
  if (params.atomId) query.set('atomId', params.atomId)
  if (params.startDate) query.set('startDate', params.startDate)
  if (params.endDate) query.set('endDate', params.endDate)
  if (params.basis && params.basis.length > 0) query.set('basis', params.basis.join(','))
  if (params.location) query.set('location', params.location)
  if (params.atomType) query.set('atomType', params.atomType)
  if (params.shift) query.set('shift', params.shift)
  if (params.billable) query.set('billable', params.billable)
  if (params.groupBy) query.set('groupBy', params.groupBy)

  const res = await fetch(`${API_URL}/api/v2/atoms/financial/view?${query.toString()}`, { signal })
  return handleResponse<AtomFinancialViewResponse>(res)
}

export async function fetchAtomManifestation(params: {
  tenantId?: string
  vendor: string
  machineType: string
  model: string
}): Promise<AtomManifestationResponse> {
  const search = new URLSearchParams({
    tenantId: params.tenantId ?? DEFAULT_TENANT_ID,
    vendor: params.vendor,
    machineType: params.machineType,
    model: params.model,
  })
  const res = await fetch(`${API_URL}/api/v2/atoms/manifestation?${search.toString()}`)
  return handleResponse<AtomManifestationResponse>(res)
}

export async function fetchAtomDetail(atomId: string, tenantId: string = DEFAULT_TENANT_ID): Promise<AtomDetailResponse> {
  const res = await fetch(`${API_URL}/api/v2/atoms/${atomId}?tenantId=${encodeURIComponent(tenantId)}`)
  return handleResponse<AtomDetailResponse>(res)
}

export async function fetchAtomExperience(atomId: string, tenantId: string = DEFAULT_TENANT_ID): Promise<AtomExperienceResponse> {
  const res = await fetch(`${API_URL}/api/v3/atoms/${atomId}/experience?tenantId=${encodeURIComponent(tenantId)}`)
  return handleResponse<AtomExperienceResponse>(res)
}

export async function fetchProgressHierarchy(tenantId: string = DEFAULT_TENANT_ID): Promise<ProgressHierarchyResponse> {
  try {
    const res = await fetch(`${API_URL}/api/v2/progress/hierarchy?tenantId=${encodeURIComponent(tenantId)}`)
    return await handleResponse<ProgressHierarchyResponse>(res)
  } catch (error) {
    console.warn('Using fallback progress hierarchy:', error)
    return getProgressHierarchyFallback()
  }
}

export async function mutateAtomDeployment(
  params: {
    tenantId?: string
    projectId: string
    contractId?: string | null
    sowId?: string | null
    processId?: string | null
  },
  payload: AtomDeploymentMutation,
  role: 'contractor' | 'client' = 'contractor',
): Promise<AtomDeploymentResponse> {
  const query = buildAtomQuery({
    tenantId: params.tenantId ?? DEFAULT_TENANT_ID,
    projectId: params.projectId,
    contractId: params.contractId ?? undefined,
    sowId: params.sowId ?? undefined,
    processId: params.processId ?? undefined,
  })
  const res = await fetch(`${API_URL}/api/v2/atoms/deployments?${query}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Role': role,
    },
    body: JSON.stringify(payload),
  })
  return handleResponse<AtomDeploymentResponse>(res)
}

function buildContractScheduleFromTasks(contractId: string, tasks: GanttTask[]): ContractSchedule | null {
  if (!tasks.length) return null
  const contractTask = tasks.find((task) => task.id.startsWith('contract:'))
  const sowTasks = tasks.filter((task) => task.id.startsWith('sow:'))
  if (!contractTask || sowTasks.length === 0) {
    return null
  }

  const processTasks = tasks.filter((task) => task.id.startsWith('process:'))
  const processBySow = processTasks.reduce<Record<string, ProcessScheduleItem[]>>((acc, task) => {
    const parent = task.parent
    if (!parent) return acc
    const sowId = parent.split(':')[1]
    acc[sowId] = acc[sowId] ?? []
    acc[sowId].push({
      id: task.id.split(':')[1],
      sowId,
      name: task.name,
      startPlanned: task.start,
      endPlanned: task.end,
      percentComplete: task.progress,
      spi: (task.meta?.spi as number | undefined) ?? null,
      cpi: (task.meta?.cpi as number | undefined) ?? null,
    })
    return acc
  }, {})

  const sows: SOWScheduleItem[] = sowTasks.map((sowTask) => {
    const sowId = sowTask.id.split(':')[1]
    const processes = processBySow[sowId] ?? []
    const percent =
      processes.length > 0
        ? processes.reduce((total, proc) => total + proc.percentComplete, 0) / processes.length
        : sowTask.progress
    return {
      id: sowId,
      contractId,
      code: sowTask.name.split(' ')[0] ?? sowId,
      name: sowTask.name,
      startPlanned: sowTask.start,
      endPlanned: sowTask.end,
      percentComplete: percent,
      spi: (sowTask.meta?.spi as number | undefined) ?? null,
      cpi: (sowTask.meta?.cpi as number | undefined) ?? null,
      processes,
    }
  })

  return {
    id: contractId,
    code: contractTask.name.split(' ')[0] ?? contractId,
    name: contractTask.name,
    baselineVersion: undefined,
    updatedAt: new Date().toISOString(),
    sows: sows.sort((a, b) => new Date(a.startPlanned).getTime() - new Date(b.startPlanned).getTime()),
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

const offlineContracts = new Set<string>()

const RESOURCE_IMPACT: Record<string, { label: string; deltaPerUnit: number; spiBoost: number }> = {
  excavator: { label: 'Excavator crews', deltaPerUnit: 3, spiBoost: 0.02 },
  crew: { label: 'Formwork / shift crews', deltaPerUnit: 2, spiBoost: 0.015 },
  qa: { label: 'QA inspectors & drones', deltaPerUnit: 1, spiBoost: 0.01 },
}

const simulateWhatIfFallback = (
  contractId: string,
  daysOffset: number,
  resources: Array<{ resource: string; quantity: number }>,
  fallbackTasks?: GanttTask[],
): ScheduleWhatIfResponse => {
  const baselineFinishTime =
    fallbackTasks && fallbackTasks.length
      ? Math.max(...fallbackTasks.map((task) => new Date(task.end).getTime()))
      : Date.now() + 45 * DAY_MS

  const resourceImpact = resources.reduce(
    (acc, entry) => {
      const config = RESOURCE_IMPACT[entry.resource]
      if (!config || !entry.quantity) return acc
      const quantity = entry.quantity
      const deltaContribution = config.deltaPerUnit * quantity
      const spiContribution = config.spiBoost * quantity
      acc.deltaGain += deltaContribution
      acc.spiGain += spiContribution
      acc.notes.push(
        `${config.label}: ${quantity > 0 ? '+' : ''}${quantity} → ${deltaContribution >= 0 ? 'compress' : 'extend'} ${Math.abs(
          deltaContribution,
        )}d`,
      )
      return acc
    },
    { deltaGain: 0, spiGain: 0, notes: [] as string[] },
  )

  const adjustedDelta = daysOffset - resourceImpact.deltaGain
  const clampedDelta = Math.max(-90, Math.min(120, adjustedDelta))
  const roundedDelta = Math.round(clampedDelta)
  const projectedFinish = new Date(baselineFinishTime + roundedDelta * DAY_MS)

  const baseSpi = 1 - roundedDelta / 90
  const projectedSpi = Math.max(0.55, Math.min(1.45, baseSpi + resourceImpact.spiGain))

  if (!resourceImpact.notes.length) {
    resourceImpact.notes.push('No additional resources applied.')
  }
  resourceImpact.notes.push(`Fallback simulation generated locally for ${contractId}.`)

  return {
    projectedFinish: projectedFinish.toISOString(),
    deltaDays: roundedDelta,
    spiProjected: Number(projectedSpi.toFixed(2)),
    notes: resourceImpact.notes,
  }
}

export async function fetchContractScheduleDetail(contractId: string): Promise<ContractSchedule> {
  try {
    const res = await fetch(`${API_URL}/api/contracts/${encodeURIComponent(contractId)}/schedule`)
    return await handleResponse<ContractSchedule>(res)
  } catch (error) {
    const fallbackTasks = getScheduleFallback('contract', contractId)
    if (fallbackTasks) {
      const fallbackSchedule = buildContractScheduleFromTasks(contractId, fallbackTasks)
      if (fallbackSchedule) {
        offlineContracts.add(contractId)
        console.warn(`Using fallback contract schedule for ${contractId}:`, error)
        return { ...fallbackSchedule, offlineFallback: true }
      }
    }
    throw error
  }
}

export async function fetchScheduleKpis(
  contractId: string,
  level: 'contract' | 'sow' | 'process',
  id?: string,
): Promise<ScheduleKpiResponse> {
  const resolveFallback = () => {
    const fallbackTasks = getScheduleFallback('contract', contractId)
    if (fallbackTasks) {
      const schedule = buildContractScheduleFromTasks(contractId, fallbackTasks)
      if (schedule) {
        const pool =
          level === 'contract'
            ? schedule.sows.flatMap((sow) => sow.processes)
            : level === 'sow'
            ? schedule.sows.find((sow) => sow.id === id)?.processes ?? []
            : schedule.sows.flatMap((sow) => sow.processes.filter((proc) => proc.id === id))
        if (pool.length) {
          const spiValues = pool.map((proc) => proc.spi ?? 1)
          const avg = spiValues.reduce((acc, val) => acc + val, 0) / spiValues.length
          const progressAvg =
            pool.reduce((acc, proc) => acc + (proc.percentComplete ?? 0), 0) / pool.length
          const progressValue = Number.isFinite(progressAvg) ? Number((progressAvg * 100).toFixed(1)) : null
          return {
            spi: avg,
            progressActual: progressValue,
            trend: pool.slice(-12).map((proc) => ({ date: proc.endPlanned, spi: proc.spi ?? null })),
          }
        }
      }
    }
    return { spi: null, trend: [] }
  }

  if (offlineContracts.has(contractId)) {
    return resolveFallback()
  }

  try {
    const url = new URL(`${API_URL}/api/contracts/${encodeURIComponent(contractId)}/kpis`)
    url.searchParams.set('level', level)
    if (id) {
      url.searchParams.set('id', id)
    }
    const res = await fetch(url.toString())
    return await handleResponse<ScheduleKpiResponse>(res)
  } catch (error) {
    offlineContracts.add(contractId)
    const fallback = resolveFallback()
    console.warn(`Using fallback schedule KPIs for ${contractId}:`, error)
    return fallback
  }
}

export async function fetchWeatherSummary(): Promise<WeatherSummary> {
  const res = await fetch(`${API_URL}/api/weather`)
  return handleResponse<WeatherSummary>(res)
}

export async function postScheduleWhatIf(
  contractId: string,
  daysOffset: number,
  resources: Array<{ resource: string; quantity: number }> = [],
): Promise<ScheduleWhatIfResponse> {
  const fallbackTasks = getScheduleFallback('contract', contractId)
  if (offlineContracts.has(contractId)) {
    return simulateWhatIfFallback(contractId, daysOffset, resources, fallbackTasks ?? undefined)
  }

  try {
    const res = await fetch(`${API_URL}/api/schedule/whatif`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractId, daysOffset, resources }),
    })
    return await handleResponse<ScheduleWhatIfResponse>(res)
  } catch (error) {
    console.warn(`Using fallback what-if simulation for ${contractId}:`, error)
    return simulateWhatIfFallback(contractId, daysOffset, resources, fallbackTasks ?? undefined)
  }
}

export type ChangeRequestPayload = {
  tenantId?: string
  projectId: string
  contractId?: string | null
  sowId?: string | null
  processId?: string | null
  atomType: string
  model: string
  requestedUnits: number
  estCost?: number | null
  reason?: string | null
  createdBy?: string
}

export type ChangeRequest = {
  id: string
  tenant_id: string
  project_id: string
  contract_id: string | null
  sow_id: string | null
  process_id: string | null
  atom_type: string
  model: string
  requested_units: number
  est_cost: number | null
  reason: string | null
  status: string
  created_by: string
  created_at: string
  alert_id?: string | null
}

export async function createChangeRequest(payload: ChangeRequestPayload): Promise<ChangeRequest> {
  const res = await fetch(`${API_URL}/api/v2/change-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleResponse<ChangeRequest>(res)
}

export async function fetchChangeRequests(params: {
  tenantId?: string
  projectId: string
  contractId?: string | null
  sowId?: string | null
  processId?: string | null
}): Promise<ChangeRequest[]> {
  const search = new URLSearchParams({
    tenantId: params.tenantId ?? DEFAULT_TENANT_ID,
    projectId: params.projectId,
  })
  if (params.contractId) search.set('contractId', params.contractId)
  if (params.sowId) search.set('sowId', params.sowId)
  if (params.processId) search.set('processId', params.processId)
  const res = await fetch(`${API_URL}/api/v2/change-requests?${search.toString()}`)
  return handleResponse<ChangeRequest[]>(res)
}
