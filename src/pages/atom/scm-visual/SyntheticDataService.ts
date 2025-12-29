import {
  Alarm,
  AlarmSeverity,
  DemandMetrics,
  InventoryMetrics,
  LogisticsMetrics,
  ProcurementMetrics,
  ProcessProfile,
  ReadinessMetrics,
  SimulatedEvent,
  Stage,
  Status,
  StatusMap,
  SyntheticDrivers,
  SyntheticScmSnapshot,
  VolatilityLevel,
} from './types'
import { logTelemetry } from './telemetry'

type Subscriber = (snapshot: SyntheticScmSnapshot) => void

type MutableSnapshot = SyntheticScmSnapshot

const VOLATILITY_SCALE: Record<VolatilityLevel, number> = {
  low: 0.45,
  medium: 1,
  high: 1.75,
}

const DRIVER_DEFAULTS: SyntheticDrivers = {
  demandGrowth: 0.52,
  leadTimeVariance: 0.48,
  onTimeNoise: 0.5,
}

const STAGE_PIPELINE: Stage[] = ['Demand', 'Procurement', 'Logistics', 'Inventory', 'Readiness']

const STATUS_ORDER: Status[] = ['OK', 'Risk', 'Delayed', 'Blocked']
const STATUS_RANK = new Map<Status, number>(STATUS_ORDER.map((status, index) => [status, index]))

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const lerp = (start: number, end: number, amount: number) => start + (end - start) * amount

const normalize01 = (value: number, min: number, max: number) => {
  if (max === min) return 0
  return clamp((value - min) / (max - min), 0, 1)
}

const baseShipmentAnchors = [
  { lat: 24.79, lon: 66.99 },
  { lat: 25.5, lon: 67.6 },
  { lat: 27.2, lon: 68.4 },
  { lat: 30.2, lon: 70.1 },
  { lat: 33.4, lon: 72.8 },
  { lat: 35.7, lon: 74.5 },
]

const clampToCorridor = (lat: number, lon: number) => {
  const clampedLat = clamp(lat, 23.8, 36.4)
  const clampedLon = clamp(lon, 65.8, 75.6)
  return { lat: clampedLat, lon: clampedLon }
}

const createRng = (seed: number) => {
  let current = seed >>> 0
  return () => {
    current += 0x6d2b79f5
    let t = current
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const worstStatus = (statuses: Status[]): Status => {
  return statuses.reduce<Status>(
    (acc, status) => ((STATUS_RANK.get(status) ?? 0) > (STATUS_RANK.get(acc) ?? 0) ? status : acc),
    'OK',
  )
}

const statusToSeverity = (status: Status): AlarmSeverity => {
  if (status === 'OK') return 'info'
  if (status === 'Risk') return 'warn'
  return 'critical'
}

const formatPercent = (value: number, fractionDigits = 1) => `${value.toFixed(fractionDigits)}%`

const formatNumber = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 0 })

const buildAlarmMessage = (stage: Stage, severity: AlarmSeverity, rng: () => number) => {
  const templates: Record<Stage, string[]> = {
    Demand: [
      'Site escalation request increased committed demand',
      'Planner revised demand forecast upward',
      'Demand pull adjusted after rush order intake',
    ],
    Procurement: [
      'PO-147 overdue 3d awaiting vendor response',
      'Fabrication lot slipped +2d due to QA hold',
      'Supplier requested expedite surcharge on PO-233',
    ],
    Readiness: [
      'Coverage dropped below target guardrail',
      'Readiness impacted by upstream procurement delays',
      'Field crews flagged missing materials for next shift',
    ],
    Logistics: [
      'Vessel ETA slip +2d from Karachi corridor',
      'Convoy paused at checkpoint awaiting clearance',
      'Cold chain sensor pinged variance in reefer container',
    ],
    Inventory: [
      'Warehouse drawdown exceeded rolling average',
      'Cycle count variance detected in laydown yard',
      'Critical spare reorder point reached',
    ],
  }
  const pool = templates[stage]
  if (!pool || !pool.length) return `${stage} status ping`
  const index = Math.floor(rng() * pool.length)
  const prefix = severity === 'critical' ? 'Critical' : severity === 'warn' ? 'Warning' : 'Info'
  return `${prefix}: ${pool[index]}`
}

export class SyntheticDataService {
  private subscribers = new Set<Subscriber>()

  private timer: ReturnType<typeof setInterval> | null = null

  private readonly intervalMs = 3000

  private rng: () => number

  private seed: number

  private volatility: VolatilityLevel

  private drivers: SyntheticDrivers

  private snapshot: MutableSnapshot

  private inventoryBaseline: number

  private readonly targetEtaDays = 7

  private profile: ProcessProfile | null

