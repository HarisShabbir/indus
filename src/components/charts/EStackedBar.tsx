import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'

import { useChartTheme } from './useChartTheme'

type Props = {
  categories: string[]
  actual: Array<number | null>
  planned: Array<number | null>
  height?: number
  loading?: boolean
  actualLabel?: string
  plannedLabel?: string
  valueFormatter?: (value: number) => string
}

const defaultFormatter = (value: number) => `${value.toFixed(1)}%`

export function EStackedBar({
  categories,
  actual,
  planned,
  height = 220,
  loading = false,
  actualLabel = 'Actual',
  plannedLabel = 'Planned',
  valueFormatter = defaultFormatter,
}: Props) {
  const palette = useChartTheme()

  const option = useMemo(() => {
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          if (!Array.isArray(params)) {
            return ''
          }
          const plannedPoint = params.find((item) => item.seriesName === plannedLabel)
          const actualPoint = params.find((item) => item.seriesName === actualLabel)
          const plannedValue = Number(plannedPoint?.data ?? 0)
          const actualValue = Number(actualPoint?.data ?? 0)
          const variance = actualValue - plannedValue
          const formattedPlanned = valueFormatter(plannedValue)
          const formattedActual = valueFormatter(actualValue)
          const formattedVariance = valueFormatter(variance)
          const varianceLabel = variance >= 0 ? '▲' : '▼'
          return `
            <div>
              <div>${params[0]?.axisValueLabel ?? ''}</div>
              <div>${actualLabel}: <strong>${formattedActual}</strong></div>
              <div>${plannedLabel}: <span>${formattedPlanned}</span></div>
              <div>Variance: <span>${varianceLabel} ${formattedVariance}</span></div>
            </div>
          `
        },
      },
      legend: {
        top: 6,
        left: 'center',
        textStyle: { color: palette.subtleText },
      },
      grid: { left: 16, right: 16, top: 48, bottom: 32, containLabel: true },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: { color: palette.subtleText },
        axisLine: { lineStyle: { color: palette.grid } },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: palette.subtleText,
          formatter: (value: number) => valueFormatter(Number(value)),
        },
        splitLine: { show: true, lineStyle: { color: palette.grid, type: 'dashed' } },
      },
      series: [
        {
          name: plannedLabel,
          type: 'bar',
          stack: 'total',
          barMaxWidth: 36,
          emphasis: { focus: 'series' },
          itemStyle: { color: palette.planned },
          data: planned,
        },
        {
          name: actualLabel,
          type: 'bar',
          stack: 'total',
          barMaxWidth: 36,
          emphasis: { focus: 'series' },
          itemStyle: { color: palette.actual },
          data: actual,
        },
      ],
    }
  }, [categories, actual, planned, palette, actualLabel, plannedLabel, valueFormatter])

  return <ReactECharts style={{ height }} option={option} notMerge lazyUpdate showLoading={loading} />
}

export default EStackedBar
