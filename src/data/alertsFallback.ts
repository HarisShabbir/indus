import type { Alert } from '../api'

const ALERTS: Alert[] = [
  {
    id: 'fallback-ncr-rcc-01',
    project_id: 'diamer-basha',
    title: 'Non-conformance · MW-01 Main Dam',
    location: 'RCC Daily Pour',
    activity: 'Non-conformance review',
    severity: 'major',
    category: 'NCR',
    status: 'open',
    owner: 'Site QA Lead',
    root_cause: 'Incorrect rebar spacing detected in pour sequence',
    recommendation: 'Issue NCR and schedule rework crew with calibrated jigs',
    acknowledged_at: '2025-01-10T05:20:00Z',
    due_at: '2025-01-12T08:00:00Z',
    cleared_at: null,
    raised_at: '2025-01-10T04:15:00Z',
    metadata: {
      scope: {
        project: { code: 'diamer-basha', name: 'Diamer Basha Dam Program' },
        contract: { code: 'mw-01-main-dam', name: 'MW-01 Main Dam' },
        sow: { code: 'mw-01-rcc', name: 'RCC Dam Works' },
        process: { code: 'mw-01-rcc-pouring', name: 'RCC Daily Pour' },
      },
      impact: {
        scheduleDaysAtRisk: 2.5,
        costExposureK: 145,
        productivityLossHours: 12,
        description: 'Structural pour hold until NCR disposition',
      },
      workflow: {
        status: 'open',
        owner: 'Site QA Lead',
        slaHours: 48,
        lastUpdated: '2025-01-10T05:20:00Z',
      },
    },
    items: [
      { type: 'category', label: 'Non-conformance', detail: 'Structural pour hold until NCR disposition' },
      { type: 'severity', label: 'Priority', detail: 'Major' },
      { type: 'owner', label: 'Owner', detail: 'Site QA Lead' },
      { type: 'process', label: 'Process', detail: 'RCC Daily Pour' },
    ],
  },
  {
    id: 'fallback-sensor-vibration-01',
    project_id: 'mohmand-dam',
    title: 'Sensor drift · CW-01 Civil Works',
    location: 'Tunnel Excavation',
    activity: 'Instrumentation monitoring',
    severity: 'critical',
    category: 'Sensor',
    status: 'acknowledged',
    owner: 'Instrumentation Supervisor',
    root_cause: 'Sensor calibration drift beyond allowable threshold',
    recommendation: 'Swap sensor module and run calibration routine',
    acknowledged_at: '2025-01-12T03:45:00Z',
    due_at: '2025-01-12T16:00:00Z',
    cleared_at: null,
    raised_at: '2025-01-12T02:15:00Z',
    metadata: {
      scope: {
        project: { code: 'mohmand-dam', name: 'Mohmand Dam Hydropower Project' },
        contract: { code: 'cw-01-civil-works', name: 'CW-01 Civil Works' },
        sow: { code: 'cw-01-diversion', name: 'Diversion Tunnel Works' },
        process: { code: 'cw-01-tunnel-exc', name: 'Tunnel Excavation' },
      },
      signals: {
        source: 'sensor',
        tag: 'VIB-332',
        lastReading: 1.18,
        confidence: 0.92,
      },
      impact: {
        scheduleDaysAtRisk: 1.2,
        costExposureK: 88,
        productivityLossHours: 6,
        description: 'Instrumentation feed degraded for dam safety dashboard',
      },
      workflow: {
        status: 'acknowledged',
        owner: 'Instrumentation Supervisor',
        slaHours: 24,
        lastUpdated: '2025-01-12T03:45:00Z',
      },
    },
    items: [
      { type: 'category', label: 'Sensor drift', detail: 'Instrumentation feed degraded for dam safety dashboard' },
      { type: 'sensor', label: 'Sensor Tag', detail: 'VIB-332 · drift 5.1%' },
      { type: 'severity', label: 'Priority', detail: 'Critical' },
      { type: 'owner', label: 'Owner', detail: 'Instrumentation Supervisor' },
    ],
  },
  {
    id: 'fallback-schedule-powerhouse-01',
    project_id: 'dasu-hpp',
    title: 'Schedule slip · MW-02 Transmission',
    location: 'Conductor Stringing',
    activity: 'Schedule monitoring',
    severity: 'major',
    category: 'Schedule',
    status: 'in_progress',
    owner: 'Construction Manager',
    root_cause: 'Late delivery of rebar cages impacting sequence',
    recommendation: 'Expedite supplier QA release and resequence installation',
    acknowledged_at: '2025-01-13T10:05:00Z',
    due_at: '2025-01-15T08:00:00Z',
    cleared_at: null,
    raised_at: '2025-01-13T08:50:00Z',
    metadata: {
      scope: {
        project: { code: 'dasu-hpp', name: 'Dasu Hydropower Project' },
        contract: { code: 'mw-02-transmission', name: 'MW-02 Transmission' },
        sow: { code: 'mw-02-right-bank', name: 'Right Bank Towers' },
        process: { code: 'mw-02-stringing', name: 'Conductor Stringing' },
      },
      impact: {
        scheduleDaysAtRisk: 3.4,
        costExposureK: 132,
        productivityLossHours: 18,
        description: 'Schedule float eroded for spillway crest',
      },
      workflow: {
        status: 'in_progress',
        owner: 'Construction Manager',
        slaHours: 48,
        lastUpdated: '2025-01-13T10:05:00Z',
      },
    },
    items: [
      { type: 'category', label: 'Schedule slip', detail: 'Schedule float eroded for spillway crest' },
      { type: 'severity', label: 'Priority', detail: 'Major' },
      { type: 'owner', label: 'Owner', detail: 'Construction Manager' },
      { type: 'process', label: 'Process', detail: 'Conductor Stringing' },
    ],
  },
]

export function getAlertsFallback(projectId?: string): Alert[] {
  if (!projectId) {
    return ALERTS
  }
  return ALERTS.filter((alert) => alert.project_id === projectId)
}
