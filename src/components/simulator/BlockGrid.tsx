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
}

const matchesFilter = (cell: BlockLiftCell, filter: CellFilter) => {
  if (filter === 'all') return true
  if (filter === 'completed') return cell.status === 'approved'
  if (filter === 'approved') return cell.status === 'approved' || (cell.status === 'awaiting' && cell.approved)
  return cell.status === filter
}

export function BlockGrid({ blocks, activeId, highlightedId, filter = 'all', onSelect }: BlockGridProps) {
  const ordered = useMemo(() => [...blocks].sort((a, b) => (a.block === b.block ? a.lift - b.lift : a.block - b.block)), [blocks])
  return (
    <div className="block-grid-shell">
      <div className="block-grid" role="grid" aria-label="Blocks and lifts">
        {ordered.map((cell) => {
          const cellId = `B${cell.block}-L${cell.lift}`
          const status = cell.status
          const isActive = activeId === cell.id
          const highlighted = highlightedId === cell.id
          const dimmed = !matchesFilter(cell, filter)
          return (
            <button
              key={cell.id}
              type="button"
              className={`block-cell ${status} ${isActive ? 'active' : ''} ${highlighted ? 'highlighted' : ''} ${dimmed ? 'dimmed' : ''}`}
              title={`${cellId}`}
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
