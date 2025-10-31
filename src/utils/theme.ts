export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'dipgos.theme'

export const resolveInitialTheme = (): ThemeMode => {
  const persisted = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
  if (persisted === 'light' || persisted === 'dark') {
    return persisted
  }
  const dataset = document.documentElement.dataset.theme as ThemeMode | undefined
  if (dataset === 'light' || dataset === 'dark') {
    return dataset
  }
  return 'dark'
}

export const applyTheme = (theme: ThemeMode) => {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(STORAGE_KEY, theme)
}

export const toggleThemeValue = (current: ThemeMode): ThemeMode => (current === 'light' ? 'dark' : 'light')
