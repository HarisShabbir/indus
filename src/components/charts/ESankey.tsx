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
  project: '#3b82f6',
  contract: '#10b981',
  inflow: '#38bdf8',
  inflow_expected: '#a855f7',
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
      lineStyle: {
        color: 'inherit',
        opacity: 0.5,
      },
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
      series: [
        {
          type: 'sankey',
          data: nodeData,
          links: linkData,
          emphasis: { focus: 'adjacency' },
          nodeAlign: 'justify',
          draggable: false,
          lineStyle: {
            color: 'gradient',
            opacity: 0.45,
            curveness: 0.5,
          },
          label: {
            fontFamily: 'Inter, system-ui, sans-serif',
            color: palette.text,
            fontSize: 12,
          },
        },
      ],
    }
  }, [links, nodes, palette])

  return <ReactECharts option={option} style={{ height }} notMerge lazyUpdate showLoading={loading} />
}

export default ESankey
