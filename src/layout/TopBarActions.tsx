import React from 'react'
import { useNavigate } from 'react-router-dom'

import { type ThemeMode } from './navigation'
import { TopBarIcons } from './TopBar'

type ScopeParams = {
  projectId?: string | null
  contractId?: string | null
  sowId?: string | null
  processId?: string | null
  projectName?: string | null
  contractName?: string | null
  sowName?: string | null
  processName?: string | null
}

type Props = {
  theme: ThemeMode
  onToggleTheme: () => void
  scope: ScopeParams
}

export function TopBarGlobalActions({ theme, onToggleTheme, scope }: Props) {
  const navigate = useNavigate()

  const handleNavigate = (path: string) => () => {
    navigate(path, {
      state: {
        ...scope,
      },
    })
  }

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
        <span className="topbar-action-btn__badge">•</span>
      </button>
      <button type="button" className="topbar-action-btn" aria-label="Team directory" title="Team directory">
        <TopBarIcons.Users />
      </button>
    </>
  )
}

export default TopBarGlobalActions
