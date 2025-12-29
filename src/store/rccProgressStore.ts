import { create } from 'zustand'
import type { RccBlockProgress } from '../types/rcc'

type RccProgressState = {
  blocks: RccBlockProgress[]
  highlighted: RccHighlight | null
  setBlocks: (blocks: RccBlockProgress[]) => void
  highlight: (payload: RccHighlight | null) => void
  upsertBlock: (block: RccBlockProgress) => void
  applyUpdates: (updates: RccBlockProgressPatch[]) => void
}

export type RccHighlight = {
  blockLabel: string
  blockNo: number
  liftNumber: number
  status: 'complete' | 'in-progress' | 'at-risk' | 'planned'
  elevation: number
  lat: number
  lon: number
  percent: number
}

export const useRccProgressStore = create<RccProgressState>((set) => ({
  blocks: [],
  highlighted: null,
  setBlocks: (blocks) => set({ blocks }),
  highlight: (highlighted) => set({ highlighted }),
  upsertBlock: (block) =>
    set((state) => {
      const existingIndex = state.blocks.findIndex(
        (item) => item.sow_id === block.sow_id && item.block_no === block.block_no && item.lift_no === block.lift_no,
      )
      if (existingIndex === -1) {
        return { blocks: [...state.blocks, block] }
      }
      const next = state.blocks.slice()
      next[existingIndex] = block
      return { blocks: next }
    }),
  applyUpdates: (updates) =>
    set((state) => {
      if (!updates.length || !state.blocks.length) {
        return state
      }
      const indexLookup = new Map<string, number>()
      state.blocks.forEach((item, idx) => {
        indexLookup.set(`${item.sow_id}:${item.block_no}:${item.lift_no}`, idx)
      })
      const next = state.blocks.slice()
      let changed = false
      updates.forEach((patch) => {
        const key = `${patch.sow_id}:${patch.block_no}:${patch.lift_no}`
        const idx = indexLookup.get(key)
        if (idx === undefined) return
        const current = next[idx]
        const updated = {
          ...current,
          status: patch.status ?? current.status,
          percent_complete: patch.percent_complete ?? current.percent_complete,
          temperature: patch.temperature ?? current.temperature,
          observed_at: patch.observed_at ?? current.observed_at,
          metadata: patch.metadata ?? current.metadata,
        }
        if (
          updated.status !== current.status ||
          updated.percent_complete !== current.percent_complete ||
          updated.temperature !== current.temperature ||
          (patch.metadata && JSON.stringify(patch.metadata) !== JSON.stringify(current.metadata ?? {}))
        ) {
          next[idx] = updated
          changed = true
        }
      })
      if (!changed) return state
      return { blocks: next }
    }),
}))

type RccBlockProgressPatch = {
  sow_id: string
  block_no: number
  lift_no: number
  status?: string
  percent_complete?: number
  temperature?: number | null
  observed_at?: string | null
  metadata?: Record<string, unknown>
}
