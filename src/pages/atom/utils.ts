export const formatNumber = (value: number) =>
  value >= 10_000 ? `${Math.round(value / 1000)}k` : value.toLocaleString(undefined, { maximumFractionDigits: 0 })

export const formatPercent = (value: number | null) =>
  value == null ? '--' : `${Math.round(Math.min(Math.max(value * 100, 0), 9999))}%`

export const formatCurrency = (value: number | null | undefined, fractionDigits = 0) => {
  if (value == null || Number.isNaN(value)) return '--'
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000_000) {
    return `${sign}$${(abs / 1_000_000_000).toFixed(Math.max(1, fractionDigits))}B`
  }
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(Math.max(1, fractionDigits))}M`
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(Math.max(1, fractionDigits))}K`
  }
  return `${sign}$${abs.toFixed(fractionDigits)}`
}

export const formatShortDate = (value: string) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export const formatHours = (value: number | null | undefined) => {
  if (value == null) return '--'
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k h`
  }
  return `${value.toFixed(1)} h`
}

export const formatDate = (value: string | Date | null | undefined) => {
  if (!value) return '--'
  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) return typeof value === 'string' ? value : '--'
  return parsed.toLocaleString()
}

export const ratio = (numerator: number, denominator: number) => {
  if (!denominator) return 0
  return Math.min(Math.max(numerator / denominator, 0), 1)
}

export const journeyStatusClass = (status?: string | null) => {
  const value = (status ?? '').toLowerCase()
  if (value.includes('engaged') || value.includes('active')) return 'status-pill--active'
  if (value.includes('complete')) return 'status-pill--completed'
  if (value.includes('idle')) return 'status-pill--planned'
  if (value.includes('transit') || value.includes('warehouse') || value.includes('on_site') || value.includes('planned'))
    return 'status-pill--planned'
  return 'status-pill--planned'
}
