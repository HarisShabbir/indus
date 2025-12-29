import React from 'react'

import type { ProgressSummaryResponse } from '../../../api'
import { formatDate } from '../utils'

type ProgressNextActivity = ProgressSummaryResponse['nextActivities'][number]

export function NextActivitiesPanel({
  activities,
  loading,
  error,
  asOf,
}: {
  activities: ProgressNextActivity[]
  loading: boolean
  error: string | null
  asOf?: string | null
}) {
  if (error) {
    return <div className="atom-error">Unable to load next activities right now.</div>
  }
  if (loading) {
    return <div className="atom-loading">Loading next activities…</div>
  }
  if (!activities.length) {
    return <div className="atom-deployments__empty">No upcoming activities in this scope.</div>
  }
  return (
    <section className="atom-next-activities">
      <div className="atom-right__header">
        <h3>Next activities</h3>
        {asOf ? <span>As of {formatDate(asOf)}</span> : null}
      </div>
      <table className="atom-deployments">
        <thead>
          <tr>
            <th>Process</th>
            <th>Planned</th>
            <th>Ready</th>
          </tr>
        </thead>
        <tbody>
          {activities.slice(0, 5).map((activity) => (
            <tr key={activity.processId}>
              <td>{activity.name}</td>
              <td>{activity.plannedStart ? formatDate(activity.plannedStart) : 'TBD'}</td>
              <td>{activity.ready ? 'Ready' : 'Pending'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export default NextActivitiesPanel
