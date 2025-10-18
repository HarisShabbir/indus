import React from 'react'
import { ComponentAggregation } from '../../selectors/sowSelectors'
import { Sparkline } from './Sparkline'

export type ComponentProgressListProps = {
  items: ComponentAggregation[]
}

function statusClass(status: string) {
  if (status === 'Completed') return 'status-chip status-chip--completed'
  if (status === 'Delayed') return 'status-chip status-chip--delayed'
  return 'status-chip status-chip--progress'
}

export function ComponentProgressList({ items }: ComponentProgressListProps) {
  return (
    <ul className="component-progress-list">
      {items.map((item) => {
        const percent = item.plannedQty === 0 ? 0 : (item.actualQty / item.plannedQty) * 100
        return (
          <li key={item.key} className="component-progress-item">
            <div className="component-progress-item__header">
              <div>
                <div className="component-progress-item__title">{item.component}</div>
                <span className="component-progress-item__contract">{item.contractId}</span>
              </div>
              <span className={statusClass(item.status)}>{item.status}</span>
            </div>
            <div className="component-progress-item__bar" title={`${item.actualQty} ${item.unit} of ${item.plannedQty} ${item.unit}`}>
              <div className="component-progress-item__bar-fill" style={{ width: `${Math.min(100, percent)}%` }} />
              <span className="component-progress-item__percent">{Math.round(percent)}%</span>
            </div>
            <div className="component-progress-item__stats">
              <div>
                <span className="label">Actual</span>
                <strong>{item.actualQty.toLocaleString()} {item.unit}</strong>
              </div>
              <div>
                <span className="label">Planned</span>
                <strong>{item.plannedQty.toLocaleString()} {item.unit}</strong>
              </div>
              <div>
                <span className={`delta ${item.actualQty - item.plannedQty >= 0 ? 'delta--positive' : 'delta--negative'}`}>
                  Δ {(item.actualQty - item.plannedQty).toLocaleString()} {item.unit}
                </span>
              </div>
            </div>
            <div className="component-progress-item__trend">
              <Sparkline
                data={item.trend.map((point) => ({ date: point.date, value: point.actualQty }))}
                color="#38bdf8"
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
