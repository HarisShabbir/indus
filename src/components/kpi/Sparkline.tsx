import React from 'react'
import ReactEChartsCore from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { ensureScheduleTheme, SCHEDULE_ECHARTS_THEME_NAME } from '../../theme/echartsTheme'
import { scheduleTokens } from '../../theme/tokens'

type SparklinePoint = {
  date: string
  spi: number | null
}

type SparklineProps = {
  title: string
  points: SparklinePoint[]
}

export function Sparkline({ title, points }: SparklineProps) {
  ensureScheduleTheme()
  const dates = points.map((point) => point.date)
  const values = points.map((point) => (typeof point.spi === 'number' ? Number(point.spi.toFixed(3)) : null))

  const option: EChartsOption = {
    grid: { left: 0, right: 0, top: 8, bottom: 0 },
    xAxis: {
      type: 'category',
      data: dates,
      boundaryGap: false,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false },
      min: (value) => value.min - 0.1,
      max: (value) => value.max + 0.1,
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const [{ value, axisValue }] = params
        if (value === null || value === undefined) return axisValue
        return `${axisValue}<br/>SPI ${value}`
      },
    },
    series: [
      {
        data: values,
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: scheduleTokens.colors.accent,
        },
        lineStyle: {
          width: 2,
          color: scheduleTokens.colors.primary,
        },
        areaStyle: {
          color: 'rgba(37, 99, 235, 0.15)',
        },
      },
    ],
  }

  return (
    <div className="sparkline-card">
      <header>
        <span>{title}</span>
        <small>Recent SPI trajectory</small>
      </header>
      <ReactEChartsCore option={option} notMerge lazyUpdate theme={SCHEDULE_ECHARTS_THEME_NAME} style={{ height: 120 }} />
    </div>
  )
}

export default Sparkline
