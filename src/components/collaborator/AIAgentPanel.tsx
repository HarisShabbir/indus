import React, { useMemo, useState } from 'react'
import { Send, Sparkles, X, Brain } from 'lucide-react'
import type { AlarmEvent, StageTelemetry } from '../../types/simulator'
import { collaboratorRoles, stageRoleMap } from '../../store/simulatorStore'
import type { CollaboratorMessage, CollaboratorRole } from '../../store/simulatorStore'

type AIAgentPanelProps = {
  stageId: string | null
  stageTelemetry: StageTelemetry[]
  thread: CollaboratorMessage[]
  role: CollaboratorRole
  alarms: AlarmEvent[]
  onRoleChange: (role: CollaboratorRole) => void
  onAsk: (question: string) => Promise<void>
  onClose: () => void
}

const labelLookup = (stages: StageTelemetry[]) => {
  const map = new Map<string, string>()
  stages.forEach((stage) => map.set(stage.id, stage.label))
  return map
}

const quickPrompts = ['Why is this block at risk?', 'Recommend fastest recovery', 'Show supply chain lineage', 'What is the cost impact?']

export function AIAgentPanel({ stageId, stageTelemetry, thread, role, alarms, onRoleChange, onAsk, onClose }: AIAgentPanelProps) {
  const [input, setInput] = useState('')
  const lookup = useMemo(() => labelLookup(stageTelemetry), [stageTelemetry])
  const label = stageId ? lookup.get(stageId) ?? stageId : 'Process'

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!input.trim()) return
    void onAsk(input.trim())
    setInput('')
  }

  return (
    <aside className="ai-panel" role="dialog" aria-modal="true">
      <header>
        <div>
          <Sparkles size={16} />
          <strong>AI Collaborator</strong>
        </div>
        <div className="stage-badge">
          <Brain size={14} />
          <span>{label}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close collaborator">
          <X size={16} />
        </button>
      </header>
      <div className="ai-role-bar">
        <label>
          Role
          <select
            value={role}
            onChange={(event) => {
              const nextRole = event.target.value as CollaboratorRole
              if (collaboratorRoles.includes(nextRole)) {
                onRoleChange(nextRole)
              }
            }}
          >
            {collaboratorRoles.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="ai-alarms">
        <strong>Active alarms from tower</strong>
        {alarms.length === 0 ? (
          <p className="empty">No alarms captured when collaborator opened.</p>
        ) : (
          <ul>
            {alarms.map((alarm) => (
              <li key={alarm.id}>
                <span>{alarm.ruleId}</span>
                <p>{alarm.description}</p>
                <small>
                  {alarm.block}
                  {alarm.stageId ? ` · ${stageRoleMap[alarm.stageId] ?? alarm.stageId}` : null}
                </small>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="ai-thread">
        {thread.map((message) => (
          <article key={message.id} className={`ai-bubble ${message.author}`}>
            <p>{message.text}</p>
            <small>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
          </article>
        ))}
      </div>
      <div className="ai-quick">
        {quickPrompts.map((prompt) => (
          <button key={prompt} type="button" onClick={() => void onAsk(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="ai-input-row">
        <input type="text" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask anything… e.g. Risk to Block 17" />
        <button type="submit">
          <Send size={16} />
          Ask
        </button>
      </form>
    </aside>
  )
}

export default AIAgentPanel
