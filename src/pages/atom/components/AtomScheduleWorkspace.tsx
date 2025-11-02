import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Gantt, Task, ViewMode } from 'gantt-task-react'
import 'gantt-task-react/dist/index.css'

import type {
  AtomScheduleCreatePayload,
  AtomScheduleItem,
  AtomScheduleResponse,
  AtomScheduleUpdatePayload,
} from '../../../api'
import { formatDate, formatNumber, formatPercent, formatShortDate } from '../utils'

const STATUS_COLORS: Record<string, string> = {
  completed: 'var(--status-completed-task)',
  delayed: 'var(--status-delayed-task)',
  at_risk: 'var(--status-at-risk-task)',
  on_track: 'var(--status-on-track-task)',
}

const LABEL_COLOR = 'var(--schedule-label-color)'

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  delayed: 'Delayed',
  at_risk: 'At Risk',
  on_track: 'On Track',
}

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'on_track', label: 'On Track' },
  { id: 'at_risk', label: 'At Risk' },
  { id: 'delayed', label: 'Delayed' },
  { id: 'completed', label: 'Completed' },
]

type StatusFilter = 'all' | 'on_track' | 'at_risk' | 'delayed' | 'completed'

const MS_PER_DAY = 86_400_000

type AtomScheduleWorkspaceProps = {
  scope: {
    tenantId: string
    projectId: string | null
    contractId?: string | null
    sowId?: string | null
    processId?: string | null
    atomId?: string | null
    atomName?: string | null
  } | null
  data: AtomScheduleResponse | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onCreate: (payload: AtomScheduleCreatePayload) => Promise<AtomScheduleItem>
  onUpdate: (scheduleId: string, payload: AtomScheduleUpdatePayload) => Promise<AtomScheduleItem>
  onDelete: (scheduleId: string) => Promise<void>
}

type DraftCreate = {
  draftId: string
  task: Task
  payload: AtomScheduleCreatePayload
}

type DraftUpdateMap = Record<string, AtomScheduleUpdatePayload>

type EditFormState = {
  status: string
  percent: number
  notes: string
  milestone: string
  atomId: string
  processId: string
}

const cloneTask = (task: Task): Task => ({
  ...task,
  start: new Date(task.start),
  end: new Date(task.end),
  styles: task.styles ? { ...task.styles } : undefined,
  dependencies: task.dependencies ? [...task.dependencies] : undefined,
})

const parseDate = (value?: string | null): Date | null => {
  if (!value) return null
  return new Date(`${value}T00:00:00`)
}

const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * MS_PER_DAY)

const toISODate = (date: Date): string => {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  return utc.toISOString().slice(0, 10)
}

const normalizeStatus = (value?: string | null): string => {
  const text = (value ?? '').toLowerCase()
  if (text.includes('delay')) return 'delayed'
  if (text.includes('risk') || text.includes('warning')) return 'at_risk'
  if (text.includes('complete') || text.includes('done')) return 'completed'
  return 'on_track'
}

const toProgress = (percent?: number | null): number => {
  if (percent == null || Number.isNaN(percent)) return 0
  if (percent > 1) return Math.min(100, Math.max(0, percent))
  return Math.min(100, Math.max(0, percent * 100))
}

const buildTask = (item: AtomScheduleItem, index: number, criticalSet: Set<string>): Task => {
  const start = parseDate(item.plannedStart) ?? new Date()
  const rawEnd = parseDate(item.plannedFinish)
  const end = rawEnd && rawEnd >= start ? addDays(rawEnd, 1) : addDays(start, 1)
  const statusKey = normalizeStatus(item.status)
  const isCritical = criticalSet.has(item.scheduleId)
  const baseColor = STATUS_COLORS[statusKey] ?? 'var(--status-on-track-task)'
  const backgroundColor = isCritical ? 'var(--status-critical-task)' : baseColor
  const progress = toProgress(item.percentComplete)

  return {
    id: item.scheduleId,
    type: 'task',
    name: item.milestone || item.processName || item.atomName || 'Allocation',
    start,
    end,
    progress,
    styles: {
      backgroundColor,
      backgroundSelectedColor: backgroundColor,
      progressColor: 'var(--gantt-task-progress)',
      progressSelectedColor: 'var(--gantt-task-progress)',
    },
    dependencies: item.dependencies ?? [],
    displayOrder: index,
  }
}

const differenceInDays = (start: Date, end: Date): number =>
  Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY))

