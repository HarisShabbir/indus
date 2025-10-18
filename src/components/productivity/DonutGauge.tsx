import React from 'react'
import ReactECharts from 'echarts-for-react'

export type DonutGaugeProps = {
  value: number
  label?: string
}

export function DonutGauge({ value, label }: DonutGaugeProps) {
  const percent = Math.round(value * 100)
  const option = {
    animation: true,
    series: [
      {
        type: 'pie',
        radius: ['60%', '80%'],
        avoidLabelOverlap: false,
        label: { show: false },
        data: [
          { value: percent, name: 'Within tolerance', itemStyle: { color: '#22c55e' } },
          { value: Math.max(0, 100 - percent), name: 'Out of tolerance', itemStyle: { color: '#e2e8f0' } },
        ],
      },
    ],
  }

  return (
    <div className="donut-gauge">
      <ReactECharts option={option} style={{ width: 80, height: 80 }} />
      <div className="donut-gauge__label">
        <strong>{percent}%</strong>
        {label && <span>{label}</span>}
      </div>
    </div>
  )
}
