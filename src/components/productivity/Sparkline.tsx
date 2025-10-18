import React from 'react'
import ReactECharts from 'echarts-for-react'

export type SparklineProps = {
  data: Array<{ date: string; value: number }>
  color?: string
}

export function Sparkline({ data, color = '#38bdf8' }: SparklineProps) {
  const option = {
    animation: true,
    grid: { left: 0, right: 0, top: 0, bottom: 0 },
    xAxis: {
      type: 'category',
      data: data.map((point) => point.date),
      show: false,
    },
    yAxis: {
      type: 'value',
      show: false,
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any[]) => {
        const item = params[0]
        return `${item.axisValue}<br/>${item.data}`
      },
    },
    series: [
      {
        type: 'line',
        data: data.map((point) => Number(point.value.toFixed(2))),
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        areaStyle: {
          color,
          opacity: 0.12,
        },
        lineStyle: {
          color,
          width: 2,
        },
        itemStyle: {
          color,
          borderWidth: 1,
          borderColor: '#fff',
        },
      },
    ],
  }

  return <ReactECharts option={option} style={{ width: '100%', height: 48 }} />
}
