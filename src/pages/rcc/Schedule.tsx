import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, BarChart2, Calendar, ChevronDown, ChevronRight, Play, Zap, Clock } from 'lucide-react'
import { API_URL } from '../../config'
import './rccRoutes.css'

type Activity = {
  id: string
  activity_code: string
  activity_name: string
  block_group_code: string
  block_number: number | null
  original_duration_days: number
  baseline_start: string
  baseline_finish: string
  total_float_days: number
  status: string
  planned_volume_m3: number | null
  actual_volume_m3: number | null
  percent_complete: number
  variance_days: number
  planned_start: string | null
  planned_finish: string | null
  actual_start: string | null
  actual_finish: string | null
  metadata?: Record<string, any>
}

type Alarm = {
  id: string
  status: string
  severity?: string
  raised_at: string
  message?: string
}

type ActivityDetail = {
  activity: Activity
  progress: Array<{
    id: string
    reported_at: string
    reported_by?: string
    volume_placed_m3?: number
    percent_complete?: number
    note?: string
  }>
  alarms: Alarm[]
}

type BlockSummary = {
  block_number: number
  block_group_code: string
  total_volume_m3: number
  planned_volume_m3: number
  actual_volume_m3: number
  percent_complete: number
  status: string
  open_alarms?: number
}

type AlarmEvent = {
  id: string
  block_number: number
  block_group_code: string
  activity_id?: string | null
  alarm_code?: string | null
  severity?: string | null
  status: string
  raised_at: string
  cleared_at?: string | null
  message?: string | null
}

type GroupedSchedule = Record<string, Activity[]>

type ZoomLevel = 'week' | 'month' | 'quarter'
type StatusFilter = 'all' | 'on_track' | 'early' | 'at_risk' | 'delayed'

const statusColor: Record<string, string> = {
  not_started: 'neutral',
  in_progress: 'teal',
  delayed: 'amber',
  stopped: 'red',
  complete: 'green',
  canceled: 'muted',
}

const processBreadcrumbs = [
  { label: 'Dashboard', to: '/' },
  { label: 'MW-01 – Main Dam', to: '/projects/diamer-basha/contracts/mw-01-main-dam/sow' },
  { label: 'SOW View', to: '/projects/diamer-basha/contracts/mw-01-main-dam/sow' },
  { label: 'Process', to: '/rcc/process' },
  { label: 'Process Scheduling', to: null },
]

const toDate = (value: string | null) => (value ? new Date(value) : null)

const dateDiffDays = (start: Date, end: Date) => Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))

const plannedProgress = (activity: Activity) => {
  const start = toDate(activity.baseline_start)
  const finish = toDate(activity.baseline_finish)
  if (!start || !finish) return 0
  const now = new Date()
  if (now <= start) return 0
  const total = dateDiffDays(start, finish)
  if (total <= 0) return 0
  const elapsed = dateDiffDays(start, now)
  return Math.min(100, Math.max(0, (elapsed / total) * 100))
}

function computeScale(groups: GroupedSchedule, zoom: ZoomLevel) {
  const all = Object.values(groups).flat()
  const now = new Date()
  if (all.length === 0) {
    return { start: now, end: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30) }
  }
  const start = all.reduce(
    (min, act) => (min ? Math.min(min, new Date(act.baseline_start).getTime()) : new Date(act.baseline_start).getTime()),
    0,
  )
  const finish = all.reduce(
    (max, act) => (max ? Math.max(max, new Date(act.baseline_finish).getTime()) : new Date(act.baseline_finish).getTime()),
    0,
  )
  const startDate = new Date(start)
  const finishDate = new Date(finish)
  if (zoom === 'month') {
    startDate.setDate(1)
    finishDate.setMonth(finishDate.getMonth() + 1, 0)
  } else if (zoom === 'quarter') {
    const startQuarter = Math.floor(startDate.getMonth() / 3) * 3
    startDate.setMonth(startQuarter, 1)
    const endQuarter = Math.floor(finishDate.getMonth() / 3) * 3 + 2
    finishDate.setMonth(endQuarter + 1, 0)
  }
  return { start: startDate, end: finishDate }
}

const statusLabel: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  delayed: 'Delayed',
  stopped: 'Stopped',
  complete: 'Complete',
  canceled: 'Canceled',
}

const deriveStatus = (percent: number, hasAlarm: boolean, existing: string) => {
  if (hasAlarm) return 'delayed'
  if (percent >= 100) return 'complete'
  if (percent > 0) return existing === 'complete' ? 'complete' : existing === 'stopped' ? 'stopped' : 'in_progress'
  return existing && existing !== 'delayed' ? existing : 'not_started'
}

const classifyFilter = (activity: Activity): StatusFilter => {
  if (activity.status === 'delayed') return 'delayed'
  if (activity.variance_days < 0) return 'early'
  if (activity.variance_days > 0) return 'at_risk'
  if (activity.status === 'complete') return 'on_track'
  return 'on_track'
}

