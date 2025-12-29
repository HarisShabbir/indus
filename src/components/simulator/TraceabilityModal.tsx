import React from 'react'
import type { TraceChain } from '../../../types/simulator'
import { getLiftElevationRange, getPourVolumeEstimate } from '../../lib/rccMetrics'

type TraceabilityModalProps = {
  chain: TraceChain | null
  onClose: () => void
  projectProgress: number
}

export function TraceabilityModal({ chain, onClose, projectProgress }: TraceabilityModalProps) {
  if (!chain) return null
  const elevation = getLiftElevationRange(chain.pour.lift, chain.pour.lift_depth_m)
  const pourVolume = getPourVolumeEstimate(chain.pour.lift_depth_m)
  return (
    <div className="trace-modal" role="dialog" aria-modal="true">
      <div className="trace-panel">
        <header>
          <div>
            <strong>Full Traceability Chain</strong>
            <span>{chain.blockLabel}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close traceability view">
            ×
          </button>
        </header>
        <div className="trace-stats">
          <div>
            <small>Elevation</small>
            <strong>
              {elevation.bottom.toFixed(1)}–{elevation.top.toFixed(1)} m
            </strong>
            <span>Lift {chain.pour.lift}</span>
          </div>
          <div>
            <small>Volume (est.)</small>
            <strong>{pourVolume.toFixed(0)} m³</strong>
            <span>{chain.pour.lift_depth_m.toFixed(1)} m depth</span>
          </div>
          <div>
            <small>RCC Progress</small>
            <strong>{projectProgress.toFixed(1)}%</strong>
            <span>Network-wide</span>
          </div>
        </div>
        <ul>
          <li>
            <span>Vendor</span>
            <strong>{chain.vendor.name}</strong>
            <small>{chain.vendor.region}</small>
          </li>
          <li>
            <span>Lot</span>
            <strong>{chain.lot.id}</strong>
            <small>{chain.lot.material}</small>
          </li>
          <li>
            <span>Batch</span>
            <strong>{chain.batch.id}</strong>
            <small>{chain.batch.vendorMix.join(', ')}</small>
          </li>
          <li>
            <span>Pour</span>
            <strong>{chain.pour.id}</strong>
            <small>
              {chain.blockLabel} · {new Date(chain.pour.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </small>
          </li>
        </ul>
      </div>
    </div>
  )
}
