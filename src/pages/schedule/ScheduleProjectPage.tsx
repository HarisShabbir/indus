import React, { useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { FEATURE_SCHEDULE_UI, FEATURE_PROGRESS_V2 } from '../../config'
import { useProjectSchedule } from '../../hooks/useSchedule'
import { useProgressSummary } from '../../hooks/useProgress'
import ScheduleLayout from './ScheduleLayout'
import type { Project } from '../../api'
import { readAuthToken } from '../../utils/auth'

type LocationState = {
  projectId?: string
  projectName?: string
  projectSnapshot?: Project | null
} | null

export function ScheduleProjectPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state as LocationState) ?? null
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const projectId = state?.projectId ?? searchParams.get('projectId') ?? null
  const projectName = state?.projectName ?? searchParams.get('projectName') ?? 'Project'
  const projectSnapshot = state?.projectSnapshot ?? null
  const isAuthenticated = readAuthToken()

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/', { state: { openView: 'login' } })
    }
  }, [isAuthenticated, navigate])

  const enabled = FEATURE_SCHEDULE_UI && !!projectId && isAuthenticated
  const { data, loading, error } = useProjectSchedule(projectId, enabled)
  const progressEnabled = FEATURE_SCHEDULE_UI && FEATURE_PROGRESS_V2 && !!projectId && isAuthenticated
  const progress = useProgressSummary(
    { projectId: projectId ?? '', tenantId: 'default' },
    { enabled: progressEnabled },
  )

  if (!isAuthenticated) {
    return null
  }

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

  if (!projectId) {
    return (
      <ScheduleLayout
        title="Project Schedule"
        breadcrumbs={['Dashboard', 'Project Schedule View']}
        tasks={[]}
        loading={false}
        error={null}
        emptyMessage="Select a project from the dashboard to view its schedule."
      />
    )
  }

  const projectSlug = projectName.replace(/\s+/g, '_')
  const handleNavigateToCcc = () => {
    if (projectSnapshot) {
      navigate('/', { state: { openView: 'contract', projectSnapshot, projectId, utilityView: 'scheduling' } })
      return
    }
    if (projectId) {
      navigate('/', { state: { openView: 'contract', projectId, utilityView: 'scheduling' } })
      return
    }
    navigate('/')
  }

  const breadcrumbs = [
    { label: 'Dashboard', onClick: () => navigate('/', { state: { openView: 'dashboard' } }) },
    { label: projectSlug, onClick: handleNavigateToCcc },
    { label: 'Construction Control Center', onClick: handleNavigateToCcc },
    { label: 'Scheduling View' },
  ]
  const title = `${projectName} · Project Schedule`

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

export default ScheduleProjectPage
