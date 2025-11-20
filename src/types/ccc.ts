export type CccSelection = {
  tenant_id: string
  project_id: string
  contract_id?: string | null
  sow_id?: string | null
  process_id?: string | null
}

export type MapMarker = {
  id: string
  type: 'contract' | 'sow' | 'process'
  name: string
  lat: number
  lon: number
  status: 'on-track' | 'monitoring' | 'risk'
  percent_complete: number
  spi?: number | null
  cpi?: number | null
  metadata?: Record<string, unknown>
}

export type WipDial = {
  id: string
  level: 'project' | 'contract' | 'sow' | 'process'
  code?: string | null
  name: string
  percent_complete: number
  ev?: number | null
  pv?: number | null
  ac?: number | null
  spi?: number | null
  cpi?: number | null
}

export type CccSummary = {
  selection: CccSelection
  map: MapMarker[]
  wip: WipDial[]
  as_of: string
}

export type PhysicalWorksCard = {
  actual_percent?: number | null
  planned_percent?: number | null
  variance_percent?: number | null
  trend_actual: number[]
  trend_planned: number[]
  notes?: string[]
}

export type WorkInProgressCategory = {
  name: string
  count: number
  planned_percent?: number | null
  actual_percent?: number | null
  variance_percent?: number | null
}

export type WorkInProgressCard = {
  categories: WorkInProgressCategory[]
  notes?: string[]
}

export type WorkOutputItem = {
  name: string
  planned_percent?: number | null
  actual_percent?: number | null
  variance_percent?: number | null
}

export type WorkOutputCard = {
  items: WorkOutputItem[]
  notes?: string[]
}

export type QualitySummaryCard = {
  ncr_open: number
  ncr_closed: number
  qaor_open: number
  qaor_closed: number
  quality_conformance?: number | null
}

export type PerformanceSnapshotCard = {
  spi?: number | null
  cpi?: number | null
  ev?: number | null
  pv?: number | null
  ac?: number | null
  burn_rate_days?: number | null
  runway_days?: number | null
  cash_flow?: number | null
  trend_spi: number[]
  trend_cpi: number[]
  notes?: string[]
}

export type RightPanelKpiPayload = {
  selection: CccSelection
  as_of: string
  physical: PhysicalWorksCard
  work_in_progress: WorkInProgressCard
  work_output: WorkOutputCard
  performance: PerformanceSnapshotCard
  preparatory: WorkOutputCard
  quality_summary?: QualitySummaryCard
}
