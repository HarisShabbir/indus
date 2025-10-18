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

  return (
    <div className="schedule-task-list" style={{ fontFamily, fontSize }}>
      {tasks.map((task) => {
        const isCollapsible = task.hideChildren !== undefined
        const isCollapsed = task.hideChildren === true
        const isExpanded = task.hideChildren === false
        const isSelected = task.id === selectedTaskId
        const cellStyle = { minWidth: rowWidth, maxWidth: rowWidth, width: rowWidth }
        return (
          <div
            key={`${task.id}-row`}
            className={`schedule-task-list-row${isCollapsed ? ' collapsed' : ''}${isSelected ? ' selected' : ''}`}
            style={{ height: rowHeight }}
            data-task-id={task.id}
            data-collapsed={isCollapsed || undefined}
            onClick={() => setSelectedTask(task.id)}
          >
            <div className="schedule-task-list-cell name" style={cellStyle} title={task.name}>
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
                <span>{task.name}</span>
              </div>
            </div>
            <div className="schedule-task-list-cell date" style={cellStyle}>
              {formatDate.format(task.start)}
            </div>
            <div className="schedule-task-list-cell date" style={cellStyle}>
              {formatDate.format(task.end)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ScheduleTaskListTable
