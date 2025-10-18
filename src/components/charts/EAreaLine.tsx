import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts'

import { useChartTheme } from './useChartTheme'

type Props = {
  dates: string[]
  actual: Array<number | null>
  planned: Array<number | null>
  height?: number
  loading?: boolean
  actualLabel?: string
  plannedLabel?: string
  valueFormatter?: (value: number) => string
}

const defaultFormatter = (value: number) => `${value.toFixed(1)}%`

export function EAreaLine({
  dates,
  actual,
  planned,
  height = 240,
  loading = false,
  actualLabel = 'Actual',
  plannedLabel = 'Planned',
  valueFormatter = defaultFormatter,
}: Props) {
  const palette = useChartTheme()

  const option = useMemo(() => {
    const gradient = new echarts.graphic.LinearGradient(0, 0, 0, 1, [
      { offset: 0, color: `${palette.actual}99` },
      { offset: 1, color: `${palette.actual}1a` },
    ])
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        className: 'echarts-tooltip',
        valueFormatter,
        axisPointer: { type: 'line' },
      },
      legend: {
        top: 6,
        left: 'center',
        textStyle: { color: palette.subtleText },
      },
      grid: { left: 16, right: 16, top: 48, bottom: 32, containLabel: true },
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLine: { lineStyle: { color: palette.grid } },
        axisLabel: { color: palette.subtleText },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: {
          color: palette.subtleText,
          formatter: (value: number) => valueFormatter(Number(value)),
        },
        splitLine: { show: true, lineStyle: { color: palette.grid, type: 'dashed' } },
      },
      series: [
        {
          name: actualLabel,
          type: 'line',
          data: actual,
          smooth: true,
          showSymbol: false,
          lineStyle: { color: palette.actual, width: 3 },
          itemStyle: { color: palette.actual },
          areaStyle: { color: gradient },
          emphasis: { focus: 'series' },
        },
        {
          name: plannedLabel,
          type: 'line',
          data: planned,
          smooth: true,
          showSymbol: false,
          lineStyle: { color: palette.plannedLine, width: 2, type: 'dashed' },
          itemStyle: { color: palette.plannedLine },
        },
      ],
    }
  }, [dates, actual, planned, palette, actualLabel, plannedLabel, valueFormatter])

  return <ReactECharts style={{ height }} option={option} notMerge lazyUpdate showLoading={loading} />
}

export default EAreaLine
