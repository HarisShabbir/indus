export type Stage = 'Demand' | 'Procurement' | 'Readiness' | 'Logistics' | 'Inventory'

export type Status = 'OK' | 'Risk' | 'Blocked' | 'Delayed'

export type Demand = {
  total: number
  committed: number
  status: Status
}

export type Procurement = {
  openPOs: number
  latePOs: number
  etaDaysMean: number
  status: Status
}

export type Readiness = {
  coveragePct: number
  trend: number[]
  status: Status
}

export type Logistics = {
  shipmentsInFlight: number
  avgETA_Days: number
  onTimePct: number
  status: Status
}

export type Inventory = {
  valueUSD: number
  turns: number
  spark: number[]
  status: Status
}

export type AlarmSeverity = 'info' | 'warn' | 'critical'

export type Alarm = {
  id: string
  stage: Stage
  severity: AlarmSeverity
  message: string
  ts: string
  metadata?: Record<string, unknown>
}

export type Shipment = {
  id: string
  lat: number
  lon: number
  speedKph?: number
  headingDeg?: number
  label?: string
}

export type VolatilityLevel = 'low' | 'medium' | 'high'

export type ProcessAtom = {
  name: string
  type: string
  status?: string
}

export type ProcessProfile = {
  id: string
  label: string
  description?: string
  atoms: ProcessAtom[]
  baseline?: {
    demandTotal?: number
    demandCommitted?: number
    procurement?: {
      openPOs?: number
      latePOs?: number
      etaDays?: number
    }
    logistics?: {
      shipmentsInFlight?: number
      onTimePct?: number
      avgETA?: number
    }
    inventory?: {
      valueUSD?: number
    }
  }
}

export type SyntheticDrivers = {
  demandGrowth: number
  leadTimeVariance: number
  onTimeNoise: number
}

export type DemandMetrics = Demand & {
  deltas: number[]
  ratio: number
  updatedAtTick: number
  rationale: string
}

export type ProcurementMetrics = Procurement & {
  updatedAtTick: number
  rationale: string
  targetEtaDays: number
}

export type ReadinessMetrics = Readiness & {
  updatedAtTick: number
  rationale: string
}

export type LogisticsMetrics = Logistics & {
  shipments: Shipment[]
  updatedAtTick: number
  rationale: string
}

export type InventoryMetrics = Inventory & {
  baseline: number
  updatedAtTick: number
  rationale: string
}

export type StatusMap = Record<Stage, Status>

export type RationaleMap = Record<Stage, string>

export type SyntheticScmSnapshot = {
  tick: number
  seed: number
  volatility: VolatilityLevel
  isRunning: boolean
  demand: DemandMetrics
  procurement: ProcurementMetrics
  readiness: ReadinessMetrics
  logistics: LogisticsMetrics
  inventory: InventoryMetrics
  statusByStage: StatusMap
  rationaleByStage: RationaleMap
  overallStatus: Status
  alarms: Alarm[]
  drivers: SyntheticDrivers
  lastUpdatedAt: number
  processProfile?: ProcessProfile | null
}

export type SimulatedEvent = 'supply-delay' | 'po-cancellation' | 'expedite' | 'port-congestion' | 'inventory-recovery'
