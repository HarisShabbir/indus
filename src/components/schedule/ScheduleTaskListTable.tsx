import React, { useMemo } from 'react'
import type { Task } from 'gantt-task-react'

type TaskListTableProps = {
  rowHeight: number
  rowWidth: string
  tasks: Task[]
  fontFamily: string
  fontSize: string
  locale: string
  selectedTaskId: string
  setSelectedTask: (taskId: string) => void
  onExpanderClick: (task: Task) => void
}

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
}

export function ScheduleTaskListTable({
  rowHeight,
  rowWidth,
  tasks,
  fontFamily,
  fontSize,
  locale,
  selectedTaskId,
  setSelectedTask,
  onExpanderClick,
}: TaskListTableProps): JSX.Element {
  const formatDate = useMemo(() => new Intl.DateTimeFormat(locale, DATE_FORMAT_OPTIONS), [locale])
  const baseWidth = Number.parseInt(rowWidth, 10) || 320
  const nameMinWidth = Math.max(220, baseWidth)
  const dateMinWidth = Math.max(160, Math.round(baseWidth * 0.55))
  const columnTemplate = `minmax(${nameMinWidth}px, 2.5fr) repeat(2, minmax(${dateMinWidth}px, 1.2fr))`
  const nameCellStyle: React.CSSProperties = { minWidth: `${nameMinWidth}px` }
  const dateCellStyle: React.CSSProperties = { minWidth: `${dateMinWidth}px` }

  return (
    <div className="schedule-task-list" style={{ fontFamily, fontSize }}>
      {tasks.map((task) => {
        const extended = task as Task & { fullName?: string }
        const displayName = extended.fullName ?? task.name
        const isCollapsible = task.hideChildren !== undefined
        const isCollapsed = task.hideChildren === true
        const isExpanded = task.hideChildren === false
        const isSelected = task.id === selectedTaskId
        return (
          <div
            key={`${task.id}-row`}
            className={`schedule-task-list-row${isCollapsed ? ' collapsed' : ''}${isSelected ? ' selected' : ''}`}
            style={{ height: rowHeight, gridTemplateColumns: columnTemplate }}
            data-task-id={task.id}
            data-collapsed={isCollapsed || undefined}
            onClick={() => setSelectedTask(task.id)}
          >
            <div className="schedule-task-list-cell name" style={nameCellStyle} title={displayName}>
              <div className="schedule-task-list-name">
                <button
                  type="button"
                  className={`schedule-task-list-expander${isCollapsible ? '' : ' empty'}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (isCollapsible) onExpanderClick(task)
                  }}
                  aria-hidden={!isCollapsible}
                  tabIndex={isCollapsible ? 0 : -1}
                  aria-label={isCollapsed ? 'Expand row' : isExpanded ? 'Collapse row' : undefined}
                >
                  {isCollapsible ? (isCollapsed ? '▶' : '▼') : ''}
                </button>
                <span>{displayName}</span>
              </div>
            </div>
            <div className="schedule-task-list-cell date" style={dateCellStyle}>
              {formatDate.format(task.start)}
            </div>
            <div className="schedule-task-list-cell date" style={dateCellStyle}>
              {formatDate.format(task.end)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ScheduleTaskListTable
