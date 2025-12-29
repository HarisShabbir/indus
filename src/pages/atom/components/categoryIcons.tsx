import React from 'react'

export const CATEGORY_ICONS: Record<string, JSX.Element> = {
  actors: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="4" />
      <path d="M6 20c0-3.314 2.686-6 6-6s6 2.686 6 6" strokeLinecap="round" />
    </svg>
  ),
  materials: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" strokeLinejoin="round" />
      <path d="M12 3v18" />
      <path d="m4 7 8 4 8-4" />
    </svg>
  ),
  machinery: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.09l.06.07a2 2 0 1 1-2.83 2.83l-.07-.06A1 1 0 0 0 15 19.4a1 1 0 0 0-1 .6l-.22.53a2 2 0 0 1-3.56 0L10 20a1 1 0 0 0-1-.6 1 1 0 0 0-1.76-.47l-.07.06A2 2 0 1 1 4.34 16.2l.06-.07A1 1 0 0 0 5 15.4a1 1 0 0 0-.6-1l-.53-.22a2 2 0 0 1 0-3.56L4.4 10A1 1 0 0 0 5 9.4a1 1 0 0 0-.6-1L4 8.18a2 2 0 0 1 0-3.56l.53-.22a1 1 0 0 0 .47-1.76l-.06-.07A2 2 0 1 1 7.8 4.34l.07.06A1 1 0 0 0 9 5a1 1 0 0 0 1-.6l.22-.53a2 2 0 0 1 3.56 0L14 4.4a1 1 0 0 0 1 .6 1 1 0 0 0 1.76.47l.07-.06A2 2 0 1 1 19.66 7.8l-.06.07A1 1 0 0 0 19 9a1 1 0 0 0 .6 1l.53.22a2 2 0 0 1 0 3.56L19.4 15Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  consumables: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 2c0 4-4 6-4 10a4 4 0 1 0 8 0c0-4-4-6-4-10Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 16h8" strokeLinecap="round" />
    </svg>
  ),
  tools: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14.7 6.3a4 4 0 0 0-5.66 5.66l9 9 3-3-9-9Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m5 11-3 3 4 4 3-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  equipment: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 17h18" strokeLinecap="round" />
      <path d="M5 17V7l7-4 7 4v10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 17v4M15 17v4" strokeLinecap="round" />
    </svg>
  ),
  systems: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="5" cy="12" r="3" />
      <circle cx="19" cy="7" r="3" />
      <circle cx="19" cy="17" r="3" />
      <path d="M8 12h8M18 9l-6 3M12 12l6 3" strokeLinecap="round" />
    </svg>
  ),
  technologies: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6.2 6.2 9 9M14.9 9l2.8-2.8M9 15l-2.8 2.8M17.7 17.7 15 15" strokeLinecap="round" />
      <path d="M12 5V3M5 12H3M12 21v-2M21 12h-2" strokeLinecap="round" />
    </svg>
  ),
  financials: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v18" strokeLinecap="round" />
      <path d="M16.5 7.5a3.5 3.5 0 0 0-7 0c0 3.5 7 1.5 7 5a3.5 3.5 0 0 1-7 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}

type CategoryIconKey = keyof typeof CATEGORY_ICONS

export const getCategoryIcon = (categoryId: string): JSX.Element => CATEGORY_ICONS[categoryId as CategoryIconKey] ?? (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
