import React from 'react'
import type { AtomExecutionMetric, AtomStatusTile, AtomTrendSeries } from '../../../api'

export function TrendSparkline({ series }: { series: AtomTrendSeries }) {
  if (!series.points.length) return null
  const values = series.points.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const normalized = series.points.map((point, index) => {
    const x = series.points.length === 1 ? 100 : (index / (series.points.length - 1)) * 100
    const y = 100 - ((point.value - min) / range) * 100
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  return (
    <div className="atom-experience-sparkline" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`sparkfill-${series.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(59,130,246,0.45)" />
            <stop offset="100%" stopColor="rgba(59,130,246,0)" />
          </linearGradient>
        </defs>
        <polyline points={`0,100 ${normalized.join(' ')} 100,100`} fill={`url(#sparkfill-${series.id})`} stroke="none" />
        <polyline points={normalized.join(' ')} fill="none" stroke="rgba(96,165,250,0.9)" strokeWidth={1.8} />
      </svg>
    </div>
  )
}

export function StatusTile({ tile }: { tile: AtomStatusTile }) {
  return (
    <article className={`atom-experience-tile atom-experience-tile--${tile.severity}`}>
      <header>
        <span>{tile.label}</span>
        {tile.change !== undefined && tile.change !== null ? (
          <small data-direction={tile.changeDirection}>
            {tile.change > 0 ? '+' : ''}
            {tile.change.toFixed(1)}
          </small>
        ) : null}
      </header>
      <strong>{tile.value}</strong>
      {tile.caption ? <p>{tile.caption}</p> : null}
    </article>
  )
}

export function MetricCard({ metric }: { metric: AtomExecutionMetric }) {
  const showChange = metric.change !== undefined && metric.change !== null && metric.change !== 0
  const directionLabel = metric.changeDirection === 'up' ? 'Increasing' : metric.changeDirection === 'down' ? 'Decreasing' : 'Flat'
  return (
    <article className="atom-experience-metric">
      <header>
        <span>{metric.label}</span>
        {showChange ? (
          <small data-direction={metric.changeDirection} aria-label={`${directionLabel} by ${metric.change}`}>
            {metric.changeDirection === 'up' ? '▲' : metric.changeDirection === 'down' ? '▼' : '—'} {metric.change?.toFixed(1)}
          </small>
        ) : null}
      </header>
      <strong>{metric.formatted}</strong>
      {metric.sparkline ? <TrendSparkline series={metric.sparkline} /> : null}
    </article>
  )
}
