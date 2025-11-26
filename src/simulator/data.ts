import vendorsData from '../data/rcc/vendors.json'
import lotsData from '../data/rcc/lots.json'
import type { Batch, BlockLiftCell, Pour, RawMaterialLot, Vendor } from '../types/simulator'

export const BLOCK_COUNT = 32
export const LIFT_COUNT = 6

const vendors = vendorsData as Vendor[]
const lots = lotsData as RawMaterialLot[]

const pick = <T,>(items: T[], count: number): T[] => {
  const shuffled = [...items].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

const randomBetween = (min: number, max: number, precision = 1) => {
  const value = Math.random() * (max - min) + min
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

const createBatchId = (idx: number) => `B-2025-${117 + idx}`

export function createMockBatches(count = 5): Batch[] {
  return Array.from({ length: count }).map((_, idx) => {
    const selectedLots = pick(lots, 4)
    const vendorMix = Array.from(new Set(selectedLots.map((lot) => lot.vendor_id)))
    return {
      id: createBatchId(idx),
      lots: selectedLots.map((lot) => lot.id),
      vendorMix,
      started_at: new Date(Date.now() - idx * 36 * 60 * 1000).toISOString(),
      status: 'pending',
      mixing_time_sec: Math.round(randomBetween(70, 165, 0)),
      fine_agg_moisture_pct: randomBetween(4.1, 6.4, 1),
      batch_temp_c: randomBetween(6, 11, 1),
    }
  })
}

export function createBlockMatrix(): BlockLiftCell[] {
  const cells: BlockLiftCell[] = []
  for (let block = 1; block <= BLOCK_COUNT; block += 1) {
    for (let lift = 1; lift <= LIFT_COUNT; lift += 1) {
      cells.push({
        id: `B${block}-L${lift}`,
        block,
        lift,
        status: lift === 1 && block === 1 ? 'in_progress' : 'pending',
        approved: false,
        readyAt: null,
      })
    }
  }
  return cells
}

let pourIncrement = 1700

export function createPourForCell(cell: BlockLiftCell, batch: Batch): Pour {
  pourIncrement += 1
  const base = Date.now()
  return {
    id: `P-${pourIncrement}`,
    block: cell.block,
    lift: cell.lift,
    batch_id: batch.id,
    started_at: new Date(base).toISOString(),
    pour_temp_c: randomBetween(6, 13, 1),
    slump_mm: randomBetween(25, 60, 0),
    wet_density_kg_m3: randomBetween(2595, 2630, 0),
    air_content_pct: randomBetween(1.2, 2.4, 1),
    conveyor_speed_m_s: randomBetween(2.4, 4.8, 1),
    transport_speed_km_hr: randomBetween(1.4, 2.1, 1),
    lift_depth_m: randomBetween(1.6, 2.4, 1),
    time_between_lifts_hr: randomBetween(76, 120, 0),
  }
}

export function getVendors(): Vendor[] {
  return vendors
}

export function getLots(): RawMaterialLot[] {
  return lots
}
