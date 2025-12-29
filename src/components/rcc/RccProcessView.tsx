import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RccAlarmRule, RccProcessOperation, RccProcessStage, RccProcessTree } from '../../types/rcc'
import { simulateRccProcessWorkflow } from '../../api'

type RccProcessViewProps = {
  sowId: string
  data: RccProcessTree | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onOpenRuleAdmin: () => void
}

const SIMULATION_TICK_MS = 6000

const statusIntent: Record<string, 'ok' | 'warning' | 'alarm' | 'unknown'> = {
  ok: 'ok',
  warning: 'warning',
  alarm: 'alarm',
  error: 'alarm',
  unknown: 'unknown',
}

const statusLabel: Record<string, string> = {
  ok: 'Stable',
  warning: 'Watch',
  alarm: 'Alarm',
  error: 'Alarm',
  unknown: 'Unknown',
}

const formatRelativeTime = (timestamp?: string | null) => {
  if (!timestamp) return '—'
  const value = new Date(timestamp)
  const diff = Math.max(0, Date.now() - value.getTime())
  if (diff < 1500) return 'just now'
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  return `${Math.round(diff / 3_600_000)}h ago`
}

const flattenOperations = (nodes: RccProcessOperation[]): RccProcessOperation[] => {
  const list: RccProcessOperation[] = []
  nodes.forEach((operation) => {
    list.push(operation)
    if (operation.children.length) {
      list.push(...flattenOperations(operation.children))
    }
  })
  return list
}

