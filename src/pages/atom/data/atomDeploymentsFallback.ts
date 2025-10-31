import type { AtomDeploymentGroupReport, AtomDeploymentItemReport } from '../../../api'

type DeploymentTotals = {
  active: number
  idle: number
  completed: number
}

type Blueprint = {
  model: string
  vendor: string
  process: string
  sow: string
  atomType: string
  baseHours: number
  baseValue: number
  baseProgress: number
}

type BlueprintSet = {
  active: Blueprint[]
  idle: Blueprint[]
  completed: Blueprint[]
}

type FallbackResult = {
  active: AtomDeploymentGroupReport[]
  idle: AtomDeploymentGroupReport[]
  completed: AtomDeploymentGroupReport[]
  totals: DeploymentTotals
  asOf: string
}

const DEFAULT_TOTALS: DeploymentTotals = {
  active: 24,
  idle: 8,
  completed: 4,
}

const MACHINERY_BLUEPRINTS: BlueprintSet = {
  active: [
    {
      model: 'CAT 395 Tier 4',
      vendor: 'Caterpillar Inc.',
      process: 'Dam Pit Excavation',
      sow: 'RCC Dam Works',
      atomType: 'Machinery · Excavator',
      baseHours: 210,
      baseValue: 315000,
      baseProgress: 0.72,
    },
    {
      model: 'Volvo EC750E',
      vendor: 'Volvo CE',
      process: 'Spillway Excavation',
      sow: 'Structural Works',
      atomType: 'Machinery · Excavator',
      baseHours: 195,
      baseValue: 298000,
      baseProgress: 0.66,
    },
    {
      model: 'Liebherr R 980 SME',
      vendor: 'Liebherr Group',
      process: 'Left Abutment Trim',
      sow: 'Earthworks',
      atomType: 'Machinery · Excavator',
      baseHours: 188,
      baseValue: 342000,
      baseProgress: 0.69,
    },
    {
      model: 'Komatsu PC850LC',
      vendor: 'Komatsu Ltd.',
      process: 'Batch Plant Loading',
      sow: 'Support Works',
      atomType: 'Machinery · Excavator',
      baseHours: 176,
      baseValue: 256000,
      baseProgress: 0.63,
    },
  ],
  idle: [
    {
      model: 'Doosan DX800LC',
      vendor: 'Doosan',
      process: 'Stockpile Management',
      sow: 'Support Works',
      atomType: 'Machinery · Excavator',
      baseHours: 104,
      baseValue: 212000,
      baseProgress: 0.42,
    },
    {
      model: 'Hyundai HX900L',
      vendor: 'Hyundai CE',
      process: 'Portal Trimming',
      sow: 'River Diversion',
      atomType: 'Machinery · Excavator',
      baseHours: 96,
      baseValue: 198000,
      baseProgress: 0.37,
    },
  ],
  completed: [
    {
      model: 'CAT 390F',
      vendor: 'Caterpillar Inc.',
      process: 'Diversion Cofferdam',
      sow: 'River Diversion',
      atomType: 'Machinery · Excavator',
      baseHours: 152,
      baseValue: 226000,
      baseProgress: 1,
    },
    {
      model: 'Volvo EC950F',
      vendor: 'Volvo CE',
      process: 'Spillway Pilot Cut',
      sow: 'Structural Works',
      atomType: 'Machinery · Excavator',
      baseHours: 148,
      baseValue: 308000,
      baseProgress: 1,
    },
  ],
}

const ACTOR_BLUEPRINTS: BlueprintSet = {
  active: [
    {
      model: 'Excavator Crew',
      vendor: 'HydroBuild Operations',
      process: 'Dam Pit Excavation',
      sow: 'RCC Dam Works',
      atomType: 'Workforce · Crew',
      baseHours: 12,
      baseValue: 5200,
      baseProgress: 0.82,
    },
    {
      model: 'Trim Crew',
      vendor: 'Frontier Earthworks JV',
      process: 'Spillway Excavation',
      sow: 'Structural Works',
      atomType: 'Workforce · Crew',
      baseHours: 11,
      baseValue: 5100,
      baseProgress: 0.78,
    },
    {
      model: 'Batch Plant Ops',
      vendor: 'Nevada Heavy Rentals',
      process: 'Batch Plant Loading',
      sow: 'Support Works',
      atomType: 'Workforce · Crew',
      baseHours: 10,
      baseValue: 4900,
      baseProgress: 0.74,
    },
    {
      model: 'Survey Team',
      vendor: 'SiteWorks Partners',
      process: 'Portal Layout',
      sow: 'River Diversion',
      atomType: 'Workforce · Crew',
      baseHours: 9,
      baseValue: 4600,
      baseProgress: 0.7,
    },
  ],
  idle: [
    {
      model: 'Logistics Support',
      vendor: 'HydroBuild Operations',
      process: 'Access Road Prep',
      sow: 'Logistics Works',
      atomType: 'Workforce · Crew',
      baseHours: 8,
      baseValue: 4200,
      baseProgress: 0.46,
    },
    {
      model: 'Safety Watch',
      vendor: 'Blue Ridge Services',
      process: 'Permit Readiness',
      sow: 'Support Works',
      atomType: 'Workforce · Crew',
      baseHours: 7,
      baseValue: 4000,
      baseProgress: 0.4,
    },
  ],
  completed: [
    {
      model: 'QA/QC Team',
      vendor: 'HydroBuild Operations',
      process: 'QC Sign-off',
      sow: 'Structural Works',
      atomType: 'Workforce · Crew',
      baseHours: 6,
      baseValue: 3800,
      baseProgress: 1,
    },
  ],
}

