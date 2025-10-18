export const AUTH_TOKEN_KEY = 'dipgosAuthToken'
export const AUTH_USER_KEY = 'dipgosAuthUser'
export const AUTH_PASS_KEY = 'dipgosAuthPass'

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

export const readAuthToken = (): boolean => {
  if (!canUseStorage()) return false
  return window.localStorage.getItem(AUTH_TOKEN_KEY) === 'true'
}

export const setAuthToken = (value: boolean) => {
  if (!canUseStorage()) return
  window.localStorage.setItem(AUTH_TOKEN_KEY, value ? 'true' : 'false')
}

export const persistCredentials = (username: string, password: string) => {
  if (!canUseStorage()) return
  window.localStorage.setItem(AUTH_USER_KEY, username)
  window.localStorage.setItem(AUTH_PASS_KEY, password)
}

export const readSavedCredentials = (): { username: string; password: string } => {
  if (!canUseStorage()) {
    return { username: 'demo@dipgos', password: 'Secure!Demo2025' }
}
  const username = window.localStorage.getItem(AUTH_USER_KEY) ?? 'demo@dipgos'
  const password = window.localStorage.getItem(AUTH_PASS_KEY) ?? 'Secure!Demo2025'
  return { username, password }
}
