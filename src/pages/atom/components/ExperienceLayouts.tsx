import React, { useEffect, useMemo, useState } from 'react'

import { CircleMarker, MapContainer, TileLayer, Tooltip, ZoomControl } from 'react-leaflet'

import type { AtomExperienceResponse, AtomExecutionMetric } from '../../../api'
import type { AtomDetailContent } from '../data/atomDetailLibrary'
import { TrendSparkline } from './AtomExperienceFragments'

type MobilizationNodesBoardProps = {
  experience: AtomExperienceResponse
}

type ExecutionDashboardProps = {
  experience: AtomExperienceResponse
  image?: string | null
  library?: AtomDetailContent | null
}

type MobilizationNode = {
  id: string
  title: string
  status: 'good' | 'warning' | 'neutral'
  defaultValue: string
  currentValue: string
  inputs: Array<{ label: string; value: string }>
  outputs: Array<{ label: string; value: string }>
  impactIn: string
  impactOut: string
  note?: string
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const createSeed = (key: string): number => {
  let hash = 0
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) & 0xffffffff
  }
  return Math.abs(hash)
}

const seededNumber = (atomId: string, key: string, min: number, max: number, precision = 0): number => {
  if (max <= min) return Number(min.toFixed(precision))
  const seed = createSeed(`${atomId}:${key}`)
  const normalized = (seed % 1000) / 1000
  const value = min + (max - min) * normalized
  return Number(value.toFixed(precision))
}

