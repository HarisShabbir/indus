import React from 'react'
import type { RuleDescriptor } from '../../types/simulator'

type RuleModalProps = {
  rules: RuleDescriptor[]
  onClose: () => void
  onUpdate: (ruleId: string, patch: Partial<RuleDescriptor>) => void
}

export function RuleModal({ rules, onClose, onUpdate }: RuleModalProps) {
  return (
    <div className="trace-modal" role="dialog" aria-modal="true">
      <div className="rule-panel">
        <header>
          <div>
            <strong>RCC Rule Matrix</strong>
            <span>{rules.length} rules active</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close rules">
            ×
          </button>
        </header>
        <div className="rule-table">
          <table>
            <thead>
              <tr>
                <th>Rule</th>
                <th>Stage</th>
                <th>Metric</th>
                <th>Operator</th>
                <th>Low</th>
                <th>High</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.rule_id}>
                  <td>{rule.rule_id}</td>
                  <td>{rule.process_stage}</td>
                  <td>{rule.metric}</td>
                  <td>{rule.condition_operator}</td>
                  <td>
                    <input
                      type="number"
                      value={rule.threshold_low ?? ''}
                      onChange={(event) =>
                        onUpdate(rule.rule_id, { threshold_low: event.target.value === '' ? null : Number(event.target.value) })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={rule.threshold_high ?? ''}
                      onChange={(event) =>
                        onUpdate(rule.rule_id, { threshold_high: event.target.value === '' ? null : Number(event.target.value) })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default RuleModal
