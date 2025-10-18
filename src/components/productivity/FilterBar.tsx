import React from 'react'
import { WorkStream } from '../../data/seedSOW'

export type FilterState = {
  contractId: 'ALL' | string
  timeRange: '30' | '60' | '90' | 'ALL'
  workStreams: WorkStream[]
}

export type FilterBarProps = {
  contracts: string[]
  availableWorkStreams: WorkStream[]
  state: FilterState
  onChange: (next: FilterState) => void
}

const timeRanges: Array<{ label: string; value: FilterState['timeRange'] }> = [
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 60 days', value: '60' },
  { label: 'Last 90 days', value: '90' },
  { label: 'All', value: 'ALL' },
]

export function FilterBar({ contracts, availableWorkStreams, state, onChange }: FilterBarProps) {
  const toggleWorkStream = (workStream: WorkStream) => {
    const set = new Set(state.workStreams)
    if (set.has(workStream)) {
      set.delete(workStream)
    } else {
      set.add(workStream)
    }
    onChange({ ...state, workStreams: Array.from(set) })
  }

  return (
    <div className="productivity-filters">
      <label className="filter-column">
        <span>Contract</span>
        <select
          value={state.contractId}
          onChange={(event) =>
            onChange({ ...state, contractId: event.target.value as FilterState['contractId'] })
          }
        >
          <option value="ALL">All Contracts</option>
          {contracts.map((contractId) => (
            <option key={contractId} value={contractId}>
              {contractId}
            </option>
          ))}
        </select>
      </label>

      <label className="filter-column">
        <span>Time range</span>
        <select
          value={state.timeRange}
          onChange={(event) =>
            onChange({ ...state, timeRange: event.target.value as FilterState['timeRange'] })
          }
        >
          {timeRanges.map((range) => (
            <option key={range.value} value={range.value}>
              {range.label}
            </option>
          ))}
        </select>
      </label>

      <div className="filter-column">
        <span>Work streams</span>
        <div className="workstream-chips">
          {availableWorkStreams.map((workStream) => {
            const active = state.workStreams.includes(workStream)
            return (
              <button
                key={workStream}
                type="button"
                className={`workstream-chip ${active ? 'active' : ''}`}
                onClick={() => toggleWorkStream(workStream)}
              >
                {workStream}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
