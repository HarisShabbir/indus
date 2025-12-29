import { LIFT_COUNT } from '../simulator/data'

export const RCC_BASE_ELEVATION_M = 950
export const RCC_DESIGN_LIFT_DEPTH_M = 2.1
export const RCC_CELL_VOLUME_M3 = 520
export const RCC_BLOCK_FOOTPRINT_M2 = RCC_CELL_VOLUME_M3 / RCC_DESIGN_LIFT_DEPTH_M
export const RCC_CREST_ELEVATION_M = RCC_BASE_ELEVATION_M + LIFT_COUNT * RCC_DESIGN_LIFT_DEPTH_M

export const getLiftElevationRange = (lift: number, depth: number) => {
  const safeDepth = Math.max(0, depth)
  const bottom = RCC_BASE_ELEVATION_M + (lift - 1) * RCC_DESIGN_LIFT_DEPTH_M
  const top = Math.min(bottom + safeDepth, RCC_CREST_ELEVATION_M)
  return { bottom, top }
}

export const getPourVolumeEstimate = (depth: number) => Math.max(0, depth) * RCC_BLOCK_FOOTPRINT_M2
