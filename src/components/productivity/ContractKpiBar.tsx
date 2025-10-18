import React, { useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'

import { fetchContractKpiLatestDetailed } from '../../api'

type MetricCode = string

const METRIC_LABELS: Record<MetricCode, string> = {
  ev: 'Earned Value',
  pv: 'Planned Value',
  ac: 'Actual Cost',
  cpi: 'CPI',
  schedule_progress_pct: 'Schedule Progress %',
  spi: 'SPI',
  prod_actual_pct: 'Actual %',
  prod_planned_pct: 'Planned %',
}

type ContractKpiBarProps = {
  contractId?: string | null
  metrics?: MetricCode[]
  height?: number
}

export function ContractKpiBar({ contractId, metrics = ['ev', 'pv', 'ac'], height = 240 }: ContractKpiBarProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [values, setValues] = useState<Record<MetricCode, number | null>>({})
  const metricsKey = useMemo(() => metrics.join('|'), [metrics])

  useEffect(() => {
    if (!contractId) {
      setValues({})
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchContractKpiLatestDetailed(contractId)
      .then((payload) => {
        if (cancelled) return
        const next: Record<MetricCode, number | null> = {}
        metrics.forEach((metric) => {
          const point = payload.metrics ? payload.metrics[metric] : undefined
          next[metric] = point?.actual ?? null
        })
        setValues(next)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message || 'Failed to load KPI data')
        setValues({})
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [contractId, metricsKey])

  const hasData = useMemo(
    () =>
      metrics.some((metric) => {
        if (!(metric in values)) return false
        const val = values[metric]
        return val !== null && val !== undefined && !Number.isNaN(val)
      }),
    [metrics, values],
  )

  const option = useMemo(() => {
    const categories = metrics.map((metric) => METRIC_LABELS[metric] ?? metric)
    const actualSeries = metrics.map((metric) => {
      const val = values[metric]
      if (val === null || val === undefined) return 0
      if (Number.isNaN(val)) return 0
      return Number(val.toFixed(2))
    })

    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 24, right: 16, top: 24, bottom: 28 },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: { interval: 0, rotate: categories.length > 4 ? 20 : 0 },
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: '{value}' },
        splitLine: { show: true, lineStyle: { type: 'dashed', opacity: 0.3 } },
      },
      series: [
        {
          name: 'Actual',
          type: 'bar',
          data: actualSeries,
          itemStyle: {
            borderRadius: [6, 6, 0, 0],
            color: '#38bdf8',
          },
        },
      ],
    }
  }, [metrics, values])

  if (!contractId) {
    return <span className="kpi-note">Select a contract to view KPIs.</span>
  }

  if (loading && !hasData) {
    return <div className="kpi-bar--loading">Loading KPIs…</div>
  }

  if (error && !hasData) {
    return <div className="kpi-bar--error">{error}</div>
  }

  if (!hasData) {
    return <div className="kpi-bar--empty">No KPI data available yet.</div>
  }

  return (
    <div className="kpi-bar">
      <ReactECharts style={{ height }} option={option} />
      {error && <div className="kpi-bar--error tiny">{error}</div>}
    </div>
  )
}

export default ContractKpiBar
