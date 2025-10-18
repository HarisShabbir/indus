import type { GanttTask } from '../types'

type Scope = 'project' | 'contract' | 'sow' | 'process'

const cloneTask = (task: GanttTask): GanttTask => ({
  ...task,
  meta: task.meta ? { ...task.meta } : undefined,
})

const cloneTasks = (tasks: GanttTask[]): GanttTask[] => tasks.map(cloneTask)

const MW01_MAIN_DAM_TASKS: GanttTask[] = [
  {
    id: 'project:diamer-basha',
    name: 'Diamer Basha Dam',
    start: '2024-01-05',
    end: '2024-12-20',
    progress: 0.8286788650711907,
    parent: null,
    meta: {
      progress_pct: 82.87,
      status: 'Monitoring',
      child_count: 1,
      spi: 0.9833333333333334,
    },
  },
  {
    id: 'contract:mw-01-main-dam',
    name: 'MW-01 - Main Dam',
    start: '2024-01-05',
    end: '2024-12-20',
    progress: 0.8286788650711907,
    parent: 'project:diamer-basha',
    meta: {
      progress_pct: 82.87,
      status: 'Monitoring',
      child_count: 3,
      spi: 0.9833333333333334,
      quality_conf: 87.93219745227695,
      status_label: 'Live',
    },
  },
  {
    id: 'sow:sow-mw01-prelim',
    name: 'Preliminary and General Item',
    start: '2024-01-05',
    end: '2024-03-30',
    progress: 0.7150061999264181,
    parent: 'contract:mw-01-main-dam',
    meta: {
      progress_pct: 71.5,
      status: 'Monitoring',
      child_count: 2,
      spi: 1.0,
      quality_conf: 86.96903910346464,
    },
  },
  {
    id: 'sow:sow-mw01-river',
    name: 'River diversion & care of water',
    start: '2024-04-01',
    end: '2024-09-12',
    progress: 0.9028150584257111,
    parent: 'contract:mw-01-main-dam',
    meta: {
      progress_pct: 90.28,
      status: 'On Track',
      child_count: 2,
      spi: 1.0,
      quality_conf: 85.02224012722374,
    },
  },
  {
    id: 'sow:sow-mw01-rcc',
    name: 'RCC Dam',
    start: '2024-06-01',
    end: '2024-12-20',
    progress: 0.8682153368614428,
    parent: 'contract:mw-01-main-dam',
    meta: {
      progress_pct: 86.82,
      status: 'Monitoring',
      child_count: 2,
      spi: 0.95,
      quality_conf: 91.8053131261425,
    },
  },
  {
    id: 'process:clause-mw01-prelim-1',
    name: 'Site mobilisation',
    start: '2024-01-05',
    end: '2024-02-20',
    progress: 0.5416777389342968,
    parent: 'sow:sow-mw01-prelim',
    meta: {
      progress_pct: 54.17,
      status: 'At Risk',
      spi: 0.89,
      quality_conf: 92.01243476026049,
    },
  },
  {
    id: 'process:clause-mw01-prelim-2',
    name: 'Temporary works setup',
    start: '2024-02-21',
    end: '2024-03-30',
    progress: 0.8883346609185394,
    parent: 'sow:sow-mw01-prelim',
    meta: {
      progress_pct: 88.83,
      status: 'Monitoring',
      spi: 1.11,
      quality_conf: 81.92564344666879,
    },
  },
  {
    id: 'process:clause-mw01-river-1',
    name: 'Cofferdam installation',
    start: '2024-04-01',
    end: '2024-07-30',
    progress: 0.9028150584257111,
    parent: 'sow:sow-mw01-river',
    meta: {
      progress_pct: 90.28,
      status: 'On Track',
      spi: 0.89,
      quality_conf: 85.02224012722374,
    },
  },
  {
    id: 'process:clause-mw01-river-2',
    name: 'Diversion channel excavation',
    start: '2024-05-10',
    end: '2024-09-12',
    progress: 0.9028150584257111,
    parent: 'sow:sow-mw01-river',
    meta: {
      progress_pct: 90.28,
      status: 'On Track',
      spi: 1.11,
      quality_conf: 85.02224012722374,
    },
  },
  {
    id: 'process:clause-mw01-rcc-1',
    name: 'Left bank RCC placements',
    start: '2024-06-01',
    end: '2024-11-15',
    progress: 0.8682153368614428,
    parent: 'sow:sow-mw01-rcc',
    meta: {
      progress_pct: 86.82,
      status: 'Monitoring',
      spi: 0.95,
      quality_conf: 91.8053131261425,
    },
  },
  {
    id: 'process:clause-mw01-rcc-2',
    name: 'Instrumentation embeds',
    start: '2024-08-01',
    end: '2024-12-20',
    progress: 0.8682153368614428,
    parent: 'sow:sow-mw01-rcc',
    meta: {
      progress_pct: 86.82,
      status: 'Monitoring',
      spi: 0.95,
      quality_conf: 91.8053131261425,
    },
  },
]

