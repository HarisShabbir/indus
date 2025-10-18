import * as echarts from 'echarts/core'
import { scheduleTokens } from './tokens'

const palette = [
  scheduleTokens.colors.primary,
  scheduleTokens.colors.accent,
  '#7C3AED',
  '#0EA5E9',
  '#22D3EE',
  '#C084FC',
]

export const scheduleEChartsTheme = {
  color: palette,
  backgroundColor: 'transparent',
  textStyle: {
    color: scheduleTokens.colors.textPrimary,
  },
  title: {
    textStyle: {
      color: scheduleTokens.colors.textPrimary,
    },
    subtextStyle: {
      color: scheduleTokens.colors.textMuted,
    },
  },
  legend: {
    textStyle: {
      color: scheduleTokens.colors.textPrimary,
    },
  },
  tooltip: {
    backgroundColor: 'rgba(15,23,42,0.92)',
    borderColor: 'rgba(37,99,235,0.35)',
    textStyle: {
      color: scheduleTokens.colors.neutralHigh,
    },
  },
  gauge: {
    axisLine: {
      lineStyle: {
        width: 12,
        color: [
          [0.5, 'rgba(59,130,246,0.2)'],
          [0.9, scheduleTokens.gantt.monitoring],
          [1.0, scheduleTokens.colors.primary],
          [1.2, scheduleTokens.colors.accent],
        ],
      },
    },
    axisLabel: {
      color: scheduleTokens.colors.textMuted,
    },
    pointer: {
      itemStyle: {
        color: scheduleTokens.colors.accent,
      },
    },
    detail: {
      color: scheduleTokens.colors.textPrimary,
    },
  },
}

export const SCHEDULE_ECHARTS_THEME_NAME = 'schedule-theme'

let isRegistered = false

export const ensureScheduleTheme = () => {
  if (!isRegistered) {
    echarts.registerTheme(SCHEDULE_ECHARTS_THEME_NAME, scheduleEChartsTheme)
    isRegistered = true
  }
}