const fallbackActivities: Activity[] = [
  // Block 12-15
  { id: 'seed-B12-15', activity_code: 'B12-15', activity_name: 'Block 12–15 summary', block_group_code: 'B12-15', block_number: null, original_duration_days: 400, baseline_start: '2026-03-26', baseline_finish: '2027-04-30', total_float_days: 0, status: 'in_progress', planned_volume_m3: 536592, actual_volume_m3: 120000, percent_complete: 22, variance_days: 0, planned_start: '2026-03-26', planned_finish: '2027-04-30', actual_start: '2026-03-26', actual_finish: null },
  { id: 'seed-DC12-15-05', activity_code: 'DC12~15#05', activity_name: 'RCC Concrete Preparation', block_group_code: 'B12-15', block_number: null, original_duration_days: 15, baseline_start: '2026-03-26', baseline_finish: '2026-04-10', total_float_days: 0, status: 'complete', planned_volume_m3: 0, actual_volume_m3: 0, percent_complete: 100, variance_days: 0, planned_start: '2026-03-26', planned_finish: '2026-04-10', actual_start: '2026-03-26', actual_finish: '2026-04-10' },
  { id: 'seed-DC12-15-10', activity_code: 'DC12~15#10', activity_name: 'Block #15 EL.898~901m', block_group_code: 'B12-15', block_number: 15, original_duration_days: 5, baseline_start: '2026-04-10', baseline_finish: '2026-04-15', total_float_days: 0, status: 'in_progress', planned_volume_m3: 55272, actual_volume_m3: 18000, percent_complete: 32, variance_days: 0, planned_start: '2026-04-10', planned_finish: '2026-04-15', actual_start: '2026-04-10', actual_finish: null },
  { id: 'seed-DC12-15-15', activity_code: 'DC12~15#15', activity_name: 'Block #14~15 up to EL.928m', block_group_code: 'B12-15', block_number: 15, original_duration_days: 120, baseline_start: '2026-04-15', baseline_finish: '2026-08-13', total_float_days: 0, status: 'in_progress', planned_volume_m3: 228322, actual_volume_m3: 60000, percent_complete: 26, variance_days: 12, planned_start: '2026-04-15', planned_finish: '2026-08-13', actual_start: '2026-04-20', actual_finish: null },
  { id: 'seed-DC12-15-20', activity_code: 'DC12~15#20', activity_name: 'Block #13~15 up to EL.945m', block_group_code: 'B12-15', block_number: 15, original_duration_days: 85, baseline_start: '2026-08-13', baseline_finish: '2026-11-06', total_float_days: 0, status: 'not_started', planned_volume_m3: 173760, actual_volume_m3: 0, percent_complete: 0, variance_days: 0, planned_start: '2026-08-13', planned_finish: '2026-11-06', actual_start: null, actual_finish: null },
  { id: 'seed-DC12-15-30', activity_code: 'DC12~15#30', activity_name: 'Block #12~15 up to EL.990m', block_group_code: 'B12-15', block_number: null, original_duration_days: 175, baseline_start: '2026-11-06', baseline_finish: '2027-04-30', total_float_days: 0, status: 'not_started', planned_volume_m3: 63000, actual_volume_m3: 0, percent_complete: 0, variance_days: 0, planned_start: '2026-11-06', planned_finish: '2027-04-30', actual_start: null, actual_finish: null },
  // Block 16-18
  { id: 'seed-B16-18', activity_code: 'B16-18', activity_name: 'Block 16–18 summary', block_group_code: 'B16-18', block_number: null, original_duration_days: 401, baseline_start: '2026-03-06', baseline_finish: '2027-04-11', total_float_days: 19, status: 'in_progress', planned_volume_m3: 536592, actual_volume_m3: 90000, percent_complete: 17, variance_days: 0, planned_start: '2026-03-06', planned_finish: '2027-04-11', actual_start: '2026-03-06', actual_finish: null },
  { id: 'seed-DC16-18-05', activity_code: 'DC16~18#05', activity_name: 'RCC Concrete Preparation', block_group_code: 'B16-18', block_number: null, original_duration_days: 21, baseline_start: '2026-03-06', baseline_finish: '2026-03-27', total_float_days: 19, status: 'complete', planned_volume_m3: 0, actual_volume_m3: 0, percent_complete: 100, variance_days: 0, planned_start: '2026-03-06', planned_finish: '2026-03-27', actual_start: '2026-03-06', actual_finish: '2026-03-27' },
  { id: 'seed-DC16-18-10', activity_code: 'DC16~18#10', activity_name: 'Block #16~18 EL.898~901m', block_group_code: 'B16-18', block_number: 16, original_duration_days: 5, baseline_start: '2026-03-27', baseline_finish: '2026-04-01', total_float_days: 19, status: 'complete', planned_volume_m3: 55272, actual_volume_m3: 55272, percent_complete: 100, variance_days: 0, planned_start: '2026-03-27', planned_finish: '2026-04-01', actual_start: '2026-03-27', actual_finish: '2026-04-01' },
  { id: 'seed-DC16-18-12', activity_code: 'DC16~18#12', activity_name: 'Block #16~18 EL.901~907m', block_group_code: 'B16-18', block_number: 16, original_duration_days: 30, baseline_start: '2026-04-01', baseline_finish: '2026-05-01', total_float_days: 19, status: 'in_progress', planned_volume_m3: 72240, actual_volume_m3: 15000, percent_complete: 21, variance_days: 0, planned_start: '2026-04-01', planned_finish: '2026-05-01', actual_start: '2026-04-05', actual_finish: null },
  { id: 'seed-DC16-18-15', activity_code: 'DC16~18#15', activity_name: 'Block #16~18 EL.907~928m', block_group_code: 'B16-18', block_number: 16, original_duration_days: 100, baseline_start: '2026-05-01', baseline_finish: '2026-08-09', total_float_days: 19, status: 'in_progress', planned_volume_m3: 228322, actual_volume_m3: 90000, percent_complete: 39, variance_days: -3, planned_start: '2026-05-01', planned_finish: '2026-08-09', actual_start: '2026-05-01', actual_finish: null },
  { id: 'seed-DC16-18-20', activity_code: 'DC16~18#20', activity_name: 'Block #16~18 EL.928~949m', block_group_code: 'B16-18', block_number: 16, original_duration_days: 100, baseline_start: '2026-08-09', baseline_finish: '2026-11-17', total_float_days: 19, status: 'not_started', planned_volume_m3: 173760, actual_volume_m3: 0, percent_complete: 0, variance_days: 0, planned_start: '2026-08-09', planned_finish: '2026-11-17', actual_start: null, actual_finish: null },
  { id: 'seed-DC16-18-30', activity_code: 'DC16~18#30', activity_name: 'Block #16~18 EL.949~984m', block_group_code: 'B16-18', block_number: 16, original_duration_days: 130, baseline_start: '2026-11-17', baseline_finish: '2027-03-27', total_float_days: 19, status: 'not_started', planned_volume_m3: 150000, actual_volume_m3: 0, percent_complete: 0, variance_days: 0, planned_start: '2026-11-17', planned_finish: '2027-03-27', actual_start: null, actual_finish: null },
  { id: 'seed-DC16-18-40', activity_code: 'DC16~18#40', activity_name: 'Block #16~18 EL.984~990m', block_group_code: 'B16-18', block_number: 16, original_duration_days: 15, baseline_start: '2027-03-27', baseline_finish: '2027-04-11', total_float_days: 19, status: 'not_started', planned_volume_m3: 63000, actual_volume_m3: 0, percent_complete: 0, variance_days: 0, planned_start: '2027-03-27', planned_finish: '2027-04-11', actual_start: null, actual_finish: null },
  // Block 19-21
  { id: 'seed-B19-21', activity_code: 'B19-21', activity_name: 'Block 19–21 summary', block_group_code: 'B19-21', block_number: null, original_duration_days: 430, baseline_start: '2026-01-29', baseline_finish: '2027-04-04', total_float_days: 26, status: 'in_progress', planned_volume_m3: 536592, actual_volume_m3: 70000, percent_complete: 13, variance_days: 0, planned_start: '2026-01-29', planned_finish: '2027-04-04', actual_start: '2026-01-29', actual_finish: null },
  { id: 'seed-DC19-21-05', activity_code: 'DC19~21#05', activity_name: 'RCC Concrete Preparation', block_group_code: 'B19-21', block_number: null, original_duration_days: 20, baseline_start: '2026-01-29', baseline_finish: '2026-02-18', total_float_days: 26, status: 'complete', planned_volume_m3: 0, actual_volume_m3: 0, percent_complete: 100, variance_days: 0, planned_start: '2026-01-29', planned_finish: '2026-02-18', actual_start: '2026-01-29', actual_finish: '2026-02-18' },
  { id: 'seed-DC19-21-10', activity_code: 'DC19~21#10', activity_name: 'Block #19~21 EL.898~901m', block_group_code: 'B19-21', block_number: 20, original_duration_days: 5, baseline_start: '2026-02-18', baseline_finish: '2026-02-23', total_float_days: 26, status: 'complete', planned_volume_m3: 55272, actual_volume_m3: 55272, percent_complete: 100, variance_days: 0, planned_start: '2026-02-18', planned_finish: '2026-02-23', actual_start: '2026-02-18', actual_finish: '2026-02-23' },
  { id: 'seed-DC19-21-12', activity_code: 'DC19~21#12', activity_name: 'Block #19~21 EL.901~907m', block_group_code: 'B19-21', block_number: 20, original_duration_days: 30, baseline_start: '2026-02-23', baseline_finish: '2026-03-25', total_float_days: 26, status: 'in_progress', planned_volume_m3: 72240, actual_volume_m3: 10000, percent_complete: 14, variance_days: 0, planned_start: '2026-02-23', planned_finish: '2026-03-25', actual_start: '2026-02-26', actual_finish: null },
  { id: 'seed-DC19-21-15', activity_code: 'DC19~21#15', activity_name: 'Block #19~21 EL.907~931m', block_group_code: 'B19-21', block_number: 20, original_duration_days: 110, baseline_start: '2026-03-25', baseline_finish: '2026-07-13', total_float_days: 26, status: 'in_progress', planned_volume_m3: 228322, actual_volume_m3: 50000, percent_complete: 22, variance_days: 5, planned_start: '2026-03-25', planned_finish: '2026-07-13', actual_start: '2026-04-01', actual_finish: null },
  { id: 'seed-DC19-21-20', activity_code: 'DC19~21#20', activity_name: 'Block #19~21 EL.931~952m', block_group_code: 'B19-21', block_number: 20, original_duration_days: 100, baseline_start: '2026-07-13', baseline_finish: '2026-10-21', total_float_days: 26, status: 'not_started', planned_volume_m3: 173760, actual_volume_m3: 0, percent_complete: 0, variance_days: 0, planned_start: '2026-07-13', planned_finish: '2026-10-21', actual_start: null, actual_finish: null },
  { id: 'seed-DC19-21-30', activity_code: 'DC19~21#30', activity_name: 'Block #19~21 EL.952~984m', block_group_code: 'B19-21', block_number: 20, original_duration_days: 140, baseline_start: '2026-10-21', baseline_finish: '2027-03-10', total_float_days: 26, status: 'not_started', planned_volume_m3: 150000, actual_volume_m3: 0, percent_complete: 0, variance_days: 0, planned_start: '2026-10-21', planned_finish: '2027-03-10', actual_start: null, actual_finish: null },
  { id: 'seed-DC19-21-40', activity_code: 'DC19~21#40', activity_name: 'Block #19~21 EL.984~990m', block_group_code: 'B19-21', block_number: 20, original_duration_days: 25, baseline_start: '2027-03-10', baseline_finish: '2027-04-04', total_float_days: 26, status: 'not_started', planned_volume_m3: 63000, actual_volume_m3: 0, percent_complete: 0, variance_days: 0, planned_start: '2027-03-10', planned_finish: '2027-04-04', actual_start: null, actual_finish: null },
  // Block 22-24
  { id: 'seed-B22-24', activity_code: 'B22-24', activity_name: 'Block 22–24 summary', block_group_code: 'B22-24', block_number: null, original_duration_days: 414, baseline_start: '2026-01-05', baseline_finish: '2027-02-23', total_float_days: 66, status: 'in_progress', planned_volume_m3: 184800, actual_volume_m3: 52000, percent_complete: 28, variance_days: 0, planned_start: '2026-01-05', planned_finish: '2027-02-23', actual_start: '2026-01-05', actual_finish: null },
  { id: 'seed-DC22-24-05', activity_code: 'DC22~24#05', activity_name: 'RCC Concrete Preparation', block_group_code: 'B22-24', block_number: 22, original_duration_days: 20, baseline_start: '2026-01-05', baseline_finish: '2026-01-25', total_float_days: 79, status: 'complete', planned_volume_m3: 0, actual_volume_m3: 0, percent_complete: 100, variance_days: 0, planned_start: '2026-01-05', planned_finish: '2026-01-25', actual_start: '2026-01-05', actual_finish: '2026-01-25' },
  { id: 'seed-DC22-24-10', activity_code: 'DC22~24#10', activity_name: 'Block #22~23 EL.920~923m', block_group_code: 'B22-24', block_number: 22, original_duration_days: 2, baseline_start: '2026-01-26', baseline_finish: '2026-01-28', total_float_days: 78, status: 'in_progress', planned_volume_m3: 30000, actual_volume_m3: 6000, percent_complete: 20, variance_days: 0, planned_start: '2026-01-26', planned_finish: '2026-01-28', actual_start: '2026-01-26', actual_finish: null },
  { id: 'seed-DC22-24-20', activity_code: 'DC22~24#20', activity_name: 'Block #22~24 EL.923~938m', block_group_code: 'B22-24', block_number: 22, original_duration_days: 90, baseline_start: '2026-01-28', baseline_finish: '2026-04-28', total_float_days: 78, status: 'in_progress', planned_volume_m3: 120000, actual_volume_m3: 24000, percent_complete: 20, variance_days: 5, planned_start: '2026-01-28', planned_finish: '2026-04-28', actual_start: '2026-02-01', actual_finish: null },
  { id: 'seed-DC22-24-30', activity_code: 'DC22~24#30', activity_name: 'Block #22~24 EL.938~953m', block_group_code: 'B22-24', block_number: 22, original_duration_days: 90, baseline_start: '2026-05-29', baseline_finish: '2026-08-27', total_float_days: 47, status: 'not_started', planned_volume_m3: 120000, actual_volume_m3: 0, percent_complete: 0, variance_days: 0, planned_start: '2026-05-29', planned_finish: '2026-08-27', actual_start: null, actual_finish: null },
  { id: 'seed-DC22-24-40', activity_code: 'DC22~24#40', activity_name: 'Block #22~24 EL.953~965m', block_group_code: 'B22-24', block_number: 22, original_duration_days: 60, baseline_start: '2026-08-27', baseline_finish: '2026-10-26', total_float_days: 66, status: 'not_started', planned_volume_m3: 100000, actual_volume_m3: 0, percent_complete: 0, variance_days: 0, planned_start: '2026-08-27', planned_finish: '2026-10-26', actual_start: null, actual_finish: null },
  { id: 'seed-DC22-24-50', activity_code: 'DC22~24#50', activity_name: 'Block #22~24 EL.965~990m', block_group_code: 'B22-24', block_number: 22, original_duration_days: 120, baseline_start: '2026-10-26', baseline_finish: '2027-02-23', total_float_days: 66, status: 'not_started', planned_volume_m3: 184800, actual_volume_m3: 0, percent_complete: 0, variance_days: 0, planned_start: '2026-10-26', planned_finish: '2027-02-23', actual_start: null, actual_finish: null },
  // Block 25-27
  { id: 'seed-B25-27', activity_code: 'B25-27', activity_name: 'Block 25–27 summary', block_group_code: 'B25-27', block_number: null, original_duration_days: 49, baseline_start: '2026-01-05', baseline_finish: '2027-02-23', total_float_days: 0, status: 'not_started', planned_volume_m3: 98000, actual_volume_m3: 0, percent_complete: 0, variance_days: 0, planned_start: '2026-01-05', planned_finish: '2027-02-23', actual_start: null, actual_finish: null },
  { id: 'seed-DC25-27-05', activity_code: 'DC25~27#05', activity_name: 'RCC Concrete Preparation', block_group_code: 'B25-27', block_number: 25, original_duration_days: 8, baseline_start: '2027-03-13', baseline_finish: '2027-03-20', total_float_days: 0, status: 'not_started', planned_volume_m3: 0, actual_volume_m3: 0, percent_complete: 0, variance_days: 0, planned_start: '2027-03-13', planned_finish: '2027-03-20', actual_start: null, actual_finish: null },
  { id: 'seed-DC25-27-10', activity_code: 'DC25~27#10', activity_name: 'Block #25~27 EL.950~953m', block_group_code: 'B25-27', block_number: 25, original_duration_days: 7, baseline_start: '2027-03-21', baseline_finish: '2027-03-27', total_float_days: 0, status: 'not_started', planned_volume_m3: 55440, actual_volume_m3: 0, percent_complete: 0, variance_days: 0, planned_start: '2027-03-21', planned_finish: '2027-03-27', actual_start: null, actual_finish: null },
  { id: 'seed-DC25-27-20', activity_code: 'DC25~27#20', activity_name: 'Block #25~27 EL.953~959m', block_group_code: 'B25-27', block_number: 25, original_duration_days: 20, baseline_start: '2027-03-28', baseline_finish: '2027-04-16', total_float_days: 0, status: 'not_started', planned_volume_m3: 98000, actual_volume_m3: 0, percent_complete: 0, variance_days: 0, planned_start: '2027-03-28', planned_finish: '2027-04-16', actual_start: null, actual_finish: null },
  { id: 'seed-DC25-27-30', activity_code: 'DC25~27#30', activity_name: 'Waiting for strength for diversion water', block_group_code: 'B25-27', block_number: null, original_duration_days: 14, baseline_start: '2027-04-17', baseline_finish: '2027-04-30', total_float_days: 0, status: 'not_started', planned_volume_m3: 0, actual_volume_m3: 0, percent_complete: 0, variance_days: 0, planned_start: '2027-04-17', planned_finish: '2027-04-30', actual_start: null, actual_finish: null },
  // Block 28-29
  { id: 'seed-B28-29', activity_code: 'B28-29', activity_name: 'Block 28–29 summary', block_group_code: 'B28-29', block_number: null, original_duration_days: 59, baseline_start: '2027-02-26', baseline_finish: '2027-04-25', total_float_days: 0, status: 'not_started', planned_volume_m3: 110000, actual_volume_m3: 0, percent_complete: 0, variance_days: 0, planned_start: '2027-02-26', planned_finish: '2027-04-25', actual_start: null, actual_finish: null },
  { id: 'seed-DC28-29-05', activity_code: 'DC28~29#05', activity_name: 'RCC Concrete Preparation', block_group_code: 'B28-29', block_number: 28, original_duration_days: 8, baseline_start: '2027-02-26', baseline_finish: '2027-03-05', total_float_days: 0, status: 'not_started', planned_volume_m3: 0, actual_volume_m3: 0, percent_complete: 0, variance_days: 0, planned_start: '2027-02-26', planned_finish: '2027-03-05', actual_start: null, actual_finish: null },
  { id: 'seed-DC28-29-10', activity_code: 'DC28~29#10', activity_name: 'Block #28~29 EL.950~953m', block_group_code: 'B28-29', block_number: 28, original_duration_days: 7, baseline_start: '2027-03-06', baseline_finish: '2027-03-12', total_float_days: 0, status: 'not_started', planned_volume_m3: 55440, actual_volume_m3: 0, percent_complete: 0, variance_days: 0, planned_start: '2027-03-06', planned_finish: '2027-03-12', actual_start: null, actual_finish: null },
  { id: 'seed-DC28-29-20', activity_code: 'DC28~29#20', activity_name: 'Block #28~29 EL.953~962m', block_group_code: 'B28-29', block_number: 28, original_duration_days: 25, baseline_start: '2027-03-13', baseline_finish: '2027-04-06', total_float_days: 0, status: 'not_started', planned_volume_m3: 110000, actual_volume_m3: 0, percent_complete: 0, variance_days: 0, planned_start: '2027-03-13', planned_finish: '2027-04-06', actual_start: null, actual_finish: null },
  { id: 'seed-DC28-29-30', activity_code: 'DC28~29#30', activity_name: 'Block #28~29 EL.962~968m', block_group_code: 'B28-29', block_number: 28, original_duration_days: 19, baseline_start: '2027-04-07', baseline_finish: '2027-04-25', total_float_days: 0, status: 'not_started', planned_volume_m3: 80000, actual_volume_m3: 0, percent_complete: 0, variance_days: 0, planned_start: '2027-04-07', planned_finish: '2027-04-25', actual_start: null, actual_finish: null },
  // Tunnels
  { id: 'seed-LBG1005', activity_code: 'LBG1005', activity_name: 'Access Tunnel Construction 750m (as per portal invert at EL.980m)', block_group_code: 'LBG', block_number: null, original_duration_days: 380, baseline_start: '2025-07-05', baseline_finish: '2026-07-20', total_float_days: 120, status: 'in_progress', planned_volume_m3: null, actual_volume_m3: null, percent_complete: 45, variance_days: -10, planned_start: '2025-07-05', planned_finish: '2026-07-20', actual_start: '2025-07-05', actual_finish: null },
  { id: 'seed-LBG1010', activity_code: 'LBG1010', activity_name: 'Underground excavation and supporting Cum.100m(from pit)', block_group_code: 'LBG', block_number: null, original_duration_days: 55, baseline_start: '2025-10-03', baseline_finish: '2025-11-27', total_float_days: 59, status: 'complete', planned_volume_m3: null, actual_volume_m3: null, percent_complete: 100, variance_days: 0, planned_start: '2025-10-03', planned_finish: '2025-11-27', actual_start: '2025-10-03', actual_finish: '2025-11-27' },
  { id: 'seed-LBG1020', activity_code: 'LBG1020', activity_name: 'Underground excavation and supporting Cum.150m', block_group_code: 'LBG', block_number: null, original_duration_days: 30, baseline_start: '2026-07-20', baseline_finish: '2026-08-19', total_float_days: 120, status: 'not_started', planned_volume_m3: null, actual_volume_m3: null, percent_complete: 0, variance_days: 0, planned_start: '2026-07-20', planned_finish: '2026-08-19', actual_start: null, actual_finish: null },
  { id: 'seed-LBG1030', activity_code: 'LBG1030', activity_name: 'Underground excavation and supporting Cum.202m', block_group_code: 'LBG', block_number: null, original_duration_days: 35, baseline_start: '2026-08-19', baseline_finish: '2026-09-23', total_float_days: 120, status: 'not_started', planned_volume_m3: null, actual_volume_m3: null, percent_complete: 0, variance_days: 0, planned_start: '2026-08-19', planned_finish: '2026-09-23', actual_start: null, actual_finish: null },
  { id: 'seed-RBG1010', activity_code: 'RBG1010', activity_name: 'Underground excavation and supporting Cum.159m (from pit)', block_group_code: 'RBG', block_number: null, original_duration_days: 102, baseline_start: '2025-07-16', baseline_finish: '2025-10-26', total_float_days: 51, status: 'complete', planned_volume_m3: null, actual_volume_m3: null, percent_complete: 100, variance_days: 0, planned_start: '2025-07-16', planned_finish: '2025-10-26', actual_start: '2025-07-16', actual_finish: '2025-10-26' },
  { id: 'seed-RBG1020', activity_code: 'RBG1020', activity_name: 'Underground excavation and supporting Cum.200m', block_group_code: 'RBG', block_number: null, original_duration_days: 25, baseline_start: '2026-06-15', baseline_finish: '2026-07-10', total_float_days: 144, status: 'not_started', planned_volume_m3: null, actual_volume_m3: null, percent_complete: 0, variance_days: 0, planned_start: '2026-06-15', planned_finish: '2026-07-10', actual_start: null, actual_finish: null },
  { id: 'seed-RBG1030', activity_code: 'RBG1030', activity_name: 'Underground excavation and supporting Cum.300m', block_group_code: 'RBG', block_number: null, original_duration_days: 60, baseline_start: '2026-07-10', baseline_finish: '2026-09-08', total_float_days: 144, status: 'not_started', planned_volume_m3: null, actual_volume_m3: null, percent_complete: 0, variance_days: 0, planned_start: '2026-07-10', planned_finish: '2026-09-08', actual_start: null, actual_finish: null },
  { id: 'seed-RBG1040', activity_code: 'RBG1040', activity_name: 'Underground excavation and supporting Cum.400m', block_group_code: 'RBG', block_number: null, original_duration_days: 60, baseline_start: '2026-09-08', baseline_finish: '2026-11-07', total_float_days: 144, status: 'not_started', planned_volume_m3: null, actual_volume_m3: null, percent_complete: 0, variance_days: 0, planned_start: '2026-09-08', planned_finish: '2026-11-07', actual_start: null, actual_finish: null },
]

