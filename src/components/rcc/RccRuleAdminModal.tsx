import React, { useEffect, useState } from 'react'
import type { RccAlarmRule } from '../../types/rcc'
import type { RccRulePayload } from '../../api'

type RccRuleAdminModalProps = {
  rules: RccAlarmRule[]
  loading: boolean
  error: string | null
  onClose: () => void
  onSaveRule: (payload: RccRulePayload) => Promise<void>
}

type RuleDraft = RccAlarmRule & { dirty?: boolean }

export default function RccRuleAdminModal({ rules, loading, error, onClose, onSaveRule }: RccRuleAdminModalProps): JSX.Element {
  const [drafts, setDrafts] = useState<Record<string, RuleDraft>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    const snapshot: Record<string, RuleDraft> = {}
    rules.forEach((rule) => {
      snapshot[rule.id] = { ...rule, dirty: false }
    })
    setDrafts(snapshot)
  }, [rules])

  const handleChange = (id: string, field: keyof RccAlarmRule, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
        dirty: true,
      },
    }))
  }

  const handleToggle = (id: string) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        enabled: !prev[id].enabled,
        dirty: true,
      },
    }))
  }

  const handleSave = async (rule: RuleDraft) => {
    setSavingId(rule.id)
    setFeedback(null)
    try {
      await onSaveRule({
        id: rule.id,
        category: rule.category,
        condition: rule.condition,
        severity: rule.severity,
        action: rule.action ?? undefined,
        message: rule.message ?? undefined,
        enabled: rule.enabled,
        metadata: rule.metadata,
        operation_id: rule.operation_id ?? null,
      })
      setDrafts((prev) => ({
        ...prev,
        [rule.id]: {
          ...prev[rule.id],
          dirty: false,
        },
      }))
      setFeedback('Rule updated.')
    } catch (err) {
      setFeedback('Unable to save rule right now.')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="rcc-rule-modal" role="dialog" aria-modal="true" aria-label="RCC alarm rules">
      <div className="rcc-rule-modal__panel">
        <header>
          <div>
            <strong>Alarm rules</strong>
            <span>Configure RCC thresholds</span>
          </div>
          <button type="button" className="rcc-link-button" onClick={onClose}>
            Close
          </button>
        </header>
        {loading ? <div className="rcc-rule-modal__status">Loading rules…</div> : null}
        {error ? <div className="rcc-rule-modal__status error">{error}</div> : null}
        {feedback ? <div className="rcc-rule-modal__status success">{feedback}</div> : null}
        <div className="rcc-rule-modal__body">
          {Object.values(drafts).map((rule) => (
            <article key={rule.id}>
              <header>
                <div>
                  <strong>{rule.category}</strong>
                  <span>{rule.stage_name ?? 'Unmapped stage'}</span>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={!!rule.enabled} onChange={() => handleToggle(rule.id)} />
                  <span />
                </label>
              </header>
              <label>
                <span>Condition</span>
                <textarea value={rule.condition} onChange={(e) => handleChange(rule.id, 'condition', e.target.value)} />
              </label>
              <label>
                <span>Severity</span>
                <input value={rule.severity} onChange={(e) => handleChange(rule.id, 'severity', e.target.value)} />
              </label>
              <label>
                <span>Action</span>
                <input value={rule.action ?? ''} onChange={(e) => handleChange(rule.id, 'action', e.target.value)} />
              </label>
              <label>
                <span>Message</span>
                <input value={rule.message ?? ''} onChange={(e) => handleChange(rule.id, 'message', e.target.value)} />
              </label>
              <footer>
                <button type="button" disabled={!rule.dirty || savingId === rule.id} onClick={() => handleSave(rule)}>
                  {savingId === rule.id ? 'Saving…' : 'Save rule'}
                </button>
              </footer>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
