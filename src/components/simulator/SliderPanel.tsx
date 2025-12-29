import React from 'react'
import { Activity, Zap } from 'lucide-react'
import type { SimulatorSliderKey, SliderConfig } from '../../../types/simulator'

type SliderPanelProps = {
  configs: SliderConfig[]
  values: Record<SimulatorSliderKey, number>
  onChange: (key: SimulatorSliderKey, value: number) => void
  autoAdvance: boolean
  nextAutoTimestamp: number | null
  onToggleAuto: () => void
  onOpenTrace: () => void
  batchLabel: string | null
  onOpenRules?: () => void
}

export function SliderPanel({ configs, values, onChange, autoAdvance, nextAutoTimestamp, onToggleAuto, onOpenTrace, batchLabel, onOpenRules }: SliderPanelProps) {
  const eta = nextAutoTimestamp ? Math.max(0, Math.round((nextAutoTimestamp - Date.now()) / 1000)) : null
  return (
    <aside className="sim-slider-panel">
      <header>
        <div>
          <Activity size={16} />
          <strong>Live Controls</strong>
        </div>
        <small>{batchLabel ?? 'Assigning batch…'}</small>
        <button type="button" className="rules-btn" onClick={onOpenRules}>
          Rule Engine
        </button>
      </header>
      <div className="auto-toggle">
        <button type="button" className={autoAdvance ? 'active' : ''} onClick={onToggleAuto}>
          <Zap size={14} /> Auto-advance
        </button>
        <span>{autoAdvance && eta !== null ? `Next pour in ${eta}s` : 'Manual control'}</span>
      </div>
      <div className="slider-group">
        {configs.map((slider) => (
          <div key={slider.key} className="slider-row">
            <div className="slider-label">
              <strong>{slider.label}</strong>
              <span>
                {values[slider.key].toFixed(slider.step < 1 ? 1 : 0)} {slider.unit}
              </span>
            </div>
            <input
              type="range"
              min={slider.min}
              max={slider.max}
              step={slider.step}
              value={values[slider.key]}
              onChange={(event) => onChange(slider.key, Number(event.target.value))}
            />
            <small>{slider.description}</small>
          </div>
        ))}
      </div>
      <button type="button" className="trace-button" onClick={onOpenTrace}>
        Traceability Drill-Down
      </button>
    </aside>
  )
}
