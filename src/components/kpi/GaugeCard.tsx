import React from 'react'
import ReactEChartsCore from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { ensureScheduleTheme, SCHEDULE_ECHARTS_THEME_NAME } from '../../theme/echartsTheme'
import { scheduleTokens } from '../../theme/tokens'

type GaugeCardProps = {
  title: string
  value?: number | null
  min?: number
  max?: number
  unit?: string
  subtitle?: string
}

export function GaugeCard({ title, value, min = 0.5, max = 1.2, unit = '', subtitle }: GaugeCardProps) {
  ensureScheduleTheme()
  const safeValue = typeof value === 'number' ? value : null
  const option: EChartsOption = {
    series: [
      {
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min,
        max,
        radius: '100%',
        splitNumber: 5,
        axisLine: {
          lineStyle: {
            width: 14,
            color: [
              [(0.9 - min) / (max - min), 'rgba(59,130,246,0.2)'],
              [(1.0 - min) / (max - min), scheduleTokens.gantt.monitoring],
              [1, scheduleTokens.colors.primary],
            ],
          },
        },
        pointer: {
          length: '65%',
          width: 6,
        },
        itemStyle: {
          color: scheduleTokens.colors.accent,
        },
        axisTick: {
          distance: 0,
          length: 6,
          lineStyle: {
            color: 'rgba(148,163,184,0.45)',
          },
        },
        splitLine: {
          distance: 0,
          length: 12,
          lineStyle: {
            color: 'rgba(148,163,184,0.45)',
          },
        },
        axisLabel: {
          distance: 10,
          color: 'var(--text-muted)',
          fontSize: 10,
        },
        detail: {
          valueAnimation: true,
          formatter: safeValue !== null ? `{value}${unit}` : '--',
          color: 'var(--text-primary)',
          fontSize: 18,
          offsetCenter: [0, '40%'],
        },
        title: {
          show: false,
        },
        data: [{ value: safeValue ?? min }],
      },
    ],
  }

  return (
    <div className="gauge-card">
      <header>
        <span>{title}</span>
        {subtitle && <small>{subtitle}</small>}
      </header>
      <ReactEChartsCore option={option} theme={SCHEDULE_ECHARTS_THEME_NAME} notMerge lazyUpdate style={{ height: 160 }} />
    </div>
  )
}

export default GaugeCard
