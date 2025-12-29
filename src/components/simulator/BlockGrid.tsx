import React, { useMemo } from 'react'
import { Skull } from 'lucide-react'
import type { BlockLiftCell } from '../../../types/simulator'

type CellFilter = 'all' | 'completed' | 'in_progress' | 'awaiting' | 'alarm' | 'rejected' | 'approved'

type BlockGridProps = {
  blocks: BlockLiftCell[]
  activeId?: string | null
  highlightedId?: string | null
  filter?: CellFilter
  onSelect?: (cellId: string) => void
  blockSummaries?: Record<number, { planned_volume_m3: number; actual_volume_m3: number; percent_complete: number; status: string }>
  showHelper?: boolean
  highlightPredicate?: (cell: BlockLiftCell) => boolean
}

const matchesFilter = (cell: BlockLiftCell, filter: CellFilter) => {
  if (filter === 'all') return true
  if (filter === 'completed') return cell.status === 'approved'
  if (filter === 'approved') return cell.status === 'approved' || (cell.status === 'awaiting' && cell.approved)
  return cell.status === filter
}

export function BlockGrid({
  blocks,
  activeId,
  highlightedId,
  filter = 'all',
  onSelect,
  blockSummaries,
  showHelper = false,
  highlightPredicate,
}: BlockGridProps) {
  const ordered = useMemo(() => [...blocks].sort((a, b) => (a.block === b.block ? a.lift - b.lift : a.block - b.block)), [blocks])
  return (
    <div className="block-grid-shell">
      <div className="block-grid" role="grid" aria-label="Blocks and lifts">
        {ordered.map((cell) => {
          const cellId = `B${cell.block}-L${cell.lift}`
          const status = cell.status
          const isActive = activeId === cell.id
          const highlighted = highlightedId === cell.id
          const helperHighlight = showHelper && highlightPredicate?.(cell)
          const dimmed = !matchesFilter(cell, filter)
          const summary = blockSummaries?.[cell.block]
          const tooltip = summary
            ? `${cellId}\nPlanned: ${summary.planned_volume_m3.toLocaleString()} m³\nActual: ${summary.actual_volume_m3.toLocaleString()} m³\nComplete: ${summary.percent_complete.toFixed(1)}%\nStatus: ${summary.status}`
            : cellId
          return (
            <button
              key={cell.id}
              type="button"
              className={`block-cell ${status} ${isActive ? 'active' : ''} ${highlighted ? 'highlighted' : ''} ${helperHighlight ? 'helper' : ''} ${dimmed ? 'dimmed' : ''}`}
              title={tooltip}
              onClick={() => onSelect?.(cell.id)}
            >
              {status === 'rejected' ? <Skull size={12} /> : `${cell.lift}`}
            </button>
          )
        })}
      </div>
    </div>
  )
}
