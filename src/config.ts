const FEATURE_RIGHT_PANEL_RAW =
  import.meta.env.VITE_FEATURE_CONTRACT_RIGHT_PANEL_ECHARTS ?? import.meta.env.VITE_FEATURE_CONTRACT_RIGHT_PANEL ?? 'false'
const FEATURE_SCHEDULE_RAW =
  import.meta.env.VITE_FEATURE_SCHEDULE_UI ?? import.meta.env.VITE_FEATURE_CONTRACT_SCHEDULE ?? 'false'

export const FEATURE_CONTRACT_RIGHT_PANEL_ECHARTS = FEATURE_RIGHT_PANEL_RAW === 'true'
export const FEATURE_SCHEDULE_UI = FEATURE_SCHEDULE_RAW === 'true'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
