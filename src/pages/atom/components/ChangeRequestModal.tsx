import React, { useState } from 'react'

import type { AtomDeploymentGroupReport } from '../../../api'

type Props = {
  target: AtomDeploymentGroupReport
  onClose: () => void
  onSubmit: (values: { units: number; estCost?: number | null; reason?: string | null }) => void
  submitting: boolean
  message: string | null
}

export function ChangeRequestModal({ target, onClose, onSubmit, submitting, message }: Props) {
  const [units, setUnits] = useState<number>(target.count + 1)
  const [estCost, setEstCost] = useState<string>('')
  const [reason, setReason] = useState<string>('')

  return (
    <div className="atom-modal">
      <div className="atom-modal__content">
        <h3>Propose capacity increase</h3>
        <p>Request additional units for {target.model}.</p>
        <label>
          Requested units
          <input type="number" value={units} min={1} onChange={(event) => setUnits(Number(event.target.value))} />
        </label>
        <label>
          Estimated cost
          <input type="number" value={estCost} onChange={(event) => setEstCost(event.target.value)} placeholder="Optional" />
        </label>
        <label>
          Justification
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this needed?" />
        </label>
        {message ? <div className="atom-success">{message}</div> : null}
        <div className="atom-modal__actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => onSubmit({ units, estCost: estCost ? Number(estCost) : undefined, reason })}
          >
            {submitting ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChangeRequestModal
