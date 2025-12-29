import React, { useMemo, useState } from 'react'

import type { AtomPaymentRecord, AtomPaymentResponse } from '../../../api'
import { formatCurrency, formatDate, formatNumber, formatPercent } from '../utils'

type StatusFilter = 'all' | 'paid' | 'pending' | 'overdue' | 'submitted'

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'paid', label: 'Paid' },
  { id: 'pending', label: 'Pending' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'submitted', label: 'Submitted' },
]

const normaliseStatus = (value?: string | null): StatusFilter => {
  const status = (value ?? '').toLowerCase()
  if (status.includes('paid') || status.includes('settled')) return 'paid'
  if (status.includes('overdue') || status.includes('late') || status.includes('due')) return 'overdue'
  if (status.includes('submit')) return 'submitted'
  if (status.includes('review')) return 'pending'
  if (status.includes('pending')) return 'pending'
  return 'pending'
}

const resolveStatusClass = (status: StatusFilter, record: AtomPaymentRecord): string => {
  switch (status) {
    case 'paid':
      return 'status-pill--completed'
    case 'overdue':
      return 'status-pill--delayed'
    case 'submitted':
      return 'status-pill--planned'
    case 'pending':
    default:
      if (isRecordOverdue(record)) return 'status-pill--delayed'
      return 'status-pill--in-progress'
  }
}

const formatVarianceDays = (value?: number | null): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '--'
  const rounded = Math.round(value * 10) / 10
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded.toFixed(1)}d`
}

const isRecordOverdue = (record: AtomPaymentRecord) => {
  if (!record.dueDate || record.status.toLowerCase().includes('paid')) return false
  const due = new Date(record.dueDate)
  if (Number.isNaN(due.getTime())) return false
  const today = new Date()
  return due < today
}

const formatCategoryLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

type AtomPaymentsBoardProps = {
  data: AtomPaymentResponse | null
  loading: boolean
  error: string | null
  categoryFilter: string | null
  onRefresh?: () => void
  refreshing?: boolean
}

const AtomPaymentsBoard: React.FC<AtomPaymentsBoardProps> = ({ data, loading, error, categoryFilter, onRefresh, refreshing }) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const filteredRecords = useMemo(() => {
    if (!data) return []
    return data.records.filter((record) => {
      const matchesCategory = !categoryFilter || record.category === categoryFilter
      const status = normaliseStatus(record.status)
      const matchesStatus =
        statusFilter === 'all' ||
        status === statusFilter ||
        (statusFilter === 'overdue' && isRecordOverdue(record)) ||
        (statusFilter === 'pending' && status === 'pending')
      return matchesCategory && matchesStatus
    })
  }, [data, categoryFilter, statusFilter])

  if (!data && !loading && !error) {
    return (
      <section className="atom-payments-board">
        <div className="atom-empty-state">
          <h3>Select a project scope</h3>
          <p>Pick a project context to surface atom payment performance.</p>
        </div>
      </section>
    )
  }

  const summary = data?.summary ?? null

  return (
    <section className="atom-payments-board">
      <header className="atom-payments-board__header">
        <div>
          <h3>Atom cost · payments</h3>
          {summary?.asOf ? <span>As of {formatDate(summary.asOf)}</span> : null}
        </div>
        <div className="atom-payments-board__actions">
          {error ? <span className="atom-error">{error}</span> : null}
          {onRefresh ? (
            <button type="button" className="atom-refresh" onClick={onRefresh} disabled={loading || refreshing}>
              {loading || refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          ) : null}
        </div>
      </header>

      {loading ? (
        <div className="atom-loading">Loading payment performance…</div>
      ) : (
        <>
          {summary ? (
            <div className="atom-payments-board__summary">
              <div className="atom-metric-card">
                <span>Total committed</span>
                <strong>{formatCurrency(summary.committed, 1)}</strong>
              </div>
              <div className="atom-metric-card">
                <span>Paid to date</span>
                <strong>{formatCurrency(summary.paid, 1)}</strong>
              </div>
              <div className="atom-metric-card">
                <span>Outstanding</span>
                <strong>{formatCurrency(summary.outstanding, 1)}</strong>
              </div>
              <div className="atom-metric-card">
                <span>Overdue invoices</span>
                <strong>{formatNumber(summary.overdueCount)}</strong>
              </div>
              <div className="atom-metric-card">
                <span>Pending approvals</span>
                <strong>{formatNumber(summary.pendingCount)}</strong>
              </div>
              <div className="atom-metric-card">
                <span>Avg. payment delta</span>
                <strong>
                  {summary.averagePaymentDays != null ? `${summary.averagePaymentDays >= 0 ? '+' : ''}${summary.averagePaymentDays.toFixed(1)}d` : '--'}
                </strong>
              </div>
              <div className="atom-metric-card">
                <span>Latest payment</span>
                <strong>{summary.latestPaymentDate ? formatDate(summary.latestPaymentDate) : '--'}</strong>
              </div>
              <div className="atom-metric-card">
                <span>Paid ratio</span>
                <strong>
                  {summary.committed > 0 ? formatPercent(summary.paid / summary.committed) : '--'}
                </strong>
              </div>
            </div>
          ) : null}

          {data?.categories?.length ? (
            <div className="atom-payments-board__categories">
              <h4>Category mix</h4>
              <div className="atom-payments-board__categories-grid">
                {data.categories.map((category) => (
                  <article key={`${category.category}-${category.label}`} className="atom-category-card">
                    <header>
                      <strong>{category.label}</strong>
                      <span>{formatCurrency(category.committed, 1)}</span>
                    </header>
                    <div className="atom-category-card__metrics">
                      <span>
                        Paid <strong>{formatCurrency(category.paid, 1)}</strong>
                      </span>
                      <span>
                        Outstanding <strong>{formatCurrency(category.outstanding, 1)}</strong>
                      </span>
                    </div>
                    <footer>
                      <span className="atom-category-card__overdue">
                        Overdue · {formatNumber(category.overdue)}
                      </span>
                    </footer>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          <div className="atom-board-filters">
            <div className="atom-chip-group" role="group" aria-label="Payment status filter">
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
            <table className="atom-payments-board__table">
              <thead>
                <tr>
                  <th scope="col">Milestone</th>
                  <th scope="col">Atom</th>
                  <th scope="col">Vendor</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col">Due date</th>
                  <th scope="col">Paid date</th>
                  <th scope="col">Variance</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <div className="atom-empty-row">No payment records match the current filters.</div>
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((record: AtomPaymentRecord) => {
                    const status = normaliseStatus(record.status)
                    return (
                      <tr key={record.paymentId}>
                        <td>
                          <strong>{record.paymentMilestone ?? '—'}</strong>
                          <em>{record.invoiceNumber ?? ''}</em>
                        </td>
                        <td>
                          <div className="atom-table-cell">
                            <span>{record.atomName}</span>
                            <em>{record.atomType}</em>
                          </div>
                        </td>
                        <td>{record.vendor ?? '—'}</td>
                        <td>{formatCurrency(record.amount, 1)}</td>
                        <td>
                          <span className={`status-pill ${resolveStatusClass(status, record)}`}>{record.status}</span>
                        </td>
                        <td>{record.dueDate ? formatDate(record.dueDate) : '--'}</td>
                        <td>{record.paidDate ? formatDate(record.paidDate) : '--'}</td>
                        <td>{formatVarianceDays(record.varianceDays)}</td>
                        <td>{record.notes ?? '—'}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

export default AtomPaymentsBoard