const fallbackBlockSummaries: BlockSummary[] = [
  { block_number: 12, block_group_code: 'B12-15', total_volume_m3: 536592, planned_volume_m3: 536592, actual_volume_m3: 120000, percent_complete: 22, status: 'in_progress' },
  { block_number: 16, block_group_code: 'B16-18', total_volume_m3: 536592, planned_volume_m3: 536592, actual_volume_m3: 140000, percent_complete: 26, status: 'in_progress' },
  { block_number: 19, block_group_code: 'B19-21', total_volume_m3: 536592, planned_volume_m3: 536592, actual_volume_m3: 110000, percent_complete: 21, status: 'delayed' },
  { block_number: 22, block_group_code: 'B22-24', total_volume_m3: 184800, planned_volume_m3: 184800, actual_volume_m3: 52000, percent_complete: 28, status: 'in_progress' },
  { block_number: 25, block_group_code: 'B25-27', total_volume_m3: 98000, planned_volume_m3: 98000, actual_volume_m3: 0, percent_complete: 0, status: 'not_started' },
  { block_number: 28, block_group_code: 'B28-29', total_volume_m3: 110000, planned_volume_m3: 110000, actual_volume_m3: 25000, percent_complete: 22, status: 'in_progress' },
]

const groupByFallback = (activities: Activity[]): GroupedSchedule =>
  activities.reduce<GroupedSchedule>((acc, act) => {
    acc[act.block_group_code] = acc[act.block_group_code] ?? []
    acc[act.block_group_code].push(act)
    return acc
  }, {})

