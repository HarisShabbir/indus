import React, { useEffect, useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { FEATURE_SCHEDULE_UI, FEATURE_PROGRESS_V2 } from '../../config'
import { useProcessSchedule } from '../../hooks/useSchedule'
import ScheduleLayout from './ScheduleLayout'
import type { Project } from '../../api'
import { readAuthToken } from '../../utils/auth'
import { useProgressSummary } from '../../hooks/useProgress'

type LocationState = {
  projectName?: string
  contractName?: string
  sowName?: string
  processName?: string
  projectId?: string
  contractId?: string
  sowId?: string
  processId?: string
  projectSnapshot?: Project | null
} | null

export function ProcessSchedulePage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state as LocationState) ?? null
  const isAuthenticated = readAuthToken()

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/', { state: { openView: 'login' } })
    }
  }, [isAuthenticated, navigate])

  const enabled = FEATURE_SCHEDULE_UI && !!id && isAuthenticated
  const { data, loading, error } = useProcessSchedule(id ?? null, enabled)

  if (!isAuthenticated) {
    return null
  }

  const derivedNames = useMemo(() => {
    const projectTask = data.find((task) => task.id.startsWith('project:'))
    const contractTask = data.find((task) => task.id.startsWith('contract:'))
    const sowTask = data.find((task) => task.id.startsWith('sow:'))
    const processTask = data.find((task) => task.id.startsWith('process:'))
    return {
      projectName: state?.projectName ?? projectTask?.name ?? 'Project',
      contractName: state?.contractName ?? contractTask?.name ?? 'Contract',
      sowName: state?.sowName ?? sowTask?.name ?? 'SOW',
      processName: state?.processName ?? processTask?.name ?? 'Process',
      projectId: projectTask?.id?.split(':')[1] ?? state?.projectId ?? null,
      contractId: contractTask?.id?.split(':')[1] ?? state?.contractId ?? null,
      sowId: sowTask?.id?.split(':')[1] ?? state?.sowId ?? null,
      processId: processTask?.id?.split(':')[1] ?? state?.processId ?? id ?? null,
      projectSnapshot: state?.projectSnapshot ?? null,
    }
  }, [data, id, state?.contractId, state?.contractName, state?.processId, state?.processName, state?.projectId, state?.projectName, state?.projectSnapshot, state?.sowId, state?.sowName])

  const progressEnabled =
    FEATURE_SCHEDULE_UI &&
    FEATURE_PROGRESS_V2 &&
    !!derivedNames.projectId &&
    isAuthenticated
  const progress = useProgressSummary(
    {
      projectId: derivedNames.projectId ?? '',
      contractId: derivedNames.contractId ?? undefined,
      sowId: derivedNames.sowId ?? undefined,
      processId: derivedNames.processId ?? undefined,
      tenantId: 'default',
    },
    { enabled: progressEnabled },
  )

  if (!FEATURE_SCHEDULE_UI) {
    return (
      <ScheduleLayout
        title="Scheduling feature unavailable"
        breadcrumbs={['Dashboard', 'Scheduling']}
        tasks={[]}
        loading={false}
        error={null}
        emptyMessage="Scheduling is currently disabled."
      />
    )
  }

  if (!id) {
    return (
      <ScheduleLayout
        title="Process Schedule"
        breadcrumbs={['Dashboard', 'Process Schedule View']}
        tasks={[]}
        loading={false}
        error={null}
        emptyMessage="Process identifier missing from URL."
      />
    )
  }

  const breadcrumbs = [
    { label: 'Dashboard', onClick: () => navigate('/', { state: { openView: 'dashboard' } }) },
    {
      label: derivedNames.projectName,
      onClick: () =>
        navigate('/schedule', { state: { projectId: derivedNames.projectId, projectName: derivedNames.projectName } }),
    },
    {
      label: derivedNames.contractName,
      onClick: () =>
        navigate(`/contracts/${derivedNames.contractId ?? ''}/schedule`, {
          state: {
            projectId: derivedNames.projectId,
            projectName: derivedNames.projectName,
            contractName: derivedNames.contractName,
            contractId: derivedNames.contractId,
            projectSnapshot: derivedNames.projectSnapshot ?? null,
            focusContractId: derivedNames.contractId ?? null,
            utilityView: 'scheduling',
          },
        }),
    },
    {
      label: derivedNames.sowName,
      onClick: () =>
        navigate(`/sow/${derivedNames.sowId ?? ''}/schedule`, {
          state: {
            projectId: derivedNames.projectId,
            projectName: derivedNames.projectName,
            contractName: derivedNames.contractName,
            contractId: derivedNames.contractId,
            sowName: derivedNames.sowName,
            sowId: derivedNames.sowId,
            projectSnapshot: derivedNames.projectSnapshot ?? null,
          },
        }),
    },
    { label: `${derivedNames.processName} Schedule View` },
  ]
  const title = `${derivedNames.processName} · Process Schedule`

  return (
    <ScheduleLayout
      title={title}
      breadcrumbs={breadcrumbs}
      tasks={data}
      loading={loading}
      error={error}
      progress={{
        summary: progress.data,
        loading: progress.loading,
        refreshing: progress.refreshing,
        error: progress.error,
        enabled: progressEnabled,
        onRefresh: progress.refresh,
      }}
    />
  )
}

export default ProcessSchedulePage
