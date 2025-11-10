import React, { useMemo, useState } from 'react'

import { Alarm, SimulatedEvent, Stage, SyntheticDrivers, SyntheticScmSnapshot } from './types'

type SidePanelProps = {
  stage: Stage
  snapshot: SyntheticScmSnapshot
  alarms: Alarm[]
  onClose: () => void
  onAcknowledge: (id: string) => void
  onSimulate: (event: SimulatedEvent) => void
  onDriversChange: (drivers: Partial<SyntheticDrivers>) => void
}

const humanizeStage = (stage: Stage) => stage

const StageMetrics = ({ stage, snapshot }: { stage: Stage; snapshot: SyntheticScmSnapshot }) => {
  switch (stage) {
    case 'Demand': {
      const { demand } = snapshot
      return (
        <dl className="scm-visual-panel__metrics">
          <div>
            <dt>Committed</dt>
            <dd>{demand.committed.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Total demand</dt>
            <dd>{demand.total.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Coverage</dt>
            <dd>{(demand.ratio * 100).toFixed(1)}%</dd>
          </div>
          <div>
            <dt>Last delta</dt>
            <dd>{demand.deltas.length ? demand.deltas[demand.deltas.length - 1] : 0}</dd>
          </div>
        </dl>
      )
    }
    case 'Procurement': {
      const { procurement } = snapshot
      return (
        <dl className="scm-visual-panel__metrics">
          <div>
            <dt>Open POs</dt>
            <dd>{procurement.openPOs}</dd>
          </div>
          <div>
            <dt>Late POs</dt>
            <dd>{procurement.latePOs}</dd>
          </div>
          <div>
            <dt>Mean ETA</dt>
            <dd>{procurement.etaDaysMean.toFixed(1)} days</dd>
          </div>
        </dl>
      )
    }
    case 'Readiness': {
      const { readiness } = snapshot
      return (
        <dl className="scm-visual-panel__metrics">
          <div>
            <dt>Coverage</dt>
            <dd>{readiness.coveragePct.toFixed(1)}%</dd>
          </div>
          <div>
            <dt>Trend window</dt>
            <dd>{readiness.trend.length} ticks</dd>
          </div>
        </dl>
      )
    }
    case 'Logistics': {
      const { logistics } = snapshot
      return (
        <dl className="scm-visual-panel__metrics">
          <div>
            <dt>Shipments in flight</dt>
            <dd>{logistics.shipmentsInFlight}</dd>
          </div>
          <div>
            <dt>On-time</dt>
            <dd>{(logistics.onTimePct * 100).toFixed(1)}%</dd>
          </div>
          <div>
            <dt>Average ETA</dt>
            <dd>{logistics.avgETA_Days.toFixed(1)} days</dd>
          </div>
        </dl>
      )
    }
    case 'Inventory': {
      const { inventory } = snapshot
      return (
        <dl className="scm-visual-panel__metrics">
          <div>
            <dt>Inventory value</dt>
            <dd>${inventory.valueUSD.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Turns</dt>
            <dd>{inventory.turns.toFixed(1)}</dd>
          </div>
        </dl>
      )
    }
    default:
      return null
  }
}

const SIM_EVENT_OPTIONS: Array<{ id: SimulatedEvent; label: string }> = [
  { id: 'supply-delay', label: 'Supply Delay +2d' },
  { id: 'po-cancellation', label: 'PO Cancellation' },
  { id: 'expedite', label: 'Expedite' },
  { id: 'port-congestion', label: 'Port Congestion' },
  { id: 'inventory-recovery', label: 'Inventory Recovery' },
]

const SimulateButtons = ({
  onSimulate,
  disabled,
}: {
  onSimulate: (event: SimulatedEvent) => void
  disabled?: boolean
}) => (
  <div className="scm-visual-panel__simulate">
    {SIM_EVENT_OPTIONS.map((event) => (
      <button key={event.id} type="button" onClick={() => onSimulate(event.id)} disabled={disabled}>
        {event.label}
      </button>
    ))}
  </div>
)

const DriversSection = ({
  drivers,
  onDriversChange,
}: {
  drivers: SyntheticDrivers
  onDriversChange: (drivers: Partial<SyntheticDrivers>) => void
}) => {
  const handleChange =
    (key: keyof SyntheticDrivers) => (event: React.ChangeEvent<HTMLInputElement>) =>
      onDriversChange({ [key]: Number(event.target.value) / 100 })

  return (
    <div className="scm-visual-panel__drivers">
      <label>
        <span>Demand growth</span>
        <input type="range" min={0} max={100} value={Math.round(drivers.demandGrowth * 100)} onChange={handleChange('demandGrowth')} />
        <span className="value">{Math.round(drivers.demandGrowth * 100)}%</span>
      </label>
      <label>
        <span>Lead-time variance</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(drivers.leadTimeVariance * 100)}
          onChange={handleChange('leadTimeVariance')}
        />
        <span className="value">{Math.round(drivers.leadTimeVariance * 100)}%</span>
      </label>
      <label>
        <span>On-time noise</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(drivers.onTimeNoise * 100)}
          onChange={handleChange('onTimeNoise')}
        />
        <span className="value">{Math.round(drivers.onTimeNoise * 100)}%</span>
      </label>
    </div>
  )
}

export const SidePanel: React.FC<SidePanelProps> = ({
  stage,
  snapshot,
  alarms,
  onClose,
  onAcknowledge,
  onSimulate,
  onDriversChange,
}) => {
  const [showDrivers, setShowDrivers] = useState(false)
  const stageLabel = useMemo(() => humanizeStage(stage), [stage])
  const stageRationale = snapshot.rationaleByStage[stage]
  const drivers = snapshot.drivers
  const handleToggleDrivers = () => setShowDrivers((prev) => !prev)

  return (
    <aside className="scm-visual-panel" aria-label={`${stageLabel} details`}>
      <header>
        <div>
          <h3>{stageLabel}</h3>
          <p>{snapshot.statusByStage[stage]}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close side panel">
          Close
        </button>
      </header>

      <section>
        <h4>Current metrics</h4>
        <StageMetrics stage={stage} snapshot={snapshot} />
      </section>

      <section>
        <h4>Status rationale</h4>
        <p className="scm-visual-panel__rationale">{stageRationale}</p>
      </section>

      <section>
        <h4>Alarms</h4>
        {alarms.length === 0 ? (
          <p className="scm-visual-panel__empty">No active alarms for this stage.</p>
        ) : (
          <ul className="scm-visual-panel__alarms">
            {alarms.map((alarm) => (
              <li key={alarm.id} data-severity={alarm.severity}>
                <div>
                  <strong>{alarm.message}</strong>
                  <span>{new Date(alarm.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <button type="button" onClick={() => onAcknowledge(alarm.id)}>
                  Acknowledge
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4>Simulate event</h4>
        <SimulateButtons onSimulate={onSimulate} />
      </section>

      <section>
        <div className="scm-visual-panel__drivers-header">
          <h4>Simulation drivers</h4>
          <button type="button" onClick={handleToggleDrivers} className="link">
            {showDrivers ? 'Hide' : 'Show'} sliders
          </button>
        </div>
        {showDrivers ? <DriversSection drivers={drivers} onDriversChange={onDriversChange} /> : <p className="scm-visual-panel__hint">Hidden (toggle to adjust demand growth, lead-time variance, on-time noise).</p>}
      </section>
    </aside>
  )
}

export default SidePanel
