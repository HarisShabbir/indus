import React from 'react'
import { Sparkline } from './Sparkline'
import { SpiAggregation } from '../../selectors/sowSelectors'

export type SpiSectionProps = {
  data: SpiAggregation
}

function spiStatusColor(value: number) {
  if (value < 0.95) return 'spi-value spi-value--low'
  if (value > 1.05) return 'spi-value spi-value--high'
  return 'spi-value spi-value--mid'
}

export function SpiSection({ data }: SpiSectionProps) {
  const percent = data.current
  return (
    <div className="spi-section">
      <div className="spi-overview">
        <div className="spi-overview__kpi">
          <span>SPI</span>
          <strong className={spiStatusColor(percent)}>{percent.toFixed(2)}</strong>
        </div>
        <div className="spi-overview__meta">
          <span className="badge">Burn Rate {data.burnRateDays} days</span>
          <span className="badge">Runway {data.runwayDays} days</span>
          <span className={`badge ${data.cashDelta >= 0 ? 'badge--positive' : 'badge--negative'}`}>
            Cash Δ {data.cashDelta >= 0 ? '+' : ''}${Math.abs(data.cashDelta).toLocaleString()}
          </span>
        </div>
      </div>
      <Sparkline data={data.series.map((point) => ({ date: point.date, value: point.value }))} color="#22d3ee" />
      <div className="spi-reference">
        <span>Reference line at 1.0</span>
      </div>
    </div>
  )
}
