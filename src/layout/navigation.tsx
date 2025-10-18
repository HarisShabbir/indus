import React from 'react'

export type ThemeMode = 'light' | 'dark'

export const sidebarItems: Array<{ label: string; icon: React.ReactNode }> = [
  {
    label: 'Home',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 10.5l8-6.5 8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'CPDS',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="4" y="4" width="16" height="14" rx="2" />
        <path d="M8 8h8" strokeLinecap="round" />
        <path d="M8 12h5" strokeLinecap="round" />
        <path d="M14.5 16.5L19 21" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 16l3 3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'ACCS',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 7l6 6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 4l6 6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11 12l6 8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 5l4-1 4 4-1 4-4 1-4-4z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: 'AOS',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.5 14a6 6 0 0 1 11 0" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Analytics',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 18h16" strokeLinecap="round" />
        <path d="M7 18V11" strokeLinecap="round" />
        <path d="M12 18V7" strokeLinecap="round" />
        <path d="M17 18v-9" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08A1.65 1.65 0 0 0 10.91 3V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.08a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
  {
    label: 'Placeholder 1',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="6" y="6" width="12" height="12" rx="3" />
      </svg>
    ),
  },
  {
    label: 'Placeholder 2',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 5l6 4v6l-6 4-6-4V9z" strokeLinejoin="round" />
      </svg>
    ),
  },
]

export const HOME_NAV_INDEX = sidebarItems.findIndex((item) => item.label === 'Home')
export const ACCS_NAV_INDEX = sidebarItems.findIndex((item) => item.label === 'ACCS')

type SidebarNavProps = {
  activeIndex: number
  onSelect: (index: number) => void
  theme: ThemeMode
  onToggleTheme: () => void
  onNavigateLanding?: () => void
}

function ThemeIcon({ theme }: { theme: ThemeMode }) {
  return theme === 'dark' ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M21 15.77A9 9 0 0 1 8.23 3 7 7 0 1 0 21 15.77z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" strokeLinecap="round" />
      <path d="M12 20v2" strokeLinecap="round" />
      <path d="M4.93 4.93l1.41 1.41" strokeLinecap="round" />
      <path d="M17.66 17.66l1.41 1.41" strokeLinecap="round" />
      <path d="M2 12h2" strokeLinecap="round" />
      <path d="M20 12h2" strokeLinecap="round" />
      <path d="M6.34 17.66l-1.41 1.41" strokeLinecap="round" />
      <path d="M19.07 4.93l-1.41 1.41" strokeLinecap="round" />
    </svg>
  )
}

export function ThemeToggleButton({ theme, onToggle }: { theme: ThemeMode; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      aria-label="Toggle theme"
      title="Toggle theme"
      aria-pressed={theme === 'dark'}
    >
      <ThemeIcon theme={theme} />
    </button>
  )
}

export function SidebarNav({ activeIndex, onSelect, theme, onToggleTheme, onNavigateLanding }: SidebarNavProps) {
  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="sidebar-logo">D</div>
      {sidebarItems.map((item, index) => (
        <button
          key={item.label}
          className={`nav-btn ${index === activeIndex ? 'active' : ''}`}
          onClick={() => onSelect(index)}
          aria-label={item.label}
          title={item.label}
        >
          {item.icon}
        </button>
      ))}
      <button
        type="button"
        className={`nav-btn theme-nav ${theme === 'dark' ? 'active' : ''}`}
        onClick={onToggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        aria-pressed={theme === 'dark'}
      >
        <ThemeIcon theme={theme} />
      </button>
      <div className="sidebar-footer">
        {onNavigateLanding && (
          <button
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              border: '1px solid var(--border-subtle)',
              background: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
            onClick={onNavigateLanding}
            aria-label="Return to landing"
          >
            ↩︎
          </button>
        )}
      </div>
    </aside>
  )
}
