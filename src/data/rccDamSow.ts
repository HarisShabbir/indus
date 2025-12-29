import type { MapMarker } from '../types/ccc'

export const RCC_DAM_CENTER = {
  lat: 35.6215,
  lon: 74.616,
}

export type RccProcessNode = {
  id: string
  label: string
  status: 'On Track' | 'Live' | 'Monitoring' | 'Delayed'
  percent: number
  badge?: 'Live' | 'In Progress'
  markerId?: string
}

export type RccFacilityStep = {
  id: string
  label: string
  status: 'Completed' | 'In Progress' | 'Pending'
}

export type RccFacilityNode = {
  id: string
  label: string
  status: 'In Progress' | 'Delayed' | 'Completed'
  steps: RccFacilityStep[]
}

export const RCC_PROCESSES: RccProcessNode[] = [
  { id: 'rcc-raw-material', label: 'Raw Material Source & Verification', status: 'On Track', percent: 92, badge: 'Live', markerId: 'rcc-map-raw-material' },
  { id: 'rcc-simulations', label: 'Simulations', status: 'On Track', percent: 88, markerId: 'rcc-map-simulations' },
  { id: 'rcc-mix-design', label: 'Concrete Mix Design', status: 'Monitoring', percent: 83, markerId: 'rcc-map-mix-design' },
  { id: 'rcc-thermal-design', label: 'Placement Schedules & Thermal Design', status: 'On Track', percent: 79, badge: 'Live', markerId: 'rcc-map-thermal' },
  { id: 'rcc-batching-plant', label: 'Concrete Batching Plant', status: 'Monitoring', percent: 74, markerId: 'rcc-map-batching' },
  { id: 'rcc-aggregate-plant', label: 'Aggregate Plant', status: 'On Track', percent: 70, markerId: 'rcc-map-aggregate' },
  { id: 'rcc-transportation', label: 'Transportation System', status: 'On Track', percent: 68, markerId: 'rcc-map-transport' },
  { id: 'rcc-trial', label: 'RCC Trial Construction', status: 'Live', percent: 65, badge: 'Live', markerId: 'rcc-map-trial' },
  { id: 'rcc-lab', label: 'RCC Lab', status: 'Monitoring', percent: 62, markerId: 'rcc-map-lab' },
  { id: 'rcc-preparations', label: 'Placement Preparations', status: 'On Track', percent: 59, markerId: 'rcc-map-preparations' },
]

export const RCC_FACILITIES: RccFacilityNode[] = [
  {
    id: 'facility-aggregate-phase-1',
    label: 'Aggregate Crushing Plant (Phase-1)',
    status: 'In Progress',
    steps: [
      { id: 'facility-aggregate-phase-1-po', label: 'Submission of PO', status: 'Completed' },
      { id: 'facility-aggregate-phase-1-delivery', label: 'Delivery at Site', status: 'In Progress' },
      { id: 'facility-aggregate-phase-1-calibration', label: 'Calibration', status: 'Pending' },
    ],
  },
  {
    id: 'facility-batching-phase-1',
    label: 'Batching Plant (Phase-1)',
    status: 'In Progress',
    steps: [
      { id: 'facility-batching-phase-1-po', label: 'Submission of PO', status: 'Completed' },
      { id: 'facility-batching-phase-1-delivery', label: '1st Stage – Delivery at Site', status: 'In Progress' },
      { id: 'facility-batching-phase-1-calibration', label: '1st Stage – Calibration', status: 'Pending' },
    ],
  },
  {
    id: 'facility-aggregate-phase-2',
    label: 'Aggregate Crushing Plant (Phase-2)',
    status: 'Delayed',
    steps: [{ id: 'facility-aggregate-phase-2-po', label: 'Submission of PO', status: 'Pending' }],
  },
]

type MapSeed = {
  id: string
  label: string
  status: MapMarker['status']
  percent: number
  offsetLat: number
  offsetLon: number
}

const MAP_SEEDS: MapSeed[] = [
  { id: 'rcc-map-raw-material', label: 'Raw Material Source & Verification', status: 'on-track', percent: 92, offsetLat: 0.006, offsetLon: -0.004 },
  { id: 'rcc-map-simulations', label: 'Simulations', status: 'on-track', percent: 88, offsetLat: 0.0045, offsetLon: -0.0008 },
  { id: 'rcc-map-mix-design', label: 'Concrete Mix Design', status: 'monitoring', percent: 83, offsetLat: 0.0025, offsetLon: 0.0022 },
  { id: 'rcc-map-thermal', label: 'Placement & Thermal Design', status: 'on-track', percent: 79, offsetLat: -0.0015, offsetLon: -0.0025 },
  { id: 'rcc-map-batching', label: 'Batching Plant', status: 'monitoring', percent: 74, offsetLat: -0.0035, offsetLon: 0.0036 },
  { id: 'rcc-map-aggregate', label: 'Aggregate Plant', status: 'on-track', percent: 70, offsetLat: -0.0041, offsetLon: -0.0031 },
  { id: 'rcc-map-transport', label: 'Transportation System', status: 'on-track', percent: 68, offsetLat: 0.0038, offsetLon: 0.0045 },
  { id: 'rcc-map-trial', label: 'RCC Trial Construction', status: 'risk', percent: 65, offsetLat: 0.001, offsetLon: 0.0051 },
  { id: 'rcc-map-lab', label: 'RCC Lab', status: 'risk', percent: 62, offsetLat: -0.0055, offsetLon: 0.0018 },
  { id: 'rcc-map-preparations', label: 'Placement Preparations', status: 'monitoring', percent: 59, offsetLat: 0.0002, offsetLon: -0.0044 },
]

export const RCC_MAP_MARKERS: MapMarker[] = [
  {
    id: 'sow-mw01-rcc',
    type: 'sow',
    name: 'RCC Dam (2.5 years plan)',
    lat: RCC_DAM_CENTER.lat,
    lon: RCC_DAM_CENTER.lon,
    status: 'monitoring',
    percent_complete: 86.8,
    spi: 0.92,
    cpi: 0.88,
  },
  ...MAP_SEEDS.map((seed) => ({
    id: seed.id,
    type: 'process' as const,
    name: seed.label,
    lat: Number((RCC_DAM_CENTER.lat + seed.offsetLat).toFixed(6)),
    lon: Number((RCC_DAM_CENTER.lon + seed.offsetLon).toFixed(6)),
    status: seed.status,
    percent_complete: seed.percent,
    spi: seed.status === 'risk' ? 0.82 : seed.status === 'monitoring' ? 0.94 : 1.02,
    cpi: seed.status === 'risk' ? 0.79 : seed.status === 'monitoring' ? 0.9 : 1.04,
  })),
]