const formatNumber = (value: number, unit: string): string => {
  if (Number.isNaN(value)) return '—'
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit}`
}

const toHoursLabel = (min: number, max: number): string => `${min.toFixed(0)}–${max.toFixed(0)} hours`

const buildMachineryNodes = (experience: AtomExperienceResponse): MobilizationNode[] => {
  const atomId = experience.info.atomId ?? experience.info.name
  const tileMap = new Map(experience.mobilization.tiles.map((tile) => [tile.id, tile]))

  const currentFuel = tileMap.get('fuel')?.value ?? `${seededNumber(atomId, 'fuel-current', 48, 86)}%`
  const readiness = tileMap.get('readiness')?.value ?? `${seededNumber(atomId, 'readiness', 70, 94)}%`
  const readinessValue = Number.parseFloat(readiness)
  const utilization = tileMap.get('utilization')?.value ?? `${seededNumber(atomId, 'utilization', 68, 92)}%`
  const lastRecord = experience.mobilization.records[0]
  const lastRefillDays = seededNumber(atomId, 'refill-days', 1, 5, 0)
  const lastRefillDate = lastRecord
    ? DATE_FORMAT.format(new Date(lastRecord.mobilizedOn))
    : DATE_FORMAT.format(new Date(Date.now() - Number(lastRefillDays) * 24 * 60 * 60 * 1000))

  return [
    {
      id: 'fuel',
      title: 'Current Fuel Level',
      status: tileMap.get('fuel')?.severity === 'warning' ? 'warning' : 'neutral',
      defaultValue: `${seededNumber(atomId, 'fuel-default', 82, 94)}%`,
      currentValue: currentFuel,
      inputs: [
        { label: 'Atom Type', value: 'Integration' },
        { label: 'Node Type', value: 'Required' },
      ],
      outputs: [
        { label: 'Atom Type', value: 'Any' },
        { label: 'Node Type', value: 'Value' },
      ],
      impactIn: 'Fuel logistics',
      impactOut: 'Utilization',
      note: 'Projected runtime 6.5h',
    },
    {
      id: 'fuel-rate',
      title: 'Fuel Consumption Rate',
      status: 'neutral',
      defaultValue: `${seededNumber(atomId, 'fuel-rate-default', 5.6, 7.2, 2)} gal/hr`,
      currentValue: `${seededNumber(atomId, 'fuel-rate-current', 6.3, 7.8, 2)} gal/hr`,
      inputs: [
        { label: 'Atom Type', value: 'Dynamic' },
        { label: 'Node Type', value: 'Required' },
      ],
      outputs: [
        { label: 'Atom Type', value: 'Any' },
        { label: 'Node Type', value: 'Value' },
      ],
      impactIn: 'Plant planning',
      impactOut: 'Cost ledger',
      note: 'Auto-lube enabled',
    },
    {
      id: 'last-refill',
      title: 'Last Refill Date',
      status: 'neutral',
      defaultValue: DATE_FORMAT.format(new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)),
      currentValue: lastRefillDate,
      inputs: [
        { label: 'Atom Type', value: 'Operational' },
        { label: 'Node Type', value: 'Required' },
      ],
      outputs: [
        { label: 'Atom Type', value: 'Any' },
        { label: 'Node Type', value: 'Time' },
      ],
      impactIn: 'Shift planning',
      impactOut: 'Logistics',
      note: `Refuel interval ${lastRefillDays} days`,
    },
    {
      id: 'engine-temp',
      title: 'Engine Temperature',
      status: seededNumber(atomId, 'engine-temp-status', 0, 1, 0) > 0.6 ? 'warning' : 'neutral',
      defaultValue: `${seededNumber(atomId, 'engine-temp-default', 178, 189, 0)} °F`,
      currentValue: `${seededNumber(atomId, 'engine-temp-current', 184, 198, 0)} °F`,
      inputs: [
        { label: 'Atom Type', value: 'Integration' },
        { label: 'Node Type', value: 'Sensor' },
      ],
      outputs: [
        { label: 'Atom Type', value: 'Any' },
        { label: 'Node Type', value: 'Alert' },
      ],
      impactIn: 'Condition monitoring',
      impactOut: 'Maintenance',
      note: 'Delta +4°F vs baseline',
    },
    {
      id: 'hydraulic-pressure',
      title: 'Hydraulic Pressure',
      status: 'neutral',
      defaultValue: `${seededNumber(atomId, 'hydraulic-default', 4.8, 5.2, 2)} ksi`,
      currentValue: `${seededNumber(atomId, 'hydraulic-current', 4.9, 5.4, 2)} ksi`,
      inputs: [
        { label: 'Atom Type', value: 'Dynamic' },
        { label: 'Node Type', value: 'Telemetry' },
      ],
      outputs: [
        { label: 'Atom Type', value: 'Any' },
        { label: 'Node Type', value: 'Value' },
      ],
      impactIn: 'Cycle analytics',
      impactOut: 'Integrity',
      note: 'Smart boom dampening active',
    },
    {
      id: 'readiness',
      title: 'Readiness Index',
      status: Number.isFinite(readinessValue) && readinessValue < 80 ? 'warning' : 'good',
      defaultValue: `${seededNumber(atomId, 'readiness-default', 82, 95)}%`,
      currentValue: readiness,
      inputs: [
        { label: 'Atom Type', value: 'Diagnostic' },
        { label: 'Node Type', value: 'Required' },
      ],
      outputs: [
        { label: 'Atom Type', value: 'Any' },
        { label: 'Node Type', value: 'State' },
      ],
      impactIn: 'Work packaging',
      impactOut: 'Dispatch',
      note: `Utilization ${utilization}`,
    },
  ]
}

const formatPercentString = (value: number): string => `${Math.max(0, Math.min(100, Number(value.toFixed(1))))}%`

const parsePercentValue = (raw: string | number | undefined, fallback: number): number => {
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw
  if (typeof raw === 'string') {
    const match = raw.match(/(-?\d+(?:\.\d+)?)/)
    if (match) {
      return Number.parseFloat(match[1])
    }
  }
  return fallback
}

const buildTrendSeries = (values: number[], label: string, unit: string): AtomTrendSeries => {
  const today = new Date()
  const points = values.map((value, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (values.length - 1 - index))
    return { date, value: Number(value.toFixed(2)) }
  })
  return {
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    label,
    unit,
    points,
  }
}

const buildProfessionalNodes = (experience: AtomExperienceResponse): MobilizationNode[] => {
  const atomId = experience.info.atomId ?? experience.info.name
  const attributes = new Map(
    (experience.attributes ?? []).map((attr) => [attr.label.toLowerCase(), attr.value as Record<string, unknown>]),
  )
  const toolbox = (attributes.get('toolbox & permits') ?? {}) as Record<string, unknown>
  const equipmentAccess = (attributes.get('equipment access') ?? {}) as Record<string, unknown>
  const workingHours = (attributes.get('working hours') ?? {}) as Record<string, unknown>
  const attendanceTrend = (attributes.get('attendance trend') ?? {}) as Record<string, number[]>
  const wellness = (attributes.get('wellness & readiness') ?? {}) as Record<string, unknown>
  const readinessScore = Number(wellness.readinessScore ?? 0.95)
  const readinessPct = readinessScore <= 1 ? readinessScore * 100 : readinessScore

  const nodes: MobilizationNode[] = [
    {
      id: 'permit-readiness',
      title: 'Permit / Onboarding',
      status: readinessPct < 90 ? 'warning' : 'good',
      defaultValue: 'Permit pack 100%',
      currentValue: `${readinessPct.toFixed(1)}% ready`,
      inputs: [
        { label: 'Source', value: 'HSSE & HR' },
        { label: 'Node Type', value: 'Compliance' },
      ],
      outputs: [
        { label: 'Process', value: 'Mobilization' },
        { label: 'Node Type', value: 'State' },
      ],
      impactIn: 'Permit board',
      impactOut: 'Site access',
      note: `Cert currency ${(toolbox.certificationCurrency as number | undefined)?.toFixed?.(2) ?? '0.98'}`,
    },
    {
      id: 'shift-adherence',
      title: 'Shift Adherence',
      status: (attendanceTrend.shiftadherence?.slice(-1)[0] ?? attendanceTrend['shiftAdherence']?.slice(-1)[0] ?? 95) < 92 ? 'warning' : 'good',
      defaultValue: 'Target 95%',
      currentValue: `${((attendanceTrend.shiftadherence ?? attendanceTrend['shiftAdherence'] ?? [95]).slice(-1)[0] ?? 95).toFixed(0)}%`,
      inputs: [
        { label: 'Source', value: 'Roster' },
        { label: 'Node Type', value: 'Schedule' },
      ],
      outputs: [
        { label: 'Process', value: 'Operations' },
        { label: 'Node Type', value: 'Insight' },
      ],
      impactIn: 'Daily briefing',
      impactOut: 'Work packaging',
      note: `Week to date ${(workingHours.weekToDate as number | undefined)?.toFixed?.(1) ?? 46.5}h`,
    },
    {
      id: 'attendance',
      title: 'Attendance',
      status: (attendanceTrend.attendance?.slice(-1)[0] ?? 98) < 96 ? 'warning' : 'good',
      defaultValue: 'Target 97%',
      currentValue: `${(attendanceTrend.attendance?.slice(-1)[0] ?? 98).toFixed(0)}%`,
      inputs: [
        { label: 'Source', value: 'Timekeeping' },
        { label: 'Node Type', value: 'Data' },
      ],
      outputs: [
        { label: 'Process', value: 'HR' },
        { label: 'Node Type', value: 'Metric' },
      ],
      impactIn: 'Fatigue check',
      impactOut: 'Resource plan',
      note: `Overtime ${(workingHours.overtime as number | undefined)?.toFixed?.(1) ?? 3.8}h`,
    },
    {
      id: 'toolbox',
      title: 'Toolbox Participation',
      status: (Number(toolbox.toolboxParticipation ?? toolbox.toolboxparticipation ?? 0.94)) < 0.9 ? 'warning' : 'good',
      defaultValue: 'Target 90%',
      currentValue: `${Math.round(Number(toolbox.toolboxParticipation ?? toolbox.toolboxparticipation ?? 0.94) * 100)}%`,
      inputs: [
        { label: 'Source', value: 'HSSE' },
        { label: 'Node Type', value: 'Engagement' },
      ],
      outputs: [
        { label: 'Process', value: 'Safety' },
        { label: 'Node Type', value: 'Insight' },
      ],
      impactIn: 'Toolbox sync',
      impactOut: 'Permit readiness',
      note: `Last session ${toolbox.lastToolbox ?? '2025-05-18'}`,
    },
    {
      id: 'certification-currency',
      title: 'Certification Currency',
      status: (toolbox.certificationCurrency as number | undefined ?? 0.98) < 0.95 ? 'warning' : 'good',
      defaultValue: 'Target 95%',
      currentValue: `${Math.round(((toolbox.certificationCurrency as number | undefined) ?? 0.98) * 100)}%`,
      inputs: [
        { label: 'Source', value: 'Training LMS' },
        { label: 'Node Type', value: 'Compliance' },
      ],
      outputs: [
        { label: 'Process', value: 'Capability' },
        { label: 'Node Type', value: 'Metric' },
      ],
      impactIn: 'Skills radar',
      impactOut: 'Deployment',
      note: `${(toolbox.siteAccessApprovals as number | undefined) ?? 3} access approvals live`,
    },
    {
      id: 'tool-access',
      title: 'Equipment & Tool Access',
      status: ((toolbox.openActions as number | undefined) ?? 0) > 1 ? 'warning' : 'good',
      defaultValue: 'Ready',
      currentValue: `${Math.round(Number(equipmentAccess.toolReady ?? 0.96) * 100)}% ready`,
      inputs: [
        { label: 'Source', value: 'Asset access' },
        { label: 'Node Type', value: 'Integration' },
      ],
      outputs: [
        { label: 'Process', value: 'Operations' },
        { label: 'Node Type', value: 'State' },
      ],
      impactIn: 'Equipment prep',
      impactOut: 'Shift brief',
      note: Array.isArray(toolbox.permits) ? `Permits: ${(toolbox.permits as string[]).join(', ')}` : 'Permits synced',
    },
  ]

  const readinessTrend = attendanceTrend.readiness ?? []
  if (readinessTrend.length) {
    const trendSeries = buildTrendSeries(readinessTrend, 'Readiness Score', '%')
    experience.mobilization.trend = trendSeries
  }

  return nodes
}

const buildActorNodes = (experience: AtomExperienceResponse): MobilizationNode[] => {
  const atomId = experience.info.atomId ?? experience.info.name
  const tileMap = new Map(experience.mobilization.tiles.map((tile) => [tile.id, tile]))
  const spec = (experience.info.spec ?? {}) as Record<string, unknown>
  const attributes = new Map(
    (experience.attributes ?? []).map((attr) => [attr.label.toLowerCase(), attr.value as Record<string, unknown>]),
  )
  if ((experience.info.typeName ?? '').toLowerCase().includes('professional')) {
    return buildProfessionalNodes(experience)
  }

  const crews = Number(spec.crews ?? 12)
  const demographics = (attributes.get('demographics') ?? {}) as Record<string, unknown>
  const workforce = Number(demographics['totalworkforce'] ?? demographics['totalWorkforce'] ?? 0)
  const localHirePctRaw = Number(demographics['localhirepct'] ?? demographics['localHirePct'] ?? 0)
  const localHirePct = localHirePctRaw <= 1 ? localHirePctRaw * 100 : localHirePctRaw
  const availabilityTile = tileMap.get('readiness')?.value ?? tileMap.get('availability')?.value ?? '92%'
  const availability = parsePercentValue(availabilityTile, 92)
  const progressTile = tileMap.get('progress')?.value ?? '78%'
  const progress = parsePercentValue(progressTile, 78)
  const safetyScore = seededNumber(atomId, 'safety-compliance', 92, 99, 1)
  const financialExposure = seededNumber(atomId, 'commercial-exposure', 1, 4, 0)
  const interfaceLag = seededNumber(atomId, 'interface-lag', 0, 3, 1)
  const certification = seededNumber(atomId, 'training-cert', 82, 97, 1)

  return [
    {
      id: 'crew-availability',
      title: 'Crew Availability',
      status: availability < 85 ? 'warning' : 'good',
      defaultValue: '95%',
      currentValue: formatPercentString(availability),
      inputs: [
        { label: 'Node Type', value: 'Diagnostic' },
        { label: 'Signal', value: 'Daily roster' },
      ],
      outputs: [
        { label: 'Atom Type', value: 'Operations' },
        { label: 'Node Type', value: 'State' },
      ],
      impactIn: 'Work packaging',
      impactOut: 'Dispatch',
      note: `${Math.max(crews, 1)} crews on rotation`,
    },
    {
      id: 'workforce-composition',
      title: 'Workforce Composition',
      status: localHirePct < 40 ? 'warning' : 'neutral',
      defaultValue: '50% local',
      currentValue: `${Math.round(localHirePct)}% local`,
      inputs: [
        { label: 'Source', value: 'HR onboarding' },
        { label: 'Node Type', value: 'Data' },
      ],
      outputs: [
        { label: 'Process', value: 'Community' },
        { label: 'Node Type', value: 'Insight' },
      ],
      impactIn: 'Social performance',
      impactOut: 'Stakeholder',
      note: workforce ? `${workforce.toLocaleString()} personnel active` : 'Roster syncing',
    },
    {
      id: 'safety-compliance',
      title: 'Safety Compliance',
      status: safetyScore < 94 ? 'warning' : 'good',
      defaultValue: '98%',
      currentValue: formatPercentString(safetyScore),
      inputs: [
        { label: 'Source', value: 'HSSE permits' },
        { label: 'Node Type', value: 'Required' },
      ],
      outputs: [
        { label: 'Process', value: 'HSSE' },
        { label: 'Node Type', value: 'Alert' },
      ],
      impactIn: 'HSSE oversight',
      impactOut: 'Toolbox talks',
      note: 'Next stand-down in 3 days',
    },
    {
      id: 'commercial-health',
      title: 'Commercial Exposure',
      status: financialExposure > 2 ? 'warning' : 'neutral',
      defaultValue: '0 pending claims',
      currentValue: `${financialExposure} open items`,
      inputs: [
        { label: 'Source', value: 'Cost ledger' },
        { label: 'Node Type', value: 'Required' },
      ],
      outputs: [
        { label: 'Process', value: 'Commercial' },
        { label: 'Node Type', value: 'Alert' },
      ],
      impactIn: 'Claims review',
      impactOut: 'Cash flow',
      note: 'Change order session every Friday',
    },
    {
      id: 'progress-alignment',
      title: 'Progress Alignment',
      status: progress < 75 ? 'warning' : 'good',
      defaultValue: '82%',
      currentValue: formatPercentString(progress),
      inputs: [
        { label: 'Source', value: 'DPPR feed' },
        { label: 'Node Type', value: 'Dynamic' },
      ],
      outputs: [
        { label: 'Process', value: 'Production control' },
        { label: 'Node Type', value: 'Value' },
      ],
      impactIn: 'Concrete control',
      impactOut: 'Earned value',
      note: 'Concrete variance trending +4%',
    },
    {
      id: 'interface-readiness',
      title: 'Interface Readiness',
      status: interfaceLag > 1.5 ? 'warning' : 'neutral',
      defaultValue: 'On schedule',
      currentValue: interfaceLag > 0.5 ? `${interfaceLag.toFixed(1)}d late` : 'On track',
      inputs: [
        { label: 'Source', value: 'Interface board' },
        { label: 'Node Type', value: 'Integration' },
      ],
      outputs: [
        { label: 'Process', value: 'Interfaces' },
        { label: 'Node Type', value: 'State' },
      ],
      impactIn: 'Construction sequencing',
      impactOut: 'Stakeholder sync',
      note: 'Next hold point review in 2 days',
    },
    {
      id: 'certification',
      title: 'Certification Currency',
      status: certification < 90 ? 'warning' : 'neutral',
      defaultValue: '100%',
      currentValue: formatPercentString(certification),
      inputs: [
        { label: 'Source', value: 'Training matrix' },
        { label: 'Node Type', value: 'Data' },
      ],
      outputs: [
        { label: 'Process', value: 'HSSE' },
        { label: 'Node Type', value: 'Alert' },
      ],
      impactIn: 'Permit to work',
      impactOut: 'Access control',
      note: '8 certifications renew this week',
    },
  ]
}

const formatSeconds = (valueMs: number): string => {
  if (!Number.isFinite(valueMs)) return '—'
  if (valueMs >= 1000) {
    return `${(valueMs / 1000).toFixed(2)} s`
  }
  return `${valueMs.toFixed(0)} ms`
}

const buildSensorNodes = (experience: AtomExperienceResponse): MobilizationNode[] => {
  const atomId = experience.info.atomId ?? experience.info.name
  const attributes = new Map(
    (experience.attributes ?? []).map((attr) => [attr.label.toLowerCase(), attr.value as Record<string, unknown>]),
  )
  const spec = (experience.info.spec ?? {}) as Record<string, unknown>
  const telemetry = (attributes.get('telemetry') ?? {}) as Record<string, unknown>
  const health = (attributes.get('health') ?? {}) as Record<string, unknown>
  const calibration = (attributes.get('calibration') ?? {}) as Record<string, unknown>
  const environment = (attributes.get('environment') ?? {}) as Record<string, unknown>

  const batteryRaw = Number(health['batterypct'] ?? spec['batterypct'] ?? 0.82)
  const batteryPct = batteryRaw <= 1 ? batteryRaw * 100 : batteryRaw
  const heartbeatMs = Number(telemetry['heartbeatms'] ?? 2500)
  const uptime = seededNumber(atomId, 'sensor-uptime', 97, 99.8, 1)
  const drift = seededNumber(atomId, 'sensor-drift', 0.12, 0.32, 2)
  const noise = seededNumber(atomId, 'sensor-noise', 0.8, 1.6, 2)
  const probes = Number(spec['nodes'] ?? 12)
  const activeProbes = Math.max(0, probes - Math.round(seededNumber(atomId, 'sensor-probe-fault', 0, 1, 0)))
  const calibrationDue = Number(calibration['dueindays'] ?? 6)

  return [
    {
      id: 'battery-health',
      title: 'Battery Health',
      status: batteryPct < 65 ? 'warning' : 'good',
      defaultValue: '98%',
      currentValue: formatPercentString(batteryPct),
      inputs: [
        { label: 'Source', value: 'Power telemetry' },
        { label: 'Node Type', value: 'Required' },
      ],
      outputs: [
        { label: 'Process', value: 'Monitoring' },
        { label: 'Node Type', value: 'Alert' },
      ],
      impactIn: 'Power planning',
      impactOut: 'Maintenance',
      note: `Last check ${(health['lastbatterycheck'] as string) ?? '—'}`,
    },
    {
      id: 'calibration-window',
      title: 'Calibration Window',
      status: calibrationDue <= 3 ? 'warning' : 'neutral',
      defaultValue: '14 days',
      currentValue: `${calibrationDue} days`,
      inputs: [
        { label: 'Source', value: 'Calibration log' },
        { label: 'Node Type', value: 'Diagnostic' },
      ],
      outputs: [
        { label: 'Process', value: 'QA/QC' },
        { label: 'Node Type', value: 'Alert' },
      ],
      impactIn: 'Thermal control',
      impactOut: 'Pour scheduling',
      note: `Last calibration ${(calibration['lastcalibration'] as string) ?? '—'}`,
    },
    {
      id: 'data-latency',
      title: 'Data Latency',
      status: heartbeatMs > 3500 ? 'warning' : 'good',
      defaultValue: '2.0 s',
      currentValue: formatSeconds(heartbeatMs),
      inputs: [
        { label: 'Source', value: 'Gateway heartbeat' },
        { label: 'Node Type', value: 'Telemetry' },
      ],
      outputs: [
        { label: 'Process', value: 'Analytics' },
        { label: 'Node Type', value: 'Value' },
      ],
      impactIn: 'Thermal dashboard',
      impactOut: 'Alerting',
      note: `Gateway ${(telemetry['gateway'] as string) ?? 'Batch yard north'}`,
    },
    {
      id: 'connectivity-uptime',
      title: 'Connectivity Uptime',
      status: uptime < 96 ? 'warning' : 'good',
      defaultValue: '99%',
      currentValue: formatPercentString(uptime),
      inputs: [
        { label: 'Source', value: 'Network analytics' },
        { label: 'Node Type', value: 'Diagnostic' },
      ],
      outputs: [
        { label: 'Process', value: 'Operations' },
        { label: 'Node Type', value: 'State' },
      ],
      impactIn: 'Data assurance',
      impactOut: 'Issue response',
      note: 'LoRaWAN primary / LTE failover',
    },
    {
      id: 'sensor-drift',
      title: 'Sensor Drift',
      status: drift > 0.25 ? 'warning' : 'neutral',
      defaultValue: '0.20°C',
      currentValue: `${drift.toFixed(2)}°C`,
      inputs: [
        { label: 'Source', value: 'Maturity analytics' },
        { label: 'Node Type', value: 'Dynamic' },
      ],
      outputs: [
        { label: 'Process', value: 'QA/QC' },
        { label: 'Node Type', value: 'Alert' },
      ],
      impactIn: 'Pour control',
      impactOut: 'Engineering review',
      note: `Ambient ${environment['ambientrange'] ?? environment['ambientRange'] ?? '—'}`,
    },
    {
      id: 'probe-availability',
      title: 'Probe Availability',
      status: activeProbes < probes ? 'warning' : 'good',
      defaultValue: `${probes} probes`,
      currentValue: `${activeProbes}/${probes} active`,
      inputs: [
        { label: 'Source', value: 'Probe diagnostics' },
        { label: 'Node Type', value: 'Required' },
      ],
      outputs: [
        { label: 'Process', value: 'Decision support' },
        { label: 'Node Type', value: 'State' },
      ],
      impactIn: 'Thermal control',
      impactOut: 'Alerting',
      note: `Signal noise ${noise.toFixed(1)} dB`,
    },
  ]
}

export function MobilizationNodesBoard({ experience }: MobilizationNodesBoardProps) {
  const category = (experience.info.category ?? '').toLowerCase()
  const nodes = useMemo(() => {
    if (category === 'actors') {
      return buildActorNodes(experience)
    }
    if (category === 'technologies' || experience.info.typeName.toLowerCase().includes('sensor')) {
      return buildSensorNodes(experience)
    }
    return buildMachineryNodes(experience)
  }, [category, experience])
  const trend = experience.mobilization.trend
  const records = experience.mobilization.records
  const contexts =
    category === 'actors'
      ? ['All', 'Commercial', 'Compliance', 'People', 'Safety', 'Interfaces', 'Logistics', 'Finance']
      : category === 'technologies' || experience.info.typeName.toLowerCase().includes('sensor')
      ? ['All', 'Telemetry', 'Calibration', 'Environment', 'Analytics', 'HSSE', 'Interfaces']
      : ['All', 'Finance', 'Environment', 'Location', 'Technology', 'Standards', 'Contractual', 'Performance', 'Actors', 'Supply Chain']

  return (
    <div className="mobilization-board">
      <header className="mobilization-board__filters">
        {contexts.map((label, index) => (
          <button key={label} type="button" className={index === 0 ? 'is-active' : ''}>
            {label}
          </button>
        ))}
      </header>
      <section className="mobilization-board__grid">
        {nodes.map((node) => (
          <article key={node.id} className={`mobilization-node-card mobilization-node-card--${node.status}`}>
            <header>
              <div>
                <h4>{node.title}</h4>
                {node.note ? <span>{node.note}</span> : null}
              </div>
              <span className="mobilization-node-card__status">{node.status === 'good' ? 'Ready' : node.status === 'warning' ? 'Attention' : 'Enabled'}</span>
            </header>
            <div className="mobilization-node-card__values">
              <div>
                <span>Default value</span>
                <strong>{node.defaultValue}</strong>
              </div>
              <div>
                <span>Current value</span>
                <strong>{node.currentValue}</strong>
              </div>
            </div>
            <div className="mobilization-node-card__io">
              <div>
                <span>Acceptable input nodes</span>
                <div>
                  {node.inputs.map((item) => (
                    <span key={`${node.id}-input-${item.label}`} className="mobilization-chip">
                      {item.label}: {item.value}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <span>Acceptable output nodes</span>
                <div>
                  {node.outputs.map((item) => (
                    <span key={`${node.id}-output-${item.label}`} className="mobilization-chip">
                      {item.label}: {item.value}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <footer className="mobilization-node-card__actions">
              <button type="button">{node.impactIn}</button>
              <button type="button">{node.impactOut}</button>
            </footer>
          </article>
        ))}
      </section>

      {trend ? (
        <section className="mobilization-board__trend">
          <header>
            <h4>{trend.label}</h4>
            <span>Last {trend.points.length} days</span>
          </header>
          <TrendSparkline series={trend} />
        </section>
      ) : null}

      <section className="mobilization-board__history">
        <header>
          <h4>Mobilization readiness</h4>
          <span>{records.length} nodes engaged</span>
        </header>
        <table>
          <thead>
            <tr>
              <th scope="col">Node</th>
              <th scope="col">Window</th>
              <th scope="col">Status</th>
              <th scope="col">Notes</th>
            </tr>
          </thead>
          <tbody>
            {records.length ? (
              records.map((record) => (
                <tr key={record.id}>
                  <td>{record.location ?? '—'}</td>
                  <td>
                    {DATE_FORMAT.format(new Date(record.mobilizedOn))} –{' '}
                    {record.demobilizedOn ? DATE_FORMAT.format(new Date(record.demobilizedOn)) : 'Present'}
                  </td>
                  <td>
                    <span className={`mobilization-tag mobilization-tag--${record.status.toLowerCase()}`}>{record.status}</span>
                  </td>
                  <td>
                    {Object.keys(record.metadata || {}).length
                      ? Object.entries(record.metadata)
                          .map(([key, value]) => `${key}: ${value}`)
                          .join(' • ')
                      : '—'}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>No mobilization activity captured yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export function ExecutionDashboard({ experience, image, library }: ExecutionDashboardProps) {
  const atomId = experience.info.atomId ?? experience.info.name
  const category = (experience.info.category ?? '').toLowerCase()
  const typeName = (experience.info.typeName ?? '').toLowerCase()
  const metrics = useMemo(() => {
    const map = new Map<string, AtomExecutionMetric>()
    experience.execution.metrics.forEach((metric) => {
      map.set(metric.id, metric)
    })
    return map
  }, [experience.execution.metrics])
  const tileMap = useMemo(() => new Map(experience.mobilization.tiles.map((tile) => [tile.id, tile])), [experience.mobilization.tiles])
  const spec = (experience.info.spec ?? {}) as Record<string, unknown>
  const attributes = new Map(
    (experience.attributes ?? []).map((attr) => [attr.label.toLowerCase(), attr.value as Record<string, unknown>]),
  )

  if (category === 'actors' && typeName.includes('contractor')) {
    const demographics = (attributes.get('demographics') ?? {}) as Record<string, unknown>
    const contracts = (attributes.get('contracts') ?? {}) as Record<string, unknown>
    const crews = Number(spec.crews ?? 12)
    const workforce = Number(demographics['totalworkforce'] ?? demographics['totalWorkforce'] ?? 0)
    const localHirePctRaw = Number(demographics['localhirepct'] ?? demographics['localHirePct'] ?? 0)
    const localHirePct = localHirePctRaw <= 1 ? localHirePctRaw * 100 : localHirePctRaw
    const contractValue = Number(contracts['valueusdm'] ?? contracts['valueUSDm'] ?? 0)
    const subcontractors = Number(contracts['subcontractors'] ?? 0)
    const crewUtilization = metrics.get('utilization')?.value ?? seededNumber(atomId, 'utilization', 72, 88, 1)
    const crewAvailability = metrics.get('availability')?.value ?? parsePercentValue(tileMap.get('readiness')?.value, 92)
    const productivityMetric = metrics.get('productivity')?.value ?? seededNumber(atomId, 'productivity', 1.5, 2.1, 2)
    const qaScore = metrics.get('quality')?.value ?? seededNumber(atomId, 'qa-score', 95, 99, 1)
    const changeCycle = Math.round(seededNumber(atomId, 'change-cycle', 12, 22, 0))
    const openNcr = Math.round(seededNumber(atomId, 'open-ncr', 1, 6, 0))
    const hsseClosed = Math.round(seededNumber(atomId, 'hsse-closeout', 12, 22, 0))
    const avgShiftHours = seededNumber(atomId, 'avg-shift-hours', 8.6, 9.4, 1)
    const positives = experience.execution.callouts.positives.length
      ? experience.execution.callouts.positives
      : ['Concrete productivity beat target three days running.']
    const watch = experience.execution.callouts.watch.length
      ? experience.execution.callouts.watch
      : ['Confirm overtime roster for weekend pour.']

    const contractorKpis = [
      { id: 'utilization', label: 'Crew Utilization', value: formatPercentString(crewUtilization) },
      { id: 'availability', label: 'Crew Availability', value: formatPercentString(crewAvailability) },
      { id: 'productivity', label: 'Concrete Productivity', value: `${productivityMetric.toFixed(2)} m³/hr` },
      { id: 'qa-score', label: 'QA Score', value: formatPercentString(qaScore) },
      { id: 'change-cycle', label: 'Change Order Cycle', value: `${changeCycle} days` },
      { id: 'open-ncr', label: 'Open NCRs', value: `${openNcr}` },
    ]

    const mobilizationRows = experience.mobilization.records.slice(0, 6)

    return (
      <div className="contractor-dashboard">
        <section className="contractor-hero">
          <div className="contractor-hero__meta">
            <h3>{experience.info.name}</h3>
            <p>{(spec.scope as string) ?? experience.info.description ?? 'Contractor readiness summary.'}</p>
          </div>
          <div className="contractor-hero__stats">
            <div>
              <span>Active crews</span>
              <strong>{crews}</strong>
            </div>
            <div>
              <span>Total workforce</span>
              <strong>{workforce ? workforce.toLocaleString() : '—'}</strong>
            </div>
            <div>
              <span>Local hire</span>
              <strong>{formatPercentString(localHirePct)}</strong>
            </div>
            <div>
              <span>Contract value</span>
              <strong>{contractValue ? `$${contractValue.toFixed(0)}M` : '—'}</strong>
            </div>
          </div>
        </section>

        <section className="contractor-kpis">
          {contractorKpis.map((kpi) => (
            <article key={kpi.id} className="contractor-kpi-card">
              <span>{kpi.label}</span>
              <strong>{kpi.value}</strong>
            </article>
          ))}
        </section>

        <section className="contractor-alerts">
          <div>
            <h4>Performance highlights</h4>
            <ul>
              {positives.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Watch next</h4>
            <ul>
              {watch.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Commercial snapshot</h4>
            <ul>
              <li>{subcontractors} subcontractors engaged</li>
              <li>HSSE close-outs: {hsseClosed} / week</li>
              <li>Avg shift hours: {avgShiftHours.toFixed(1)} h</li>
            </ul>
          </div>
        </section>

        <section className="contractor-mobilization">
          <header>
            <h4>Active mobilization</h4>
            <span>{experience.mobilization.records.length} records</span>
          </header>
          <table>
            <thead>
              <tr>
                <th>Location</th>
                <th>Window</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {mobilizationRows.map((record) => (
                <tr key={record.id}>
                  <td>{record.location ?? '—'}</td>
                  <td>
                    {DATE_FORMAT.format(new Date(record.mobilizedOn))} –{' '}
                    {record.demobilizedOn ? DATE_FORMAT.format(new Date(record.demobilizedOn)) : 'Present'}
                  </td>
                  <td>
                    <span className={`mobilization-tag mobilization-tag--${record.status.toLowerCase()}`}>{record.status}</span>
                  </td>
                  <td>
                    {Object.keys(record.metadata || {}).length
                      ? Object.entries(record.metadata)
                          .map(([key, value]) => `${key}: ${value}`)
                          .join(' • ')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    )
  }

  if (category === 'technologies' && typeName.includes('sensor')) {
    const telemetry = (attributes.get('telemetry') ?? {}) as Record<string, unknown>
    const health = (attributes.get('health') ?? {}) as Record<string, unknown>
    const calibration = (attributes.get('calibration') ?? {}) as Record<string, unknown>
    const environment = (attributes.get('environment') ?? {}) as Record<string, unknown>

    const batteryRaw = Number(health['batterypct'] ?? spec['batteryPct'] ?? 0.84)
    const batteryPct = batteryRaw <= 1 ? batteryRaw * 100 : batteryRaw
    const uptime = metrics.get('availability')?.value ?? seededNumber(atomId, 'sensor-uptime', 97, 99.9, 1)
    const latencyMs = Number(telemetry['heartbeatms'] ?? 2500)
    const drift = seededNumber(atomId, 'sensor-drift', 0.12, 0.3, 2)
    const alertsOpen = Math.round(seededNumber(atomId, 'sensor-alerts', 0, 3, 0))
    const calibrationDue = Number(calibration['dueindays'] ?? 6)
    const throughput = seededNumber(atomId, 'sensor-throughput', 86000, 90000, 0)
    const positives = experience.execution.callouts.positives.length
      ? experience.execution.callouts.positives
      : ['Sensor array streaming within latency target.', 'Battery health holding above 80%.']
    const watch = experience.execution.callouts.watch.length
      ? experience.execution.callouts.watch
      : ['Calibration due in less than a week — schedule thermal QA.']

    const sensorKpis = [
      { id: 'uptime', label: 'Network Uptime', value: formatPercentString(uptime) },
      { id: 'latency', label: 'Stream Latency', value: formatSeconds(latencyMs) },
      { id: 'battery', label: 'Battery Health', value: formatPercentString(batteryPct) },
      { id: 'drift', label: 'Sensor Drift', value: `${drift.toFixed(2)}°C` },
      { id: 'alerts', label: 'Open Alerts', value: `${alertsOpen}` },
      { id: 'throughput', label: 'Daily Readings', value: `${throughput.toLocaleString()} packets` },
    ]

    const mobilizationRows = experience.mobilization.records.slice(0, 6)

    return (
      <div className="sensor-dashboard">
        <section className="sensor-hero">
          <div className="sensor-hero__meta">
            <h3>{experience.info.name}</h3>
            <p>{(experience.info.description as string) ?? 'Sensor readiness overview for thermal control.'}</p>
          </div>
          <div className="sensor-hero__stats">
            <div>
              <span>Nodes</span>
              <strong>{spec['nodes'] ?? 12}</strong>
            </div>
            <div>
              <span>Gateway</span>
              <strong>{(telemetry['gateway'] as string) ?? 'Batch yard north'}</strong>
            </div>
            <div>
              <span>Calibration due</span>
              <strong>{calibrationDue} days</strong>
            </div>
            <div>
              <span>Ambient</span>
              <strong>{(environment['ambientrange'] ?? environment['ambientRange'] ?? '5–48°C') as string}</strong>
            </div>
          </div>
        </section>

        <section className="sensor-kpis">
          {sensorKpis.map((kpi) => (
            <article key={kpi.id} className="sensor-kpi-card">
              <span>{kpi.label}</span>
              <strong>{kpi.value}</strong>
            </article>
          ))}
        </section>

        <section className="sensor-highlights">
          <div>
            <h4>Performance highlights</h4>
            <ul>
              {positives.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Watch next</h4>
            <ul>
              {watch.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Telemetry notes</h4>
            <ul>
              <li>Heartbeat: {formatSeconds(latencyMs)}</li>
              <li>Signal path: {(telemetry['uplink'] as string) ?? 'LoRaWAN + LTE backup'}</li>
              <li>Humidity: {(environment['humidity'] as string) ?? '—'}</li>
            </ul>
          </div>
        </section>

        <section className="sensor-stream">
          <header>
            <h4>Sensor deployment</h4>
            <span>{experience.mobilization.records.length} placements</span>
          </header>
          <table>
            <thead>
              <tr>
                <th>Location</th>
                <th>Window</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {mobilizationRows.map((record) => (
                <tr key={record.id}>
                  <td>{record.location ?? '—'}</td>
                  <td>
                    {DATE_FORMAT.format(new Date(record.mobilizedOn))} –{' '}
                    {record.demobilizedOn ? DATE_FORMAT.format(new Date(record.demobilizedOn)) : 'Present'}
                  </td>
                  <td>
                    <span className={`mobilization-tag mobilization-tag--${record.status.toLowerCase()}`}>{record.status}</span>
                  </td>
                  <td>
                    {Object.keys(record.metadata || {}).length
                      ? Object.entries(record.metadata)
                          .map(([key, value]) => `${key}: ${value}`)
                          .join(' • ')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    )
  }

  const specData = (experience.info.spec ?? null) as Record<string, unknown> | null
  const specHoursValue =
    specData && typeof specData['hours'] === 'number' ? (specData['hours'] as number) : undefined
  const totalOperatingHours = specHoursValue ?? seededNumber(atomId, 'hours-total', 720, 980, 0)
  const downtimeHours = seededNumber(atomId, 'downtime', 28, 72, 0)
  const cycleTimeSeconds = seededNumber(atomId, 'cycle', 9, 15, 0)
  const bucketFill = seededNumber(atomId, 'bucket-fill', 82, 92, 0)
  const utilization = metrics.get('utilization')?.value ?? seededNumber(atomId, 'utilization', 70, 96, 1)

  const energyMetric = metrics.get('energy-rate')
  let fuelRateValue = seededNumber(atomId, 'fuel-consumption', 6.2, 7.4, 2)
  let fuelRateUnit = 'gal/hr'
  if (energyMetric) {
    const unit = (energyMetric.unit ?? '').toLowerCase()
    if (unit.includes('l')) {
      const gallons = energyMetric.value / 3.785
      fuelRateValue = Number(gallons.toFixed(2))
      fuelRateUnit = 'gal/hr'
    } else {
      fuelRateValue = Number(energyMetric.value.toFixed(1))
      fuelRateUnit = energyMetric.unit ?? 'kWh'
    }
  }

  const downtimeAlert = 'Fuel level will expire before day end. Keep fuel in reserve.'
  const gradeControlAccuracy = seededNumber(atomId, 'grade-accuracy', 0.18, 0.32, 1)
  const tilt = seededNumber(atomId, 'mcs-tilt', 10, 14, 0)
  const rotation = seededNumber(atomId, 'mcs-rotation', 4, 8, 0)

  const locationName = experience.mobilization.records[0]?.location ?? 'Active excavation zone'
  const lat = seededNumber(atomId, 'lat', 35.61, 35.64, 3)
  const lng = seededNumber(atomId, 'lng', 73.12, 73.16, 3)
  const deploymentStart = experience.mobilization.records[0]?.mobilizedOn
    ? DATE_FORMAT.format(new Date(experience.mobilization.records[0].mobilizedOn))
    : DATE_FORMAT.format(new Date(Date.now() - 24 * 60 * 60 * 1000))

  const make = library?.info.provider?.split(' ')[0] ?? experience.info.typeName.split(' ')[0] ?? '—'
  const model = library?.info.atomName ?? experience.info.typeName ?? experience.info.name
  const softwareVersion = `v${seededNumber(atomId, 'software', 3.1, 4.8, 1)}`
  const ownership = library?.info.owner ?? experience.info.contractor ?? 'Plant & Fleet JV'

  const impactScore = '2.247'
  const integrity = '2 yrs warranty'

  const rulWindows = [
    { label: 'Hydraulic filter replacement', window: toHoursLabel(40, 50) },
    { label: 'Air filter cleaning', window: toHoursLabel(4, 5) },
  ]

  const aiRecommendations = [
    'Heavy dust detected, filter will require change soon.',
    'Heavy hydraulic usage detected, filter and oil life will reduce by 10%.',
    'Hydraulic pressure variation suggests leakage in arm link.',
  ]

  const highlights = experience.execution.callouts.positives.length
    ? experience.execution.callouts.positives
    : ['Utilization holding steady above weekly target.', 'Zero safety incidents in the past 14 days.']

  const kpis = [
    { id: 'operating-hours', label: 'Total Operating Hours', value: totalOperatingHours, unit: 'Hours' },
    { id: 'downtime', label: 'Downtime', value: downtimeHours, unit: 'Hours' },
    { id: 'cycle-time', label: 'Cycle Time Per Operation', value: cycleTimeSeconds, unit: 'Seconds' },
    { id: 'bucket-fill', label: 'Bucket Fill Factor', value: bucketFill, unit: 'Percent' },
    { id: 'utilization', label: 'Utilization Rate', value: utilization.toFixed(1), unit: 'Percent' },
    { id: 'fuel-rate', label: 'Fuel Consumption Rate', value: fuelRateValue, unit: fuelRateUnit },
  ]

  const [mapMounted, setMapMounted] = useState(false)
  useEffect(() => {
    setMapMounted(true)
  }, [])

  const mapCenter: [number, number] = [35.6175, 73.1338]
  const mapMarkers = [
    { label: 'MW-01 · Main Dam', percent: 74, alerts: 5, position: [35.6195, 73.1348] as [number, number] },
    { label: 'Batch Plant', percent: 54, alerts: 3, position: [35.6156, 73.1392] as [number, number] },
    { label: 'Spillway Works', percent: 62, alerts: 3, position: [35.6111, 73.1456] as [number, number] },
    { label: 'Diversion Tunnel', percent: 48, alerts: 3, position: [35.6039, 73.1406] as [number, number] },
    { label: 'Left Abutment', percent: 52, alerts: 2, position: [35.6068, 73.1487] as [number, number] },
    { label: 'Right Abutment', percent: 45, alerts: 4, position: [35.6005, 73.1546] as [number, number] },
  ]

  return (
    <div className="execution-dashboard">
      <section className="execution-hero">
        <div className="execution-hero__artwork">
          {image ? (
            <figure>
              <img src={image} alt={model} />
            </figure>
          ) : (
            <div className="execution-hero__placeholder">
              <span>{model}</span>
            </div>
          )}
          <span className="execution-status-tag">Active</span>
        </div>
        <div className="execution-hero__snapshot">
          <div className="execution-map">
            <div className="execution-map__modes">
              {['Atlas', 'Satellite', 'Terrain', 'Blueprint'].map((label) => (
                <span key={label} className={label === 'Satellite' ? 'is-active' : ''}>
                  {label}
                </span>
              ))}
            </div>
            <div className="execution-map__layers">
              <span>Geofence</span>
              <span>Heat</span>
            </div>
            <div className="execution-map__viewport">
              {mapMounted ? (
                <MapContainer
                  center={mapCenter}
                  zoom={13}
                  zoomSnap={0.25}
                  scrollWheelZoom={false}
                  className="execution-map__leaflet"
                  zoomControl={false}
                >
                  <ZoomControl position="topright" />
                  <TileLayer
                    attribution="&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye"
                    url="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  />
                  {mapMarkers.map((marker) => (
                    <CircleMarker
                      key={marker.label}
                      center={marker.position}
                      radius={16}
                      color="rgba(59,130,246,0.25)"
                      fillColor="rgba(59,130,246,0.85)"
                      fillOpacity={0.9}
                      weight={2}
                    >
                      <Tooltip direction="top" offset={[0, -8]} opacity={1} permanent className="execution-map__tooltip">
                        <div>
                          <strong>{marker.percent}%</strong>
                          <span>{marker.alerts} alerts</span>
                        </div>
                      </Tooltip>
                    </CircleMarker>
                  ))}
                </MapContainer>
              ) : (
                <div className="execution-map__placeholder" />
              )}
              <div className="execution-map__callout">
                <h5>MW-01 · Main Dam</h5>
                <p>74% complete</p>
                <p>Alerts 5 · Live</p>
                <p>Weather — · Conditions unavailable</p>
              </div>
            </div>
            <footer>
              <div>
                <strong>{locationName}</strong>
                <span>
                  {lat.toFixed(3)}° N · {lng.toFixed(3)}° E
                </span>
              </div>
              <button type="button">View log</button>
            </footer>
          </div>
          <div className="execution-specs">
            <dl>
              <div>
                <dt>Make</dt>
                <dd>{make}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{model}</dd>
              </div>
              <div>
                <dt>Software ver.</dt>
                <dd>{softwareVersion}</dd>
              </div>
              <div>
                <dt>Deployment start</dt>
                <dd>{deploymentStart}</dd>
              </div>
              <div>
                <dt>Ownership</dt>
                <dd>{ownership}</dd>
              </div>
              <div>
                <dt>Impact</dt>
                <dd>{impactScore}</dd>
              </div>
              <div>
                <dt>Integrity</dt>
                <dd>{integrity}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section className="execution-alerts">
        <div className="execution-alert">
          <h4>Downtime prevention alert</h4>
          <p>{downtimeAlert}</p>
        </div>
        <div className="execution-rul">
          <h4>Remaining useful life (RUL)</h4>
          <ul>
            {rulWindows.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <strong>{item.window}</strong>
              </li>
            ))}
          </ul>
        </div>
        <div className="execution-ai">
          <h4>AI-recommended maintenance</h4>
          <ul>
            {aiRecommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="execution-metrics">
        {kpis.map((kpi) => (
          <article key={kpi.id} className="execution-metric-card">
            <span>{kpi.label}</span>
            <strong>{typeof kpi.value === 'number' ? kpi.value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : kpi.value}</strong>
            <small>{kpi.unit}</small>
          </article>
        ))}
      </section>

      <section className="execution-mcs">
        <div className="execution-mcs__grade">
          <header>
            <h4>MCS · Grade control accuracy</h4>
            <span>Within limits</span>
          </header>
          <strong>{gradeControlAccuracy.toFixed(1)}°</strong>
          <div className="execution-mcs__chips">
            <span>Tilt {tilt.toFixed(0)}°</span>
            <span>Rotation {rotation.toFixed(0)}°</span>
          </div>
        </div>
        <div className="execution-mcs__monitoring">
          <header>
            <h4>Load monitoring & overload alerts</h4>
            <span>Sensor data integration</span>
          </header>
          <div>
            <span>Bucket load</span>
            <strong>Nominal</strong>
          </div>
          <div>
            <span>Overload alert</span>
            <strong className="execution-mcs__safe">None</strong>
          </div>
        </div>
      </section>

      <section className="execution-highlights">
        <h4>Performance highlights</h4>
        <ul>
          {highlights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
