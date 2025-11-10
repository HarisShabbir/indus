import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { SidebarNav, HOME_NAV_INDEX, ACCS_NAV_INDEX, CHANGE_NAV_INDEX, type ThemeMode } from '../../layout/navigation'
import TopBar from '../../layout/TopBar'
import TopBarGlobalActions from '../../layout/TopBarActions'
import { applyTheme, resolveInitialTheme, toggleThemeValue } from '../../utils/theme'
import ScmVisualExperience from './scm-visual/ScmVisualExperience'
import { resolveProcessProfile } from './scm-visual/processProfiles'
import { FEATURE_SCM_VISUAL } from '../../config'
import { AlarmSeverity } from './scm-visual/types'

type ScopeState = {
  projectId?: string | null
  projectName?: string | null
  contractId?: string | null
  contractName?: string | null
  sowId?: string | null
  sowName?: string | null
  processId?: string | null
  processName?: string | null
  tenantId?: string | null
}

const AtomScmVisualPage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme())
  const [activeNavIndex, setActiveNavIndex] = useState(ACCS_NAV_INDEX)
  const scopeState = useMemo(() => ((location.state as ScopeState | null) ?? {}), [location.state])
  const [alarmSummary, setAlarmSummary] = useState<{ count: number; severity: AlarmSeverity | null }>({ count: 0, severity: null })

  useEffect(() => {
    if (!FEATURE_SCM_VISUAL) {
      navigate('/atoms/scm')
    }
  }, [navigate])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => toggleThemeValue(prev))
  }, [])

  const handleNavSelect = useCallback(
    (index: number) => {
      setActiveNavIndex(index)
      if (index === HOME_NAV_INDEX) {
        navigate('/')
      }
      if (index === CHANGE_NAV_INDEX) {
        navigate('/change-management')
      }
    },
    [navigate],
  )

  const breadcrumbs = useMemo(
    () => [
      { label: 'Atoms', href: '/atoms' },
      { label: 'SCM Visual Flow' },
    ],
    [],
  )

  const processProfile = useMemo(() => resolveProcessProfile(scopeState.processId), [scopeState.processId])

  return (
    <div className="scm-visual-layout" data-theme={theme}>
      <SidebarNav activeIndex={activeNavIndex} onSelect={handleNavSelect} theme={theme} onToggleTheme={handleToggleTheme} />
      <div className="scm-visual-main">
        <TopBar
          breadcrumbs={breadcrumbs}
          actions={
            <TopBarGlobalActions
              theme={theme}
              onToggleTheme={handleToggleTheme}
              scope={scopeState}
              alarmCount={alarmSummary.count}
              alarmSeverity={alarmSummary.severity ?? undefined}
            />
          }
        />
        <main className="scm-visual-content">
          <ScmVisualExperience
            scope={scopeState}
            processProfile={processProfile}
            onAlarmSummary={(summary) => {
              setAlarmSummary(summary)
            }}
          />
        </main>
      </div>
    </div>
  )
}

export default AtomScmVisualPage
