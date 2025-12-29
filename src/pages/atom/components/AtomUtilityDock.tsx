import React, { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { FEATURE_ATOM_MANAGER, FEATURE_SCM } from '../../../config'

export type AtomUtilityView = 'manager' | 'scheduling' | 'financial' | 'sustainability' | 'procurement' | 'forecasting'

type AtomUtilityDockProps = {
  activeView: AtomUtilityView
  scopeState?: Record<string, unknown> | null
}

type DockViewConfig = {
  id: AtomUtilityView
  label: string
  icon: React.ReactNode
  path?: string | null
  state?: Record<string, unknown>
}

const VIEWS: DockViewConfig[] = [
  {
    id: 'manager',
    label: 'Atom Manager',
    path: '/atoms',
    icon: (
      <svg viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor" fill="none">
        <circle cx="12" cy="12" r="2.4" />
        <path d="M4.5 8c3.5-6 11.5-6 15 0s-3.5 14-7.5 8-7.5-2-7.5-8Z" />
      </svg>
    ),
  },
  {
    id: 'scheduling',
    label: 'Scheduling View',
    path: '/atoms/scheduling',
    icon: (
      <svg viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor" fill="none">
        <rect x="4" y="5" width="16" height="15" rx="3" />
        <path d="M8 3v4" strokeLinecap="round" />
        <path d="M16 3v4" strokeLinecap="round" />
        <path d="M4 11h16" />
        <path d="M9 15h2" strokeLinecap="round" />
        <path d="M13 15h2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'financial',
    label: 'Financial View',
    path: '/atoms/cost',
    icon: (
      <svg viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor" fill="none">
        <rect x="4" y="6" width="16" height="13" rx="2" />
        <path d="M4 10h16" />
        <path d="M8 14h1" strokeLinecap="round" />
        <path d="M11 14h1" strokeLinecap="round" />
        <path d="M14 14h2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'sustainability',
    label: 'Sustainability View',
    path: '/',
    state: { openView: 'dashboard', utilityView: 'sustainability' },
    icon: (
      <svg viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor" fill="none">
        <path d="M12 21c4-2.5 6-5.5 6-9.5a6 6 0 0 0-12 0C6 15.5 8 18.5 12 21Z" />
        <path d="M12 10a2 2 0 0 1 2 2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'procurement',
    label: 'Procurement / SCM View',
    path: '/atoms/scm',
    icon: (
      <svg viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor" fill="none">
        <path d="M4 7h16" strokeLinecap="round" />
        <path d="M6 7v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
        <path d="M10 11h4" strokeLinecap="round" />
        <path d="M12 7V3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'forecasting',
    label: 'Forecasting View',
    path: '/',
    state: { openView: 'dashboard', utilityView: 'forecasting' },
    icon: (
      <svg viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor" fill="none">
        <path d="M4 18h16" strokeLinecap="round" />
        <path d="M6 16l3.5-4 2.5 3 4.5-6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17 9h3v3" strokeLinecap="round" />
      </svg>
    ),
  },
]

export function AtomUtilityDock({ activeView, scopeState }: AtomUtilityDockProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const views = useMemo(() => {
    if (!FEATURE_ATOM_MANAGER) return []
    return VIEWS.filter((view) => (view.id === 'procurement' ? FEATURE_SCM : true))
  }, [FEATURE_SCM])

  if (!views.length) {
    return null
  }

  const handleNavigate = (view: DockViewConfig) => {
    const targetPath = view.path ?? location.pathname
    const nextState =
      view.path && view.path.startsWith('/atoms')
        ? { ...(scopeState ?? {}), ...(view.state ?? {}) }
        : view.state

    if (location.pathname === targetPath && !nextState) {
      return
    }
    navigate(targetPath, {
      state: nextState,
    })
  }

  return (
    <div className="contract-utility-floating atom-utility-dock" role="navigation" aria-label="Atom quick navigation">
      {views.map((view) => {
        const isActive = view.id === activeView
        return (
          <button
            key={view.id}
            type="button"
            className={`utility-dock-btn ${isActive ? 'active' : ''}`}
            onClick={() => {
              if (view.id === 'procurement') {
                if (!FEATURE_SCM) return
                const record = { ...(scopeState ?? {}) } as Record<string, unknown>
                const processId = typeof record.processId === 'string' && record.processId.trim() ? record.processId : null
                const processName = typeof record.processName === 'string' && record.processName.trim() ? record.processName : null
                navigate('/atoms/scm', {
                  state: {
                    ...record,
                    processId,
                    processName,
                    source: 'atom',
                  },
                })
                return
              }
              handleNavigate(view)
            }}
            aria-pressed={isActive}
            title={view.label}
          >
            <span aria-hidden>{view.icon}</span>
            <span className="sr-only">{view.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export default AtomUtilityDock
