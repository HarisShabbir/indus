export const generateClientId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `cid-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`
}

export default generateClientId