type ScheduleBundle = {
  projectId: string
  contractId: string
  tasks: GanttTask[]
}

const BUNDLES: Record<string, ScheduleBundle> = {
  'mw-01-main-dam': {
    projectId: 'diamer-basha',
    contractId: 'mw-01-main-dam',
    tasks: MW01_MAIN_DAM_TASKS,
  },
}

const findBundleByProject = (projectId: string): ScheduleBundle | null => {
  return Object.values(BUNDLES).find((bundle) => bundle.projectId === projectId) ?? null
}

const findBundleBySow = (sowId: string): ScheduleBundle | null => {
  const target = `sow:${sowId}`
  return Object.values(BUNDLES).find((bundle) => bundle.tasks.some((task) => task.id === target)) ?? null
}

const findBundleByProcess = (processId: string): ScheduleBundle | null => {
  const target = `process:${processId}`
  return Object.values(BUNDLES).find((bundle) => bundle.tasks.some((task) => task.id === target)) ?? null
}

const selectForSow = (bundle: ScheduleBundle, sowId: string): GanttTask[] => {
  const sowTaskId = `sow:${sowId}`
  const contractTaskId = `contract:${bundle.contractId}`
  const projectTaskId = `project:${bundle.projectId}`
  const allowed = new Set<string>([sowTaskId, contractTaskId, projectTaskId])

  bundle.tasks.forEach((task) => {
    if (task.parent === sowTaskId) {
      allowed.add(task.id)
    }
  })

  return cloneTasks(bundle.tasks.filter((task) => allowed.has(task.id)))
}

const selectForProcess = (bundle: ScheduleBundle, processId: string): GanttTask[] => {
  const processTaskId = `process:${processId}`
  const processTask = bundle.tasks.find((task) => task.id === processTaskId)
  if (!processTask) {
    return []
  }
  const sowTaskId = processTask.parent ?? ''
  const contractTaskId = `contract:${bundle.contractId}`
  const projectTaskId = `project:${bundle.projectId}`
  const allowed = new Set<string>([processTaskId, sowTaskId, contractTaskId, projectTaskId])

  bundle.tasks.forEach((task) => {
    if (task.id === sowTaskId || task.parent === sowTaskId) {
      allowed.add(task.id)
    }
  })

  return cloneTasks(bundle.tasks.filter((task) => allowed.has(task.id)))
}

export function getScheduleFallback(scope: Scope, identifier: string): GanttTask[] | null {
  if (!identifier) {
    return null
  }

  if (scope === 'contract') {
    const bundle = BUNDLES[identifier]
    return bundle ? cloneTasks(bundle.tasks) : null
  }

  if (scope === 'project') {
    const bundle = findBundleByProject(identifier)
    return bundle ? cloneTasks(bundle.tasks) : null
  }

  if (scope === 'sow') {
    const bundle = findBundleBySow(identifier)
    return bundle ? selectForSow(bundle, identifier) : null
  }

  if (scope === 'process') {
    const bundle = findBundleByProcess(identifier)
    return bundle ? selectForProcess(bundle, identifier) : null
  }

  return null
}