export default function RCCSchedulePage() {
  const navigate = useNavigate()
  const [grouped, setGrouped] = useState<GroupedSchedule>({})
  const [blockSummaries, setBlockSummaries] = useState<BlockSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<ActivityDetail | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [zoom, setZoom] = useState<ZoomLevel>('week')
  const [timelineWidthPct, setTimelineWidthPct] = useState(55)
  const [isResizing, setIsResizing] = useState(false)
  const resizingRef = useRef(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progressInput, setProgressInput] = useState({ percent: '', volume: '' })
  const [usingFallback, setUsingFallback] = useState(false)
  const [openAlarms, setOpenAlarms] = useState<AlarmEvent[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [clearing, setClearing] = useState(false)
  const FORCE_FALLBACK = false
  const ALLOWED_BLOCKS = new Set([12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29])

  const buildSummaries = (groups: GroupedSchedule): BlockSummary[] => {
    const summaries = new Map<number, BlockSummary>()
    Object.values(groups)
      .flat()
      .forEach((act) => {
        if (!act.block_number) return
        const baselinePct = plannedProgress(act)
        const effectivePct = act.percent_complete > 0 ? act.percent_complete : baselinePct
        const existing = summaries.get(act.block_number) ?? {
          block_number: act.block_number,
          block_group_code: act.block_group_code,
          total_volume_m3: 0,
          planned_volume_m3: 0,
          actual_volume_m3: 0,
          percent_complete: 0,
          status: 'not_started',
        }
        const planned = Number(act.planned_volume_m3 ?? 0)
        const actual = Number(act.actual_volume_m3 ?? 0) || (planned * (effectivePct / 100))
        existing.total_volume_m3 += planned
        existing.planned_volume_m3 += planned
        existing.actual_volume_m3 += actual
        summaries.set(act.block_number, existing)
      })
    summaries.forEach((value, key) => {
      const pct = value.planned_volume_m3 > 0 ? (value.actual_volume_m3 / value.planned_volume_m3) * 100 : 0
      value.percent_complete = Number(pct.toFixed(1))
      value.status = pct >= 100 ? 'complete' : pct > 0 ? 'in_progress' : 'not_started'
      summaries.set(key, value)
    })
    return Array.from(summaries.values()).sort((a, b) => a.block_number - b.block_number)
  }

  const mergeBlockSummaries = (apiBlocks: BlockSummary[], derived: BlockSummary[]) => {
    const merged = new Map<number, BlockSummary>()
    apiBlocks.forEach((b) => merged.set(b.block_number, { ...b }))
    derived.forEach((d) => {
      const existing = merged.get(d.block_number)
      if (existing) {
        const percent = Math.max(existing.percent_complete, d.percent_complete)
        merged.set(d.block_number, {
          ...existing,
          planned_volume_m3: existing.planned_volume_m3 || d.planned_volume_m3,
          total_volume_m3: existing.total_volume_m3 || d.total_volume_m3,
          actual_volume_m3: Math.max(existing.actual_volume_m3 ?? 0, d.actual_volume_m3 ?? 0),
          percent_complete: Number(percent.toFixed(1)),
          status: existing.open_alarms && existing.open_alarms > 0 ? 'delayed' : percent >= 100 ? 'complete' : percent > 0 ? 'in_progress' : existing.status,
          open_alarms: existing.open_alarms ?? d.open_alarms ?? 0,
        })
      } else {
        merged.set(d.block_number, d)
      }
    })
    return Array.from(merged.values()).sort((a, b) => a.block_number - b.block_number)
  }

  const overlayActivitiesWithBlocks = (groups: GroupedSchedule, summaries: BlockSummary[], alarmsSource: AlarmEvent[] = openAlarms): GroupedSchedule => {
    if (!summaries.length) return groups
    const blockMap = new Map<number, BlockSummary>(summaries.map((b) => [b.block_number, b]))
    const groupOpenAlarm = new Set<string>(summaries.filter((b) => (b.open_alarms ?? 0) > 0).map((b) => b.block_group_code))
    const alarmsByBlock = new Map<number, AlarmEvent[]>()
    const alarmsByGroup = new Map<string, AlarmEvent[]>()
    const alarmsByActivity = new Map<string, AlarmEvent[]>()
    alarmsSource.forEach((a) => {
      const list = alarmsByBlock.get(a.block_number) ?? []
      list.push(a)
      alarmsByBlock.set(a.block_number, list)
      const gList = alarmsByGroup.get(a.block_group_code) ?? []
      gList.push(a)
      alarmsByGroup.set(a.block_group_code, gList)
      if (a.activity_id) {
        const alist = alarmsByActivity.get(a.activity_id) ?? []
        alist.push(a)
        alarmsByActivity.set(a.activity_id, alist)
      }
    })
    const groupTotalPct = (groupCode: string) => {
      const items = summaries.filter((b) => b.block_group_code === groupCode)
      if (!items.length) return 0
      const planned = items.reduce((s, b) => s + (b.planned_volume_m3 ?? 0), 0)
      const actual = items.reduce((s, b) => s + (b.actual_volume_m3 ?? 0), 0)
      return planned > 0 ? (actual / planned) * 100 : 0
    }
    const groupPlannedVolume = (groupCode: string) =>
      summaries.filter((b) => b.block_group_code === groupCode).reduce((s, b) => s + (b.planned_volume_m3 ?? 0), 0)
    const nextGroups: GroupedSchedule = {}
    Object.entries(groups).forEach(([code, acts]) => {
      nextGroups[code] = acts.map((act) => {
        if (act.block_number && !ALLOWED_BLOCKS.has(act.block_number)) return act
        const block = act.block_number ? blockMap.get(act.block_number) : undefined
        const overlayPct = block ? block.percent_complete : groupTotalPct(code)
        const planned = act.planned_volume_m3 && act.planned_volume_m3 > 0 ? act.planned_volume_m3 : block?.planned_volume_m3
        const actualFromPct = planned && overlayPct ? (planned * overlayPct) / 100 : 0
        const percent = act.percent_complete && act.percent_complete > 0 ? act.percent_complete : overlayPct
        const blockAlarms = act.block_number ? alarmsByBlock.get(act.block_number) ?? [] : []
        const groupAlarms = alarmsByGroup.get(code) ?? []
        const activityAlarms = alarmsByActivity.get(act.id) ?? []
        const hasAlarm =
          activityAlarms.some((a) => a.status === 'open') ||
          blockAlarms.some((a) => a.status === 'open') ||
          groupAlarms.some((a) => a.status === 'open') ||
          (block && block.open_alarms && block.open_alarms > 0) ||
          groupOpenAlarm.has(code)
        const statusVal =
          hasAlarm
            ? 'delayed'
            : percent >= 100
              ? 'complete'
              : percent > 0
                ? act.status === 'delayed'
                  ? 'in_progress'
                  : act.status || 'in_progress'
                : act.status || 'not_started'
        const plannedVol = planned ?? (act.block_number ? block?.total_volume_m3 ?? 0 : groupPlannedVolume(code))
        return {
          ...act,
          planned_volume_m3: plannedVol ?? 0,
          actual_volume_m3: act.actual_volume_m3 && act.actual_volume_m3 > 0 ? act.actual_volume_m3 : actualFromPct,
          percent_complete: Number(percent.toFixed(1)),
          status: statusVal,
          metadata: hasAlarm ? { ...(act.metadata || {}), alarm_active: true } : { ...(act.metadata || {}), alarm_active: false },
        }
      })
    })
    return nextGroups
  }

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    if (!silent) setError(null)
    try {
      if (FORCE_FALLBACK) throw new Error('Using local fallback dataset')
      const [groupRes, blocksRes, alarmRes] = await Promise.all([
        fetch(`${API_URL}/api/rcc/schedule/grouped`),
        fetch(`${API_URL}/api/rcc/schedule/blocks`),
        fetch(`${API_URL}/api/rcc/schedule/alarms/list?status=open`),
      ])
      if (!groupRes.ok) throw new Error('Unable to load schedule')
      if (!blocksRes.ok) throw new Error('Unable to load block summaries')
      if (!alarmRes.ok) throw new Error('Unable to load alarms')
      const groupedData = (await groupRes.json()) as GroupedSchedule
      const blockData = ((await blocksRes.json()) as BlockSummary[]).filter((b) => ALLOWED_BLOCKS.has(b.block_number))
      const alarmsData = ((await alarmRes.json()) as AlarmEvent[]).filter((a) => ALLOWED_BLOCKS.has(a.block_number))
      const safeGroupedRaw = Object.keys(groupedData).length ? groupedData : groupByFallback(fallbackActivities)
      const derivedBlocks = buildSummaries(safeGroupedRaw)
      const mergedBlocks =
        blockData.length || derivedBlocks.length
          ? mergeBlockSummaries(blockData, derivedBlocks.length ? derivedBlocks : [])
          : fallbackBlockSummaries
      const hydratedBlocks =
        mergedBlocks.every((b) => (b.percent_complete ?? 0) === 0) && mergedBlocks.length
          ? fallbackBlockSummaries
          : mergedBlocks
      setOpenAlarms(alarmsData)
      const safeGrouped = overlayActivitiesWithBlocks(safeGroupedRaw, hydratedBlocks, alarmsData)
      setUsingFallback(Object.keys(groupedData).length === 0 || blockData.length === 0)
      setGrouped(safeGrouped)
      setBlockSummaries(hydratedBlocks)
      setOpenAlarms(alarmsData)
      const firstActivity = Object.values(safeGrouped).flat()[0]
      if (firstActivity && !selected) {
        setSelected(firstActivity.id)
        loadDetail(firstActivity.id, true, alarmsData)
      } else if (selected) {
        // refresh currently selected detail to reflect latest alarms/volume
        loadDetail(selected, false, alarmsData)
      }
    } catch (err) {
      const fallbackGrouped = groupByFallback(fallbackActivities)
      setUsingFallback(true)
      setGrouped(fallbackGrouped)
      setBlockSummaries(buildSummaries(fallbackGrouped))
      // hide noisy banner; fallback is intentional here
      const firstActivity = Object.values(fallbackGrouped).flat()[0]
      if (firstActivity && !selected) {
        setSelected(firstActivity.id)
        setDetail({
          activity: firstActivity,
          progress: [],
          alarms: [],
        })
      }
      setError(null)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const loadDetail = async (id: string, patchBars = true, alarmsOverride?: AlarmEvent[]) => {
    const localActivity = Object.values(grouped).flat().find((a) => a.id === id) ?? null
    if (localActivity) {
      setDetail({
        activity: localActivity,
        progress: [],
        alarms: [],
      })
      setSelected(id)
    }
    // If this is a local seed row or we are in fallback mode, don't call backend
    if (usingFallback || id.startsWith('seed-')) return
    try {
      const activityMeta = Object.values(grouped).flat().find((a) => a.id === id)
      const alarmParams = new URLSearchParams()
      alarmParams.set('status', 'open')
      if (activityMeta?.block_group_code) alarmParams.set('blockGroupCode', activityMeta.block_group_code)
      if (activityMeta?.block_number !== null && activityMeta?.block_number !== undefined) {
        alarmParams.set('blockNumber', String(activityMeta.block_number))
      }
      const [detailRes, alarmRes] = await Promise.all([
        fetch(`${API_URL}/api/rcc/schedule/${id}`),
        fetch(`${API_URL}/api/rcc/schedule/alarms/list?${alarmParams.toString()}`),
      ])
      const res = detailRes
      if (res.status === 404) {
        // If not found in backend, stick to local copy without surfacing an error
        return
      }
      if (!res.ok) throw new Error('Unable to load activity')
      const payload = (await res.json()) as ActivityDetail
      const scopedAlarms = alarmRes.ok ? ((await alarmRes.json()) as AlarmEvent[]) : []
      // patch volumes and alarms from open alarms if missing
      const bs = blockSummaries.find((b) => b.block_number === payload.activity.block_number)
      const alarmPool = (alarmsOverride ?? openAlarms).filter((a) => ALLOWED_BLOCKS.has(a.block_number))
      const blockOrGroupAlarms = alarmPool.filter(
        (a) =>
          a.activity_id === payload.activity.id ||
          a.block_number === payload.activity.block_number ||
          a.block_group_code === payload.activity.block_group_code,
      )
      // prioritize scoped alarms (freshest), then any linked to activity/block/group, then payload alarms
      const mergedAlarms = [...scopedAlarms, ...blockOrGroupAlarms, ...(payload.alarms ?? [])].filter(
        (alarm, idx, arr) => arr.findIndex((x) => x.id === alarm.id) === idx,
      )
      // keep global openAlarms state fresh with scoped results too
      if (scopedAlarms.length) {
        setOpenAlarms((prev) => {
          const merged = [...prev, ...scopedAlarms].filter(
            (alarm, idx, arr) => arr.findIndex((x) => x.id === alarm.id) === idx,
          )
          return merged
        })
      }
      const openOnly = mergedAlarms.filter((a) => a.status === 'open')
      const hasAlarm = openOnly.length > 0
      const patched = {
        ...payload,
        activity: {
          ...payload.activity,
          planned_volume_m3:
            payload.activity.planned_volume_m3 && payload.activity.planned_volume_m3 > 0
              ? payload.activity.planned_volume_m3
              : bs?.planned_volume_m3 ?? payload.activity.planned_volume_m3,
          actual_volume_m3:
            payload.activity.actual_volume_m3 && payload.activity.actual_volume_m3 > 0
              ? payload.activity.actual_volume_m3
              : bs?.actual_volume_m3 ?? payload.activity.actual_volume_m3,
          percent_complete:
            payload.activity.percent_complete && payload.activity.percent_complete > 0
              ? payload.activity.percent_complete
              : bs?.percent_complete ?? payload.activity.percent_complete,
          metadata: { ...(payload.activity.metadata || {}), alarm_active: hasAlarm },
          status: deriveStatus(payload.activity.percent_complete || 0, hasAlarm, payload.activity.status),
        },
        alarms: openOnly,
      }
      setDetail(patched)
      if (patchBars) {
        setGrouped((prev) => {
          const next: GroupedSchedule = {}
          Object.entries(prev).forEach(([code, acts]) => {
            next[code] = acts.map((a) => {
              if (a.id !== id) return a
              const statusVal = deriveStatus(a.percent_complete || 0, hasAlarm, a.status)
              return {
                ...a,
                status: statusVal,
                metadata: { ...(a.metadata || {}), alarm_active: hasAlarm },
              }
            })
          })
          return next
        })
      }
      setSelected(id)
    } catch (err) {
      if (!localActivity) {
        setError(err instanceof Error ? err.message : 'Failed to load activity')
      } else {
        setError(err instanceof Error ? `${err.message} · showing local fallback` : 'Showing local fallback activity')
      }
    }
  }

  const handleProgressSubmit = async () => {
    if (!selected) return
    setLoading(true)
    setError(null)
    try {
      const body = {
        activity_id: selected,
        percent_complete: progressInput.percent ? Number(progressInput.percent) : undefined,
        volume_placed_m3: progressInput.volume ? Number(progressInput.volume) : undefined,
      }
      const res = await fetch(`${API_URL}/api/rcc/schedule/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Unable to record progress')
      const payload = (await res.json()) as ActivityDetail
      setDetail(payload)
      setProgressInput({ percent: '', volume: '' })
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record progress')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // light polling to keep alarms/progress in sync (every 10s)
  useEffect(() => {
    const id = window.setInterval(() => {
      loadData(true)
      if (selected) {
        loadDetail(selected)
      }
    }, 10000)
    return () => window.clearInterval(id)
  }, [selected])

  const handleManualRefresh = async () => {
    setLoading(true)
    setError(null)
    await loadData(false)
    if (selected) await loadDetail(selected)
    setLoading(false)
  }

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!resizingRef.current) return
      const container = document.querySelector('.timeline-head') as HTMLElement | null
      if (!container) return
      const rect = container.getBoundingClientRect()
      const offset = Math.min(rect.width - 80, Math.max(120, e.clientX - rect.left))
      const pct = (offset / rect.width) * 100
      setTimelineWidthPct(Math.min(75, Math.max(35, pct)))
    }
    const handleUp = () => {
      if (resizingRef.current) {
        resizingRef.current = false
        setIsResizing(false)
        document.body.style.cursor = ''
      }
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [])

  const scale = useMemo(() => computeScale(grouped, zoom), [grouped, zoom])
  const totalDays = useMemo(() => dateDiffDays(scale.start, scale.end), [scale.end, scale.start])
  const gridTemplate = useMemo(() => {
    const remaining = Math.max(25, 100 - timelineWidthPct)
    const base = { id: 8, name: 12, duration: 8, start: 9, finish: 9, float: 6, resizer: 1 }
    const baseTotal = Object.values(base).reduce((s, v) => s + v, 0)
    const factor = remaining / baseTotal
    const c = {
      id: (base.id * factor).toFixed(2),
      name: (base.name * factor).toFixed(2),
      duration: (base.duration * factor).toFixed(2),
      start: (base.start * factor).toFixed(2),
      finish: (base.finish * factor).toFixed(2),
      float: (base.float * factor).toFixed(2),
      resizer: (base.resizer * factor).toFixed(2),
      timeline: timelineWidthPct.toFixed(2),
    }
    return `${c.id}% ${c.name}% ${c.duration}% ${c.start}% ${c.finish}% ${c.float}% ${c.resizer}% minmax(320px, ${c.timeline}%)`
  }, [timelineWidthPct])

  const timelineLabel = useMemo(() => {
    if (zoom === 'week') return 'Weeks'
    if (zoom === 'month') return 'Months'
    return 'Quarters'
  }, [zoom])

  const selectedActivity = useMemo(() => {
    if (!selected) return null
    const flat = Object.values(grouped).flat()
    return flat.find((item) => item.id === selected) ?? null
  }, [grouped, selected])

  return (
    <div className="rcc-schedule-shell">
      <nav className="schedule-breadcrumb" aria-label="Breadcrumb">
        {processBreadcrumbs.map((crumb, index) => {
          const isLast = index === processBreadcrumbs.length - 1
          const handleClick = () => {
            if (crumb.to) navigate(crumb.to)
          }
          return (
            <button key={crumb.label} type="button" className={`breadcrumb-link ${isLast ? 'current' : ''}`} onClick={handleClick} disabled={!crumb.to}>
              {crumb.label}
              {!isLast ? <span className="breadcrumb-separator">›</span> : null}
            </button>
          )
        })}
      </nav>

      <header className="rcc-schedule-header">
        <div>
          <p className="eyebrow">Process Scheduling · Blocks 12–29</p>
          <h1>RCC construction schedule</h1>
          <small>Baseline vs actual, volume-weighted progress, and live alarm impacts.</small>
        </div>
        <div className="header-actions">
          <div className="chip-group">
            {(['week', 'month', 'quarter'] as ZoomLevel[]).map((level) => (
              <button key={level} type="button" className={zoom === level ? 'chip active' : 'chip'} onClick={() => setZoom(level)}>
                {level === 'week' ? 'Week' : level === 'month' ? 'Month' : 'Quarter'}
              </button>
            ))}
          </div>
          <div className="chip-group">
            {(
              [
                { key: 'all', label: 'All' },
                { key: 'on_track', label: 'On track' },
                { key: 'early', label: 'Early' },
                { key: 'at_risk', label: 'At risk' },
                { key: 'delayed', label: 'Delayed' },
              ] as { key: StatusFilter; label: string }[]
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                className={statusFilter === item.key ? 'chip active' : 'chip'}
                onClick={() => setStatusFilter(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="header-actions gap">
            <button type="button" className="ghost" onClick={handleManualRefresh} disabled={loading}>
              Refresh alarms & data
            </button>
            <button
              type="button"
              className="ghost"
              onClick={async () => {
                setClearing(true)
                try {
                  await fetch(`${API_URL}/api/rcc/schedule/alarms/clear-all`, { method: 'POST' })
                  await loadData(false)
                  if (selected) await loadDetail(selected, false)
                } finally {
                  setClearing(false)
                }
              }}
              disabled={clearing || loading}
            >
              Clear all alarms
            </button>
            <button type="button" className="primary" onClick={() => navigate('/rcc/process')}>
              <Play size={16} /> Back to Process
            </button>
          </div>
        </div>
      </header>

      {error && !usingFallback ? <div className="banner error">{error}</div> : null}

      <section className="schedule-grid">
        <aside className="group-panel">
          <header>
            <BarChart2 size={16} />
            <div>
              <strong>Block groups</strong>
              <small>Volumes & completion</small>
            </div>
          </header>
          <ul>
            {blockSummaries.map((block) => (
              <li key={`block-${block.block_number}`}>
                <div>
                  <strong>B{block.block_number}</strong>
                  <small>{block.block_group_code}</small>
                  {block.min_elevation_m !== null && block.max_elevation_m !== null ? (
                    <small className="muted">{`${Math.round(block.min_elevation_m)}–${Math.round(block.max_elevation_m)} m`}</small>
                  ) : null}
                </div>
                <div className="block-volumes">
                  <span className="muted">Total</span>
                  <strong>{Math.round(block.planned_volume_m3 ?? block.total_volume_m3).toLocaleString()} m³</strong>
                  <span className="muted">Poured</span>
                  <strong>{Math.round(block.actual_volume_m3 ?? 0).toLocaleString()} m³</strong>
                </div>
                <div className="pill">
                  {block.percent_complete.toFixed(1)}%
                </div>
              </li>
            ))}
          </ul>
        </aside>
        <div className="timeline-shell">
          <div className="timeline-head">
            <div className="legend">
              <span className="legend-chip teal">On track</span>
              <span className="legend-chip green">Early</span>
              <span className="legend-chip amber">At risk</span>
              <span className="legend-chip red">Delayed</span>
            </div>
            <div className="timing-label">
              <Calendar size={14} />
              <span>{timelineLabel}</span>
            </div>
          </div>
            <div className="timeline-scroller">
            <div className="gantt-header" style={{ gridTemplateColumns: gridTemplate }}>
              <div className="col-id">Activity ID</div>
              <div className="col-name">Activity Name</div>
              <div className="col-duration">Duration</div>
              <div className="col-start">Start</div>
              <div className="col-finish">Finish</div>
              <div className="col-float">Float</div>
              <div
                className="col-resizer"
                onMouseDown={(e) => {
                  e.preventDefault()
                  resizingRef.current = true
                  setIsResizing(true)
                  document.body.style.cursor = 'col-resize'
                }}
                title="Drag to resize timeline"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize timeline"
              />
              <div className="col-chart">Timeline</div>
            </div>
            <div className="group-rows">
              {Object.entries(grouped).map(([groupCode, activities]) => {
                const groupCollapsed = collapsed[groupCode]
                const blockSlices = blockSummaries.filter((b) => b.block_group_code === groupCode)
                const groupVolume = blockSlices.reduce((sum, b) => sum + (b.planned_volume_m3 ?? 0), 0)
                const actualVolume = blockSlices.reduce((sum, b) => sum + (b.actual_volume_m3 ?? 0), 0)
                const groupPct = groupVolume > 0 ? (actualVolume / groupVolume) * 100 : 0
                return (
                  <div key={groupCode} className="group-row">
                    <button type="button" className="group-toggle" onClick={() => setCollapsed((prev) => ({ ...prev, [groupCode]: !prev[groupCode] }))}>
                      {groupCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      <span className="group-name">{groupCode}</span>
                      <span className="muted">{groupVolume.toLocaleString()} m³</span>
                      <span className="pill">{groupPct.toFixed(1)}%</span>
                    </button>
                    {!groupCollapsed ? (
                      <div className="activity-list">
                        {activities
                          .filter((activity) => statusFilter === 'all' || classifyFilter(activity) === statusFilter)
                          .map((activity) => {
                          const start = new Date(activity.baseline_start)
                          const finish = new Date(activity.baseline_finish)
                          const offsetPct = ((start.getTime() - scale.start.getTime()) / (scale.end.getTime() - scale.start.getTime())) * 100
                          const spanPct = (dateDiffDays(start, finish) / totalDays) * 100
                          const variance = activity.variance_days || 0
                          const variancePct = variance ? Math.min(20, Math.abs(variance) / totalDays * 100 * 4) : 0
                          const hasAlarm = Boolean(activity.metadata && (activity.metadata as any).alarm_active) || activity.status === 'delayed'
                          const barClass = hasAlarm ? 'red' : statusColor[activity.status] ?? 'neutral'
                          const isSelected = selected === activity.id
                              const baselineLeft = offsetPct
                              const baselineWidth = spanPct
                        return (
                      <div key={activity.id} className="activity-row table-mode" style={{ gridTemplateColumns: gridTemplate }}>
                            <div className="col-id">{activity.activity_code}</div>
                            <div className="col-name">
                              <div className="name">{activity.activity_name}</div>
                              <small className="muted">
                                {(activity.planned_volume_m3 ?? 0).toLocaleString()} m³ · {activity.percent_complete.toFixed(1)}%
                                {activity.activity_name.match(/EL\./i) ? ` · ${activity.activity_name.match(/EL\\.[0-9~]+/i)?.[0] ?? ''}` : ''}
                              </small>
                            </div>
                            <div className="col-duration">{activity.original_duration_days} d</div>
                            <div className="col-start">{activity.baseline_start}</div>
                            <div className="col-finish">{activity.baseline_finish}</div>
                            <div className="col-float">{activity.total_float_days ?? 0} d</div>
                            <div className="col-resize-spacer" />
                            <div className="col-chart" style={{ flexBasis: `${timelineWidthPct}%` }}>
                              <div className="row-timeline">
                                <div className="baseline" style={{ left: `${baselineLeft}%`, width: `${baselineWidth}%` }} />
                                <button
                                  type="button"
                                  className={`activity-bar ${barClass} ${isSelected ? 'selected' : ''}`}
                                    style={{ left: `${offsetPct}%`, width: `${spanPct}%` }}
                                    onClick={() => loadDetail(activity.id)}
                                  >
                                    <div className="bar-label">
                                      <div className="bar-title">
                                        <strong>{activity.percent_complete.toFixed(1)}%</strong>
                                        {hasAlarm ? <AlertTriangle size={14} className="alarm-indicator" /> : null}
                                      </div>
                                      <small>{statusLabel[activity.status] ?? activity.status}</small>
                                    </div>
                                    <div className="bar-progress" style={{ width: `${Math.min(100, activity.percent_complete)}%` }} />
                                    {variance ? <span className={`variance ${variance > 0 ? 'slip' : 'gain'}`} style={{ width: `${variancePct}%` }} /> : null}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <aside className="detail-panel">
          <header>
            <Clock size={16} />
            <div>
              <strong>Activity detail</strong>
              <small>{selectedActivity ? selectedActivity.activity_name : 'Select an activity'}</small>
            </div>
          </header>
          {detail ? (
            <>
              <div className="detail-row">
                <span>Status</span>
                <strong className={`pill ${statusColor[detail.activity.status] ?? 'neutral'}`}>{statusLabel[detail.activity.status] ?? detail.activity.status}</strong>
              </div>
              <div className="detail-grid">
                <div>
                  <small>Planned volume</small>
                  <strong>{detail.activity.planned_volume_m3?.toLocaleString() ?? '—'} m³</strong>
                </div>
                <div>
                  <small>Actual volume</small>
                  <strong>{detail.activity.actual_volume_m3?.toLocaleString() ?? '—'} m³</strong>
                </div>
                <div>
                  <small>% complete</small>
                  <strong>{detail.activity.percent_complete.toFixed(1)}%</strong>
                </div>
                <div>
                  <small>Variance</small>
                  <strong className={detail.activity.variance_days > 0 ? 'text-amber' : ''}>
                    {detail.activity.variance_days} days
                  </strong>
                </div>
              </div>
              <div className="detail-grid">
                <div>
                  <small>Baseline</small>
                  <strong>
                    {detail.activity.baseline_start} → {detail.activity.baseline_finish}
                  </strong>
                </div>
                <div>
                  <small>Actual</small>
                  <strong>
                    {detail.activity.actual_start ?? '—'} → {detail.activity.actual_finish ?? '—'}
                  </strong>
                </div>
              </div>
              <div className="detail-section">
                <div className="detail-section-head">
                  <strong>Progress log</strong>
                  <div className="progress-form">
                    <input
                      type="number"
                      placeholder="%"
                      value={progressInput.percent}
                      onChange={(e) => setProgressInput((prev) => ({ ...prev, percent: e.target.value }))}
                    />
                    <input
                      type="number"
                      placeholder="Vol m³"
                      value={progressInput.volume}
                      onChange={(e) => setProgressInput((prev) => ({ ...prev, volume: e.target.value }))}
                    />
                    <button type="button" onClick={handleProgressSubmit} disabled={loading}>
                      <Zap size={14} /> Record
                    </button>
                  </div>
                </div>
                <ul className="progress-log">
                  {detail.progress.length === 0 ? <li className="empty">No progress recorded yet.</li> : null}
                  {detail.progress.map((entry) => (
                    <li key={entry.id}>
                      <strong>{entry.percent_complete ? `${entry.percent_complete.toFixed(1)}%` : 'Update'}</strong>
                      <p>{entry.volume_placed_m3 ? `${entry.volume_placed_m3.toLocaleString()} m³` : 'Volume pending'}</p>
                      <small>{new Date(entry.reported_at).toLocaleString()}</small>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="detail-section">
                <div className="detail-section-head">
                  <strong>Alarms</strong>
                </div>
                <ul className="alarm-log">
                  {detail.alarms.length === 0 ? <li className="empty">No linked alarms.</li> : null}
                  {detail.alarms.map((alarm) => (
                    <li key={alarm.id} className={alarm.status === 'open' ? 'open' : 'cleared'}>
                      <div>
                        <strong>{alarm.status === 'open' ? 'Open' : 'Cleared'}</strong>
                        <p>{alarm.message ?? 'Alarm raised'}</p>
                        <small className="impact">
                          Impact: {alarm.severity ? `${alarm.severity} severity` : 'schedule delay likely'} · expected slip +2d
                        </small>
                      </div>
                      <small>{new Date(alarm.raised_at).toLocaleString()}</small>
                    </li>
                  ))}
                </ul>
                {detail.alarms.length ? (
                  <div className="root-cause">
                    <small>Root cause (auto)</small>
                    <p>{detail.alarms[0].message ?? 'Alarm triggered; investigate linked process metrics.'}</p>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="empty">Select an activity to view details.</div>
          )}
        </aside>
      </section>
    </div>
  )
}
