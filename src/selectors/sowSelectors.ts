import { SOWItem, WorkStream } from '../data/seedSOW'

export type SOWFilters = {
  contractId: 'ALL' | string
  timeRange: '30' | '60' | '90' | 'ALL'
  workStreams: WorkStream[]
}

const DAY_MS = 24 * 60 * 60 * 1000

export function filterSOW(items: SOWItem[], filters: SOWFilters): SOWItem[] {
  const { contractId, timeRange, workStreams } = filters
  const maxDate = items.reduce((max, item) => {
    const ts = Date.parse(item.date)
    return ts > max ? ts : max
  }, 0)

  const windowMs =
    timeRange === 'ALL'
      ? Infinity
      : parseInt(timeRange, 10) * DAY_MS

  return items.filter((item) => {
    if (contractId !== 'ALL' && item.contractId !== contractId) return false
    if (workStreams.length && !workStreams.includes(item.workStream)) return false
    if (windowMs !== Infinity) {
      const delta = maxDate - Date.parse(item.date)
      if (delta > windowMs) return false
    }
    return true
  })
}

export function computeTotals(items: SOWItem[]) {
  return items.reduce(
    (acc, item) => {
      acc.plannedQty += item.plannedQty
      acc.actualQty += item.actualQty
      acc.plannedValue += item.plannedValue ?? 0
      acc.actualValue += item.actualValue ?? 0
      return acc
    },
    { plannedQty: 0, actualQty: 0, plannedValue: 0, actualValue: 0 },
  )
}

export type ComponentAggregation = {
  key: string
  contractId: string
  workStream: WorkStream
  component: string
  plannedQty: number
  actualQty: number
  unit: string
  status: string
  trend: Array<{ date: string; actualQty: number }>
}

export function groupByComponent(items: SOWItem[]): ComponentAggregation[] {
  const map = new Map<string, ComponentAggregation>()
  items.forEach((item) => {
    const key = `${item.contractId}-${item.component}`
    const agg = map.get(key)
    const entry = { date: item.date, actualQty: item.actualQty }
    if (agg) {
      agg.plannedQty += item.plannedQty
      agg.actualQty += item.actualQty
      agg.status = item.status
      agg.trend.push(entry)
    } else {
      map.set(key, {
        key,
        contractId: item.contractId,
        workStream: item.workStream,
        component: item.component,
        plannedQty: item.plannedQty,
        actualQty: item.actualQty,
        unit: item.unit,
        status: item.status,
        trend: [entry],
      })
    }
  })

  return Array.from(map.values()).map((item) => ({
    ...item,
    trend: item.trend.sort((a, b) => Date.parse(a.date) - Date.parse(b.date)),
  }))
}

export type QualityAggregation = {
  ncrOpen: number
  ncrClosed: number
  qaorSeries: Array<{ date: string; score: number }>
  toleranceRatio: number
}

export function computeQuality(items: SOWItem[]): QualityAggregation {
  let ncrOpen = 0
  let ncrClosed = 0
  const qaorSeries: Array<{ date: string; score: number }> = []
  let toleranceTotal = 0
  let toleranceOk = 0

  items.forEach((item) => {
    if (item.quality) {
      ncrOpen += item.quality.ncrOpen
      ncrClosed += item.quality.ncrClosed
      if (typeof item.quality.qaorScore === 'number') {
        qaorSeries.push({ date: item.date, score: item.quality.qaorScore })
      }
      toleranceTotal += 1
      if (item.quality.toleranceOK) toleranceOk += 1
    }
  })

  qaorSeries.sort((a, b) => Date.parse(a.date) - Date.parse(b.date))

  return {
    ncrOpen,
    ncrClosed,
    qaorSeries,
    toleranceRatio: toleranceTotal === 0 ? 0 : toleranceOk / toleranceTotal,
  }
}

export type SpiAggregation = {
  series: Array<{ date: string; value: number }>
  current: number
  burnRateDays: number
  runwayDays: number
  cashDelta: number
}

export function computeSPI(items: SOWItem[]): SpiAggregation {
  const byDate = new Map<string, { ev: number; pv: number }>()
  items.forEach((item) => {
    const bucket = byDate.get(item.date) ?? { ev: 0, pv: 0 }
    const actual = item.actualValue ?? item.actualQty
    const planned = item.plannedValue ?? item.plannedQty
    bucket.ev += actual
    bucket.pv += planned
    byDate.set(item.date, bucket)
  })

  const series = Array.from(byDate.entries())
    .map(([date, values]) => ({
      date,
      value: values.pv === 0 ? 0 : values.ev / values.pv,
    }))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))

  const current = series.length ? series[series.length - 1].value : 0

  return {
    series,
    current,
    burnRateDays: Math.max(30 - Math.round(current * 10), 5),
    runwayDays: Math.max(45 - Math.round(current * 12), 7),
    cashDelta: Math.round((current - 1) * 500000),
  }
}

export function getAvailableContracts(items: SOWItem[]): string[] {
  return Array.from(new Set(items.map((item) => item.contractId))).sort()
}

export function getAvailableWorkStreams(items: SOWItem[]): WorkStream[] {
  return Array.from(new Set(items.map((item) => item.workStream))) as WorkStream[]
}
