import React from 'react'
import { ArrowUpRight, Check } from 'lucide-react'
import type { ImpactEvent, ImpactType } from '../../../types/simulator'

const labels: Record<ImpactType, string> = {
  schedule: 'Schedule impact',
  financial: 'Financial impact',
  scm: 'SCM impact',
  collaboration: 'Collaboration impact',
}

type ImpactPanelProps = {
  type: ImpactType
  events: ImpactEvent[]
  onClose: () => void
  onNavigate: () => void
  onDismiss: (id: string) => void
}

export function ImpactPanel({ type, events, onClose, onNavigate, onDismiss }: ImpactPanelProps) {
  return (
    <div className="impact-panel" role="dialog" aria-modal="true">
      <header>
        <div>
          <strong>{labels[type]}</strong>
          <span>{events.length ? `${events.length} unresolved` : 'All clear'}</span>
        </div>
        <div>
          <button type="button" onClick={onNavigate}>
            <ArrowUpRight size={16} /> View module
          </button>
          <button type="button" onClick={onClose} aria-label="Close impact panel">
            ×
          </button>
        </div>
      </header>
      <ul>
        {events.length === 0 ? (
          <li className="empty">No outstanding impacts.</li>
        ) : (
          events.map((event) => (
            <li key={event.id}>
              <div>
                <strong>{event.title}</strong>
                <span>{event.block}</span>
                <p>{event.description}</p>
                <small>{new Date(event.timestamp).toLocaleString()}</small>
              </div>
              <button type="button" onClick={() => onDismiss(event.id)} aria-label="Dismiss impact">
                <Check size={16} /> Ack
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
