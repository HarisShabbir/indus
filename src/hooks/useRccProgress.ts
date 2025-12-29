import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'

import { fetchRccBlockProgress } from '../api'
import { API_URL } from '../config'
import type { RccBlockProgress } from '../types/rcc'
import { useRccProgressStore } from '../store/rccProgressStore'
import { RCC_BLOCK_PROGRESS_FALLBACK } from '../data/rccBlockProgressFallback'

export function useRccProgress(sowId: string) {
  const setBlocks = useRccProgressStore((state) => state.setBlocks)
  const upsertBlock = useRccProgressStore((state) => state.upsertBlock)
  const blocks = useRccProgressStore((state) => state.blocks)

  const { error, isLoading, refetch } = useQuery<RccBlockProgress[], Error>({
    queryKey: ['rcc-progress', sowId],
    queryFn: async () => {
      try {
        return await fetchRccBlockProgress(sowId)
      } catch (err) {
        console.warn(`Using fallback RCC block progress for ${sowId}:`, err)
        return RCC_BLOCK_PROGRESS_FALLBACK
      }
    },
    refetchInterval: 1000 * 60 * 5,
    onSuccess: (payload) => setBlocks(payload),
  })

  useEffect(() => {
    const apiUrl = new URL(API_URL)
    const protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(`${protocol}//${apiUrl.host}/api/rcc/ws/progress?sowId=${encodeURIComponent(sowId)}`)
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload.event === 'progress_update') {
          if (!payload.sowId || payload.sowId === sowId) {
            upsertBlock(payload.payload as RccBlockProgress)
          }
        }
      } catch (err) {
        console.warn('Unable to parse RCC progress event', err)
      }
    }
    return () => socket.close()
  }, [sowId, upsertBlock])

  return {
    blocks,
    error,
    isLoading,
    refresh: refetch,
  }
}
