import React, { useEffect, useMemo, useRef } from 'react'
import { Gantt, Task, ViewMode } from 'gantt-task-react'
import 'gantt-task-react/dist/index.css'
import ScheduleTaskListTable from './ScheduleTaskListTable'

export type ScheduleRowType = 'contract' | 'sow' | 'process'

export type ScheduleRow = {
  id: string
  entityId: string
  contractId: string
  contractRowId: string
  type: ScheduleRowType
  name: string
  start: string
  end: string
  percentComplete: number
  spi?: number | null
  cpi?: number | null
  parentId?: string | null
  status?: 'on-track' | 'monitoring' | 'risk'
  placeholder?: boolean
  dependencies?: string[]
}

export type ScheduleGanttProps = {
  rows: ScheduleRow[]
  expandedMap: Record<string, boolean>
  selectedId?: string | null
  onToggleRow?: (rowId: string) => void
  onSelect?: (row: ScheduleRow) => void
  onRangeChange?: (range: { start: Date; end: Date }) => void
}

type StatusKey = NonNullable<ScheduleRow['status']> | 'placeholder' | 'default'

type StatusPalette = {
  progress: string
  progressSelected: string
  background: string
  backgroundSelected: string
  labelTone: 'light' | 'dark'
}

type ScheduleTask = Task & {
  rawRow: ScheduleRow
  fullName: string
  statusKey: StatusKey
  labelTone: 'light' | 'dark'
}

const STATUS_STYLE_MAP: Record<StatusKey, StatusPalette> = {
  'on-track': {
    progress: 'var(--gantt-bar-on-track-progress)',
    progressSelected: 'var(--gantt-bar-on-track-progress-selected)',
    background: 'var(--gantt-bar-on-track-bg)',
    backgroundSelected: 'var(--gantt-bar-on-track-bg-selected)',
    labelTone: 'dark',
  },
  monitoring: {
    progress: 'var(--gantt-bar-monitoring-progress)',
    progressSelected: 'var(--gantt-bar-monitoring-progress-selected)',
    background: 'var(--gantt-bar-monitoring-bg)',
    backgroundSelected: 'var(--gantt-bar-monitoring-bg-selected)',
    labelTone: 'dark',
  },
  risk: {
    progress: 'var(--gantt-bar-risk-progress)',
    progressSelected: 'var(--gantt-bar-risk-progress-selected)',
    background: 'var(--gantt-bar-risk-bg)',
    backgroundSelected: 'var(--gantt-bar-risk-bg-selected)',
    labelTone: 'light',
  },
  placeholder: {
    progress: 'var(--gantt-bar-placeholder-progress)',
    progressSelected: 'var(--gantt-bar-placeholder-progress-selected)',
    background: 'var(--gantt-bar-placeholder-bg)',
    backgroundSelected: 'var(--gantt-bar-placeholder-bg-selected)',
    labelTone: 'dark',
  },
  default: {
    progress: 'var(--gantt-bar-default-progress)',
    progressSelected: 'var(--gantt-bar-default-progress-selected)',
    background: 'var(--gantt-bar-default-bg)',
    backgroundSelected: 'var(--gantt-bar-default-bg-selected)',
    labelTone: 'dark',
  },
}

const COLLAPSED_BG = 'var(--gantt-bar-collapsed-bg)'
const COLLAPSED_BG_SELECTED = 'var(--gantt-bar-collapsed-bg-selected)'

const clampProgress = (value: number | null | undefined): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  if (value > 1) return Math.min(100, Math.max(0, value))
  return Math.min(100, Math.max(0, Math.round(value * 100)))
}

const normalizeLabel = (value: string | null | undefined, fallback: string): string => {
  const trimmed = (value ?? '').trim()
  return trimmed.length ? trimmed : fallback
}

