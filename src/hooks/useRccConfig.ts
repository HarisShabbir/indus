import { useQuery } from '@tanstack/react-query'
import rccDamConfig from '../data/rccDamConfig'

export type RccConfig = {
  project: {
    id: string
    name: string
    location: { lat: number; lon: number }
    elevation_base: number
  }
  blocks: number
  lifts_per_block: number
  max_lift_depth_m: number
  curing_days: Record<string, number>
  temp_limits: { min: number; max: number }
  ipc_rate_per_m3: number
  visualization: {
    rows: number
    cols: number
    spacing: number
    lift_height: number
    base_elevation: number
    crest_elevation: number
    block_labels?: string[]
    elevation_marks?: Array<{ label: string; value: number }>
    banks?: { left?: string; right?: string }
  }
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))

const FALLBACK_CONFIGS: Record<string, RccConfig> = {
  'mw01_main_dam': clone(rccDamConfig),
}

async function fetchConfig(slug: string): Promise<RccConfig> {
  try {
    const response = await fetch(`/config/${slug}.json`)
    if (!response.ok) {
      throw new Error(`Unable to load RCC configuration (${response.status})`)
    }
    return response.json()
  } catch (error) {
    const fallback = FALLBACK_CONFIGS[slug]
    if (fallback) {
      console.warn(`Using fallback RCC config for ${slug}:`, error)
      return clone(fallback)
    }
    throw error
  }
}

export function useRccConfig(projectFile = 'mw01_main_dam'): ReturnType<typeof useQuery<RccConfig, Error>> {
  return useQuery({
    queryKey: ['rcc-config', projectFile],
    queryFn: () => fetchConfig(projectFile),
    staleTime: 1000 * 60 * 5,
  })
}