const formatConflictType = (value: string | null | undefined): string => {
  if (!value) return 'Conflict'
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

const describeCapacityLoad = (hours: number): string => {
  if (hours > 16) return 'Severely overbooked'
  if (hours > 8) return 'Over capacity'
  if (hours === 8) return 'Fully booked'
  if (hours >= 4) return 'Comfortable load'
  return 'Light load'
}

const AtomScheduleWorkspace: React.FC<AtomScheduleWorkspaceProps> = ({
  scope,
  data,
  loading,
  error,
  onRefresh,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const itemsById = useMemo(() => {
    const map = new Map<string, AtomScheduleItem>()
    data?.items.forEach((item) => map.set(item.scheduleId, item))
    return map
  }, [data])
  const criticalSet = useMemo(() => new Set(data?.criticalPath ?? []), [data?.criticalPath])
  const baseTasks = useMemo(
    () => (data ? data.items.map((item, index) => buildTask(item, index, criticalSet)) : []),
    [data, criticalSet],
  )
  const [tasks, setTasks] = useState<Task[]>(baseTasks)
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Week)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [dateFilterStart, setDateFilterStart] = useState<string>('')
  const [dateFilterEnd, setDateFilterEnd] = useState<string>('')
  const [whatIfMode, setWhatIfMode] = useState(false)
  const [pendingUpdates, setPendingUpdates] = useState<DraftUpdateMap>({})
  const [pendingCreates, setPendingCreates] = useState<DraftCreate[]>([])
  const [pendingDeletes, setPendingDeletes] = useState<string[]>([])
  const [localError, setLocalError] = useState<string | null>(null)
  const historyRef = useRef<Task[][]>([])
  const redoRef = useRef<Task[][]>([])
  const [editForm, setEditForm] = useState<EditFormState | null>(null)
  const [taskSearch, setTaskSearch] = useState<string>('')
  const [conflictSearch, setConflictSearch] = useState<string>('')

  useEffect(() => {
    if (!whatIfMode) {
      setTasks(baseTasks)
      setPendingUpdates({})
      setPendingCreates([])
      setPendingDeletes([])
    }
  }, [baseTasks, whatIfMode])

  useEffect(() => {
    if (!selectedTaskId && tasks.length) {
      setSelectedTaskId(tasks[0].id)
    }
  }, [tasks, selectedTaskId])

  const pushHistory = useCallback(() => {
    historyRef.current.push(tasks.map(cloneTask))
    if (historyRef.current.length > 30) {
      historyRef.current.shift()
    }
    redoRef.current = []
  }, [tasks])

  const undo = useCallback(() => {
    if (!historyRef.current.length) return
    redoRef.current.push(tasks.map(cloneTask))
    const previous = historyRef.current.pop()
    if (previous) {
      setTasks(previous)
    }
  }, [tasks])

  const redo = useCallback(() => {
    if (!redoRef.current.length) return
    historyRef.current.push(tasks.map(cloneTask))
    const next = redoRef.current.pop()
    if (next) {
      setTasks(next)
    }
  }, [tasks])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        undo()
      } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  const updateTaskState = useCallback((task: Task) => {
    setTasks((prev) => prev.map((current) => (current.id === task.id ? cloneTask(task) : current)))
  }, [])

  const filteredTasks = useMemo(() => {
    const start = dateFilterStart ? parseDate(dateFilterStart) : null
    const end = dateFilterEnd ? parseDate(dateFilterEnd) : null
    const searchValue = taskSearch.trim().toLowerCase()
    return tasks.filter((task) => {
      const item = itemsById.get(task.id)
      const status = normalizeStatus(item?.status ?? undefined)
      if (statusFilter !== 'all' && status !== statusFilter) {
        return false
      }
      if (start && task.end < start) return false
      if (end && addDays(task.start, 1) > addDays(end, 1)) return false
      if (searchValue) {
        const searchable = [
          task.name,
          item?.atomName,
          item?.milestone,
          item?.processName,
          item?.notes,
          item?.status,
          item?.processCode,
          item?.contractCode,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (
          !searchable.includes(searchValue) &&
          !task.id.toLowerCase().includes(searchValue)
        ) {
          return false
        }
      }
      return true
    })
  }, [tasks, statusFilter, dateFilterStart, dateFilterEnd, itemsById, taskSearch])
  const hasTasks = filteredTasks.length > 0

  useEffect(() => {
    if (selectedTaskId && !filteredTasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(filteredTasks.length ? filteredTasks[0].id : null)
    }
  }, [filteredTasks, selectedTaskId])

  const handleDateChange = useCallback(
    async (task: Task) => {
      const payload: AtomScheduleUpdatePayload = {
        plannedStart: toISODate(task.start),
        plannedFinish: toISODate(addDays(task.end, -1)),
      }
      if (whatIfMode) {
        pushHistory()
        setPendingUpdates((prev) => ({
          ...prev,
          [task.id]: { ...(prev[task.id] ?? {}), ...payload },
        }))
        updateTaskState(task)
        return true
      }
      try {
        await onUpdate(task.id, payload)
        pushHistory()
        updateTaskState(task)
        onRefresh()
        setLocalError(null)
        return true
      } catch (err) {
        setLocalError((err as Error).message)
        return false
      }
    },
    [onUpdate, onRefresh, pushHistory, updateTaskState, whatIfMode],
  )

  const handleProgressChange = useCallback(
    async (task: Task) => {
      const payload: AtomScheduleUpdatePayload = {
        percentComplete: task.progress / 100,
      }
      if (whatIfMode) {
        pushHistory()
        setPendingUpdates((prev) => ({
          ...prev,
          [task.id]: { ...(prev[task.id] ?? {}), ...payload },
        }))
        updateTaskState(task)
        return true
      }
      try {
        await onUpdate(task.id, payload)
        pushHistory()
        updateTaskState(task)
        onRefresh()
        setLocalError(null)
        return true
      } catch (err) {
        setLocalError((err as Error).message)
        return false
      }
    },
    [onUpdate, onRefresh, pushHistory, updateTaskState, whatIfMode],
  )

  const handleDeleteTask = useCallback(
    async (task: Task) => {
      if (whatIfMode) {
        pushHistory()
        setPendingDeletes((prev) => (prev.includes(task.id) ? prev : [...prev, task.id]))
        setTasks((prev) => prev.filter((current) => current.id !== task.id))
        return true
      }
      try {
        await onDelete(task.id)
        onRefresh()
        setLocalError(null)
        return true
      } catch (err) {
        setLocalError((err as Error).message)
        return false
      }
    },
    [onDelete, onRefresh, pushHistory, whatIfMode],
  )

  const selectedItem = useMemo(() => {
    if (!selectedTaskId) return null
    return itemsById.get(selectedTaskId) ?? null
  }, [itemsById, selectedTaskId])

  const selectedStart = selectedItem ? parseDate(selectedItem.plannedStart) : null
  const selectedFinish = selectedItem ? parseDate(selectedItem.plannedFinish) : null
  const selectedDuration = selectedStart && selectedFinish ? differenceInDays(selectedStart, selectedFinish) : null
  const selectedStatusKey = selectedItem ? normalizeStatus(selectedItem.status) : null
  const selectedStatusLabel = selectedStatusKey ? STATUS_LABELS[selectedStatusKey] ?? selectedItem?.status ?? 'n/a' : null

  useEffect(() => {
    if (!selectedItem) {
      setEditForm(null)
      return
    }
    setEditForm({
      status: selectedItem.status ?? 'Planned',
      percent: Math.round((selectedItem.percentComplete ?? 0) * 100),
      notes: selectedItem.notes ?? '',
      milestone: selectedItem.milestone ?? '',
      atomId: selectedItem.atomId,
      processId: selectedItem.processId ?? '',
    })
  }, [selectedItem])

  const statusOptions = ['Planned', 'On Track', 'At Risk', 'Delayed', 'Completed']

  const trendSeries = useMemo(() => {
    if (!data) {
      return { dates: [] as string[], averageProgress: [] as number[], riskCounts: [] as number[] }
    }
    const bucket = new Map<string, { sum: number; count: number; risks: number }>()
    data.items.forEach((item) => {
      const key = item.plannedFinish ?? item.plannedStart
      if (!key) return
      const record = bucket.get(key) ?? { sum: 0, count: 0, risks: 0 }
      if (item.percentComplete != null) {
        record.sum += item.percentComplete * 100
        record.count += 1
      }
      const status = normalizeStatus(item.status)
      if (status === 'at_risk' || status === 'delayed') {
        record.risks += 1
      }
      bucket.set(key, record)
    })
    const sorted = Array.from(bucket.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    return {
      dates: sorted.map(([date]) => date),
      averageProgress: sorted.map(([_, record]) => (record.count ? record.sum / record.count : 0)),
      riskCounts: sorted.map(([_, record]) => record.risks),
    }
  }, [data])

  const renderSparkline = (values: number[], color: string) => {
    if (!values.length) {
      return <p className="atom-daily-empty">No data yet.</p>
    }
    const width = 160
    const height = 60
    const maxValue = Math.max(...values, 1)
    const minValue = Math.min(...values, 0)
    const range = Math.max(maxValue - minValue, 1)
    const points = values.map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width
      const normalized = (value - minValue) / range
      const y = height - normalized * (height - 12) - 6
      return { x, y }
    })
    const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
    const area = [
      `M 0 ${height}`,
      ...points.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`),
      `L ${width} ${height}`,
      'Z',
    ].join(' ')
    const lastPoint = points[points.length - 1]
    return (
      <svg className="atom-trend" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <path d={area} fill={color} opacity={0.15} />
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={lastPoint.x} cy={lastPoint.y} r={3} fill={color} />
      </svg>
    )
  }

  const criticalPathList = Array.isArray(data?.criticalPath) ? data?.criticalPath ?? [] : []
  const criticalSelected = selectedTaskId ? criticalPathList.includes(selectedTaskId) : false

  const handleFormChange = (field: keyof EditFormState, value: string | number) => {
    setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const handleFormSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedItem || !editForm) return
    if (whatIfMode) {
      setLocalError('Disable what-if mode to save milestone edits.')
      return
    }
    const changes: AtomScheduleUpdatePayload = {}
    if (editForm.status !== (selectedItem.status ?? 'Planned')) {
      changes.status = editForm.status
    }
    if (Math.round((selectedItem.percentComplete ?? 0) * 100) !== editForm.percent) {
      changes.percentComplete = editForm.percent / 100
    }
    if ((selectedItem.notes ?? '') !== editForm.notes) {
      changes.notes = editForm.notes
    }
    if ((selectedItem.milestone ?? '') !== editForm.milestone) {
      changes.milestone = editForm.milestone
    }
    if (selectedItem.atomId !== editForm.atomId && editForm.atomId.trim().length) {
      changes.atomId = editForm.atomId.trim()
    }
    if ((selectedItem.processId ?? '') !== editForm.processId) {
      changes.processId = editForm.processId.trim()
    }
    if (!Object.keys(changes).length) {
      setLocalError('No changes to save.')
      return
    }
    try {
      await onUpdate(selectedItem.scheduleId, changes)
      setLocalError(null)
    } catch (err) {
      setLocalError((err as Error).message)
    }
  }

  const handleToggleWhatIf = () => {
    if (whatIfMode) {
      setPendingUpdates({})
      setPendingCreates([])
      setPendingDeletes([])
      setTasks(baseTasks)
    }
    setWhatIfMode((prev) => !prev)
  }

  const applyWhatIf = async () => {
    try {
      for (const [scheduleId, payload] of Object.entries(pendingUpdates)) {
        await onUpdate(scheduleId, payload)
      }
      for (const draft of pendingCreates) {
        await onCreate(draft.payload)
      }
      for (const scheduleId of pendingDeletes) {
        await onDelete(scheduleId)
      }
      setWhatIfMode(false)
      setPendingUpdates({})
      setPendingCreates([])
      setPendingDeletes([])
      setLocalError(null)
      onRefresh()
    } catch (err) {
      setLocalError((err as Error).message)
    }
  }

  const discardWhatIf = () => {
    setWhatIfMode(false)
    setPendingUpdates({})
    setPendingCreates([])
    setPendingDeletes([])
    setTasks(baseTasks)
    setLocalError(null)
  }

  const handleQuickAdd = async () => {
    if (!scope?.tenantId || !scope.projectId) {
      setLocalError('Select a project scope before adding allocations.')
      return
    }
    const sourceItem = selectedItem ?? data?.items[0]
    if (!sourceItem) {
      setLocalError('No base allocation available to duplicate.')
      return
    }
    const baseTask =
      tasks.find((task) => task.id === sourceItem.scheduleId) ?? buildTask(sourceItem, tasks.length, criticalSet)
    const start = addDays(baseTask.end, -1)
    const newStart = addDays(start, 1)
    const newFinishInclusive = addDays(newStart, Math.max(1, differenceInDays(baseTask.start, baseTask.end) - 1))
    const payload: AtomScheduleCreatePayload = {
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      contractId: scope.contractId ?? null,
      sowId: scope.sowId ?? null,
      processId: sourceItem.processCode ?? null,
      atomId: sourceItem.atomId,
      milestone: `${sourceItem.milestone ?? sourceItem.processName ?? 'Task'} · copy`,
      status: sourceItem.status ?? 'Planned',
      criticality: sourceItem.criticality ?? null,
      plannedStart: toISODate(newStart),
      plannedFinish: toISODate(newFinishInclusive),
      notes: sourceItem.notes ?? null,
      percentComplete: sourceItem.percentComplete ?? 0,
    }
    if (whatIfMode) {
      const draftId = `draft-${Date.now()}`
      const draftTask: Task = {
        ...cloneTask(baseTask),
        id: draftId,
        start: newStart,
        end: addDays(newFinishInclusive, 1),
        progress: toProgress(payload.percentComplete),
        name: payload.milestone ?? draftId,
      }
      pushHistory()
      setPendingCreates((prev) => [...prev, { draftId, task: draftTask, payload }])
      setTasks((prev) => [...prev, draftTask])
      setSelectedTaskId(draftId)
      return
    }
    try {
      await onCreate(payload)
      onRefresh()
      setLocalError(null)
    } catch (err) {
      setLocalError((err as Error).message)
    }
  }

  const handleSplitTask = async () => {
    if (!selectedItem) return
    const task = tasks.find((entry) => entry.id === selectedItem.scheduleId)
    if (!task) return
    const totalDays = differenceInDays(task.start, task.end)
    if (totalDays < 2) {
      setLocalError('Allocation must span at least two days to split.')
      return
    }
    const midpoint = addDays(task.start, Math.floor(totalDays / 2))
    const newFirstEnd = addDays(midpoint, -1)
    const newSecondStart = midpoint
    const updatePayload: AtomScheduleUpdatePayload = {
      plannedStart: toISODate(task.start),
      plannedFinish: toISODate(newFirstEnd),
    }
    const createPayload: AtomScheduleCreatePayload = {
      tenantId: scope?.tenantId ?? 'default',
      projectId: scope?.projectId ?? data?.scope.projectId ?? 'diamer-basha',
      contractId: scope?.contractId ?? data?.scope.contractId ?? selectedItem.contractCode ?? null,
      sowId: scope?.sowId ?? data?.scope.sowId ?? selectedItem.sowCode ?? null,
      processId: selectedItem.processCode ?? null,
      atomId: selectedItem.atomId,
      milestone: `${selectedItem.milestone ?? selectedItem.processName ?? 'Task'} · part B`,
      status: selectedItem.status ?? 'Planned',
      criticality: selectedItem.criticality ?? null,
      plannedStart: toISODate(newSecondStart),
      plannedFinish: toISODate(addDays(task.end, -1)),
      notes: selectedItem.notes ?? null,
      percentComplete: selectedItem.percentComplete ?? 0,
    }
    if (whatIfMode) {
      pushHistory()
      setPendingUpdates((prev) => ({
        ...prev,
        [selectedItem.scheduleId]: { ...(prev[selectedItem.scheduleId] ?? {}), ...updatePayload },
      }))
      const draftId = `draft-${Date.now()}`
      const draftTask: Task = {
        ...cloneTask(task),
        id: draftId,
        start: newSecondStart,
        end: task.end,
        name: createPayload.milestone ?? draftId,
      }
      setPendingCreates((prev) => [...prev, { draftId, task: draftTask, payload: createPayload }])
      setTasks((prev) =>
        prev.map((current) =>
          current.id === task.id
            ? {
                ...current,
                end: addDays(newFirstEnd, 1),
              }
            : current,
        ).concat(draftTask),
      )
      return
    }
    try {
      await onUpdate(selectedItem.scheduleId, updatePayload)
      await onCreate(createPayload)
      onRefresh()
      setLocalError(null)
    } catch (err) {
      setLocalError((err as Error).message)
    }
  }

  const handleShiftTask = async (scheduleId: string, days: number) => {
    const item = data?.items.find((entry) => entry.scheduleId === scheduleId)
    if (!item) return
    const start = parseDate(item.plannedStart) ?? new Date()
    const finish = parseDate(item.plannedFinish) ?? start
    const payload: AtomScheduleUpdatePayload = {
      plannedStart: toISODate(addDays(start, days)),
      plannedFinish: toISODate(addDays(finish, days)),
    }
    if (whatIfMode) {
      pushHistory()
      setPendingUpdates((prev) => ({
        ...prev,
        [scheduleId]: { ...(prev[scheduleId] ?? {}), ...payload },
      }))
      setTasks((prev) =>
        prev.map((task) =>
          task.id === scheduleId
            ? {
                ...task,
                start: addDays(task.start, days),
                end: addDays(task.end, days),
              }
            : task,
        ),
      )
      return
    }
    try {
      await onUpdate(scheduleId, payload)
      onRefresh()
      setLocalError(null)
    } catch (err) {
      setLocalError((err as Error).message)
    }
  }

  const conflicts = data?.conflicts ?? []
  const [conflictPage, setConflictPage] = useState(1)
  const CONFLICTS_PER_PAGE = 9
  const conflictSearchValue = conflictSearch.trim().toLowerCase()
  const filteredConflicts = useMemo(() => {
    if (!conflictSearchValue) return conflicts
    return conflicts.filter((conflict) => {
      const base = `${conflict.conflictType ?? ''} ${conflict.message ?? ''}`.toLowerCase()
      if (base.includes(conflictSearchValue)) return true
      return conflict.scheduleIds.some((scheduleId) => {
        const item = itemsById.get(scheduleId)
        const haystack = [scheduleId, item?.atomName, item?.milestone, item?.processName, item?.notes]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(conflictSearchValue)
      })
    })
  }, [conflicts, conflictSearchValue, itemsById])
  const totalConflictPages = Math.max(1, Math.ceil(filteredConflicts.length / CONFLICTS_PER_PAGE))

  useEffect(() => {
    setConflictPage(1)
  }, [conflictSearchValue])

  useEffect(() => {
    if (conflictPage > totalConflictPages) {
      setConflictPage(totalConflictPages)
    }
  }, [conflictPage, totalConflictPages])

  const pagedConflicts = useMemo(() => {
    const start = (conflictPage - 1) * CONFLICTS_PER_PAGE
    return filteredConflicts.slice(start, start + CONFLICTS_PER_PAGE)
  }, [filteredConflicts, conflictPage])

  const capacitySeries = useMemo(() => {
    if (!data) return []
    const map = new Map<string, number>()
    data.items.forEach((item) => {
      const start = parseDate(item.plannedStart)
      const finish = parseDate(item.plannedFinish)
      if (!start || !finish) return
      let cursor = new Date(start)
      while (cursor <= finish) {
        const key = toISODate(cursor)
        const current = map.get(key) ?? 0
        map.set(key, current + 8)
        cursor = addDays(cursor, 1)
      }
    })
    return Array.from(map.entries())
      .map(([dateKey, hours]) => ({
        date: dateKey,
        hours,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1))
  }, [data])

  const capacitySummary = useMemo(() => {
    if (!capacitySeries.length) return null
    const totalHours = capacitySeries.reduce((sum, entry) => sum + entry.hours, 0)
    const busiest = capacitySeries.reduce(
      (prev, entry) => (entry.hours > prev.hours ? entry : prev),
      capacitySeries[0],
    )
    return {
      totalHours,
      busiest,
      horizonStart: capacitySeries[0].date,
      horizonEnd: capacitySeries[capacitySeries.length - 1].date,
      days: capacitySeries.length,
    }
  }, [capacitySeries])

  return (
    <section className="atom-schedule-workspace">
      <header className="atom-schedule-workspace__header">
        <div>
          <h3>Interactive scheduling workspace</h3>
          {data?.summary?.asOf ? <span>As of {formatDate(data.summary.asOf)}</span> : null}
        </div>
        <div className="atom-schedule-workspace__actions">
          <div className="atom-chip-group">
            <button
              type="button"
              className={`atom-filter-chip ${viewMode === ViewMode.Day ? 'active' : ''}`}
              onClick={() => setViewMode(ViewMode.Day)}
            >
              Day
            </button>
            <button
              type="button"
              className={`atom-filter-chip ${viewMode === ViewMode.Week ? 'active' : ''}`}
              onClick={() => setViewMode(ViewMode.Week)}
            >
              Week
            </button>
          </div>
          <div className="atom-chip-group">
            <button type="button" className="atom-filter-chip" onClick={undo}>
              Undo
            </button>
            <button type="button" className="atom-filter-chip" onClick={redo}>
              Redo
            </button>
          </div>
          <div className="atom-chip-group">
            <button type="button" className="atom-filter-chip" onClick={handleQuickAdd}>
              Add allocation
            </button>
            <button type="button" className="atom-filter-chip" onClick={handleSplitTask} disabled={!selectedItem}>
              Split allocation
            </button>
          </div>
          <label className="atom-toggle">
            <input type="checkbox" checked={whatIfMode} onChange={handleToggleWhatIf} />
            <span>What-if mode</span>
          </label>
          {whatIfMode ? (
            <>
              <button type="button" className="atom-primary" onClick={applyWhatIf}>
                Apply changes
              </button>
              <button type="button" onClick={discardWhatIf}>
                Discard
              </button>
            </>
          ) : (
            <button type="button" onClick={onRefresh}>
              Refresh
            </button>
          )}
        </div>
      </header>

      <div className="atom-schedule-filters">
        <div className="atom-chip-group" role="group" aria-label="Status filter">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`atom-filter-chip ${statusFilter === filter.id ? 'active' : ''}`}
              onClick={() => setStatusFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="atom-filter-row">
          <label>
            Start
            <input type="date" value={dateFilterStart} onChange={(event) => setDateFilterStart(event.target.value)} />
          </label>
          <label>
            End
            <input type="date" value={dateFilterEnd} onChange={(event) => setDateFilterEnd(event.target.value)} />
          </label>
        </div>
        <div className="atom-search-field atom-schedule-search">
          <input
            type="search"
            placeholder="Search allocations, atoms, or processes…"
            value={taskSearch}
            onChange={(event) => setTaskSearch(event.target.value)}
            aria-label="Search schedule allocations"
          />
          {taskSearch ? (
            <button
              type="button"
              className="atom-search-clear"
              onClick={() => setTaskSearch('')}
              aria-label="Clear allocation search"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      {localError ? <div className="atom-error">{localError}</div> : null}
      {error ? <div className="atom-error">{error}</div> : null}

      <div className="atom-gantt-container">
        {hasTasks ? (
          <Gantt
            tasks={filteredTasks}
            viewMode={viewMode}
            onSelect={(task, isSelected) => (isSelected ? setSelectedTaskId(task.id) : undefined)}
            onDateChange={handleDateChange}
            onProgressChange={handleProgressChange}
            onDelete={handleDeleteTask}
            todayColor="#f97316"
            arrowColor="#94a3b8"
            listCellWidth="220px"
            columnWidth={viewMode === ViewMode.Day ? 52 : 180}
          />
        ) : (
          <div className="atom-empty-state">
            <h3>No allocations yet</h3>
            <p>Create a schedule allocation to populate the timeline.</p>
          </div>
        )}
      </div>

      <div className="atom-schedule-workspace__grid">
        <aside className="atom-schedule-sidebar">
          <h4>Allocation insights</h4>
          {selectedItem ? (
            <div className="atom-allocation-panel">
              <div className="atom-allocation-summary">
                <div className="atom-allocation-summary__titles">
                  <span className="atom-allocation-label">Current selection</span>
                  <strong>{selectedItem.milestone ?? selectedItem.processName ?? selectedItem.atomName}</strong>
                </div>
                <div className="atom-allocation-summary__window">
                  <span>
                    {formatShortDate(selectedItem.plannedStart ?? null)} →{' '}
                    {formatShortDate(selectedItem.plannedFinish ?? null)}
                  </span>
                  {selectedDuration ? <span>{selectedDuration} day{selectedDuration === 1 ? '' : 's'}</span> : null}
                </div>
                {criticalSelected ? <span className="atom-critical-tag">Critical path</span> : null}
              </div>
              <dl className="atom-allocation-meta">
                <div className="atom-allocation-meta__item">
                  <dt>Status</dt>
                  <dd>
                    <span
                      className={`atom-status-pill${selectedStatusKey ? ` status-${selectedStatusKey}` : ''}`}
                    >
                      {selectedStatusLabel ?? 'n/a'}
                    </span>
                  </dd>
                </div>
                <div className="atom-allocation-meta__item">
                  <dt>Progress</dt>
                  <dd>{selectedItem.percentComplete != null ? formatPercent(selectedItem.percentComplete) : '--'}</dd>
                </div>
                <div className="atom-allocation-meta__item">
                  <dt>Variance</dt>
                  <dd>{selectedItem.varianceDays != null ? `${selectedItem.varianceDays} days` : '—'}</dd>
                </div>
                <div className="atom-allocation-meta__item">
                  <dt>Process</dt>
                  <dd>{selectedItem.processName ?? '—'}</dd>
                </div>
              </dl>
              <div className="atom-allocation-notes">
                <h5>Notes & context</h5>
                <p>
                  {selectedItem.notes && selectedItem.notes.trim().length
                    ? selectedItem.notes
                    : 'No additional notes yet. Capture risks, dependencies or handover details to keep everyone aligned.'}
                </p>
                <div className="atom-allocation-tags">
                  <span>
                    <strong>Atom:</strong> {selectedItem.atomName ?? selectedItem.atomId ?? '—'}
                  </span>
                  <span>
                    <strong>Process code:</strong> {selectedItem.processId ?? '—'}
                  </span>
                </div>
              </div>
              <div className="atom-allocation-actions">
                <span className="atom-allocation-actions__title">Quick adjustments</span>
                <div className="atom-allocation-actions__buttons">
                  <button type="button" onClick={() => selectedTaskId && handleShiftTask(selectedTaskId, 1)}>
                    Shift +1 day
                  </button>
                  <button type="button" onClick={() => selectedTaskId && handleShiftTask(selectedTaskId, -1)}>
                    Shift -1 day
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      if (!selectedTaskId) return
                      const target = tasks.find((entry) => entry.id === selectedTaskId)
                      if (target) {
                        void handleDeleteTask(target)
                      }
                    }}
                  >
                    Remove allocation
                  </button>
                </div>
              </div>
              {editForm ? (
                <form className="atom-schedule-edit" onSubmit={handleFormSubmit}>
                  <label>
                    Status
                    <select
                      value={editForm.status}
                      disabled={whatIfMode}
                      onChange={(event) => handleFormChange('status', event.target.value)}
                    >
                      {statusOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Progress ({editForm.percent}%)
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={editForm.percent}
                      disabled={whatIfMode}
                      onChange={(event) => handleFormChange('percent', Number(event.target.value))}
                    />
                  </label>
                  <label>
                    Milestone
                    <input
                      type="text"
                      value={editForm.milestone}
                      disabled={whatIfMode}
                      onChange={(event) => handleFormChange('milestone', event.target.value)}
                    />
                  </label>
                  <label>
                    Notes
                    <textarea
                      value={editForm.notes}
                      disabled={whatIfMode}
                      onChange={(event) => handleFormChange('notes', event.target.value)}
                    />
                  </label>
                  <label>
                    Atom assignment
                    <input
                      type="text"
                      value={editForm.atomId}
                      disabled={whatIfMode}
                      onChange={(event) => handleFormChange('atomId', event.target.value)}
                      placeholder="UUID"
                    />
                  </label>
                  <label>
                    Process code
                    <input
                      type="text"
                      value={editForm.processId}
                      disabled={whatIfMode}
                      onChange={(event) => handleFormChange('processId', event.target.value)}
                      placeholder="Process identifier"
                    />
                  </label>
                  <button type="submit" className="atom-primary" disabled={whatIfMode}>
                    Save changes
                  </button>
                </form>
              ) : null}
            </div>
          ) : (
            <div className="atom-allocation-empty">
              <p>Select a bar in the timeline to see its status, notes, and quick actions.</p>
            </div>
          )}
          <div className="atom-capacity-card">
            <header>
              <h5>Upcoming capacity load</h5>
              {capacitySummary ? <span>{capacitySummary.days} day horizon</span> : null}
            </header>
            {capacitySummary ? (
              <>
                <p className="atom-capacity-summary">
                  Over the next {capacitySummary.days} days we have {formatNumber(capacitySummary.totalHours)} hours
                  scheduled. Peak load hits {formatShortDate(capacitySummary.busiest.date)} with{' '}
                  {formatNumber(capacitySummary.busiest.hours)} hours.
                </p>
                <ul className="atom-capacity-list">
                  {capacitySeries.slice(0, 6).map((entry) => (
                    <li key={entry.date}>
                      <div className="atom-capacity-list__label">
                        <span>{formatShortDate(entry.date)}</span>
                        <span>{formatNumber(entry.hours)} hrs</span>
                      </div>
                      <progress max={16} value={Math.min(16, entry.hours)} />
                      <span className="atom-capacity-list__hint">{describeCapacityLoad(entry.hours)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="atom-capacity-empty">No upcoming allocations.</p>
            )}
          </div>
        </aside>

        <section className="atom-schedule-conflicts">
          <header>
            <div>
              <h4>Conflict & risk intelligence</h4>
              <p>Understand schedule clashes and apply quick fixes before they escalate.</p>
            </div>
            <div className="atom-conflict-tools">
              <span className="atom-conflict-count">
                {conflictSearch
                  ? `${filteredConflicts.length} of ${conflicts.length} active`
                  : `${filteredConflicts.length} active`}
              </span>
              <div className="atom-search-field">
                <input
                  type="search"
                  placeholder="Search conflicts…"
                  value={conflictSearch}
                  onChange={(event) => setConflictSearch(event.target.value)}
                  aria-label="Search conflicts"
                />
                {conflictSearch ? (
                  <button
                    type="button"
                    className="atom-search-clear"
                    onClick={() => setConflictSearch('')}
                    aria-label="Clear conflict search"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </div>
          </header>
          {filteredConflicts.length ? (
            <ul className="atom-conflict-list">
              {pagedConflicts.map((conflict) => (
                <li key={`${conflict.conflictType}-${conflict.scheduleIds.join('-')}`} className="atom-conflict-card">
                  <div className="atom-conflict-card__header">
                    <span className="atom-conflict-card__type">{formatConflictType(conflict.conflictType)}</span>
                    <span className="atom-conflict-card__impact">
                      {conflict.scheduleIds.length} allocation{conflict.scheduleIds.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="atom-conflict-card__message">{conflict.message}</p>
                  <div className="atom-conflict-card__meta">
                    <span className="atom-conflict-card__label">Impacted IDs</span>
                    <code>{conflict.scheduleIds.map((id) => `#${id.slice(0, 6)}`).join(', ')}</code>
                  </div>
                  <div className="atom-conflict-card__actions">
                    {conflict.scheduleIds.map((scheduleId) => (
                      <button key={scheduleId} type="button" onClick={() => handleShiftTask(scheduleId, 1)}>
                        Shift #{scheduleId.slice(0, 6)} by +1 day
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="atom-conflict-empty">
              {conflictSearch ? 'No conflicts match your search.' : 'No scheduling conflicts detected.'}
            </p>
          )}
          {filteredConflicts.length ? (
            <div className="atom-conflict-pagination">
              <button
                type="button"
                onClick={() => setConflictPage((page) => Math.max(1, page - 1))}
                disabled={conflictPage === 1}
              >
                Previous
              </button>
              <span>
                Page {conflictPage} of {totalConflictPages}
              </span>
              <button
                type="button"
                onClick={() => setConflictPage((page) => Math.min(totalConflictPages, page + 1))}
                disabled={conflictPage === totalConflictPages}
              >
                Next
              </button>
            </div>
          ) : (
            null
          )}
        </section>
      </div>

      <section className="atom-schedule-trends">
        <div className="atom-trend-card">
          <header>
            <span>Average progress over time</span>
            <strong>
              {trendSeries.averageProgress.length ? `${trendSeries.averageProgress.at(-1)?.toFixed(1)}%` : '--'}
            </strong>
          </header>
          {renderSparkline(trendSeries.averageProgress, 'var(--trend-progress)')}
        </div>
        <div className="atom-trend-card">
          <header>
            <span>Risk count over time</span>
            <strong>{trendSeries.riskCounts.length ? trendSeries.riskCounts.at(-1) : '--'}</strong>
          </header>
          {renderSparkline(trendSeries.riskCounts, 'var(--trend-risk)')}
        </div>
      </section>

      {loading ? <div className="atom-loading">Updating scheduling data…</div> : null}
    </section>
  )
}

export default AtomScheduleWorkspace