const ellipsize = (value: string, max = 36): string => {
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

function toTask(row: ScheduleRow, expanded: Record<string, boolean>, selectedId?: string | null): ScheduleTask {
  const start = new Date(row.start)
  const end = new Date(row.end)
  const progress = clampProgress(row.percentComplete)
  const isSow = row.type === 'sow'
  const isContract = row.type === 'contract'
  const statusKey: StatusKey = row.placeholder ? 'placeholder' : row.status ?? 'on-track'
  const palette = STATUS_STYLE_MAP[statusKey] ?? STATUS_STYLE_MAP.default
  const isSelected = selectedId === row.id
  const isCollapsibleParent = isContract || isSow
  const isCollapsed = isCollapsibleParent && !expanded[row.id]
  const baseBackground = isCollapsed ? COLLAPSED_BG : palette.background
  const baseSelectedBackground = isCollapsed ? COLLAPSED_BG_SELECTED : palette.backgroundSelected
  const baseProgress = row.placeholder ? STATUS_STYLE_MAP.placeholder.progress : palette.progress
  const baseProgressSelected = row.placeholder ? STATUS_STYLE_MAP.placeholder.progressSelected : palette.progressSelected
  const fullName = normalizeLabel(row.name, row.type === 'contract' ? 'Unnamed contract' : 'Untitled task')
  const labelLength = row.type === 'process' ? 28 : row.type === 'sow' ? 34 : 42
  const displayName = ellipsize(fullName, labelLength)
  const dependencies = (row.dependencies ?? []).filter(Boolean)
  const labelTone = isCollapsed ? 'light' : palette.labelTone

  const ganttTask: ScheduleTask = {
    id: row.id,
    type: isSow || isContract ? 'project' : 'task',
    name: displayName,
    start,
    end,
    progress,
    project: row.parentId ?? undefined,
    hideChildren: isCollapsibleParent && !expanded[row.id],
    isDisabled: true,
    dependencies: dependencies.length ? dependencies : undefined,
    styles: {
      progressColor: isSelected ? baseProgressSelected : baseProgress,
      progressSelectedColor: baseProgressSelected,
      backgroundColor: isSelected ? baseSelectedBackground : baseBackground,
      backgroundSelectedColor: baseSelectedBackground,
    },
    rawRow: row,
    fullName,
    statusKey,
    labelTone,
  }

  return ganttTask
}

export function ScheduleGantt({ rows, expandedMap, selectedId, onToggleRow, onSelect, onRangeChange }: ScheduleGanttProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      if (row.type === 'sow') {
        return expandedMap[row.contractRowId] ?? false
      }
      if (row.type === 'process') {
        const sowVisible = row.parentId ? expandedMap[row.parentId] : false
        const contractVisible = expandedMap[row.contractRowId] ?? false
        return sowVisible && contractVisible
      }
      return true
    })
  }, [rows, expandedMap])

  const tasks = useMemo(
    () => visibleRows.map((row) => toTask(row, expandedMap, selectedId)),
    [visibleRows, expandedMap, selectedId],
  )

  const dependencyPairs = useMemo(() => {
    if (!tasks.length) return []

    const childrenMap = new Map<string, ScheduleTask[]>()
    tasks.forEach((task) => {
      childrenMap.set(task.id, [])
    })

    tasks.forEach((task) => {
      const deps = task.dependencies ?? []
      deps.forEach((dependencyId) => {
        const bucket = childrenMap.get(dependencyId)
        if (bucket) {
          bucket.push(task)
        }
      })
    })

    const pairs: Array<{ from: string; to: string }> = []
    tasks.forEach((task) => {
      const children = childrenMap.get(task.id)
      if (!children || !children.length) return
      children.forEach((child) => {
        pairs.push({ from: task.id, to: child.id })
      })
    })

    return pairs
  }, [tasks])

  useEffect(() => {
    if (tasks.length && onRangeChange) {
      const start = tasks.reduce((min, task) => (task.start < min ? task.start : min), tasks[0].start)
      const end = tasks.reduce((max, task) => (task.end > max ? task.end : max), tasks[0].end)
      onRangeChange({ start, end })
    }
  }, [tasks, onRangeChange])

  const handleSelect = (task: Task) => {
    const row = rows.find((item) => item.id === task.id)
    if (row && onSelect) {
      onSelect(row)
    }
  }

  const handleExpander = (task: Task) => {
    if (!onToggleRow) return
    const row = rows.find((item) => item.id === task.id)
    if (row && (row.type === 'contract' || row.type === 'sow')) {
      onToggleRow(row.id)
    }
  }

  useEffect(() => {
    const host = containerRef.current
    if (!host || !tasks.length) return undefined

    const escapeForSelector = (value: string) => {
      if (typeof window !== 'undefined' && window.CSS && typeof window.CSS.escape === 'function') {
        return window.CSS.escape(value)
      }
      return value.replace(/(["\\])/g, '\\$1')
    }

    const barNodes = host.querySelectorAll<SVGGElement>('.bar > g')
    barNodes.forEach((node, index) => {
      const task = tasks[index] as ScheduleTask | undefined
      if (!task) return
      node.setAttribute('data-task-id', task.id)
      node.setAttribute('data-status', task.statusKey)
      node.setAttribute('data-label-tone', task.labelTone)
      node.setAttribute('data-progress', String(task.progress))
      node.setAttribute('data-full-label', task.fullName)
      if (task.fullName) {
        node.setAttribute('title', task.fullName)
        const textNode = node.querySelector('text')
        if (textNode) {
          textNode.setAttribute('title', task.fullName)
        }
      }
    })

    const arrowNodes = host.querySelectorAll<SVGGElement>('.arrows > g.arrow')
    arrowNodes.forEach((node, index) => {
      const pair = dependencyPairs[index]
      if (pair) {
        node.setAttribute('data-from', pair.from)
        node.setAttribute('data-to', pair.to)
      } else {
        node.removeAttribute('data-from')
        node.removeAttribute('data-to')
      }
    })

    const toggleHighlight = (node: SVGGElement, state: boolean) => {
      const fromId = node.getAttribute('data-from')
      const toId = node.getAttribute('data-to')
      node.classList.toggle('is-hovered', state)
      if (!fromId || !toId) return
      ;[fromId, toId].forEach((id) => {
        const selector = `.bar > g[data-task-id="${escapeForSelector(id)}"]`
        const bar = host.querySelector<SVGGElement>(selector)
        if (bar) {
          bar.classList.toggle('dependency-hover', state)
        }
      })
    }

    const handleEnter = (event: Event) => {
      toggleHighlight(event.currentTarget as SVGGElement, true)
    }
    const handleLeave = (event: Event) => {
      toggleHighlight(event.currentTarget as SVGGElement, false)
    }

    arrowNodes.forEach((node) => {
      node.addEventListener('mouseenter', handleEnter)
      node.addEventListener('mouseleave', handleLeave)
    })

    return () => {
      arrowNodes.forEach((node) => {
        node.removeEventListener('mouseenter', handleEnter)
        node.removeEventListener('mouseleave', handleLeave)
      })
    }
  }, [tasks, dependencyPairs])

  if (!tasks.length) {
    return <div className="schedule-state">No schedule data available.</div>
  }

  return (
    <div className="schedule-gantt-shell" ref={containerRef}>
      <Gantt
        tasks={tasks}
        viewMode={ViewMode.Week}
        listCellWidth="320px"
        columnWidth={52}
        projectBackgroundColor="var(--gantt-project-bg)"
        barBackgroundColor="var(--gantt-bar-default-bg)"
        barBackgroundSelectedColor="var(--gantt-bar-default-bg-selected)"
        barProgressColor="var(--gantt-bar-default-progress)"
        barProgressSelectedColor="var(--gantt-bar-default-progress-selected)"
        locale="en-us"
        todayColor="var(--gantt-current-period)"
        onSelect={handleSelect}
        onExpanderClick={handleExpander}
        TaskListTable={ScheduleTaskListTable}
        arrowColor="var(--gantt-link)"
      />
    </div>
  )
}

export default ScheduleGantt
