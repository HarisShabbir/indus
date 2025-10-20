const FEATURE_RIGHT_PANEL_RAW =
  import.meta.env.VITE_FEATURE_CONTRACT_RIGHT_PANEL_ECHARTS ?? import.meta.env.VITE_FEATURE_CONTRACT_RIGHT_PANEL ?? 'false'
const FEATURE_SCHEDULE_RAW =
  import.meta.env.VITE_FEATURE_SCHEDULE_UI ?? import.meta.env.VITE_FEATURE_CONTRACT_SCHEDULE ?? 'false'
const FEATURE_CCC_V2_RAW = import.meta.env.VITE_FEATURE_CCC_V2 ?? 'false'
const FEATURE_FINANCIAL_VIEW_RAW = import.meta.env.VITE_FEATURE_FINANCIAL_VIEW ?? 'false'
const FEATURE_ATOM_MANAGER_RAW = import.meta.env.VITE_FEATURE_ATOM_MANAGER ?? 'false'

export const FEATURE_CONTRACT_RIGHT_PANEL_ECHARTS = FEATURE_RIGHT_PANEL_RAW === 'true'
export const FEATURE_SCHEDULE_UI = FEATURE_SCHEDULE_RAW === 'true'
export const FEATURE_CCC_V2 = FEATURE_CCC_V2_RAW === 'true'
export const FEATURE_FINANCIAL_VIEW = FEATURE_FINANCIAL_VIEW_RAW === 'true'
export const FEATURE_ATOM_MANAGER = FEATURE_ATOM_MANAGER_RAW === 'true'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
