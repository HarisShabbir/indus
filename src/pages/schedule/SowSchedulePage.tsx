import React, { useEffect, useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { FEATURE_SCHEDULE_UI, FEATURE_PROGRESS_V2 } from '../../config'
import { useSowSchedule } from '../../hooks/useSchedule'
import ScheduleLayout from './ScheduleLayout'
import type { Project } from '../../api'
import { readAuthToken } from '../../utils/auth'
import { useProgressSummary } from '../../hooks/useProgress'

type LocationState = {
  projectName?: string
  contractName?: string
  sowName?: string
  projectId?: string
  contractId?: string
  sowId?: string
  projectSnapshot?: Project | null
} | null

export function SowSchedulePage() {
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
  const { data, loading, error } = useSowSchedule(id ?? null, enabled)

  const derivedNames = useMemo(() => {
    const projectTask = data.find((task) => task.id.startsWith('project:'))
    const contractTask = data.find((task) => task.id.startsWith('contract:'))
    const sowTask = data.find((task) => task.id.startsWith('sow:'))
    return {
      projectName: state?.projectName ?? projectTask?.name ?? 'Project',
      contractName: state?.contractName ?? contractTask?.name ?? 'Contract',
      sowName: state?.sowName ?? sowTask?.name ?? 'SOW',
      projectId: projectTask?.id?.split(':')[1] ?? state?.projectId ?? null,
      contractId: contractTask?.id?.split(':')[1] ?? state?.contractId ?? null,
      sowId: sowTask?.id?.split(':')[1] ?? state?.sowId ?? id ?? null,
      projectSnapshot: state?.projectSnapshot ?? null,
    }
  }, [data, id, state?.contractId, state?.contractName, state?.projectId, state?.projectName, state?.projectSnapshot, state?.sowId, state?.sowName])

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
        title="SOW Schedule"
        breadcrumbs={['Dashboard', 'SOW Schedule View']}
        tasks={[]}
        loading={false}
        error={null}
        emptyMessage="Statement of Work identifier missing from URL."
      />
    )
  }

  if (!isAuthenticated) {
    return null
  }

  const projectSlug = derivedNames.projectName.replace(/\s+/g, '_')
  const projectSnapshot = derivedNames.projectSnapshot ?? state?.projectSnapshot ?? null

  const handleNavigateToCcc = () => {
    if (projectSnapshot) {
      navigate('/', {
        state: {
          openView: 'contract',
          projectSnapshot,
          focusContractId: derivedNames.contractId ?? null,
          utilityView: 'scheduling',
        },
      })
      return
    }
    if (derivedNames.projectId) {
      navigate('/', { state: { openView: 'dashboard' } })
      return
    }
    navigate('/')
  }

  const handleNavigateToContractSchedule = () => {
    navigate(`/contracts/${derivedNames.contractId ?? ''}/schedule`, {
      state: {
        projectId: derivedNames.projectId,
        projectName: derivedNames.projectName,
        contractName: derivedNames.contractName,
        contractId: derivedNames.contractId,
        projectSnapshot,
        focusContractId: derivedNames.contractId ?? null,
        utilityView: 'scheduling',
      },
    })
  }

  const breadcrumbs = [
    { label: 'Dashboard', onClick: () => navigate('/', { state: { openView: 'dashboard' } }) },
    { label: projectSlug },
    { label: 'Construction Control Center', onClick: handleNavigateToCcc },
    { label: 'CCC-Scheduling View', onClick: handleNavigateToContractSchedule },
    { label: `${derivedNames.sowName} Schedule`, isCurrent: true },
  ]
  const title = `${derivedNames.sowName} · SOW Schedule`

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

export default SowSchedulePage
