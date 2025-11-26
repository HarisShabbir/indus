export type Vendor = {
  id: string
  name: string
  category: string
  region: string
  contact: string
  rating: number
  reliability: number
  color: string
}

export type RawMaterialLot = {
  id: string
  vendor_id: string
  material: string
  spec: string
  delivered_at: string
  tests: Record<string, number>
}

export type Batch = {
  id: string
  lots: string[]
  vendorMix: string[]
  started_at: string
  status: 'pending' | 'accepted' | 'failed'
  mixing_time_sec: number
  fine_agg_moisture_pct: number
  batch_temp_c: number
}

export type Pour = {
  id: string
  block: number
  lift: number
  batch_id: string
  started_at: string
  pour_temp_c: number
  slump_mm: number
  wet_density_kg_m3: number
  air_content_pct: number
  conveyor_speed_m_s: number
  transport_speed_km_hr: number
  lift_depth_m: number
  time_between_lifts_hr: number
}

export type CellStatus = 'pending' | 'in_progress' | 'awaiting' | 'approved' | 'alarm' | 'rejected'

export type BlockLiftCell = {
  id: string
  block: number
  lift: number
  status: CellStatus
  vendorLabel?: string
  batchId?: string
  approved?: boolean
  readyAt?: string | null
  frozen?: boolean
}

export type SimulatorSliderKey =
  | 'pourTemp'
  | 'wetDensity'
  | 'timeSinceLift'
  | 'slump'
  | 'conveyorSpeed'
  | 'aggregateMoisture'
  | 'waterPh'
  | 'curingTemp'

export type SliderConfig = {
  key: SimulatorSliderKey
  label: string
  min: number
  max: number
  step: number
  unit: string
  description: string
}

export type RuleDescriptor = {
  rule_id: string
  process_stage: string
  metric: string
  condition_operator: string
  threshold_low: number | null
  threshold_high: number | null
  allowed_range: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  alarm_type: string
  rule_description: string
  notes?: string
}

export type RuleResult = {
  rule: RuleDescriptor
  value: number | string | null
  passed: boolean
  message: string
}

export type TraceChain = {
  vendor: Vendor
  lot: RawMaterialLot
  batch: Batch
  pour: Pour
  blockLabel: string
}

export type AlarmAction = {
  label: string
  href?: string
  actionId?: 'rework' | 'trace' | 'highlight'
}

export type AlarmEvent = {
  id: string
  timestamp: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  ruleId: string
  description: string
  block: string
  traceMessage: string
  actions: AlarmAction[]
  stageId?: string
}

export type StageTelemetry = {
  id: string
  label: string
  metrics: Array<{ name: string; value: string; unit?: string; intent: 'ok' | 'warn' | 'alarm' }>
  status: 'idle' | 'active' | 'blocked'
}

export type ImpactType = 'schedule' | 'financial' | 'scm' | 'collaboration'

export type ImpactEvent = {
  id: string
  type: ImpactType
  ruleId: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  title: string
  description: string
  block: string
  timestamp: string
}
