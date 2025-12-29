import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts'

import { useChartTheme } from './useChartTheme'

type SankeyNode = {
  id: string
  label: string
  type: string
}

type SankeyLink = {
  source: string
  target: string
  value: number
}

type Props = {
  nodes: SankeyNode[]
  links: SankeyLink[]
  height?: number
  loading?: boolean
}

const NODE_COLORS: Record<string, string> = {
  project: '#2563eb',
  contract: '#22c55e',
  inflow: '#38bdf8',
  inflow_expected: '#c084fc',
  outflow: '#fb923c',
  outflow_expected: '#facc15',
}

function mapNode(node: SankeyNode, palette: ReturnType<typeof useChartTheme>) {
  const baseColor = NODE_COLORS[node.type] ?? palette.actual
  return {
    name: node.id,
    value: 0,
    label: {
      show: true,
      formatter: node.label,
      color: palette.text,
    },
    itemStyle: {
      color: baseColor,
    },
  }
}

export function ESankey({ nodes, links, height = 320, loading = false }: Props) {
  const palette = useChartTheme()

  const option = useMemo(() => {
    const nodeData = nodes.map((node) => mapNode(node, palette))
    const linkData = links.map((link) => ({
      source: link.source,
      target: link.target,
      value: link.value,
    }))

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: (params: { data?: { name?: string; value?: number } }) => {
          const name = params?.data?.name
          const value = params?.data?.value
          if (typeof value === 'number') {
            return `${name ?? ''}: ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
          }
          return name ?? ''
        },
        className: 'echarts-tooltip',
      },
      animation: true,
      animationDuration: 800,
      animationEasing: 'quarticOut',
      series: [
        {
          type: 'sankey',
          data: nodeData,
          links: linkData,
          left: '3%',
          right: '20%',
          top: '10%',
          bottom: '10%',
          emphasis: { focus: 'adjacency' },
          nodeAlign: 'left',
          draggable: false,
          nodeGap: 18,
          nodeWidth: 18,
          lineStyle: {
            color: 'source',
            opacity: 0.65,
            curveness: 0.45,
          },
          label: {
            fontFamily: 'Inter, system-ui, sans-serif',
            color: palette.text,
            fontSize: 12,
            formatter: (params: { data?: { name?: string } }) => {
              if (!params?.data?.name) return ''
              const node = nodes.find((n) => n.id === params.data?.name)
              return node?.label ?? params.data?.name
            },
          },
          tooltip: {
            valueFormatter: (value: number) => `$${(value / 1_000_000).toFixed(1)}M`,
          },
          itemStyle: {
            borderColor: '#0f172a33',
            borderWidth: 1,
          },
          levels: [
            {
              depth: 0,
              itemStyle: { color: '#38bdf8' },
              lineStyle: { color: '#38bdf8' },
            },
            {
              depth: 1,
              itemStyle: { color: '#3b82f6' },
              lineStyle: { color: '#3b82f6' },
            },
            {
              depth: 2,
              itemStyle: { color: '#10b981' },
              lineStyle: { color: '#10b981' },
            },
            {
              depth: 3,
              itemStyle: { color: '#fb923c' },
              lineStyle: { color: '#fb923c' },
            },
          ],
        },
      ],
    }
  }, [links, nodes, palette])

  return <ReactECharts option={option} style={{ height }} notMerge lazyUpdate showLoading={loading} />
}

export default ESankey
