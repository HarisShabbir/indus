import { useEffect, useMemo, useState } from 'react'

type ChartPalette = {
  background: string
  text: string
  subtleText: string
  grid: string
  actual: string
  planned: string
  plannedLine: string
  success: string
  warning: string
  danger: string
  neutral: string
  accent: string
}

const LIGHT: ChartPalette = {
  background: '#ffffff',
  text: '#0f172a',
  subtleText: '#64748b',
  grid: '#e2e8f0',
  actual: '#1f77b4',
  planned: '#ffb347',
  plannedLine: '#f97316',
  success: '#2ca02c',
  warning: '#f59e0b',
  danger: '#dc2626',
  neutral: '#94a3b8',
  accent: '#6366f1',
}

const DARK: ChartPalette = {
  background: '#0f172a',
  text: '#e2e8f0',
  subtleText: '#94a3b8',
  grid: '#1e293b',
  actual: '#60a5fa',
  planned: '#fbbf24',
  plannedLine: '#f97316',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#f87171',
  neutral: '#64748b',
  accent: '#818cf8',
}

export function useChartTheme(): ChartPalette {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return false
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => setIsDark(media.matches)
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [])

  return useMemo(() => (isDark ? DARK : LIGHT), [isDark])
}

export type { ChartPalette }