  constructor(seed: number, volatility: VolatilityLevel = 'medium', profile?: ProcessProfile) {
    this.seed = Number.isFinite(seed) ? seed : 4021
    this.volatility = volatility
    this.rng = createRng(this.seed)
    this.drivers = { ...DRIVER_DEFAULTS }
    this.profile = profile ?? null
    this.snapshot = this.buildInitialSnapshot()
    this.inventoryBaseline = this.snapshot.inventory.valueUSD
    this.startTimer()
    this.notify()
  }

  subscribe(subscriber: Subscriber) {
    this.subscribers.add(subscriber)
    subscriber(this.cloneSnapshot())
    return () => {
      this.subscribers.delete(subscriber)
    }
  }

  dispose() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.subscribers.clear()
  }

  play() {
    if (!this.snapshot.isRunning) {
      this.snapshot.isRunning = true
      this.notify()
    }
  }

  pause() {
    if (this.snapshot.isRunning) {
      this.snapshot.isRunning = false
      this.notify()
    }
  }

  toggle() {
    this.snapshot.isRunning ? this.pause() : this.play()
  }

  reset() {
    const running = this.snapshot.isRunning
    this.reseed(this.seed, running)
  }

  setSeed(seed: number) {
    const fallback = Number.isFinite(seed) ? Math.trunc(seed) : this.seed
    this.reseed(fallback, this.snapshot.isRunning)
  }

  setVolatility(volatility: VolatilityLevel) {
    if (this.volatility === volatility) return
    this.volatility = volatility
    this.snapshot.volatility = volatility
    this.notify()
  }

  updateDrivers(partial: Partial<SyntheticDrivers>) {
    const next: SyntheticDrivers = { ...this.drivers, ...partial }
    next.demandGrowth = clamp(next.demandGrowth, 0, 1)
    next.leadTimeVariance = clamp(next.leadTimeVariance, 0, 1)
    next.onTimeNoise = clamp(next.onTimeNoise, 0, 1)
    this.drivers = next
    this.snapshot.drivers = { ...next }
    this.notify()
  }

  acknowledgeAlarm(id: string) {
    if (!id) return
    const before = this.snapshot.alarms.length
    this.snapshot.alarms = this.snapshot.alarms.filter((alarm) => alarm.id !== id)
    if (this.snapshot.alarms.length !== before) {
      this.notify()
    }
  }

  simulateEvent(event: SimulatedEvent) {
    const tick = this.snapshot.tick
    const scenarioLabels: Record<SimulatedEvent, string> = {
      'supply-delay': 'Supply delay +2d',
      'po-cancellation': 'PO cancellation',
      expedite: 'Expedite',
      'port-congestion': 'Port congestion',
      'inventory-recovery': 'Inventory recovery',
    }
    const beforeStatus = { ...this.snapshot.statusByStage }
    const touchedStages = new Set<Stage>()
    switch (event) {
      case 'supply-delay': {
        const logistics = this.snapshot.logistics
        logistics.avgETA_Days = clamp(logistics.avgETA_Days + 1.8 + this.rng() * 0.5, 4.5, 18)
        logistics.onTimePct = clamp(logistics.onTimePct - 0.14, 0.58, 0.9)
        logistics.shipmentsInFlight = Math.max(0, logistics.shipmentsInFlight - 1)
        logistics.updatedAtTick = tick
        this.refreshLogisticsMetadata(tick)
        touchedStages.add('Logistics')

        const inventory = this.snapshot.inventory
        const drop = Math.max(52000, inventory.valueUSD * 0.16)
        inventory.valueUSD = clamp(inventory.valueUSD - drop, 420_000, 980_000)
        inventory.spark = [...inventory.spark.slice(-19), inventory.valueUSD]
        inventory.updatedAtTick = tick
        this.refreshInventoryMetadata(tick)
        touchedStages.add('Inventory')
        touchedStages.add('Readiness')
        break
      }
      case 'po-cancellation': {
        const demand = this.snapshot.demand
        const reduction = Math.max(90, Math.round(demand.total * 0.07))
        demand.committed = clamp(demand.committed - reduction, 0, demand.total)
        demand.deltas = [...demand.deltas.slice(-4), -reduction]
        demand.updatedAtTick = tick
        this.refreshDemandMetadata(tick)
        touchedStages.add('Demand')

        const procurement = this.snapshot.procurement
        procurement.openPOs = Math.max(1, procurement.openPOs - 1)
        procurement.latePOs = Math.max(1, Math.min(procurement.openPOs, procurement.latePOs + 2))
        procurement.etaDaysMean = clamp(procurement.etaDaysMean + 3.4, this.targetEtaDays + 4, 18)
        procurement.updatedAtTick = tick
        this.refreshProcurementMetadata(tick)
        touchedStages.add('Procurement')

        const logistics = this.snapshot.logistics
        logistics.onTimePct = clamp(logistics.onTimePct - 0.25, 0.4, 0.9)
        logistics.avgETA_Days = clamp(logistics.avgETA_Days + 2.6, 5.4, 18)
        logistics.shipmentsInFlight = Math.max(0, logistics.shipmentsInFlight - 1)
        logistics.updatedAtTick = tick
        this.refreshLogisticsMetadata(tick)
        touchedStages.add('Logistics')

        const inventory = this.snapshot.inventory
        const drop = Math.max(52000, inventory.valueUSD * 0.18)
        inventory.valueUSD = clamp(inventory.valueUSD - drop, 420_000, 980_000)
        inventory.spark = [...inventory.spark.slice(-19), inventory.valueUSD]
        inventory.updatedAtTick = tick
        this.refreshInventoryMetadata(tick)
        touchedStages.add('Inventory')
        touchedStages.add('Readiness')
        break
      }
      case 'expedite': {
        const demand = this.snapshot.demand
        const surge = Math.max(120, Math.round(demand.total * 0.1))
        demand.total += surge
        demand.committed = clamp(demand.committed + Math.round(surge * 0.35), 0, demand.total)
        demand.deltas = [...demand.deltas.slice(-4), Math.round(surge * 0.35)]
        demand.updatedAtTick = tick
        this.refreshDemandMetadata(tick)
        touchedStages.add('Demand')

        const procurement = this.snapshot.procurement
        procurement.openPOs += Math.max(1, Math.round(1 + this.rng() * 2))
        procurement.latePOs = Math.min(
          procurement.openPOs,
          Math.max(procurement.latePOs + 1, Math.round(procurement.openPOs * 0.4)),
        )
        procurement.etaDaysMean = clamp(procurement.etaDaysMean + 1.8, 4.4, 18)
        procurement.updatedAtTick = tick
        this.refreshProcurementMetadata(tick)
        touchedStages.add('Procurement')

        const logistics = this.snapshot.logistics
        logistics.shipmentsInFlight = clamp(logistics.shipmentsInFlight + 3, 0, 12)
        logistics.onTimePct = clamp(logistics.onTimePct - 0.14, 0.6, 0.95)
        logistics.avgETA_Days = clamp(logistics.avgETA_Days + 1.4, 4, 18)
        logistics.updatedAtTick = tick
        this.refreshLogisticsMetadata(tick)
        touchedStages.add('Logistics')

        const inventory = this.snapshot.inventory
        const drawDown = Math.max(52000, inventory.valueUSD * 0.17)
        inventory.valueUSD = clamp(inventory.valueUSD - drawDown, 420_000, 980_000)
        inventory.spark = [...inventory.spark.slice(-19), inventory.valueUSD]
        inventory.updatedAtTick = tick
        this.refreshInventoryMetadata(tick)
        touchedStages.add('Inventory')
        touchedStages.add('Readiness')
        break
      }
      case 'port-congestion': {
        const logistics = this.snapshot.logistics
        logistics.onTimePct = clamp(logistics.onTimePct - 0.3, 0.35, 0.9)
        logistics.avgETA_Days = clamp(logistics.avgETA_Days + 3.2, 5.8, 18)
        logistics.shipmentsInFlight = clamp(logistics.shipmentsInFlight + 1, 0, 12)
        logistics.updatedAtTick = tick
        this.refreshLogisticsMetadata(tick)
        touchedStages.add('Logistics')

        const inventory = this.snapshot.inventory
        inventory.valueUSD = clamp(inventory.valueUSD - Math.max(52000, inventory.valueUSD * 0.16), 420_000, 980_000)
        inventory.spark = [...inventory.spark.slice(-19), inventory.valueUSD]
        inventory.updatedAtTick = tick
        this.refreshInventoryMetadata(tick)
        touchedStages.add('Inventory')
        touchedStages.add('Readiness')
        break
      }
      case 'inventory-recovery': {
        const procurement = this.snapshot.procurement
        procurement.latePOs = Math.max(0, procurement.latePOs - 1)
        procurement.etaDaysMean = clamp(procurement.etaDaysMean - 1.2, 4.4, 12)
        procurement.updatedAtTick = tick
        this.refreshProcurementMetadata(tick)
        touchedStages.add('Procurement')

        const logistics = this.snapshot.logistics
        logistics.onTimePct = clamp(logistics.onTimePct + 0.12, 0.55, 0.98)
        logistics.avgETA_Days = clamp(logistics.avgETA_Days - 1.4, 3.5, 12)
        logistics.updatedAtTick = tick
        this.refreshLogisticsMetadata(tick)
        touchedStages.add('Logistics')

        const inventory = this.snapshot.inventory
        const boost = Math.max(45000, this.inventoryBaseline * 0.08)
        inventory.valueUSD = clamp(inventory.valueUSD + boost, 420_000, 980_000)
        inventory.turns = clamp(inventory.turns + 0.4, 2.8, 8.5)
        inventory.spark = [...inventory.spark.slice(-19), inventory.valueUSD]
        inventory.updatedAtTick = tick
        this.refreshInventoryMetadata(tick)
        touchedStages.add('Inventory')

        const demand = this.snapshot.demand
        const uplift = Math.round(boost / 5000)
        demand.committed = clamp(demand.committed + uplift, 0, demand.total)
        demand.deltas = [...demand.deltas.slice(-4), uplift]
        demand.updatedAtTick = tick
        this.refreshDemandMetadata(tick)
        touchedStages.add('Demand')
        touchedStages.add('Readiness')
        break
      }
      default:
    }
    this.recomputeDerived(tick)
    this.snapshot.lastUpdatedAt = Date.now()
    const impactedStages = STAGE_PIPELINE.filter(
      (stage) => beforeStatus[stage] !== this.snapshot.statusByStage[stage] || touchedStages.has(stage),
    )
    const severityOverride: AlarmSeverity | undefined = event === 'inventory-recovery' ? 'info' : undefined
    const label = scenarioLabels[event]
    this.pushScenarioAlarm(label, impactedStages, severityOverride, event)
    this.notify()
  }

  private startTimer() {
    if (this.timer) {
      clearInterval(this.timer)
    }
    this.timer = setInterval(() => this.handleTick(), this.intervalMs)
  }

  private reseed(seed: number, running: boolean) {
    this.seed = seed
    this.rng = createRng(this.seed)
    this.snapshot = this.buildInitialSnapshot(running)
    this.inventoryBaseline = this.snapshot.inventory.valueUSD
    this.notify()
  }

  private handleTick() {
    if (!this.snapshot.isRunning) return
    const tick = this.snapshot.tick + 1
    this.snapshot.tick = tick
    const scale = VOLATILITY_SCALE[this.volatility]
    this.advanceDemand(scale, tick)
    this.advanceProcurement(scale, tick)
    this.advanceLogistics(scale, tick)
    this.advanceInventory(scale, tick)
    this.recomputeDerived(tick)
    this.snapshot.lastUpdatedAt = Date.now()
    this.maybeCreateAlarm()
    this.notify()
    logTelemetry('tick', { tick })
  }

  private recomputeDerived(tick: number) {
    this.recomputeReadiness(tick)
    this.snapshot.statusByStage = {
      Demand: this.snapshot.demand.status,
      Procurement: this.snapshot.procurement.status,
      Readiness: this.snapshot.readiness.status,
      Logistics: this.snapshot.logistics.status,
      Inventory: this.snapshot.inventory.status,
    }
    this.snapshot.rationaleByStage = {
      Demand: this.snapshot.demand.rationale,
      Procurement: this.snapshot.procurement.rationale,
      Readiness: this.snapshot.readiness.rationale,
      Logistics: this.snapshot.logistics.rationale,
      Inventory: this.snapshot.inventory.rationale,
    }
    this.snapshot.overallStatus = worstStatus(Object.values(this.snapshot.statusByStage))
  }

  private advanceDemand(scale: number, tick: number) {
    const demand = this.snapshot.demand
    const driver = (this.drivers.demandGrowth - 0.5) * 2
    const drift = (demand.total - demand.committed) * (0.14 + 0.1 * scale)
    const volatility = (this.rng() - 0.5) * 70 * scale + driver * 40
    const deltaRaw = drift * 0.18 + volatility
    let committed = demand.committed + Math.round(deltaRaw)
    if (committed > demand.total) {
      committed = Math.max(demand.total - Math.round(this.rng() * 18), demand.total * 0.85)
    }
    if (committed < 0) committed = 0
    const delta = committed - demand.committed
    demand.committed = committed
    demand.deltas = [...demand.deltas.slice(-4), delta]
    this.refreshDemandMetadata(tick)
  }

  private advanceProcurement(scale: number, tick: number) {
    const procurement = this.snapshot.procurement
    const driver = this.drivers.leadTimeVariance
    const openDelta = Math.round((this.rng() - 0.5) * (1.6 + scale))
    procurement.openPOs = Math.max(2, procurement.openPOs + openDelta)

    if (this.rng() < 0.45 + driver * 0.25) {
      const lateShift = this.rng() > 0.5 ? 1 : -1
      procurement.latePOs = Math.max(
        0,
        Math.min(procurement.openPOs, procurement.latePOs + lateShift * Math.max(1, Math.round(scale))),
      )
    }

    const etaShift = (this.rng() - 0.5) * (2.6 * scale + driver * 3.4)
    procurement.etaDaysMean = clamp(procurement.etaDaysMean + etaShift, 4.4, 18)

    this.refreshProcurementMetadata(tick)
  }

  private advanceLogistics(scale: number, tick: number) {
    const logistics = this.snapshot.logistics
    const driver = this.drivers.onTimeNoise

    const drift = (0.9 - logistics.onTimePct) * 0.18
    const jitter = (this.rng() - 0.5) * (0.16 * scale + driver * 0.24)
    logistics.onTimePct = clamp(logistics.onTimePct + drift + jitter, 0.55, 0.985)

    const etaTrend =
      (this.snapshot.procurement.etaDaysMean - this.targetEtaDays) * 0.12 +
      (this.rng() - 0.5) * (1.2 * scale + driver * 1.6)
    logistics.avgETA_Days = clamp(logistics.avgETA_Days + etaTrend, 3.5, 17.8)

    this.advanceShipments(scale)
    logistics.shipmentsInFlight = clamp(
      Math.round(logistics.shipments.filter((shipment) => (shipment.speedKph ?? 0) > 8).length + this.rng() * 1.4),
      0,
      12,
    )

    this.refreshLogisticsMetadata(tick)
  }

  private advanceShipments(scale: number) {
    const timeFactorHours = this.intervalMs / 1000 / 3600
    this.snapshot.logistics.shipments = this.snapshot.logistics.shipments.map((shipment, index) => {
      const speed = Math.max(6, (shipment.speedKph ?? 40) + (this.rng() - 0.5) * 8 * scale)
      const heading = (shipment.headingDeg ?? 0) + (this.rng() - 0.5) * 18 * scale
      const anchor = baseShipmentAnchors[index % baseShipmentAnchors.length]
      const latDrift = lerp(anchor.lat, shipment.lat, 0.82) + Math.cos((heading * Math.PI) / 180) * speed * timeFactorHours * 0.9
      const lonDrift =
        lerp(anchor.lon, shipment.lon, 0.82) +
        Math.sin((heading * Math.PI) / 180) * speed * timeFactorHours * 0.9 * Math.cos((latDrift * Math.PI) / 180)
      const { lat, lon } = clampToCorridor(latDrift, lonDrift)
      return {
        ...shipment,
        lat,
        lon,
        speedKph: speed,
        headingDeg: (heading + 360) % 360,
      }
    })
  }

  private advanceInventory(scale: number, tick: number) {
    const inventory = this.snapshot.inventory
    const demandPressure = (this.snapshot.demand.ratio - 0.62) * 42000
    const procurementDrag = (this.snapshot.procurement.latePOs / Math.max(this.snapshot.procurement.openPOs, 1)) * 32000
    const randomness = (this.rng() - 0.5) * (68000 * scale)
    const newValue = clamp(
      inventory.valueUSD + randomness - demandPressure - procurementDrag,
      420_000,
      980_000,
    )
    inventory.valueUSD = newValue
    inventory.turns = clamp(4.2 + (this.rng() - 0.5) * 1.6 + (this.snapshot.logistics.onTimePct - 0.72) * 5, 2.8, 8.5)
    inventory.spark = [...inventory.spark.slice(-19), newValue]
    this.refreshInventoryMetadata(tick)
  }

  private recomputeReadiness(tick: number) {
    const readiness = this.snapshot.readiness
    const demandRatio = this.snapshot.demand.ratio
    const procurement = this.snapshot.procurement
    const logistics = this.snapshot.logistics
    const procurementHealth =
      1 -
      clamp(
        procurement.latePOs / Math.max(procurement.openPOs, 1) * 0.65 +
          Math.max(0, procurement.etaDaysMean - this.targetEtaDays) / 16,
        0,
        1,
      )
    const logisticsHealth = normalize01(logistics.onTimePct, 0.55, 0.985)
    const readinessCoverage = clamp(
      (demandRatio * 0.6 + procurementHealth * 0.2 + logisticsHealth * 0.2) * 100,
      20,
      100,
    )
    readiness.coveragePct = readinessCoverage
    readiness.trend = [...readiness.trend.slice(-14), readinessCoverage]
    readiness.status = this.resolveReadinessStatus(readinessCoverage, procurement.status, logistics.status)
    readiness.updatedAtTick = tick
    readiness.rationale = this.buildReadinessRationale(readinessCoverage, procurement, logistics)
  }

  private resolveDemandStatus(ratio: number): Status {
    if (ratio >= 0.85) return 'OK'
    if (ratio >= 0.65) return 'Risk'
    if (ratio >= 0.48) return 'Delayed'
    return 'Blocked'
  }

  private resolveProcurementStatus(procurement: ProcurementMetrics): Status {
    if (procurement.latePOs === 0 && procurement.etaDaysMean <= this.targetEtaDays + 1.5) return 'OK'
    if (procurement.latePOs > Math.max(1, procurement.openPOs * 0.45) || procurement.etaDaysMean > this.targetEtaDays + 5)
      return 'Blocked'
    if (procurement.latePOs > 0 && procurement.etaDaysMean > this.targetEtaDays + 2.2) return 'Delayed'
    if (procurement.latePOs > 0) return 'Risk'
    if (procurement.etaDaysMean > this.targetEtaDays + 2.2) return 'Delayed'
    return 'OK'
  }

  private resolveLogisticsStatus(logistics: LogisticsMetrics): Status {
    if (logistics.onTimePct < 0.55 || logistics.avgETA_Days > 15) return 'Blocked'
    if (logistics.onTimePct < 0.6) return 'Delayed'
    if (logistics.onTimePct < 0.75 || logistics.avgETA_Days > 11) return 'Risk'
    return 'OK'
  }

  private resolveInventoryStatus(inventory: InventoryMetrics): Status {
    const baseline = this.inventoryBaseline || inventory.valueUSD
    const deltaPct = Math.abs((inventory.valueUSD - baseline) / baseline) * 100
    if (deltaPct > 32) return 'Blocked'
    if (deltaPct > 24) return 'Delayed'
    if (deltaPct > 15) return 'Risk'
    return 'OK'
  }

  private resolveReadinessStatus(
    coverage: number,
    procurementStatus: Status,
    logisticsStatus: Status,
  ): Status {
    if (coverage >= 85) return 'OK'
    if (coverage >= 60) return 'Risk'
    const upstream = worstStatus([procurementStatus, logisticsStatus])
    if (upstream === 'Blocked') return 'Blocked'
    if (upstream === 'Delayed') return 'Delayed'
    return 'Delayed'
  }

  private refreshDemandMetadata(tick?: number) {
    const demand = this.snapshot.demand
    demand.ratio = demand.total > 0 ? demand.committed / demand.total : 0
    demand.status = this.resolveDemandStatus(demand.ratio)
    if (typeof tick === 'number') {
      demand.updatedAtTick = tick
    }
    const delta = demand.deltas[demand.deltas.length - 1] ?? 0
    const deltaText = delta === 0 ? 'flat' : `${delta > 0 ? '+' : ''}${delta.toLocaleString()} ${delta > 0 ? '↑' : '↓'}`
    demand.rationale = `Committed ${formatNumber(demand.committed)} of ${formatNumber(demand.total)} (${formatPercent(
      demand.ratio * 100,
      1,
    )}) · Last delta ${deltaText}`
  }

  private refreshProcurementMetadata(tick?: number) {
    const procurement = this.snapshot.procurement
    procurement.status = this.resolveProcurementStatus(procurement)
    if (typeof tick === 'number') {
      procurement.updatedAtTick = tick
    }
    procurement.rationale = this.buildProcurementRationale(procurement)
  }

  private refreshLogisticsMetadata(tick?: number) {
    const logistics = this.snapshot.logistics
    logistics.status = this.resolveLogisticsStatus(logistics)
    if (typeof tick === 'number') {
      logistics.updatedAtTick = tick
    }
    logistics.rationale = this.buildLogisticsRationale(logistics)
  }

  private refreshInventoryMetadata(tick?: number) {
    const inventory = this.snapshot.inventory
    if (typeof tick === 'number') {
      inventory.updatedAtTick = tick
    }
    inventory.status = this.resolveInventoryStatus(inventory)
    inventory.rationale = this.buildInventoryRationale(inventory)
  }

  private buildProcurementRationale(procurement: ProcurementMetrics) {
    const etaDiff = procurement.etaDaysMean - this.targetEtaDays
    const etaText =
      etaDiff > 0
        ? `${etaDiff.toFixed(1)}d slower than target`
        : `${Math.abs(etaDiff).toFixed(1)}d ahead of target`
    return `${procurement.openPOs} open POs · ${procurement.latePOs} late · Mean ETA ${procurement.etaDaysMean.toFixed(1)}d (${etaText})`
  }

  private buildLogisticsRationale(logistics: LogisticsMetrics) {
    const onTime = formatPercent(logistics.onTimePct * 100, 1)
    return `${logistics.shipmentsInFlight} shipments moving · On-time ${onTime} · Avg ETA ${logistics.avgETA_Days.toFixed(1)}d`
  }

  private buildInventoryRationale(inventory: InventoryMetrics) {
    const deltaPct = ((inventory.valueUSD - this.inventoryBaseline) / this.inventoryBaseline) * 100
    const deltaText = deltaPct === 0 ? 'flat' : `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}% vs baseline`
    return `Inventory ${formatNumber(Math.round(inventory.valueUSD))} USD · Turns ${inventory.turns.toFixed(1)} · ${deltaText}`
  }

  private buildReadinessRationale(
    coverage: number,
    procurement: ProcurementMetrics,
    logistics: LogisticsMetrics,
  ) {
    const lateShare = procurement.openPOs > 0 ? (procurement.latePOs / procurement.openPOs) * 100 : 0
    return `Coverage ${coverage.toFixed(1)}% · ${lateShare.toFixed(0)}% late POs · Logistics on-time ${formatPercent(
      logistics.onTimePct * 100,
      1,
    )}`
  }

  private pushScenarioAlarm(
    label: string | undefined,
    impactedStages: Stage[],
    overrideSeverity?: AlarmSeverity,
    scenarioId?: string,
  ) {
    if (!label) return
    const unique = Array.from(new Set(impactedStages))
    if (!unique.length && !overrideSeverity) return
    const severity: AlarmSeverity =
      overrideSeverity ??
      (unique.length >= 3 ? 'critical' : unique.length === 2 ? 'warn' : 'info')
    const stage = unique.find((entry) => entry === 'Readiness') ?? unique[0] ?? 'Readiness'
    const alarm: Alarm = {
      id: `scenario-${Date.now()}-${Math.round(this.rng() * 1000)}`,
      stage,
      severity,
      message: `${label}: ${unique.length ? unique.join(' → ') : 'pipeline stabilised'}`,
      ts: new Date().toISOString(),
      metadata: {
        scenarioId: scenarioId ?? label,
        scenarioLabel: label,
        impactedStages: unique,
      },
    }
    this.snapshot.alarms = [alarm, ...this.snapshot.alarms].slice(0, 30)
    logTelemetry('alarm_created', { scenario: label, severity, impacted: unique })
  }

  private maybeCreateAlarm() {
    if (this.rng() > 0.1) return
    const statusEntries = Object.entries(this.snapshot.statusByStage) as [Stage, Status][]
    const weighted = statusEntries.flatMap(([stage, status]) => {
      const rank = STATUS_RANK.get(status) ?? 0
      const weight = rank + 1
      return Array(weight).fill([stage, status] as [Stage, Status])
    })
    if (!weighted.length) return
    const pick = weighted[Math.floor(this.rng() * weighted.length)]
    const [stage, status] = pick
    const severity = statusToSeverity(status)
    const alarm: Alarm = {
      id: `alarm-${Date.now()}-${Math.round(this.rng() * 1000)}`,
      stage,
      severity,
      message: buildAlarmMessage(stage, severity, this.rng),
      ts: new Date().toISOString(),
      metadata: {
        source: 'synthetic-monitor',
      },
    }
    this.snapshot.alarms = [alarm, ...this.snapshot.alarms].slice(0, 20)
    logTelemetry('alarm_created', { id: alarm.id, stage, severity })
  }

  private notify() {
    const snapshot = this.cloneSnapshot()
    this.subscribers.forEach((subscriber) => subscriber(snapshot))
  }

  private cloneSnapshot(): SyntheticScmSnapshot {
    return {
      ...this.snapshot,
      demand: { ...this.snapshot.demand, deltas: [...this.snapshot.demand.deltas] },
      procurement: { ...this.snapshot.procurement },
      readiness: { ...this.snapshot.readiness, trend: [...this.snapshot.readiness.trend] },
      logistics: { ...this.snapshot.logistics, shipments: this.snapshot.logistics.shipments.map((shipment) => ({ ...shipment })) },
      inventory: { ...this.snapshot.inventory, spark: [...this.snapshot.inventory.spark] },
      statusByStage: { ...this.snapshot.statusByStage },
      rationaleByStage: { ...this.snapshot.rationaleByStage },
      alarms: this.snapshot.alarms.map((alarm) => ({ ...alarm })),
      drivers: { ...this.snapshot.drivers },
      processProfile: this.snapshot.processProfile
        ? {
            ...this.snapshot.processProfile,
            atoms: [...this.snapshot.processProfile.atoms],
            baseline: this.snapshot.processProfile.baseline ? { ...this.snapshot.processProfile.baseline } : undefined,
          }
        : this.snapshot.processProfile,
    }
  }

  private buildInitialSnapshot(isRunning = true): MutableSnapshot {
    const tick = 0
    const now = Date.now()
    const totalDemand = Math.round(1280 + this.rng() * 460)
    const committed = Math.round(totalDemand * lerp(0.54, 0.72, this.rng()))
    const demand: DemandMetrics = {
      total: this.profile?.baseline?.demandTotal ?? totalDemand,
      committed: this.profile?.baseline?.demandCommitted ?? committed,
      status: 'OK',
      deltas: [0, 0, 0, 0, 0],
      ratio: 0,
      updatedAtTick: tick,
      rationale: '',
    }
    demand.ratio = demand.total > 0 ? demand.committed / demand.total : 0
    demand.status = this.resolveDemandStatus(demand.ratio)
    demand.rationale = `Committed ${formatNumber(demand.committed)} of ${formatNumber(demand.total)} (${formatPercent(demand.ratio * 100)})`

    const openPOs = this.profile?.baseline?.procurement?.openPOs ?? 4 + Math.round(this.rng() * 5)
    const latePOs = this.profile?.baseline?.procurement?.latePOs ?? Math.round(this.rng() * 2)
    const etaDaysMean = this.profile?.baseline?.procurement?.etaDays ?? lerp(7.2, 9.5, this.rng())
    const procurement: ProcurementMetrics = {
      openPOs,
      latePOs,
      etaDaysMean,
      status: 'OK',
      updatedAtTick: tick,
      rationale: '',
      targetEtaDays: this.targetEtaDays,
    }
    procurement.status = this.resolveProcurementStatus(procurement)
    procurement.rationale = this.buildProcurementRationale(procurement)

    const shipments = Array.from({ length: 6 }, (_, index) => {
      const anchor = baseShipmentAnchors[index % baseShipmentAnchors.length]
      return {
        id: `ship-${index + 1}`,
        lat: anchor.lat + (this.rng() - 0.5) * 1.6,
        lon: anchor.lon + (this.rng() - 0.5) * 1.2,
        speedKph: 32 + this.rng() * 40,
        headingDeg: this.rng() * 360,
        label: index % 2 === 0 ? `Convoy ${index + 11}` : `Vessel ${index + 21}`,
      }
    })

    const logistics: LogisticsMetrics = {
      shipmentsInFlight: this.profile?.baseline?.logistics?.shipmentsInFlight ?? 5,
      avgETA_Days: this.profile?.baseline?.logistics?.avgETA ?? lerp(6.5, 9.2, this.rng()),
      onTimePct: this.profile?.baseline?.logistics?.onTimePct ?? lerp(0.72, 0.9, this.rng()),
      status: 'OK',
      shipments,
      updatedAtTick: tick,
      rationale: '',
    }
    logistics.status = this.resolveLogisticsStatus(logistics)
    logistics.rationale = this.buildLogisticsRationale(logistics)

    const inventoryValue = this.profile?.baseline?.inventory?.valueUSD ?? 680_000 + this.rng() * 160_000
    const inventory: InventoryMetrics = {
      valueUSD: inventoryValue,
      turns: lerp(4.5, 6.2, this.rng()),
      spark: Array.from({ length: 20 }, () => inventoryValue),
      status: 'OK',
      baseline: inventoryValue,
      updatedAtTick: tick,
      rationale: '',
    }
    inventory.status = this.resolveInventoryStatus(inventory)
    inventory.rationale = this.buildInventoryRationale(inventory)

    const readinessCoverage = Math.min(100, (demand.ratio * 0.62 + logistics.onTimePct * 0.18 + 0.2) * 100)
    const readiness: ReadinessMetrics = {
      coveragePct: readinessCoverage,
      trend: Array.from({ length: 15 }, () => readinessCoverage),
      status: 'OK',
      updatedAtTick: tick,
      rationale: '',
    }
    readiness.status = this.resolveReadinessStatus(readinessCoverage, procurement.status, logistics.status)
    readiness.rationale = this.buildReadinessRationale(readinessCoverage, procurement, logistics)

    const statusByStage: StatusMap = {
      Demand: demand.status,
      Procurement: procurement.status,
      Readiness: readiness.status,
      Logistics: logistics.status,
      Inventory: inventory.status,
    }

    return {
      tick,
      seed: this.seed,
      volatility: this.volatility,
      isRunning,
      demand,
      procurement,
      readiness,
      logistics,
      inventory,
      statusByStage,
      rationaleByStage: {
        Demand: demand.rationale,
        Procurement: procurement.rationale,
        Readiness: readiness.rationale,
        Logistics: logistics.rationale,
        Inventory: inventory.rationale,
      },
      overallStatus: worstStatus(Object.values(statusByStage)),
      alarms: [],
      drivers: { ...this.drivers },
      lastUpdatedAt: now,
      processProfile: this.profile,
    }
  }
}

export default SyntheticDataService
