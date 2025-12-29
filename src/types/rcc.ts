export type RccProcessInput = {
  id: string
  label: string
  unit?: string | null
  source_type?: string | null
  source_name?: string | null
  thresholds: Record<string, number>
  current_value?: number | null
  last_observed?: string | null
  metadata: Record<string, unknown>
  status: 'ok' | 'warning' | 'alarm' | 'unknown' | 'error'
  status_message?: string | null
}

export type RccAlarmRule = {
  id: string
  category: string
  condition: string
  severity: string
  action?: string | null
  message?: string | null
  enabled: boolean
  created_at?: string | null
  updated_at?: string | null
  created_by?: string | null
  metadata: Record<string, unknown>
  last_evaluated_at?: string | null
  last_status?: string | null
  last_payload: Record<string, unknown>
  last_fired_at?: string | null
  operation_id?: string | null
  stage_id?: string | null
  operation_name?: string | null
  stage_name?: string | null
}

export type RccProcessOperation = {
  id: string
  name: string
  type: string
  sequence: number
  metadata: Record<string, unknown>
  status: 'ok' | 'warning' | 'alarm' | 'unknown' | 'error'
  status_message?: string | null
  rule?: RccAlarmRule | null
  inputs: RccProcessInput[]
  children: RccProcessOperation[]
}

export type RccProcessStage = {
  id: string
  name: string
  description?: string | null
  sequence: number
  operations: RccProcessOperation[]
  alarm_count: number
  rule_alarm_count: number
  status: 'ok' | 'warning' | 'alarm' | 'unknown' | 'error'
  worst_severity?: string | null
  last_updated?: string | null
}

export type RccProcessTree = {
  sow_id: string
  sow_name: string
  as_of: string
  stages: RccProcessStage[]
}

export type RccRuleList = {
  rules: RccAlarmRule[]
}

export type RccBlockProgress = {
  id: string
  sow_id: string
  block_no: number
  lift_no: number
  status: string
  percent_complete: number
  temperature?: number | null
  density?: number | null
  batch_id?: string | null
  vendor?: string | null
  ipc_value?: number | null
  metadata: Record<string, unknown>
  observed_at?: string | null
}

export type RccEnvironmentMetric = {
  id: string
  sow_id: string
  metric: string
  label: string
  unit?: string | null
  value_numeric?: number | null
  value_text?: string | null
  status: 'ok' | 'warning' | 'alarm' | 'unknown'
  thresholds: Record<string, number>
  metadata: Record<string, unknown>
  updated_at?: string | null
}
