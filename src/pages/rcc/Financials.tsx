import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, DollarSign, TrendingDown, Wallet } from 'lucide-react'
import { shallow } from 'zustand/shallow'
import { useSimulatorStore } from '../../store/simulatorStore'
import './rccRoutes.css'

export default function RCCFinancialsPage() {
  const navigate = useNavigate()
  const { blocks, impacts } = useSimulatorStore(
    (state) => ({
      blocks: state.blocks,
      impacts: state.impacts,
    }),
    shallow,
  )

  const rejected = blocks.filter((cell) => cell.status === 'rejected').length
  const reworkCost = rejected * 340_000
  const mitigationSpend = impacts.financial.length * 85_000
  const valueAtRisk = Math.max(0, (impacts.financial.length + rejected) * 0.18)

  const ledger = useMemo(
    () =>
      impacts.financial.map((impact) => ({
        id: impact.id,
        title: impact.title,
        block: impact.block,
        delta: impact.severity === 'CRITICAL' ? -420_000 : impact.severity === 'HIGH' ? -180_000 : -75_000,
        timestamp: impact.timestamp,
      })),
    [impacts.financial],
  )

  return (
    <div className="rcc-route-shell">
      <header>
        <div>
          <h1>Financial Exposure</h1>
          <p>Live CAPEX/opex impacts streaming from RCC simulator.</p>
        </div>
        <button type="button" onClick={() => navigate('/rcc/process')}>
          <ArrowLeft size={16} /> Back to Control Center
        </button>
      </header>
      <section className="route-grid">
        <article className="route-card compact">
          <header>
            <DollarSign size={18} />
            <div>
              <strong>Rejected pours</strong>
              <small>{rejected} lifts at risk</small>
            </div>
          </header>
          <div className="stat-value">${reworkCost.toLocaleString()}</div>
          <p className="muted">Estimated rework budget if no mitigation applied.</p>
        </article>
        <article className="route-card compact">
          <header>
            <TrendingDown size={18} />
            <div>
              <strong>Value at risk</strong>
              <small>Linked to live alarms</small>
            </div>
          </header>
          <div className="stat-value">${(valueAtRisk * 1_000_000).toFixed(0)}</div>
          <p className="muted">Range derived from severity + vendor risk.</p>
        </article>
        <article className="route-card compact">
          <header>
            <Wallet size={18} />
            <div>
              <strong>Mitigation spend</strong>
              <small>Night pours, chillers, QA</small>
            </div>
          </header>
          <div className="stat-value">${mitigationSpend.toLocaleString()}</div>
          <p className="muted">Auto-updated on each intervention.</p>
        </article>
      </section>
      <section className="route-card">
        <header>
          <DollarSign size={18} />
          <div>
            <strong>Rejection ledger</strong>
            <small>{ledger.length ? `${ledger.length} open records` : 'No cost hits pending'}</small>
          </div>
        </header>
        <table className="ledger">
          <thead>
            <tr>
              <th>Block / Lift</th>
              <th>Event</th>
              <th>Δ cost</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {ledger.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">
                  No active financial exposures.
                </td>
              </tr>
            ) : (
              ledger.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.block}</td>
                  <td>{entry.title}</td>
                  <td className="delta">{entry.delta.toLocaleString()}</td>
                  <td>{new Date(entry.timestamp).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
