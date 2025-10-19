import { API_URL } from './config'
import {
  getContractKpiLatestDetailedFallback,
  getContractKpiLatestFallback,
  getContractKpiSeriesFallback,
} from './data/kpiFallback'
import { getScheduleFallback } from './data/scheduleFallback'
import { getProjectControlCenterFallback } from './data/controlCenterFallback'
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
export type Alert = {
  id: string
  project_id: string
  title: string
  location?: string
  activity?: string
  severity?: string
  raised_at: string
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
  const res = await fetch(`${API_URL}/api/alerts${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`)
  return handleResponse<Alert[]>(res)
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

const buildFinancialQuery = (projectId: string, contractId?: string | null, tenantId: string = DEFAULT_TENANT_ID) => {
  const params = new URLSearchParams({ tenantId, projectId })
  if (contractId) {
    params.append('contractId', contractId)
  }
  return params.toString()
}

export async function fetchFinancialSummary(projectId: string, contractId?: string | null, tenantId: string = DEFAULT_TENANT_ID): Promise<FinancialSummary> {
  const res = await fetch(`${API_URL}/api/v2/financial/summary?${buildFinancialQuery(projectId, contractId, tenantId)}`)
  return handleResponse<FinancialSummary>(res)
}

export async function fetchFinancialAllocation(projectId: string, tenantId: string = DEFAULT_TENANT_ID): Promise<FinancialAllocationResponse> {
  const res = await fetch(`${API_URL}/api/v2/financial/fund-allocation?${buildFinancialQuery(projectId, null, tenantId)}`)
  return handleResponse<FinancialAllocationResponse>(res)
}

export async function fetchFinancialExpenses(projectId: string, contractId?: string | null, tenantId: string = DEFAULT_TENANT_ID): Promise<FinancialExpenseRow[]> {
  const res = await fetch(`${API_URL}/api/v2/financial/expenses?${buildFinancialQuery(projectId, contractId, tenantId)}`)
  return handleResponse<FinancialExpenseRow[]>(res)
}

export async function fetchFinancialFundFlow(projectId: string, contractId?: string | null, tenantId: string = DEFAULT_TENANT_ID): Promise<FinancialFundFlow> {
  const res = await fetch(`${API_URL}/api/v2/financial/fund-flow?${buildFinancialQuery(projectId, contractId, tenantId)}`)
  return handleResponse<FinancialFundFlow>(res)
}

export async function fetchFinancialIncoming(projectId: string, tenantId: string = DEFAULT_TENANT_ID): Promise<FinancialIncomingResponse> {
  const res = await fetch(`${API_URL}/api/v2/financial/incoming?${buildFinancialQuery(projectId, null, tenantId)}`)
  return handleResponse<FinancialIncomingResponse>(res)
}

export async function fetchFinancialOutgoing(projectId: string, contractId?: string | null, tenantId: string = DEFAULT_TENANT_ID): Promise<FinancialOutgoingResponse> {
  const res = await fetch(`${API_URL}/api/v2/financial/outgoing?${buildFinancialQuery(projectId, contractId, tenantId)}`)
  return handleResponse<FinancialOutgoingResponse>(res)
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
