import React, { useEffect, useMemo, useState } from 'react'

import type { AtomScheduleItem, AtomScheduleResponse } from '../../../api'
import { formatDate, formatNumber, formatPercent, formatShortDate } from '../utils'

type StatusFilter = 'all' | 'on_track' | 'at_risk' | 'delayed' | 'completed'

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'on_track', label: 'On track' },
  { id: 'at_risk', label: 'At risk' },
  { id: 'delayed', label: 'Delayed' },
  { id: 'completed', label: 'Completed' },
]

const normaliseStatus = (value?: string | null): StatusFilter => {
  const status = (value ?? '').toLowerCase()
  if (status.includes('complete')) return 'completed'
  if (status.includes('delay') || status.includes('late')) return 'delayed'
  if (status.includes('risk') || status.includes('warning')) return 'at_risk'
  if (status.includes('track') || status.includes('active') || status.includes('progress')) return 'on_track'
  return 'on_track'
}

const resolveStatusClass = (status: StatusFilter): string => {
  switch (status) {
    case 'completed':
      return 'status-pill--completed'
    case 'delayed':
      return 'status-pill--delayed'
    case 'at_risk':
      return 'status-pill--planned'
    case 'on_track':
    default:
      return 'status-pill--in-progress'
  }
}

const formatVarianceDays = (value?: number | null): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '--'
  const rounded = Math.round(value * 10) / 10
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded.toFixed(1)}d`
}

const buildWindowLabel = (start?: string | null, finish?: string | null) => {
  if (!start && !finish) return '—'
  const startLabel = start ? formatShortDate(start) : '—'
  const finishLabel = finish ? formatShortDate(finish) : '—'
  return `${startLabel} → ${finishLabel}`
}

const formatCategoryLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

type AtomScheduleBoardProps = {
  data: AtomScheduleResponse | null
  loading: boolean
  error: string | null
  categoryFilter: string | null
  onRefresh?: () => void
  refreshing?: boolean
}

const AtomScheduleBoard: React.FC<AtomScheduleBoardProps> = ({ data, loading, error, categoryFilter, onRefresh, refreshing }) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [tablePage, setTablePage] = useState(1)
  const ROWS_PER_PAGE = 9

  const filteredItems = useMemo(() => {
    const searchValue = searchTerm.trim().toLowerCase()
    if (!data) return []
    return data.items.filter((item) => {
      const matchesCategory = !categoryFilter || item.category === categoryFilter
      const status = normaliseStatus(item.status)
      const matchesStatus = statusFilter === 'all' || status === statusFilter
      const searchFields = [
        item.atomName,
        item.milestone,
        item.processName,
        item.notes,
        item.status,
        item.processCode,
        item.contractCode,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      const matchesSearch = !searchValue || searchFields.includes(searchValue) || item.scheduleId.toLowerCase().includes(searchValue)
      return matchesCategory && matchesStatus && matchesSearch
    })
  }, [data, categoryFilter, statusFilter, searchTerm])

  useEffect(() => {
    setTablePage(1)
  }, [categoryFilter, statusFilter, searchTerm])

  const totalTablePages = useMemo(
    () => Math.max(1, Math.ceil(filteredItems.length / ROWS_PER_PAGE)),
    [filteredItems.length],
  )

  useEffect(() => {
    if (tablePage > totalTablePages) {
      setTablePage(totalTablePages)
    }
  }, [tablePage, totalTablePages])

  const pagedItems = useMemo(() => {
    const start = (tablePage - 1) * ROWS_PER_PAGE
    return filteredItems.slice(start, start + ROWS_PER_PAGE)
  }, [filteredItems, tablePage])

  if (!data && !loading && !error) {
    return (
      <section className="atom-schedule-board">
        <div className="atom-empty-state">
          <h3>Select a project scope</h3>
          <p>Pick a project, contract, SOW, or process to see atom scheduling details.</p>
        </div>
      </section>
    )
  }

  const summary = data?.summary ?? null

  return (
    <section className="atom-schedule-board">
      <header className="atom-schedule-board__header">
        <div>
          <h3>Atom scheduling</h3>
          {summary?.asOf ? <span>As of {formatDate(summary.asOf)}</span> : null}
        </div>
        <div className="atom-schedule-board__actions">
          <div className="atom-search-field">
            <input
              type="search"
              placeholder="Search schedule…"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              aria-label="Search scheduled atoms"
            />
            {searchTerm ? (
              <button
                type="button"
                className="atom-search-clear"
                onClick={() => setSearchTerm('')}
                aria-label="Clear schedule search"
              >
                ×
              </button>
            ) : null}
          </div>
          {error ? <span className="atom-error">{error}</span> : null}
          {onRefresh ? (
            <button type="button" className="atom-refresh" onClick={onRefresh} disabled={loading || refreshing}>
              {loading || refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          ) : null}
        </div>
      </header>

      {loading ? (
        <div className="atom-loading">Loading atom schedule…</div>
      ) : (
        <>
          {summary ? (
            <>
              <div className="atom-schedule-board__summary">
                <div className="atom-metric-card">
                  <span>Total scheduled</span>
                  <strong>{formatNumber(summary.total)}</strong>
                </div>
                <div className="atom-metric-card">
                  <span>On track</span>
                  <strong>{formatNumber(summary.onTrack)}</strong>
                </div>
                <div className="atom-metric-card">
                  <span>At risk</span>
                  <strong>{formatNumber(summary.atRisk)}</strong>
                </div>
                <div className="atom-metric-card">
                  <span>Delayed</span>
                  <strong>{formatNumber(summary.delayed)}</strong>
                </div>
                <div className="atom-metric-card">
                  <span>Completed</span>
                  <strong>{formatNumber(summary.completed)}</strong>
                </div>
                <div className="atom-metric-card">
                  <span>Avg. progress</span>
                  <strong>{summary.averageProgress != null ? formatPercent(summary.averageProgress) : '--'}</strong>
                </div>
                <div className="atom-metric-card">
                  <span>Avg. variance</span>
                  <strong>{summary.averageVariance != null ? formatVarianceDays(summary.averageVariance) : '--'}</strong>
                </div>
                <div className="atom-metric-card">
                  <span>Starts · 7 day</span>
                  <strong>{formatNumber(summary.startsNextSeven ?? 0)}</strong>
                </div>
                <div className="atom-metric-card">
                  <span>Finishes · 7 day</span>
                  <strong>{formatNumber(summary.finishesNextSeven ?? 0)}</strong>
                </div>
                <div className="atom-metric-card">
                  <span>Risks · 7 day</span>
                  <strong>{formatNumber(summary.risksNextSeven ?? 0)}</strong>
                </div>
              </div>

              {summary.upcoming.length ? (
                <div className="atom-schedule-board__upcoming">
                  <h4>Upcoming milestones</h4>
                  <div className="atom-schedule-board__upcoming-grid">
                    {summary.upcoming.map((item) => (
                      <article key={item.scheduleId} className="atom-upcoming-card">
                        <header>
                          <strong>{item.label}</strong>
                          {item.plannedStart ? <span>{formatShortDate(item.plannedStart)}</span> : null}
                        </header>
                        <p>{buildWindowLabel(item.plannedStart ?? null, item.plannedFinish ?? null)}</p>
                        {item.daysToStart != null ? (
                          <footer>{item.daysToStart > 0 ? `${item.daysToStart} days to go` : 'In progress'}</footer>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          <div className="atom-board-filters">
            <div className="atom-chip-group" role="group" aria-label="Status filter">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={`atom-filter-chip ${statusFilter === filter.id ? 'active' : ''}`}
                  onClick={() => setStatusFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            {categoryFilter ? (
              <span className="atom-board-filter-label">Filtered by category · {formatCategoryLabel(categoryFilter)}</span>
            ) : null}
          </div>

          <div className="atom-table-wrapper">
            <table className="atom-schedule-board__table">
              <thead>
                <tr>
                  <th scope="col">Milestone</th>
                  <th scope="col">Atom</th>
                  <th scope="col">Process</th>
                  <th scope="col">Planned window</th>
                  <th scope="col">Actual window</th>
                  <th scope="col">% complete</th>
                  <th scope="col">Status</th>
                  <th scope="col">Variance</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <div className="atom-empty-row">No schedule items match the current filters.</div>
                    </td>
                  </tr>
                ) : (
                  pagedItems.map((item: AtomScheduleItem) => {
                    const status = normaliseStatus(item.status)
                    return (
                      <tr key={item.scheduleId}>
                        <td>
                          <strong>{item.milestone ?? '—'}</strong>
                          {item.criticality ? <span className={`atom-chip atom-chip--${item.criticality.toLowerCase()}`}>{item.criticality}</span> : null}
                        </td>
                        <td>
                          <div className="atom-table-cell">
                            <span>{item.atomName}</span>
                            <em>{item.atomType}</em>
                          </div>
                        </td>
                        <td>
                          <div className="atom-table-cell">
                            <span>{item.processName ?? '—'}</span>
                            <em>{item.processCode ?? ''}</em>
                          </div>
                        </td>
                        <td>{buildWindowLabel(item.plannedStart ?? null, item.plannedFinish ?? null)}</td>
                        <td>{buildWindowLabel(item.actualStart ?? null, item.actualFinish ?? null)}</td>
                        <td>{item.percentComplete != null ? formatPercent(item.percentComplete) : '--'}</td>
                        <td>
                          <span className={`status-pill ${resolveStatusClass(status)}`}>{item.status ?? 'On track'}</span>
                          {item.conflictTypes?.length ? (
                            <span className="atom-conflict-chip" title={item.conflictTypes.join(', ')}>
                              ⚠ {item.conflictTypes.length}
                            </span>
                          ) : null}
                        </td>
                        <td>{formatVarianceDays(item.varianceDays)}</td>
                        <td>{item.notes ?? '—'}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
            {filteredItems.length > ROWS_PER_PAGE ? (
              <div className="atom-table-pagination">
                <button
                  type="button"
                  onClick={() => setTablePage((page) => Math.max(1, page - 1))}
                  disabled={tablePage === 1}
                >
                  Previous
                </button>
                <span>
                  Page {tablePage} of {totalTablePages}
                </span>
                <button
                  type="button"
                  onClick={() => setTablePage((page) => Math.min(totalTablePages, page + 1))}
                  disabled={tablePage === totalTablePages}
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  )
}

export default AtomScheduleBoard
