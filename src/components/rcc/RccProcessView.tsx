import React, { useMemo, useState } from 'react'
import type { RccAlarmRule, RccProcessOperation, RccProcessStage, RccProcessTree } from '../../types/rcc'

type RccProcessViewProps = {
  data: RccProcessTree | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onOpenRuleAdmin: () => void
}

const statusIntent: Record<string, 'ok' | 'warning' | 'alarm' | 'unknown'> = {
  ok: 'ok',
  warning: 'warning',
  alarm: 'alarm',
  error: 'alarm',
  unknown: 'unknown',
}

const formatNumber = (value?: number | null, unit?: string | null) => {
  if (value === null || value === undefined) return '--'
  const formatted = Number.isInteger(value) ? value.toString() : value.toFixed(1)
  return unit ? `${formatted} ${unit}` : formatted
}

const ThresholdSummary = ({ thresholds }: { thresholds: Record<string, unknown> }) => {
  const limits: string[] = []
  if (typeof thresholds.min === 'number') limits.push(`≥${thresholds.min}`)
  if (typeof thresholds.max === 'number') limits.push(`≤${thresholds.max}`)
  if (!limits.length) return null
  return <span className="rcc-threshold">{limits.join(' · ')}</span>
}

const OperationCard = ({ operation, onSelectRule }: { operation: RccProcessOperation; onSelectRule: (rule: RccAlarmRule) => void }) => {
  const intent = statusIntent[operation.status] ?? 'unknown'
  return (
    <article className={`rcc-operation-card is-${intent}`}>
      <header className="rcc-operation-head">
        <div>
          <strong>{operation.name}</strong>
          <span>{operation.type}</span>
        </div>
        {operation.rule ? (
          <div className="rcc-operation-actions">
            {operation.rule.severity ? <span className={`rcc-chip is-${operation.rule.severity.toLowerCase()}`}>{operation.rule.severity}</span> : null}
            <button type="button" onClick={() => onSelectRule(operation.rule!)} className="rcc-link-button">
              Rule detail
            </button>
          </div>
        ) : null}
      </header>
      {operation.status_message ? <p className="rcc-operation-status">{operation.status_message}</p> : null}
      {operation.inputs.length ? (
        <ul className="rcc-input-list">
          {operation.inputs.map((input) => {
            const inputIntent = statusIntent[input.status] ?? 'unknown'
            return (
              <li key={input.id}>
                <span className={`rcc-input-dot is-${inputIntent}`} aria-hidden />
                <div>
                  <strong>{input.label}</strong>
                  <div className="rcc-input-meta">
                    <span>{formatNumber(input.current_value, input.unit)}</span>
                    <ThresholdSummary thresholds={input.thresholds} />
                  </div>
                  {input.status_message ? <p className="rcc-input-status">{input.status_message}</p> : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
      {operation.children.length ? (
        <div className="rcc-child-ops">
          {operation.children.map((child) => (
            <div key={child.id} className="rcc-child-chip">
              <span className={`rcc-input-dot is-${statusIntent[child.status] ?? 'unknown'}`} aria-hidden />
              {child.name}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  )
}

export default function RccProcessView({ data, loading, error, onRefresh, onOpenRuleAdmin }: RccProcessViewProps): JSX.Element {
  const [selectedRule, setSelectedRule] = useState<RccAlarmRule | null>(null)
  const stages = useMemo(() => (data ? [...data.stages].sort((a, b) => a.sequence - b.sequence) : []), [data])
  const updatedLabel = data ? new Date(data.as_of).toLocaleString() : null

  if (loading) {
    return (
      <div className="rcc-process-view">
        <div className="rcc-process-header">
          <div>
            <strong>RCC Dam workflow</strong>
            <span className="rcc-process-subhead">Refreshing live telemetry…</span>
          </div>
        </div>
        <div className="rcc-process-placeholder">Loading telemetry-driven process…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rcc-process-view">
        <div className="rcc-process-header">
          <strong>RCC Dam workflow</strong>
          <div className="rcc-process-actions">
            <button type="button" className="rcc-link-button" onClick={onRefresh}>
              Try again
            </button>
          </div>
        </div>
        <div className="rcc-process-placeholder error">{error}</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="rcc-process-view">
        <div className="rcc-process-header">
          <strong>RCC Dam workflow</strong>
          <div className="rcc-process-actions">
            <button type="button" className="rcc-link-button" onClick={onRefresh}>
              Load data
            </button>
          </div>
        </div>
        <div className="rcc-process-placeholder">Select the RCC Dam SOW to view live workflow data.</div>
      </div>
    )
  }

  const handleRuleSelect = (rule: RccAlarmRule) => {
    setSelectedRule(rule)
  }

  return (
    <div className="rcc-process-view">
      <div className="rcc-process-header">
        <div>
          <strong>{data.sow_name} workflow</strong>
          <span className="rcc-process-subhead">As of {updatedLabel}</span>
        </div>
        <div className="rcc-process-actions">
          <button type="button" className="rcc-link-button" onClick={onRefresh}>
            Refresh
          </button>
          <button type="button" className="rcc-primary-button" onClick={onOpenRuleAdmin}>
            Manage rules
          </button>
        </div>
      </div>
      <p className="rcc-process-intro">
        Each column represents one phase of the RCC pour lifecycle—from batching permits through conveyor transport, placement crews, and long-tail curing. Follow the numbered timeline to see
        which phase is driving alarms, then drill into the cards below for the live telemetry that triggered each rule.
      </p>
      <div className="rcc-stage-timeline">
        {stages.map((stage, index) => (
          <div key={`${stage.id}-timeline`} className={`rcc-stage-timeline__item${stage.alarm_count ? ' has-alert' : ''}`}>
            <span className="rcc-stage-timeline__step">{index + 1}</span>
            <div>
              <strong>{stage.name}</strong>
              <p>{stage.description ?? 'No description provided.'}</p>
            </div>
            <span className={`rcc-stage-timeline__status${stage.alarm_count ? ' is-risk' : ''}`}>{stage.alarm_count ? `${stage.alarm_count} alarm${stage.alarm_count > 1 ? 's' : ''}` : 'Nominal'}</span>
          </div>
        ))}
      </div>
      {selectedRule ? (
        <div className="rcc-rule-detail">
          <div className="rcc-rule-detail-head">
            <div>
              <strong>{selectedRule.category}</strong>
              {selectedRule.stage_name ? <span className="rcc-chip">{selectedRule.stage_name}</span> : null}
            </div>
            <button type="button" className="rcc-link-button" onClick={() => setSelectedRule(null)}>
              Close
            </button>
          </div>
          <p className="rcc-rule-message">{selectedRule.message ?? 'No message provided.'}</p>
          <dl>
            <div>
              <dt>Severity</dt>
              <dd>{selectedRule.severity}</dd>
            </div>
            <div>
              <dt>Condition</dt>
              <dd>
                <code>{selectedRule.condition}</code>
              </dd>
            </div>
            <div>
              <dt>Action</dt>
              <dd>{selectedRule.action ?? '—'}</dd>
            </div>
            <div>
              <dt>Last status</dt>
              <dd>{selectedRule.last_status ?? 'unknown'}</dd>
            </div>
          </dl>
        </div>
      ) : null}
      <div className="rcc-process-legend">
        <span>
          <i className="is-ok" /> Stable
        </span>
        <span>
          <i className="is-warning" /> Watch
        </span>
        <span>
          <i className="is-alarm" /> Alarm
        </span>
      </div>
      <div className="rcc-stage-row">
        {stages.map((stage) => (
          <section key={stage.id} className="rcc-stage-card">
            <header>
              <div>
                <strong>{stage.name}</strong>
                {stage.description ? <p>{stage.description}</p> : null}
              </div>
              <span className={`rcc-stage-badge ${stage.alarm_count > 0 ? 'has-alarms' : ''}`}>
                {stage.alarm_count > 0 ? `${stage.alarm_count} alarms` : 'Nominal'}
              </span>
            </header>
            <div className="rcc-operation-list">
              {stage.operations.map((operation) => (
                <OperationCard key={operation.id} operation={operation} onSelectRule={handleRuleSelect} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
