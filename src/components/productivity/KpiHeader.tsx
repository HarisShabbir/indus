import React from 'react'

export type PhysicalWorkKpiProps = {
  plannedPercent: number
  actualPercent: number
  quantityVariance: number
  valueVariance: number
  valueDelta: number
}

function formatDelta(value: number, unit: string) {
  const prefix = value >= 0 ? '+' : '−'
  const absValue = Math.abs(value)
  if (absValue >= 1_000_000) return `${prefix}${(absValue / 1_000_000).toFixed(1)}${unit}`
  if (absValue >= 1000) return `${prefix}${(absValue / 1000).toFixed(1)}k${unit}`
  return `${prefix}${absValue.toFixed(0)}${unit}`
}

export function PhysicalWorkKPI({
  plannedPercent,
  actualPercent,
  quantityVariance,
  valueVariance,
  valueDelta,
}: PhysicalWorkKpiProps) {
  return (
    <div className="productivity-kpi">
      <div className="productivity-kpi__title">Physical Works Completed</div>
      <div className="productivity-kpi__grid">
        <div className="productivity-kpi__metric highlight">
          <span>Actual</span>
          <strong>{actualPercent.toFixed(0)}%</strong>
        </div>
        <div className="productivity-kpi__metric muted">
          <span>Planned</span>
          <strong>{plannedPercent.toFixed(0)}%</strong>
        </div>
        <div className={`productivity-kpi__metric delta ${quantityVariance >= 0 ? 'positive' : 'negative'}`}>
          <span>Progress variance</span>
          <strong>{quantityVariance >= 0 ? '+' : '−'}{Math.abs(quantityVariance).toFixed(1)}%</strong>
        </div>
        <div className={`productivity-kpi__metric delta ${valueVariance >= 0 ? 'positive' : 'negative'}`}>
          <span>Value variance</span>
          <strong>{valueVariance >= 0 ? '+' : '−'}{Math.abs(valueVariance).toFixed(1)}%</strong>
          <small>{formatDelta(valueDelta, ' $')}</small>
        </div>
      </div>
    </div>
  )
}
