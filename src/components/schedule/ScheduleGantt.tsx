import React, { useEffect, useMemo } from 'react'
import { Gantt, Task, ViewMode } from 'gantt-task-react'
import 'gantt-task-react/dist/index.css'
import { scheduleTokens } from '../../theme/tokens'
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
}

export type ScheduleGanttProps = {
  rows: ScheduleRow[]
  expandedMap: Record<string, boolean>
  selectedId?: string | null
  onToggleRow?: (rowId: string) => void
  onSelect?: (row: ScheduleRow) => void
  onRangeChange?: (range: { start: Date; end: Date }) => void
}

const statusColorMap: Record<string, string> = {
  'on-track': scheduleTokens.gantt.onTrack,
  monitoring: scheduleTokens.gantt.monitoring,
  risk: scheduleTokens.gantt.risk,
}

function toTask(row: ScheduleRow, expanded: Record<string, boolean>, selectedId?: string | null): Task {
  const start = new Date(row.start)
  const end = new Date(row.end)
  const progress = Math.round(row.percentComplete * 100)
  const isSow = row.type === 'sow'
  const isContract = row.type === 'contract'
  const color = statusColorMap[row.status ?? 'on-track'] ?? scheduleTokens.colors.primary
  const isSelected = selectedId === row.id
  const isCollapsibleParent = isContract || isSow
  const isCollapsed = isCollapsibleParent && !expanded[row.id]
  const baseBackground = isCollapsed ? 'var(--gantt-row-collapsed-bg)' : 'rgba(148,163,184,0.18)'
  const baseSelectedBackground = isCollapsed ? 'var(--gantt-row-collapsed-bg)' : 'rgba(37,99,235,0.35)'

  return {
    id: row.id,
    type: isSow || isContract ? 'project' : 'task',
    name: row.name,
    start,
    end,
    progress,
    project: row.parentId ?? undefined,
    hideChildren: isCollapsibleParent && !expanded[row.id],
    isDisabled: true,
    styles: {
      progressColor: color,
      progressSelectedColor: color,
      backgroundColor: isSelected ? 'rgba(37,99,235,0.25)' : baseBackground,
      backgroundSelectedColor: isSelected ? 'rgba(37,99,235,0.35)' : baseSelectedBackground,
    },
  }
}

export function ScheduleGantt({ rows, expandedMap, selectedId, onToggleRow, onSelect, onRangeChange }: ScheduleGanttProps) {
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

  if (!tasks.length) {
    return <div className="schedule-state">No schedule data available.</div>
  }

  return (
    <div className="schedule-gantt-shell">
      <Gantt
        tasks={tasks}
        viewMode={ViewMode.Week}
        listCellWidth="320px"
        columnWidth={52}
        projectBackgroundColor="rgba(37,99,235,0.15)"
        barBackgroundColor="rgba(148,163,184,0.18)"
        barProgressColor={scheduleTokens.colors.primary}
        locale="en-us"
        todayColor="rgba(6,182,212,0.25)"
        onSelect={handleSelect}
        onExpanderClick={handleExpander}
        TaskListTable={ScheduleTaskListTable}
      />
    </div>
  )
}

export default ScheduleGantt