const stageStatusLabel: Record<string, string> = {
  ok: 'Stable',
  warning: 'Watch',
  alarm: 'Alarm',
  error: 'Alarm',
  unknown: 'Unknown',
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

const OperationCard = ({ operation, onSelectRule, isPulsing }: { operation: RccProcessOperation; onSelectRule: (rule: RccAlarmRule) => void; isPulsing?: boolean }) => {
  const intent = statusIntent[operation.status] ?? 'unknown'
  const statusText = statusLabel[operation.status] ?? 'Unknown'
  return (
    <article className={`rcc-operation-card is-${intent}${isPulsing ? ' is-pulsing' : ''}`}>
      <header className="rcc-operation-head">
        <div>
          <strong>{operation.name}</strong>
          <span>{operation.type}</span>
          <div className="rcc-operation-meta">
            <span className={`rcc-status-chip is-${intent}`}>{statusText}</span>
            {operation.rule?.last_evaluated_at ? <span className="rcc-operation-last-update">Updated {formatRelativeTime(operation.rule.last_evaluated_at)}</span> : null}
          </div>
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

export default function RccProcessView({ sowId, data, loading, error, onRefresh, onOpenRuleAdmin }: RccProcessViewProps): JSX.Element {
  const [selectedRule, setSelectedRule] = useState<RccAlarmRule | null>(null)
  const [liveData, setLiveData] = useState<RccProcessTree | null>(data)
  const [simState, setSimState] = useState<'playing' | 'paused'>('playing')
  const [syncing, setSyncing] = useState(false)
  const [simError, setSimError] = useState<string | null>(null)
  const [pulses, setPulses] = useState<Record<string, number>>({})
  const previousStatuses = useRef<Record<string, string>>({})
  const pulseTimeouts = useRef<number[]>([])
  const simulatingRef = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const currentData = liveData ?? data
  const stages = useMemo(() => (currentData ? [...currentData.stages].sort((a, b) => a.sequence - b.sequence) : []), [currentData])
  const updatedLabel = currentData ? new Date(currentData.as_of).toLocaleString() : null

  useEffect(() => {
    if (data) {
      setLiveData(data)
    }
  }, [data])

  useEffect(
    () => () => {
      pulseTimeouts.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
      pulseTimeouts.current = []
    },
    [],
  )

  const runSimulation = useCallback(
    async (reason?: string) => {
      if (!sowId || simulatingRef.current) return null
      simulatingRef.current = true
      try {
        const result = await simulateRccProcessWorkflow(sowId, reason)
        setLiveData(result)
        setSimError(null)
        return result
      } catch (err) {
        setSimError('Unable to sync telemetry right now.')
        return null
      } finally {
        simulatingRef.current = false
      }
    },
    [sowId],
  )

  const handleSyncTelemetry = useCallback(async () => {
    if (simulatingRef.current) return
    setSyncing(true)
    await runSimulation('manual')
    setSyncing(false)
  }, [runSimulation])

  useEffect(() => {
    if (simState !== 'playing' || !sowId || loading || !!error) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }
    runSimulation('auto')
    intervalRef.current = window.setInterval(() => {
      runSimulation('auto')
    }, SIMULATION_TICK_MS)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [simState, sowId, runSimulation, loading, error])

  useEffect(() => {
    if (!liveData) return
    const operations = liveData.stages.flatMap((stage) => flattenOperations(stage.operations))
    const diffs: string[] = []
    const snapshot: Record<string, string> = {}
    operations.forEach((operation) => {
      snapshot[operation.id] = operation.status
      const previous = previousStatuses.current[operation.id]
      if (previous && previous !== operation.status) {
        diffs.push(operation.id)
      }
    })
    previousStatuses.current = snapshot
    if (!diffs.length) return
    const timestamp = Date.now()
    setPulses((prev) => {
      const next = { ...prev }
      diffs.forEach((id) => {
        next[id] = timestamp
      })
      return next
    })
    diffs.forEach((id) => {
      const timeoutId = window.setTimeout(() => {
        setPulses((prev) => {
          if (!prev[id]) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
        pulseTimeouts.current = pulseTimeouts.current.filter((value) => value !== timeoutId)
      }, 1400)
      pulseTimeouts.current.push(timeoutId)
    })
  }, [liveData])

  useEffect(() => {
    if (!selectedRule || !liveData) return
    const operations = liveData.stages.flatMap((stage) => flattenOperations(stage.operations))
    const nextRule = operations.find((operation) => operation.rule && operation.rule.id === selectedRule.id)?.rule
    if (nextRule && (nextRule.last_status !== selectedRule.last_status || nextRule.last_evaluated_at !== selectedRule.last_evaluated_at)) {
      setSelectedRule(nextRule)
    }
  }, [liveData, selectedRule])

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

  if (!currentData) {
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
          <strong>{currentData.sow_name} workflow</strong>
          <span className="rcc-process-subhead">As of {updatedLabel}</span>
        </div>
        <div className="rcc-process-actions">
          <div className={`rcc-live-indicator is-${simState}`}>
            <span aria-hidden />
            {simState === 'playing' ? 'Live simulation' : 'Paused'}
          </div>
          <button type="button" className="rcc-pill-button" onClick={handleSyncTelemetry} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync telemetry'}
          </button>
          <button type="button" className="rcc-link-button" onClick={() => setSimState((prev) => (prev === 'playing' ? 'paused' : 'playing'))}>
            {simState === 'playing' ? 'Pause simulation' : 'Play simulation'}
          </button>
          <button type="button" className="rcc-link-button" onClick={onRefresh}>
            Reload data
          </button>
          <button type="button" className="rcc-primary-button" onClick={onOpenRuleAdmin}>
            Manage rules
          </button>
        </div>
      </div>
      {simError ? <div className="rcc-sim-status error">{simError}</div> : null}
      {simState === 'paused' ? <div className="rcc-sim-status muted">Simulation paused. Press play to resume telemetry updates.</div> : null}
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
              <div className="rcc-stage-timeline__meta">
                <span className={`rcc-status-chip is-${statusIntent[stage.status] ?? 'unknown'}`}>{stageStatusLabel[stage.status] ?? 'Stable'}</span>
                {stage.worst_severity ? <span className={`rcc-chip is-${stage.worst_severity.toLowerCase()}`}>{stage.worst_severity.toUpperCase()}</span> : null}
                <span className="rcc-stage-updated">Updated {formatRelativeTime(stage.last_updated ?? currentData.as_of)}</span>
              </div>
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
                <div className="rcc-stage-meta">
                  <span className={`rcc-status-chip is-${statusIntent[stage.status] ?? 'unknown'}`}>{stageStatusLabel[stage.status] ?? 'Stable'}</span>
                  {stage.worst_severity ? <span className={`rcc-chip is-${stage.worst_severity.toLowerCase()}`}>{stage.worst_severity.toUpperCase()} severity</span> : null}
                  <span className="rcc-stage-updated">Updated {formatRelativeTime(stage.last_updated ?? currentData.as_of)}</span>
                </div>
              </div>
              <div className="rcc-stage-health">
                <span className={`rcc-stage-badge ${stage.alarm_count > 0 ? 'has-alarms' : ''}`}>{stage.alarm_count > 0 ? `${stage.alarm_count} alarms` : 'Nominal'}</span>
                {stage.rule_alarm_count > 0 ? <span className="rcc-stage-rules">{stage.rule_alarm_count} rule{stage.rule_alarm_count > 1 ? 's' : ''} in alarm</span> : null}
              </div>
            </header>
            <div className="rcc-operation-list">
              {stage.operations.map((operation) => (
                <OperationCard key={operation.id} operation={operation} onSelectRule={handleRuleSelect} isPulsing={Boolean(pulses[operation.id])} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
