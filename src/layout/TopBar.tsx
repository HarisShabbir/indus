import React, { ReactNode } from 'react'

import Breadcrumbs, { type BreadcrumbItem } from '../components/breadcrumbs/Breadcrumbs'

type TopBarProps = {
  breadcrumbs: BreadcrumbItem[]
  center?: ReactNode
  actions?: ReactNode
}

export function TopBar({ breadcrumbs, center, actions }: TopBarProps) {
  return (
    <header className="app-topbar">
      <div className="app-topbar__section app-topbar__section--left">
        <Breadcrumbs items={breadcrumbs} />
      </div>
      {center ? <div className="app-topbar__section app-topbar__section--center">{center}</div> : <div className="app-topbar__spacer" />}
      <div className="app-topbar__section app-topbar__section--right">{actions}</div>
    </header>
  )
}

const IconShell = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    {children}
  </svg>
)

const MoonIcon = () => (
  <IconShell>
    <path d="M21 15.77A9 9 0 0 1 8.23 3 7 7 0 1 0 21 15.77z" strokeLinecap="round" strokeLinejoin="round" />
  </IconShell>
)

const CalendarIcon = () => (
  <IconShell>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16" strokeLinecap="round" />
    <path d="M9 3v4" strokeLinecap="round" />
    <path d="M15 3v4" strokeLinecap="round" />
  </IconShell>
)

const ChartIcon = () => (
  <IconShell>
    <path d="M4 19h16" strokeLinecap="round" />
    <path d="M8 19V11" strokeLinecap="round" />
    <path d="M12 19V7" strokeLinecap="round" />
    <path d="M16 19v-6" strokeLinecap="round" />
  </IconShell>
)

const AlertIcon = () => (
  <IconShell>
    <path d="M12 9v4" strokeLinecap="round" />
    <path d="M12 17h.01" strokeLinecap="round" />
    <path d="M5.07 18h13.86a1 1 0 0 0 .89-1.45L12.89 4.55a1 1 0 0 0-1.78 0L4.18 16.55A1 1 0 0 0 5.07 18Z" strokeLinejoin="round" />
  </IconShell>
)

const UsersIcon = () => (
  <IconShell>
    <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round" />
  </IconShell>
)

const ClipboardCheckIcon = () => (
  <IconShell>
    <path d="M8 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
    <path d="M9 2h6l.5 2h-7Z" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
  </IconShell>
)

const RadarIcon = () => (
  <IconShell>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v4" strokeLinecap="round" />
    <path d="M12 12 19 9" strokeLinecap="round" />
    <circle cx="12" cy="12" r="3" />
  </IconShell>
)

export const TopBarIcons = {
  Moon: MoonIcon,
  Calendar: CalendarIcon,
  Chart: ChartIcon,
  Alert: AlertIcon,
  Users: UsersIcon,
  ClipboardCheck: ClipboardCheckIcon,
  Radar: RadarIcon,
}

export default TopBar
