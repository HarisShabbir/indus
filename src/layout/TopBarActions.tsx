import React, { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { type ThemeMode } from './navigation'
import { TopBarIcons } from './TopBar'
import { getAlarmTowerSummary, markAlarmOrigin, useAlarmTowerSummary } from '../state/alarmTowerStore'
import { generateClientId } from '../utils/id'

type ScopeParams = {
  projectId?: string | null
  contractId?: string | null
  sowId?: string | null
  processId?: string | null
  projectName?: string | null
  contractName?: string | null
  sowName?: string | null
  processName?: string | null
  tenantId?: string | null
}

type Props = {
  theme: ThemeMode
  onToggleTheme: () => void
  scope: ScopeParams
  alarmCount?: number
  alarmSeverity?: 'info' | 'warn' | 'critical' | null
}

export function TopBarGlobalActions({ theme, onToggleTheme, scope, alarmCount, alarmSeverity }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const towerSummary = useAlarmTowerSummary()

  const derivedCount = alarmCount ?? towerSummary.count
  const derivedSeverity = alarmSeverity ?? towerSummary.severity ?? 'info'

  const handleNavigate = (path: string) => () => {
    if (path === '/alarms') {
      markAlarmOrigin({
        path: location.pathname,
        label: scope.processName ?? scope.contractName ?? scope.projectName ?? 'Last view',
        state: {
          tenantId: scope.tenantId ?? 'default',
          projectId: scope.projectId ?? null,
          contractId: scope.contractId ?? null,
          sowId: scope.sowId ?? null,
          processId: scope.processId ?? null,
          processName: scope.processName ?? null,
        },
      })
    }
    navigate(path, {
      state: {
        ...scope,
      },
    })
  }

  const derivePageLabel = () => {
    const path = location.pathname
    if (path === '/alarms') return 'Alarms'
    if (path.startsWith('/change')) return 'Change'
    if (path.startsWith('/atoms')) return 'Atoms'
    if (path.startsWith('/financial')) return 'Financial'
    if (path.startsWith('/schedule')) return 'Schedule'
    if (path.startsWith('/process')) return 'Process'
    if (path === '/') return 'Dashboard'
    return 'Workspace'
  }

  const handleOpenCollaboration = () => {
    const label = derivePageLabel()
    const contextPayload = {
      title: `${label} context`,
      path: location.pathname,
      timestamp: new Date().toISOString(),
      scope,
      filters: location.state ?? null,
    }
    navigate('/collaboration', {
      state: {
        threadId: generateClientId(),
        origin: {
          path: location.pathname,
          label,
          chain: [label],
          state: location.state,
        },
        context: {
          kind: 'page',
          payload: contextPayload,
        },
      },
    })
  }

  const badgeClass = useMemo(() => {
    if (!derivedCount) return null
    const severity = derivedSeverity ?? 'info'
    return `topbar-action-btn__badge topbar-action-btn__badge--${severity}`
  }, [derivedCount, derivedSeverity])
  const alarmLabel = derivedCount && derivedCount > 99 ? '99+' : String(derivedCount ?? '')

  return (
    <>
      <button
        type="button"
        className="topbar-action-btn"
        onClick={onToggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        <TopBarIcons.Moon />
      </button>
      <button type="button" className="topbar-action-btn" aria-label="Calendar" title="Calendar">
        <TopBarIcons.Calendar />
      </button>
      <button
        type="button"
        className="topbar-action-btn"
        aria-label="Open collaboration workspace"
        title="Open collaboration workspace"
        onClick={handleOpenCollaboration}
      >
        <TopBarIcons.Chat />
      </button>
      <button
        type="button"
        className="topbar-action-btn"
        aria-label="Open change management"
        title="Open change management"
        onClick={handleNavigate('/change-management')}
      >
        <TopBarIcons.ClipboardCheck />
      </button>
      <button
        type="button"
        className="topbar-action-btn topbar-action-btn--alert"
        aria-label="Open alarm center"
        title="Open alarm center"
        onClick={handleNavigate('/alarms')}
      >
        <TopBarIcons.Alert />
        {derivedCount && derivedCount > 0 ? <span className={badgeClass ?? undefined}>{alarmLabel}</span> : null}
      </button>
      <button type="button" className="topbar-action-btn" aria-label="Team directory" title="Team directory">
        <TopBarIcons.Users />
      </button>
    </>
  )
}

export default TopBarGlobalActions
