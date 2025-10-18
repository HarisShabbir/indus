import React from 'react'
import { DonutGauge } from './DonutGauge'
import { Sparkline } from './Sparkline'
import { QualityAggregation } from '../../selectors/sowSelectors'

export type QualitySectionProps = {
  data: QualityAggregation
}

export function QualitySection({ data }: QualitySectionProps) {
  return (
    <div className="quality-section">
      <div className="quality-metrics">
        <div className="quality-card">
          <span className="quality-card__label">NCR</span>
          <div className="quality-card__values">
            <span className="badge badge--open">Open {data.ncrOpen}</span>
            <span className="badge badge--closed">Closed {data.ncrClosed}</span>
          </div>
        </div>
        <div className="quality-card">
          <span className="quality-card__label">QA / QC</span>
          <div className="quality-card__chart">
            <Sparkline
              data={data.qaorSeries.map((point) => ({ date: point.date, value: point.score }))}
              color="#f97316"
            />
          </div>
        </div>
        <div className="quality-card">
          <span className="quality-card__label">Quality Conformance</span>
          <DonutGauge value={data.toleranceRatio} label="Within ±0.5%" />
        </div>
      </div>
    </div>
  )
}
