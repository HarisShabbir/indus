import { useSyncExternalStore } from 'react'

import { AlarmSeverity, Stage } from '../pages/atom/scm-visual/types'

export type TowerAlarmScope = {
  tenantId?: string | null
  projectId?: string | null
  projectName?: string | null
  contractId?: string | null
  contractName?: string | null
  sowId?: string | null
  sowName?: string | null
  processId?: string | null
  processName?: string | null
  sourcePath?: string
  sourceLabel?: string
}

export type TowerAlarm = {
  id: string
  severity: AlarmSeverity
  label: string
  stage?: Stage
  source?: string
  scope?: TowerAlarmScope
  ts: string
  acknowledged?: boolean
  metadata?: Record<string, unknown>
}

type AlarmTowerState = {
  alarms: TowerAlarm[]
  lastOrigin?: { path: string; label?: string; state?: unknown }
}

type AlarmTowerListener = () => void

const listeners = new Set<AlarmTowerListener>()

let snapshot: AlarmTowerState = {
  alarms: [],
  lastOrigin: undefined,
}

const getSnapshot = () => snapshot

const severityRank: Record<AlarmSeverity, number> = {
  info: 0,
  warn: 1,
  critical: 2,
}

const emit = () => listeners.forEach((listener) => listener())

const upsertAlarm = (alarm: TowerAlarm) => {
  const alarms = [alarm, ...snapshot.alarms.filter((item) => item.id !== alarm.id)].slice(0, 200)
  snapshot = { ...snapshot, alarms }
  emit()
}

const updateAlarm = (id: string, mutate: (alarm: TowerAlarm) => TowerAlarm | null) => {
  let changed = false
  const alarms = snapshot.alarms
    .map((alarm) => {
      if (alarm.id !== id) return alarm
      const next = mutate(alarm)
      changed = true
      return next
    })
    .filter(Boolean) as TowerAlarm[]
  if (changed) {
    snapshot = { ...snapshot, alarms }
    emit()
  }
}

export const publishTowerAlarm = (alarm: TowerAlarm) => {
  upsertAlarm(alarm)
}

export const acknowledgeTowerAlarm = (id: string) => {
  updateAlarm(id, (alarm) => ({ ...alarm, acknowledged: true }))
}

export const clearTowerAlarm = (id: string) => {
  snapshot = { ...snapshot, alarms: snapshot.alarms.filter((alarm) => alarm.id !== id) }
  emit()
}

export const markAlarmOrigin = (origin: { path: string; label?: string; state?: unknown }) => {
  snapshot = { ...snapshot, lastOrigin: origin }
  emit()
}

export const getAlarmTowerState = () => snapshot

export const subscribeAlarmTower = (listener: AlarmTowerListener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useAlarmTower = () => useSyncExternalStore(subscribeAlarmTower, getSnapshot, getSnapshot)

export const useAlarmTowerSummary = () => {
  const snap = useAlarmTower()
  const active = snap.alarms.filter((alarm) => !alarm.acknowledged)
  if (!active.length) {
    return { count: 0, severity: null as AlarmSeverity | null }
  }
  const highest = active.reduce((acc, alarm) => (severityRank[alarm.severity] > severityRank[acc.severity] ? alarm : acc), active[0])
  return { count: active.length, severity: highest.severity }
}

export const getAlarmTowerSummary = () => {
  const active = snapshot.alarms.filter((alarm) => !alarm.acknowledged)
  if (!active.length) return { count: 0, severity: null as AlarmSeverity | null }
  const highest = active.reduce((acc, alarm) => (severityRank[alarm.severity] > severityRank[acc.severity] ? alarm : acc), active[0])
  return { count: active.length, severity: highest.severity }
}
