import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'

import { useChartTheme } from './useChartTheme'

type Thresholds = {
  danger: number
  warning: number
}

type Props = {
  value: number | null | undefined
  min?: number
  max?: number
  title?: string
  unit?: string
  height?: number
  loading?: boolean
  thresholds?: Thresholds
  decimals?: number
}

const defaultThresholds: Thresholds = {
  danger: 0.95,
  warning: 0.99,
}

export function EDial({
  value,
  min = 0,
  max = 1.2,
  title,
  unit = '',
  height = 240,
  loading = false,
  thresholds = defaultThresholds,
  decimals = 2,
}: Props) {
  const palette = useChartTheme()
  const safeValue = typeof value === 'number' ? value : 0

  const clamped = Math.max(min, Math.min(max, safeValue))
  const formattedValue = `${clamped.toFixed(decimals)}${unit}`
  const { danger, warning } = thresholds

  const option = useMemo(() => {
    const dangerRatio = Math.max(0, Math.min(1, danger / max))
    const warningRatio = Math.max(dangerRatio, Math.min(1, warning / max))
    const gaugeColor: [number, string][] = [
      [dangerRatio, palette.danger],
      [warningRatio, palette.warning],
      [1, palette.success],
    ]
    const pointerColor = clamped < danger ? palette.danger : clamped < warning ? palette.warning : palette.success

    return {
      backgroundColor: 'transparent',
      title: title
        ? {
            text: title,
            left: 'center',
            top: 8,
            textStyle: { color: palette.text, fontSize: 14, fontWeight: 500 },
          }
        : undefined,
      tooltip: { show: false },
      series: [
        {
          type: 'gauge',
          startAngle: 210,
          endAngle: -30,
          min,
          max,
          progress: {
            show: true,
            width: 14,
            overlap: false,
          },
          axisLine: {
            lineStyle: {
              width: 14,
              color: gaugeColor,
            },
          },
          axisLabel: {
            color: palette.subtleText,
            distance: 12,
            fontSize: 11,
          },
          pointer: {
            show: true,
            length: '60%',
            width: 6,
            itemStyle: { color: pointerColor },
          },
          itemStyle: {
            color: pointerColor,
          },
          detail: {
            valueAnimation: true,
            fontSize: 20,
            fontWeight: 600,
            formatter: formattedValue,
            color: palette.text,
            offsetCenter: [0, '60%'],
          },
          data: [{ value: clamped }],
        },
      ],
    }
  }, [title, palette, danger, warning, max, min, clamped, formattedValue])

  return <ReactECharts style={{ height }} option={option} notMerge lazyUpdate showLoading={loading} />
}

export default EDial