const CATEGORY_BLUEPRINTS: Record<string, BlueprintSet> = {
  machinery: MACHINERY_BLUEPRINTS,
  actors: ACTOR_BLUEPRINTS,
}

const seed = (index: number) => {
  const value = Math.sin(index * 9991) * 10000
  return value - Math.floor(value)
}

const jitter = (value: number, offset: number, index: number) => {
  const variance = value * offset
  const delta = (seed(index) - 0.5) * 2 * variance
  return Number(Math.max(0, value + delta).toFixed(1))
}

const createItem = (blueprint: Blueprint, identifier: string, status: 'active' | 'idle' | 'completed', index: number): AtomDeploymentItemReport => {
  const start = new Date()
  start.setDate(start.getDate() - (5 + (index % 4)))
  const stages = [
    { status: 'warehouse' as const, ts: start.toISOString() },
    { status: 'in_transit' as const, ts: new Date(start.getTime() + 12 * 60 * 60 * 1000).toISOString() },
    { status: 'on_site' as const, ts: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString() },
  ]
  if (status !== 'completed') {
    stages.push({ status: 'engaged' as const, ts: new Date(start.getTime() + 30 * 60 * 60 * 1000).toISOString() })
  }

  return {
    atomId: identifier,
    serial: identifier,
    deploymentStart: stages[0].ts,
    hoursCompleted: jitter(blueprint.baseHours, 0.15, index),
    latestTelemetry:
      status === 'completed'
        ? { shift: 'Completed', readiness: 'Standby' }
        : {
            fuelLevel: `${Math.max(35, Math.round(70 - (index % 7) * 4))}%`,
            engineTemp: `${Math.round(184 + (index % 5))}°F`,
          },
    journey: stages,
    unitCost: Number(blueprint.baseValue.toFixed(0)),
  }
}

const buildGroups = (blueprints: Blueprint[], total: number, status: 'active' | 'idle' | 'completed'): AtomDeploymentGroupReport[] => {
  if (total <= 0) return []
  const groups: AtomDeploymentGroupReport[] = []
  for (let index = 0; index < total; index += 1) {
    const blueprint = blueprints[index % blueprints.length]
    const series = Math.floor(index / blueprints.length) + 1
    const modelLabel = `${blueprint.model} ${series > 1 ? `#${series.toString().padStart(2, '0')}` : '#01'}`
    const identifier = `${blueprint.model.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()}-${(series * (index % blueprints.length + 1)).toString().padStart(3, '0')}`

    const item = createItem(blueprint, identifier, status, index)
    const progress = status === 'completed' ? 1 : jitter(blueprint.baseProgress, 0.08, index)
    const cost = Number(blueprint.baseValue.toFixed(0))

    groups.push({
      atomType: blueprint.atomType,
      model: modelLabel,
      vendor: blueprint.vendor,
      capacity: status === 'active' ? { crewSize: blueprint.atomType.includes('Workforce') ? 12 : undefined } : undefined,
      count: 1,
      deploymentStartEarliest: item.deploymentStart,
      hoursCompleted: item.hoursCompleted ?? blueprint.baseHours,
      workCompleted: {
        qtyDone: Number((progress * 1200).toFixed(1)),
        percentComplete: Number(progress.toFixed(2)),
        ev: Number((progress * 6.5).toFixed(2)),
        pv: Number((progress * 6.0).toFixed(2)),
        ac: Number((progress * 5.4).toFixed(2)),
      },
      journeyStatus: status === 'active' ? 'Engaged' : status === 'idle' ? 'On Site' : 'Completed',
      deploymentStatus: status,
      items: [item],
      processId: blueprint.process.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      processCode: blueprint.process,
      processName: blueprint.process,
      sowId: blueprint.sow.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      sowCode: blueprint.sow,
      sowName: blueprint.sow,
      contractId: 'mw-01-main-dam',
      contractCode: 'mw-01-main-dam',
      contractName: 'MW-01 Main Dam',
      value: cost,
    })
  }
  return groups
}

export const getDeploymentFallback = (category?: string | null, overrideTotals?: Partial<DeploymentTotals>): FallbackResult => {
  const key = (category ?? 'machinery').toLowerCase()
  const blueprints = CATEGORY_BLUEPRINTS[key] ?? CATEGORY_BLUEPRINTS.machinery

  const totals: DeploymentTotals = {
    active: overrideTotals?.active ?? DEFAULT_TOTALS.active,
    idle: overrideTotals?.idle ?? DEFAULT_TOTALS.idle,
    completed: overrideTotals?.completed ?? DEFAULT_TOTALS.completed,
  }

  const activeGroups = buildGroups(blueprints.active, totals.active, 'active')
  const idleGroups = buildGroups(blueprints.idle, totals.idle, 'idle')
  const completedGroups = buildGroups(blueprints.completed, totals.completed, 'completed')

  return {
    active: activeGroups,
    idle: idleGroups,
    completed: completedGroups,
    totals,
    asOf: new Date().toISOString(),
  }
}

