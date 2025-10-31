import React, { useMemo, useState } from 'react'

import type {
  AtomDeploymentGroupReport,
  AtomDeploymentItemReport,
  AtomDeploymentReportResponse,
} from '../../../api'
import JourneyBadge from './JourneyBadge'
import {
  formatCurrency,
  formatNumber,
  formatHours,
  formatPercent,
  formatDate,
  ratio,
  journeyStatusClass,
} from '../utils'

type Props = {
  groups: AtomDeploymentGroupReport[]
  status: 'active' | 'idle' | 'completed'
  pagination?: AtomDeploymentReportResponse['pagination']
  onPageChange?: (page: number) => void
}

const buildPageItems = (currentPage: number, totalPages: number) => {
  const items: Array<number | 'ellipsis'> = []
  const windowSize = 2
  for (let page = 1; page <= totalPages; page += 1) {
    if (page === 1 || page === totalPages || Math.abs(page - currentPage) <= windowSize) {
      items.push(page)
    } else if (items[items.length - 1] !== 'ellipsis') {
      items.push('ellipsis')
    }
  }
  return items
}

export function DeploymentList({ groups, status, pagination, onPageChange }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  if (!groups.length) {
    return <div className="atom-deployments__empty">No deployments match the current filters.</div>
  }

  const totalGroups = pagination?.totalGroups ?? groups.length
  const currentPage = pagination?.page ?? 1
  const pageSize = pagination?.size ?? groups.length
  const totalPages = pagination ? Math.max(1, Math.ceil(totalGroups / pageSize)) : 1
  const pageStart = pagination ? (currentPage - 1) * pageSize + (groups.length ? 1 : 0) : groups.length ? 1 : 0
  const pageEnd = pagination ? Math.min(totalGroups, pageStart + groups.length - 1) : groups.length
  const pageItems = useMemo(() => (pagination ? buildPageItems(currentPage, totalPages) : []), [pagination, currentPage, totalPages])

  const handlePrev = () => {
    if (!onPageChange || currentPage <= 1) return
    onPageChange(currentPage - 1)
  }

  const handleNext = () => {
    if (!onPageChange || currentPage >= totalPages) return
    onPageChange(currentPage + 1)
  }

  const renderStatus = (group: AtomDeploymentGroupReport) => {
    const label = group.journeyStatus ?? group.deploymentStatus ?? 'unknown'
    return <span className={`status-pill ${journeyStatusClass(label)}`}>{label}</span>
  }

  const renderItems = (items: AtomDeploymentItemReport[]) =>
    items.map((item) => (
      <div key={item.atomId} className="atom-deployments__detail-card">
        <div className="atom-deployments__item-header">
          <span className="atom-deployment__serial">{item.serial ?? item.atomId}</span>
          <JourneyBadge journey={item.journey} />
        </div>
        <dl>
          <div>
            <dt>Start</dt>
            <dd>{item.deploymentStart ? formatDate(item.deploymentStart) : '--'}</dd>
          </div>
          <div>
            <dt>Hours</dt>
            <dd>{item.hoursCompleted ? formatHours(item.hoursCompleted) : '--'}</dd>
          </div>
          {item.latestTelemetry ? (
            <div>
              <dt>Telemetry</dt>
              <dd>{Object.entries(item.latestTelemetry).map(([k, v]) => `${k}: ${v}`).join(', ')}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    ))

  return (
    <div className="atom-deployments">
      {pagination ? (
        <div className="atom-pagination atom-pagination--table">
          <span>
            Showing {pageStart}-{pageEnd} of {totalGroups}
          </span>
          <div className="atom-pagination__controls" role="navigation" aria-label="Deployment pagination top">
            <button type="button" onClick={handlePrev} disabled={currentPage <= 1}>
              Previous
            </button>
            <ul className="atom-pagination__pages">
              {pageItems.map((item, index) =>
                item === 'ellipsis' ? (
                  <li key={`ellipsis-${index}`} className="atom-pagination__ellipsis" aria-hidden>
                    …
                  </li>
                ) : (
                  <li key={item}>
                    <button
                      type="button"
                      className={`atom-pagination__page-btn${item === currentPage ? ' is-active' : ''}`}
                      onClick={() => onPageChange?.(item)}
                      disabled={item === currentPage}
                      aria-current={item === currentPage ? 'page' : undefined}
                    >
                      {item}
                    </button>
                  </li>
                ),
              )}
            </ul>
            <button type="button" onClick={handleNext} disabled={currentPage >= totalPages}>
              Next
            </button>
          </div>
        </div>
      ) : null}

      <table className="atom-deployments__table">
        <thead>
          <tr>
            <th scope="col">Atom</th>
            <th scope="col">Vendor</th>
            <th scope="col">Count</th>
            <th scope="col">{status === 'active' ? 'Runtime' : 'Hours'}</th>
            <th scope="col">Progress</th>
            <th scope="col">Value</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group, index) => {
            const groupKey = `${group.atomType}-${group.model}-${index}`
            const isExpanded = expanded[groupKey] ?? false
            const toggle = () =>
              setExpanded((prev) => ({
                ...prev,
                [groupKey]: !isExpanded,
              }))
            const workPct = group.workCompleted?.percentComplete ?? null
            const runtime = group.hoursCompleted ?? null

            return (
              <React.Fragment key={groupKey}>
                <tr className="atom-deployments__row">
                  <td>
                    <div className="atom-deployments__cell">
                      <button
                        type="button"
                        className="atom-deployments__expander"
                        aria-expanded={isExpanded}
                        onClick={toggle}
                      >
                        {isExpanded ? '−' : '+'}
                      </button>
                      <div className="atom-deployments__cell-title">
                        <strong>{group.model}</strong>
                        <span>{group.atomType}</span>
                        <div className="atom-deployments__chip-row">
                          {group.processName ? (
                            <span className="atom-deployments__chip">Process · {group.processName}</span>
                          ) : null}
                          {group.sowName ? <span className="atom-deployments__chip">SOW · {group.sowName}</span> : null}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{group.vendor ?? '—'}</td>
                  <td>{group.count}</td>
                  <td>{runtime != null ? formatHours(runtime) : '—'}</td>
                  <td>{workPct != null ? formatPercent(workPct) : '—'}</td>
                  <td>{group.value != null ? formatCurrency(group.value, 1) : '—'}</td>
                  <td>{renderStatus(group)}</td>
                </tr>
                {isExpanded ? (
                  <tr className="atom-deployments__details">
                    <td colSpan={7}>
                      <div className="atom-deployments__detail-grid">
                        {group.capacity && Object.keys(group.capacity).length ? (
                          <div className="atom-deployments__detail-card">
                            <h5>Capacity</h5>
                            <div className="atom-deployments__capacity">
                              {Object.entries(group.capacity).map(([key, value]) => (
                                <span key={key}>
                                  <strong>{key}</strong>: {String(value)}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {renderItems(group.items)}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
      {pagination ? (
        <div className="atom-pagination atom-pagination--footer" role="navigation" aria-label="Deployment pagination bottom">
          <button type="button" onClick={handlePrev} disabled={currentPage <= 1}>
            Previous
          </button>
          <ul className="atom-pagination__pages">
            {pageItems.map((item, index) =>
              item === 'ellipsis' ? (
                <li key={`ellipsis-bottom-${index}`} className="atom-pagination__ellipsis" aria-hidden>
                  …
                </li>
              ) : (
                <li key={`bottom-${item}`}>
                  <button
                    type="button"
                    className={`atom-pagination__page-btn${item === currentPage ? ' is-active' : ''}`}
                    onClick={() => onPageChange?.(item)}
                    disabled={item === currentPage}
                    aria-current={item === currentPage ? 'page' : undefined}
                  >
                    {item}
                  </button>
                </li>
              ),
            )}
          </ul>
          <button type="button" onClick={handleNext} disabled={currentPage >= totalPages}>
            Next
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default DeploymentList
