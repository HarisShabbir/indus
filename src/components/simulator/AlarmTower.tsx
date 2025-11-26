import React from 'react'
import { AlertTriangle, BellRing } from 'lucide-react'
import type { AlarmAction, AlarmEvent } from '../../../types/simulator'

const severityClass: Record<AlarmEvent['severity'], string> = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
}

type AlarmTowerProps = {
  alarms: AlarmEvent[]
  onAction: (alarm: AlarmEvent, action: AlarmAction) => void
  onDismiss: (id: string) => void
  onGoToCenter?: () => void
  onOpenCollaborator?: (alarm?: AlarmEvent) => void
}

export function AlarmTower({ alarms, onAction, onDismiss, onGoToCenter, onOpenCollaborator }: AlarmTowerProps) {
  return (
    <aside className="sim-alarm-tower">
      <header>
        <div>
          <BellRing size={18} />
          <strong>Alarm Center Tower</strong>
        </div>
        <div className="alarm-head-cta">
          <span>{alarms.length} active</span>
          <button type="button" onClick={onGoToCenter}>
            Go to Alarm Center
          </button>
          {alarms.length ? (
            <button type="button" className="collab-trigger" onClick={() => onOpenCollaborator?.(alarms[0])}>
              Collaborator
            </button>
          ) : null}
        </div>
      </header>
      <div className="alarm-list">
        {alarms.length === 0 ? (
          <div className="alarm-empty">All clear. Flow ready.</div>
        ) : (
          alarms.map((alarm) => (
            <article key={alarm.id} className={`alarm-card ${severityClass[alarm.severity]}`}>
              <div className="alarm-head">
                <span className={`badge ${severityClass[alarm.severity]}`}>
                  <AlertTriangle size={14} />
                  {alarm.severity}
                </span>
                <button type="button" onClick={() => onDismiss(alarm.id)} aria-label="Dismiss alarm">
                  ×
                </button>
              </div>
              <div className="alarm-body">
                <strong>{alarm.ruleId}</strong>
                <p>{alarm.description}</p>
                <div className="alarm-meta">
                  <span>{alarm.block}</span>
                  <span>{new Date(alarm.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="alarm-trace">{alarm.traceMessage}</p>
                <div className="alarm-actions">
                  {alarm.actions.map((action) => (
                    <button key={`${alarm.id}-${action.label}`} type="button" onClick={() => onAction(alarm, action)}>
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </aside>
  )
}
