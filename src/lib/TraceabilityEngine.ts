import { createMockBatches, createPourForCell, getLots, getVendors } from '../simulator/data'
import type { Batch, BlockLiftCell, Pour, RawMaterialLot, TraceChain, Vendor } from '../types/simulator'

export class TraceabilityEngine {
  private vendors: Map<string, Vendor>
  private lots: Map<string, RawMaterialLot>
  private batches: Batch[]
  private pourAssignments = new Map<string, Pour>()
  private batchAssignments = new Map<string, Batch>()
  private nextBatch = 0

  constructor() {
    const vendorList = getVendors()
    const lotList = getLots()
    this.vendors = new Map(vendorList.map((vendor) => [vendor.id, vendor]))
    this.lots = new Map(lotList.map((lot) => [lot.id, lot]))
    this.batches = createMockBatches(5)
  }

  getActiveBatches() {
    return this.batches
  }

  assignPour(cell: BlockLiftCell) {
    const batch = this.pickBatch()
    const pour = createPourForCell(cell, batch)
    this.pourAssignments.set(cell.id, pour)
    this.batchAssignments.set(pour.id, batch)
    return { pour, batch }
  }

  getPour(cellId: string) {
    return this.pourAssignments.get(cellId)
  }

  getBatchForPour(pour: Pour) {
    return this.batchAssignments.get(pour.id) ?? this.batches[0]
  }

  buildTrace(pour: Pour, batch: Batch): TraceChain {
    const lot = this.resolveLot(batch)
    const vendor = lot ? this.vendors.get(lot.vendor_id)! : Array.from(this.vendors.values())[0]
    const blockLabel = `Block ${pour.block}, Lift ${pour.lift}`
    return { vendor, lot: lot ?? Array.from(this.lots.values())[0], batch, pour, blockLabel }
  }

  rotatePipeline() {
    const displaced = this.batches.shift()
    if (displaced) {
      displaced.status = 'pending'
      this.batches.push(displaced)
    }
  }

  private pickBatch() {
    const batch = this.batches[this.nextBatch % this.batches.length]
    this.nextBatch += 1
    return batch
  }

  private resolveLot(batch: Batch) {
    const firstLot = batch.lots[0]
    return firstLot ? this.lots.get(firstLot) ?? null : null
  }
}
