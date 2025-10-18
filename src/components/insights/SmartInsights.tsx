import React from 'react'
import { scheduleTokens } from '../../theme/tokens'

type Insight = {
  title: string
  description: string
  tone?: 'positive' | 'warning' | 'negative'
}

type SmartInsightsProps = {
  slips?: { label: string; days: number }[]
  risks?: { label: string; spi: number }[]
  resources?: { label: string; note: string }[]
  notes?: string[]
}

export function SmartInsights({ slips = [], risks = [], resources = [], notes = [] }: SmartInsightsProps) {
  return (
    <section className="smart-insights" aria-label="Smart schedule insights">
      <div className="insight-column">
        <header>
          <span>Slips vs Baseline</span>
          <small>{slips.length ? `${slips.length} flagged` : 'On track'}</small>
        </header>
        <ul>
          {slips.length === 0 && <li className="insight-empty">No slips beyond tolerance.</li>}
          {slips.map((item) => (
            <li key={item.label}>
              <strong>{item.label}</strong>
              <span className={item.days > 0 ? 'text-warning' : 'text-positive'}>
                {item.days > 0 ? `+${item.days}d` : `${item.days}d`}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="insight-column">
        <header>
          <span>Risky SOWs</span>
          <small>SPI &lt; 0.90</small>
        </header>
        <ul>
          {risks.length === 0 && <li className="insight-empty">No SOWs below SPI threshold.</li>}
          {risks.map((item) => (
            <li key={item.label}>
              <strong>{item.label}</strong>
              <span className={item.spi < 0.9 ? 'text-warning' : ''}>SPI {item.spi.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="insight-column">
        <header>
          <span>Resource contention</span>
          <small>Heuristics</small>
        </header>
        <ul>
          {resources.length === 0 && <li className="insight-empty">No immediate contention detected.</li>}
          {resources.map((item) => (
            <li key={item.label}>
              <strong>{item.label}</strong>
              <span>{item.note}</span>
            </li>
          ))}
        </ul>
      </div>

      {notes.length > 0 && (
        <div className="insight-column">
          <header>
            <span>Scenario notes</span>
          </header>
          <ul>
            {notes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

export default SmartInsights
