import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'

import { useChartTheme } from './useChartTheme'

type Props = {
  title?: string
  open: number
  closed: number
  height?: number
  loading?: boolean
}

export function EDonut({ title, open, closed, height = 220, loading = false }: Props) {
  const palette = useChartTheme()
  const total = Math.max(open + closed, 0)
  const percentClosed = total === 0 ? 0 : (closed / total) * 100

  const option = useMemo(() => {
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
      tooltip: {
        trigger: 'item',
        formatter: ({ name, value, percent }: { name: string; value: number; percent: number }) =>
          `${name}: ${value} (${percent.toFixed(1)}%)`,
      },
      legend: {
        orient: 'vertical',
        right: 8,
        top: 'center',
        textStyle: { color: palette.subtleText },
        itemHeight: 10,
      },
      series: [
        {
          type: 'pie',
          radius: ['55%', '78%'],
          avoidLabelOverlap: true,
          label: {
            show: true,
            position: 'center',
            formatter: `${percentClosed.toFixed(1)}%\nClosed`,
            color: palette.text,
            fontSize: 16,
            fontWeight: 600,
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 18,
              fontWeight: 700,
            },
          },
          labelLine: { show: false },
          itemStyle: {
            borderRadius: 8,
            borderColor: palette.background,
            borderWidth: 2,
          },
          data: [
            { value: closed, name: 'Closed', itemStyle: { color: palette.success } },
            { value: open, name: 'Open', itemStyle: { color: palette.danger } },
          ],
        },
      ],
    }
  }, [title, open, closed, palette, percentClosed])

  return <ReactECharts style={{ height }} option={option} notMerge lazyUpdate showLoading={loading} />
}

export default EDonut
