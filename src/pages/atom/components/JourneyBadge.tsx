import React, { useState } from 'react'

import type { AtomJourneyEvent } from '../../../api'
import { journeyStatusClass } from '../utils'

export function JourneyBadge({ journey }: { journey: AtomJourneyEvent[] }) {
  const [open, setOpen] = useState(false)
  const latest = journey.length ? journey[journey.length - 1].status : 'unknown'
  const toggle = () => setOpen((prev) => !prev)
  const formatted = latest.replace(/_/g, ' ')
  return (
    <div
      className={`journey-badge status-pill ${journeyStatusClass(latest)}`}
      onClick={toggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          toggle()
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span>{formatted ?? 'unknown'}</span>
      {open && journey.length ? (
        <div className="journey-badge__timeline">
          {journey.map((event) => (
            <span key={event.ts}>
              {new Date(event.ts).toLocaleString()} · {event.status.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default JourneyBadge
