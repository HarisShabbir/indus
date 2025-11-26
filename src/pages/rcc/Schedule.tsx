import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, AlertTriangle } from 'lucide-react'
import { shallow } from 'zustand/shallow'
import { useSimulatorStore } from '../../store/simulatorStore'
import type { BlockLiftCell } from '../../types/simulator'
import './rccRoutes.css'

type TimelineRow = {
  id: string
  label: string
  status: BlockLiftCell['status']
  delay: number
}

const statusLabel: Record<BlockLiftCell['status'], string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  awaiting: 'Awaiting 72h',
  approved: 'Completed',
  alarm: 'Alarm',
  rejected: 'Rejected',
}

export default function RCCSchedulePage() {
  const navigate = useNavigate()
  const { blocks, impacts, activeCell } = useSimulatorStore(
    (state) => ({
      blocks: state.blocks,
      impacts: state.impacts,
      activeCell: state.activeCell,
    }),
    shallow,
  )

  const timeline = useMemo<TimelineRow[]>(() => {
    const ordered = [...blocks].sort((a, b) => {
      if (a.block === b.block) return b.lift - a.lift
      return b.block - a.block
    })
    return ordered.slice(0, 12).map((cell) => ({
      id: cell.id,
      label: `B${cell.block} · L${cell.lift}`,
      status: cell.status,
      delay:
        cell.status === 'rejected'
          ? 72
          : cell.status === 'alarm'
            ? 24
            : cell.status === 'in_progress'
              ? 12
              : cell.status === 'pending'
                ? 4
                : 0,
    }))
  }, [blocks])

  const nextPourLabel = activeCell ? `Block ${activeCell.block}, Lift ${activeCell.lift}` : 'Assigning'
  const scheduleImpacts = impacts.schedule

  return (
    <div className="rcc-route-shell">
      <header>
        <div>
          <h1>RCC Schedule Control</h1>
          <p>Live Gantt derived from simulator · auto-updates on every pour decision.</p>
        </div>
        <button type="button" onClick={() => navigate('/rcc/process')}>
          <ArrowLeft size={16} /> Back to Control Center
        </button>
      </header>
      <section className="route-grid">
        <article className="route-card">
          <header>
            <Clock size={18} />
            <div>
              <strong>Next pour window</strong>
              <small>{nextPourLabel}</small>
            </div>
          </header>
          <div className="timeline">
            {timeline.map((row) => (
              <div key={row.id} className="timeline-row">
                <span>{row.label}</span>
                <div className={`timeline-bar ${row.status}`} style={{ width: `${Math.min(100, 30 + row.delay)}%` }}>
                  <em>{statusLabel[row.status]}</em>
                  {row.delay ? <small>+{row.delay}h</small> : null}
                </div>
              </div>
            ))}
          </div>
        </article>
        <article className="route-card">
          <header>
            <AlertTriangle size={18} />
            <div>
              <strong>Impacts driving delay</strong>
              <small>{scheduleImpacts.length ? `${scheduleImpacts.length} open` : 'No slips detected'}</small>
            </div>
          </header>
          <ul className="impact-feed">
            {scheduleImpacts.length === 0
              ? (
                <li className="empty">All pours within takt. Auto-advance locked.</li>
                )
              : scheduleImpacts.map((impact) => (
                  <li key={impact.id}>
                    <strong>{impact.block}</strong>
                    <p>{impact.description}</p>
                    <small>{new Date(impact.timestamp).toLocaleString()}</small>
                  </li>
                ))}
          </ul>
        </article>
      </section>
    </div>
  )
}
