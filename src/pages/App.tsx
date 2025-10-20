import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  ScaleControl,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
} from 'react-leaflet'
import L, { DivIcon, LatLngBoundsExpression } from 'leaflet'
import {
  Alert,
  Project,
  ProjectAnalytics,
  ContractSite,
  ProjectControlCenterPayload,
  WorkInProgressMetric,
  createProject,
  fetchAlerts,
  fetchProjectAnalytics,
  fetchProjectControlCenter,
  fetchProjects,
  fetchWeatherSummary,
  WeatherSummary,
} from '../api'
import ProjectProductivityPanel from '../panels/ProjectProductivityPanel'
import HierarchyWipBoard from '../components/wip/HierarchyWipBoard'
import { FEATURE_SCHEDULE_UI, FEATURE_CCC_V2, FEATURE_FINANCIAL_VIEW, FEATURE_ATOM_MANAGER } from '../config'
import 'leaflet/dist/leaflet.css'
import Breadcrumbs from '../components/breadcrumbs/Breadcrumbs'
import {
  SidebarNav,
  sidebarItems,
  HOME_NAV_INDEX,
  ACCS_NAV_INDEX,
  ThemeToggleButton,
  type ThemeMode,
} from '../layout/navigation'
import { useScheduleStore } from '../state/scheduleStore'
import { persistCredentials, readAuthToken, readSavedCredentials, setAuthToken } from '../utils/auth'

type Theme = ThemeMode
type View = 'landing' | 'login' | 'dashboard' | 'contract'
type PhaseFilter = 'All' | 'Construction' | 'O&M' | 'Planning & Design'
type MapView = 'atlas' | 'satellite' | 'terrain' | 'blueprint'

type MapFeatureToggle = {
  geofences: boolean
  intensity: boolean
}

const MIN_CONTRACT_WIP_HEIGHT = 320
const MIN_CCC_MAP_HEIGHT = 360
const MAX_CCC_MAP_HEIGHT = 780

const PROJECT_CONTROL_CENTER_CACHE = new Map<string, ProjectControlCenterPayload>()
const PROJECT_CONTROL_CENTER_INFLIGHT = new Map<string, Promise<ProjectControlCenterPayload>>()

const getCachedProjectControlCenter = (projectId: string) => PROJECT_CONTROL_CENTER_CACHE.get(projectId)

const warmProjectControlCenter = (projectId: string): Promise<ProjectControlCenterPayload> => {
  if (!projectId) {
    return Promise.reject(new Error('Missing project id'))
  }
  const cached = PROJECT_CONTROL_CENTER_CACHE.get(projectId)
  if (cached) {
    return Promise.resolve(cached)
  }
  const inflight = PROJECT_CONTROL_CENTER_INFLIGHT.get(projectId)
  if (inflight) {
    return inflight
  }
  const request = fetchProjectControlCenter(projectId)
    .then((payload) => {
      PROJECT_CONTROL_CENTER_CACHE.set(projectId, payload)
      PROJECT_CONTROL_CENTER_INFLIGHT.delete(projectId)
      return payload
    })
    .catch((error) => {
      PROJECT_CONTROL_CENTER_INFLIGHT.delete(projectId)
      throw error
    })
  PROJECT_CONTROL_CENTER_INFLIGHT.set(projectId, request)
  return request
}

const FALLBACK_PROJECTS: Project[] = [
  {
    id: 'mohmand-dam',
    name: 'Mohmand Dam',
    phase: 'Construction',
    status_pct: 43,
    status_label: undefined,
    alerts: 28,
    address: 'Mohmand Dam, Mohmand Agency, Pakistan',
    lat: 34.755,
    lng: 71.215,
    image: '/images/ACCS/mohmand.jpg',
    geofence_radius_m: 1500,
  },
  {
    id: 'dasu-hpp',
    name: 'Dasu Hydropower Project',
    phase: 'Construction',
    status_pct: 20,
    status_label: undefined,
    alerts: 22,
    address: 'Dasu Hydropower Project, Upper Kohistan, Pakistan',
    lat: 35.291,
    lng: 72.103,
    image: '/images/ACCS/dasu.jpg',
    geofence_radius_m: 1800,
  },
  {
    id: 'diamer-basha',
    name: 'Diamer Basha Dam',
    phase: 'Construction',
    status_pct: 20,
    status_label: undefined,
    alerts: 12,
    address: 'Diamer Basha Dam, Gilgit-Baltistan, Pakistan',
    lat: 35.619,
    lng: 74.616,
    image: '/images/ACCS/diamer.jpg',
    geofence_radius_m: 2000,
  },
  {
    id: 'ts-extension',
    name: 'Tarbela 5th Extension',
    phase: 'Construction',
    status_pct: 47.5,
    status_label: undefined,
    alerts: 8,
    address: 'Tarbela Power Project, Haripur, Pakistan',
    lat: 34.088,
    lng: 72.693,
    image: '/images/ACCS/tarbela_5th_extension.jpg',
    geofence_radius_m: 1400,
  },
  {
    id: 'tarbela-4th',
    name: 'Tarbela 4th Extension',
    phase: 'O&M',
    status_pct: 100,
    status_label: 'In-operation',
    alerts: 22,
    address: 'Tarbela Dam, Haripur, Pakistan',
    lat: 34.088,
    lng: 72.693,
    image: '/images/AOS/tarbela.jpg',
    geofence_radius_m: 1200,
  },
  {
    id: 'mangla',
    name: 'Mangla Dam',
    phase: 'O&M',
    status_pct: 100,
    status_label: 'Maintenance',
    alerts: 22,
    address: 'Mangla Dam, Mirpur, Azad Kashmir',
    lat: 33.135,
    lng: 73.64,
    image: '/images/AOS/mangla.jpg',
    geofence_radius_m: 1600,
  },
  {
    id: 'ghazi-barotha',
    name: 'Ghazi-Barotha',
    phase: 'O&M',
    status_pct: 100,
    status_label: 'In-operation',
    alerts: 22,
    address: 'Ghazi Barotha Hydropower Project, Attock, Pakistan',
    lat: 33.969,
    lng: 72.708,
    image: '/images/AOS/ghazi.jpg',
    geofence_radius_m: 1300,
  },
  {
    id: 'chashma',
    name: 'Chashma Hydropower Plant',
    phase: 'O&M',
    status_pct: 100,
    status_label: 'Shutdown',
    alerts: 22,
    address: 'Chashma Barrage, Mianwali, Pakistan',
    lat: 32.39,
    lng: 71.41,
    image: '/images/AOS/chasma.jpg',
    geofence_radius_m: 1500,
  },
  {
    id: 'bungi-hpp',
    name: 'Bungi Hydropower Project',
    phase: 'Planning & Design',
    status_pct: 12,
    status_label: 'Concept',
    alerts: 5,
    address: 'Bunji, Gilgit-Baltistan, Pakistan',
    lat: 35.68,
    lng: 74.617,
    image: '/images/CPDS/Bungi_HPP.jpg',
    geofence_radius_m: 2100,
  },
  {
    id: 'harpo-hpp',
    name: 'Harpo Hydropower Project',
    phase: 'Planning & Design',
    status_pct: 18,
    status_label: 'Feasibility',
    alerts: 7,
    address: 'Harpo, Skardu, Gilgit-Baltistan',
    lat: 35.33,
    lng: 74.81,
    image: '/images/CPDS/HARPO_HPP.jpg',
    geofence_radius_m: 1800,
  },
  {
    id: 'pattan-dam',
    name: 'Pattan Hydropower Project',
    phase: 'Planning & Design',
    status_pct: 9,
    status_label: 'Pre-feasibility',
    alerts: 6,
    address: 'Pattan, Kohistan, Pakistan',
    lat: 35.03,
    lng: 72.943,
    image: '/images/CPDS/Pattan.jpg',
    geofence_radius_m: 1700,
  },
  {
    id: 'thakot-dam',
    name: 'Thakot Hydropower Project',
    phase: 'Planning & Design',
    status_pct: 15,
    status_label: 'Design',
    alerts: 4,
    address: 'Thakot, Batagram, Pakistan',
    lat: 34.86,
    lng: 72.915,
    image: '/images/CPDS/Thakot.jpg',
    geofence_radius_m: 1600,
  },
]

const FALLBACK_CONTRACT_METRICS: ProjectControlCenterPayload['metrics'] = {
  alerts: 12,
  physical: { actual: 68, planned: 82 },
  productivity: {
    design: [
      { label: 'HM-1 Tender Drawings', status: 'Completed', percent: 100 },
      { label: 'MW-1 CFD Modelling Stage 3', status: 'In Progress', percent: 65 },
    ],
    preparatory: [
      { label: 'MW-1 RCC Facilities', status: 'In Progress', percent: 74 },
      { label: 'Reservoir Slope Protection', status: 'In Progress', percent: 48 },
      { label: 'Service Buildings', status: 'Delayed', percent: 32 },
    ],
    construction: [
      { label: 'MW-1 Dam Pit Excavation', status: 'Delayed', actual: 74, planned: 82 },
      { label: 'MW-1 Right Bank Abutment', status: 'In Progress', actual: 62, planned: 62 },
      { label: 'EM-02 RB Powerhouse', status: 'In Progress', actual: 45, planned: 50 },
    ],
  },
  milestones: [
    { label: 'Milestone A & B', status: 'Completed' },
    { label: 'Milestone C', status: 'Delayed' },
    { label: 'Milestone D', status: 'In Progress' },
  ],
  quality: {
    ncr: { closed: 122, open: 34, issued: 156 },
    qaor: { closed: 169, open: 40, issued: 209 },
    conformance: [
      { label: 'Excavation Tolerance', status: 'Within ±0.3%', description: 'Survey validated' },
      { label: 'Rebar Quality Audits', status: 'In Progress', description: 'Batch sampling underway' },
    ],
  },
  workInProgress: [
    { contract: 'MW-01', status: 'Construction', percent: 68 },
    { contract: 'HM-01', status: 'Bidding', percent: 34 },
    { contract: 'MW-02', status: 'Bidding', percent: 42 },
    { contract: 'EM-01', status: 'Pre-PQ', percent: 18 },
    { contract: 'EM-02', status: 'Pre-PQ', percent: 26 },
    { contract: 'HM-02', status: 'PQ', percent: 22 },
  ],
  spi: {
    value: 0.75,
    status: 'Amber',
    runway_days: 47,
    burn_rate_days: 47,
    cash_flow: 4_838_488,
    tasks: [
      { label: 'Main Facilities for RCC', impact: '5%', status: 'In Progress' },
      { label: 'Dam Pit Excavation', impact: '4.8%', status: 'Delayed' },
      { label: 'MW-2 Commencement', impact: '10%', status: 'In Progress' },
      { label: 'HM-1 Commissionment', impact: '10%', status: 'In Progress' },
    ],
  },
}

const FALLBACK_CONTRACTS: Record<string, ContractSite[]> = {
  'diamer-basha': [
    {
      id: 'mw-01-main-dam',
      project_id: 'diamer-basha',
      name: 'MW-01 – Main Dam',
      phase: 'Phase-1 (Dam Part)',
      discipline: 'Civil',
      lat: 35.6230,
      lng: 74.6135,
      status_pct: 74,
      status_label: 'Construction',
      alerts: 5,
      image: '/images/contracts/blueprint.jpg',
    },
    {
      id: 'mw-02-rb-powerhouse',
      project_id: 'diamer-basha',
      name: 'MW-02 – RB Powerhouse',
      phase: 'Phase-1 (Dam Part)',
      discipline: 'Mechanical',
      lat: 35.6248,
      lng: 74.6236,
      status_pct: 62,
      status_label: 'Construction',
      alerts: 3,
      image: '/images/contracts/blueprint.jpg',
    },
    {
      id: 'mw-02-lb-powerhouse',
      project_id: 'diamer-basha',
      name: 'MW-02 – LB Powerhouse',
      phase: 'Phase-1 (Dam Part)',
      discipline: 'Mechanical',
      lat: 35.6229,
      lng: 74.6202,
      status_pct: 54,
      status_label: 'Bidding',
      alerts: 3,
      image: '/images/contracts/blueprint.jpg',
    },
    {
      id: 'em-01-lb',
      project_id: 'diamer-basha',
      name: 'EM-01 – LB',
      phase: 'Phase-1 (Dam Part)',
      discipline: 'Electrical',
      lat: 35.6215,
      lng: 74.6207,
      status_pct: 58,
      status_label: 'Bidding',
      alerts: 2,
      image: '/images/contracts/blueprint.jpg',
    },
    {
      id: 'em-01-rb',
      project_id: 'diamer-basha',
      name: 'EM-01 – RB',
      phase: 'Phase-1 (Dam Part)',
      discipline: 'Electrical',
      lat: 35.6239,
      lng: 74.6244,
      status_pct: 52,
      status_label: 'Bidding',
      alerts: 2,
      image: '/images/contracts/blueprint.jpg',
    },
    {
      id: 'em-02-lb',
      project_id: 'diamer-basha',
      name: 'EM-02 – LB',
      phase: 'Phase-1 (Dam Part)',
      discipline: 'Electrical',
      lat: 35.6226,
      lng: 74.6185,
      status_pct: 48,
      status_label: 'Pre-PQ',
      alerts: 3,
      image: '/images/contracts/blueprint.jpg',
    },
    {
      id: 'em-02-rb',
      project_id: 'diamer-basha',
      name: 'EM-02 – RB',
      phase: 'Phase-1 (Dam Part)',
      discipline: 'Electrical',
      lat: 35.6234,
      lng: 74.6279,
      status_pct: 45,
      status_label: 'Pre-PQ',
      alerts: 4,
      image: '/images/contracts/blueprint.jpg',
    },
    {
      id: 'hm-01',
      project_id: 'diamer-basha',
      name: 'HM-1',
      phase: 'Phase-2 (Power Generation)',
      discipline: 'Hydro-Mechanical',
      lat: 35.6258,
      lng: 74.6138,
      status_pct: 20,
      status_label: 'Bidding',
      alerts: 1,
      image: '/images/contracts/blueprint.jpg',
    },
    {
      id: 'hm-02',
      project_id: 'diamer-basha',
      name: 'HM-2 – LB',
      phase: 'Phase-2 (Power Generation)',
      discipline: 'Hydro-Mechanical',
      lat: 35.6268,
      lng: 74.6109,
      status_pct: 12,
      status_label: 'PQ',
      alerts: 2,
      image: '/images/contracts/blueprint.jpg',
    },
    {
      id: 'hm-02-rb',
      project_id: 'diamer-basha',
      name: 'HM-2 – RB',
      phase: 'Phase-2 (Power Generation)',
      discipline: 'Hydro-Mechanical',
      lat: 35.6273,
      lng: 74.6146,
      status_pct: 10,
      status_label: 'PQ',
      alerts: 2,
      image: '/images/contracts/blueprint.jpg',
    },
  ],
}

const MAP_STYLES: Record<MapView, { label: string; url: string; attribution: string; maxZoom?: number }> = {
  atlas: {
    label: 'Atlas',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution:
      '&copy; ESRI &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19,
  },
  terrain: {
    label: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)',
    maxZoom: 17,
  },
  blueprint: {
    label: 'Blueprint',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19,
  },
}

function computeAnalytics(projects: Project[]): ProjectAnalytics {
  const total = projects.length
  const alerts_total = projects.reduce((sum, project) => sum + (project.alerts ?? 0), 0)
  const average_progress = total ? projects.reduce((sum, project) => sum + (project.status_pct ?? 0), 0) / total : 0
  const phase_breakdown = projects.reduce<Record<string, number>>((acc, project) => {
    acc[project.phase] = (acc[project.phase] || 0) + 1
    return acc
  }, {})
  return {
    total_projects: total,
    phase_breakdown,
    average_progress,
    alerts_total,
  }
}

const FALLBACK_PROJECTS_BY_PHASE = FALLBACK_PROJECTS.reduce<Record<string, Project[]>>((acc, project) => {
  acc[project.phase] = acc[project.phase] || []
  acc[project.phase].push(project)
  return acc
}, {})

const FALLBACK_ANALYTICS = computeAnalytics(FALLBACK_PROJECTS)

const STATUS_COLOR_MAP: Record<string, [number, number, number, number]> = {
  Construction: [34, 197, 94, 255],
  Bidding: [249, 115, 22, 255],
  'Pre-PQ': [245, 158, 11, 255],
  PQ: [168, 85, 247, 255],
}

const ALERT_COLOR_MAP: [number, number, number, number][] = [
  [96, 165, 250, 160],
  [59, 130, 246, 170],
  [37, 99, 235, 190],
  [239, 68, 68, 210],
]

function statusColor(status: string | null | undefined): [number, number, number, number] {
  if (!status) return [59, 130, 246, 255]
  return STATUS_COLOR_MAP[status] ?? [59, 130, 246, 255]
}

const defaultIcon = new L.Icon.Default()

function createMarkerIcon(
  project: Project,
  theme: Theme,
  isActive: boolean,
  weather?: WeatherSummary['projects'][number] | null,
): DivIcon {
  const color =
    project.phase === 'Construction'
      ? '#fb923c'
      : project.phase === 'Planning & Design'
      ? '#38bdf8'
      : '#34d399'

  const temperature = weather?.temperatureC
  const description = weather?.weatherDescription
  const weatherHtml = weather
    ? `<div class="marker-weather"><span class="marker-weather__temp">${
        temperature !== null && temperature !== undefined ? `${Math.round(temperature)}°C` : '--'
      }</span>${description ? `<span class="marker-weather__desc">${description}</span>` : ''}</div>`
    : ''

  const className = `project-marker theme-${theme} ${isActive ? 'project-marker--active' : ''}`
  return L.divIcon({
    className,
    html: `
      <div class="marker-shell" style="--marker-color:${color}">
        <span>${project.name}</span>
        <strong>${Math.round(project.status_pct)}%</strong>
        ${weatherHtml}
      </div>
      <div class="marker-pointer" style="--marker-color:${color}"></div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  })
}

const phaseAccent = (phase: string) =>
  phase === 'Construction' ? 'var(--accent-warm)' : phase === 'Planning & Design' ? 'var(--accent)' : 'var(--accent-cool)'

const phaseLabel = (phase: string) =>
  phase === 'Construction' ? 'ACCS' : phase === 'Planning & Design' ? 'CPDS' : 'AOS'

const contractAccent = (name: string) => {
  if (name.startsWith('MW-')) return '#38bdf8'
  if (name.startsWith('EM-')) return '#fb923c'
  if (name.startsWith('HM-')) return '#f87171'
  return '#a855f7'
}

const accentColor = (contract: ContractSite) => contractAccent(contract.name)

const extractContractCode = (contract: ContractSite) => {
  const match = contract.name.match(/^[A-Za-z0-9-]+/)
  if (match && match[0]) {
    return match[0]
  }
  const idMatch = contract.id.match(/^[A-Za-z0-9-]+/)
  return idMatch?.[0] ?? contract.id
}

const normaliseKey = (value: string) => value.replace(/[^a-z0-9]/gi, '').toLowerCase()

const STAGE_LABELS = ['Construction', 'Bidding', 'Pre-PQ', 'PQ']

const resolveStageLabel = (raw?: string | null): string => {
  const value = (raw ?? '').toLowerCase()
  if (value.includes('pre-pq') || value.includes('pre pq') || value.includes('prepq')) {
    return 'Pre-PQ'
  }
  if (value.includes('pq')) {
    return 'PQ'
  }
  if (value.includes('bid')) {
    return 'Bidding'
  }
  return 'Construction'
}

const phaseAccentHex = (phase: string) => {
  if (phase === 'Construction') return '#fb923c'
  if (phase === 'Planning & Design') return '#38bdf8'
  return '#34d399'
}

const hexToRgba = (hex: string, alpha = 1) => {
  const normalized = hex.replace('#', '')
  const bigint = parseInt(normalized, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const alertLevelColor = (alerts: number) => {
  if (alerts >= 40) return '#f87171'
  if (alerts >= 25) return '#fb923c'
  if (alerts >= 10) return '#facc15'
  return '#34d399'
}

const readableTextColor = (hex: string) => {
  const normalized = hex.replace('#', '')
  const bigint = parseInt(normalized, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#0b1220' : '#f8fafc'
}

export default function App() {
  const location = useLocation()
  const routerNavigate = useNavigate()
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => readAuthToken())
  const [view, setView] = useState<View>(() => (readAuthToken() ? 'dashboard' : 'landing'))
  const [theme, setTheme] = useState<Theme>('light')
  const [activeNav, setActiveNav] = useState(0)
  const [contractProject, setContractProject] = useState<Project | null>(null)
  const [previousNav, setPreviousNav] = useState(0)
  const [lastAccsProject, setLastAccsProject] = useState<Project | null>(null)
  const [utilityViewOverride, setUtilityViewOverride] = useState<UtilityView | null>(null)
  const [focusedContractOverride, setFocusedContractOverride] = useState<string | null>(null)
  const [weather, setWeather] = useState<WeatherSummary | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))

  useEffect(() => {
    if (!isAuthenticated) {
      setWeather(null)
      return
    }
    let cancelled = false

    const load = () => {
      fetchWeatherSummary()
        .then((summary) => {
          if (!cancelled) {
            setWeather(summary)
          }
        })
        .catch((error) => {
          console.error('Failed to load weather summary', error)
          if (!cancelled) {
            setWeather(null)
          }
        })
    }

    load()
    const interval = window.setInterval(load, 15 * 60 * 1000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated && (view === 'dashboard' || view === 'contract')) {
      setView('login')
    }
  }, [isAuthenticated, view])

  const getNavIndexForPhase = useCallback((phase: string) => {
    if (phase === 'O&M') {
      return sidebarItems.findIndex((item) => item.label === 'AOS')
    }
    if (phase === 'Construction') {
      return sidebarItems.findIndex((item) => item.label === 'ACCS')
    }
    if (phase === 'Planning & Design') {
      return sidebarItems.findIndex((item) => item.label === 'CPDS')
    }
    return 0
  }, [])

  useEffect(() => {
    if (view === 'landing' || view === 'login') {
      setActiveNav(0)
    }
  }, [view])

  const handleSelectNav = useCallback(
    (index: number) => {
      if (index === ACCS_NAV_INDEX) {
        if (!isAuthenticated) {
          setView('login')
          setActiveNav(HOME_NAV_INDEX)
          return
        }
        const fallbackConstruction = FALLBACK_PROJECTS.find((project) => project.phase === 'Construction')
        const projectToOpen = lastAccsProject ?? contractProject ?? fallbackConstruction ?? FALLBACK_PROJECTS[0] ?? null
        if (projectToOpen) {
          if (activeNav !== ACCS_NAV_INDEX) {
            setPreviousNav(activeNav)
          }
          warmProjectControlCenter(projectToOpen.id).catch(() => undefined)
          setActiveNav(index)
          setContractProject(projectToOpen)
          setLastAccsProject(projectToOpen)
          setUtilityViewOverride(null)
          setFocusedContractOverride(null)
          setView('contract')
          return
        }
      }

      setContractProject(null)
      setActiveNav(HOME_NAV_INDEX)
      setView(isAuthenticated ? 'dashboard' : 'login')
    },
    [activeNav, contractProject, isAuthenticated, lastAccsProject, view],
  )

  const handleOpenContract = useCallback(
    (project: Project) => {
      if (!isAuthenticated) {
        setView('login')
        setActiveNav(HOME_NAV_INDEX)
        return
      }
      if (activeNav !== ACCS_NAV_INDEX) {
        setPreviousNav(activeNav)
      }
      warmProjectControlCenter(project.id).catch(() => undefined)
      const targetIndex = getNavIndexForPhase(project.phase)
      setActiveNav(targetIndex)
      setContractProject(project)
      setLastAccsProject(project)
      setUtilityViewOverride(null)
      setFocusedContractOverride(null)
      setView('contract')
    },
    [activeNav, getNavIndexForPhase, isAuthenticated],
  )

  const handleCloseContract = useCallback(() => {
    setView('dashboard')
    setContractProject(null)
    setActiveNav(HOME_NAV_INDEX)
    setUtilityViewOverride(null)
    setFocusedContractOverride(null)
  }, [])

  useEffect(() => {
    const routeState = (location.state as RouteState) ?? null
    if (!routeState) return

    const clearRouteState = () => {
      const current = location.pathname + location.search
      routerNavigate(current, { replace: true, state: null })
    }

    if (routeState.openView === 'contract') {
      if (!isAuthenticated) {
        setView('login')
        clearRouteState()
        return
      }

      if (routeState.utilityView) {
        setUtilityViewOverride(routeState.utilityView)
      }
      if (routeState.focusContractId !== undefined) {
        setFocusedContractOverride(routeState.focusContractId ?? null)
      }

      const finalise = (project: Project | null) => {
        if (!project) {
          setView('dashboard')
          clearRouteState()
          return
        }
        warmProjectControlCenter(project.id).catch(() => undefined)
        setContractProject(project)
        setLastAccsProject(project)
        setActiveNav(getNavIndexForPhase(project.phase))
        setView('contract')
        clearRouteState()
      }

      if (routeState.projectSnapshot) {
        finalise(routeState.projectSnapshot)
        return
      }

      const candidateId = routeState.projectId ?? contractProject?.id ?? lastAccsProject?.id ?? null
      if (candidateId) {
        warmProjectControlCenter(candidateId)
          .then((payload) => finalise(payload.project))
          .catch(() => {
            const fallback = FALLBACK_PROJECTS.find((item) => item.id === candidateId) ?? contractProject ?? lastAccsProject ?? null
            finalise(fallback)
          })
        return
      }

      finalise(contractProject ?? lastAccsProject ?? null)
      return
    }

    if (routeState.openView === 'dashboard') {
      if (!isAuthenticated) {
        setView('login')
      } else {
        handleCloseContract()
      }
      clearRouteState()
    } else if (routeState.openView === 'login') {
      setView('login')
      clearRouteState()
    }
  }, [location.pathname, location.search, location.state, contractProject, lastAccsProject, getNavIndexForPhase, routerNavigate, handleCloseContract, isAuthenticated])

  const content = (() => {
    if (view === 'landing') {
      return (
        <LandingPage
          onPrimary={() => setView('login')}
          onExplore={() => setView(isAuthenticated ? 'dashboard' : 'login')}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )
    }
    if (view === 'login') {
      return (
        <LoginPage
          onBack={() => setView(isAuthenticated ? 'dashboard' : 'landing')}
          onLogin={({ username, password }) => {
            setAuthToken(true)
            persistCredentials(username, password)
            setIsAuthenticated(true)
            setActiveNav(HOME_NAV_INDEX)
            setView('dashboard')
          }}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )
    }
    if (view === 'contract' && contractProject) {
      return (
        <ContractControlCenterPage
          project={contractProject}
          onBack={handleCloseContract}
          theme={theme}
          onToggleTheme={toggleTheme}
          isAuthenticated={isAuthenticated}
          weather={weather}
          initialUtilityView={utilityViewOverride ?? undefined}
          onUtilityViewApplied={() => setUtilityViewOverride(null)}
          initialFocusedContractId={focusedContractOverride ?? undefined}
          onFocusedContractApplied={() => setFocusedContractOverride(null)}
        />
      )
    }
    return (
      <Dashboard
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenContract={handleOpenContract}
        weather={weather}
      />
    )
  })()

  return (
    <div className={`app-shell view-${view}`}>
      <SidebarNav
        activeIndex={activeNav}
        onSelect={handleSelectNav}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNavigateLanding={() => {
          setContractProject(null)
          setView('landing')
        }}
      />
      <div className="content-shell">{content}</div>
    </div>
  )
}

function LandingPage({
  onPrimary,
  onExplore,
  theme,
  onToggleTheme,
}: {
  onPrimary: () => void
  onExplore: () => void
  theme: Theme
  onToggleTheme: () => void
}) {
  return (
    <div className="landing-wrapper">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: '1.3rem' }}>DiPGOS</div>
        <ThemeToggleButton theme={theme} onToggle={onToggleTheme} />
      </div>

      <section className="landing-hero">
        <h1>Construction intelligence for proposals, execution, monitoring, and governance.</h1>
        <p>
          DiPGOS unifies proposal automation, capital delivery, site monitoring, geo-fenced safety observability, and
          performance insights. Switch between satellite, terrain, and blueprint map layers while AI-assisted workflows
          keep contractors, engineers, and executives aligned.
        </p>
        <div className="landing-actions">
          <button className="cta-primary" onClick={onPrimary}>
            Launch secure portal
          </button>
          <button className="cta-secondary" onClick={onExplore}>
            Preview live dashboard
          </button>
        </div>
      </section>

      <section className="landing-showcase">
        <article className="landing-card">
          <strong>Proposal command center</strong>
          <span>
            Auto-ingest contractor bids, score packages, and publish approvals with a governed audit trail connected to
            every project record.
          </span>
        </article>
        <article className="landing-card">
          <strong>Construction operating twin</strong>
          <span>
            Track geo-fenced assets, progress telemetry, and alert density per site to anticipate delays before they
            escalate to claims.
          </span>
        </article>
        <article className="landing-card">
          <strong>Executive intelligence</strong>
          <span>
            Portfolio dashboards, schedule risk forecasts, and automated board reporting keep leadership informed in
            minutes, not weeks.
          </span>
        </article>
      </section>

      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} DiPGOS | Construction & Hydropower Digital PMO</span>
        <span>Need an enterprise walkthrough? hello@dipgos.example</span>
      </footer>
    </div>
  )
}

function LoginPage({
  onBack,
  onLogin,
  theme,
  onToggleTheme,
}: {
  onBack: () => void
  onLogin: (credentials: { username: string; password: string }) => void
  theme: Theme
  onToggleTheme: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const savedCredentials = readSavedCredentials()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const username = String(formData.get('username') || '')
    const password = String(formData.get('password') || '')

    if (username === 'demo@dipgos' && password === 'Secure!Demo2025') {
      setError(null)
      onLogin({ username, password })
      return
    }

    setError('Invalid credentials. Use demo@dipgos / Secure!Demo2025 or request access from the PMO.')
  }

  return (
    <div className="login-screen">
      <aside className="login-panel">
        <div className="login-panel-top">
          <button className="login-back" onClick={onBack}>
            ← Back to experience
          </button>
          <ThemeToggleButton theme={theme} onToggle={onToggleTheme} />
        </div>

        <div className="login-headline">
          <span className="eyebrow">DiPGOS project operating system</span>
          <h1>Build once. Orchestrate everywhere.</h1>
          <p>
            Fuse commercial, construction, and governance telemetry into a living control center that keeps EPC teams in
            lockstep across continents.
          </p>
          <div className="login-pills">
            <span>AI field insights</span>
            <span>Portfolio command</span>
            <span>Geospatial twins</span>
          </div>
        </div>

        <div className="login-form-card">
          <h2>Sign in to DiPGOS</h2>
          <p className="login-subcopy">Secure access for project executives, construction leads, and governance teams.</p>
          <form className="login-form" onSubmit={handleSubmit}>
            <label>
              Username
              <input
                name="username"
                placeholder="demo@dipgos"
                autoComplete="username"
                defaultValue={savedCredentials.username}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                placeholder="Secure!Demo2025"
                autoComplete="current-password"
                defaultValue={savedCredentials.password}
              />
            </label>
            <small className="login-hint">Demo credentials: demo@dipgos / Secure!Demo2025</small>
            {error && <span className="login-error">{error}</span>}
            <button type="submit">Enter control center</button>
          </form>
          <div className="login-footnote">
            Need an enterprise walkthrough? <a href="mailto:hello@dipgos.example">hello@dipgos.example</a>
          </div>
        </div>
      </aside>

      <section className="login-showcase">
        <img src="/images/login-hero.jpg" alt="Hydropower project digital twin" className="login-hero-image" loading="eager" decoding="async" />
        <div className="login-image-overlay" />
        <div className="login-hero-layout">
          <div className="login-hero-copy">
            <h2>Construction portfolio oversight, reimagined.</h2>
            <p>
              Monitor hydropower mega projects, transmission corridors, and critical civil upgrades with live geospatial
              telemetry, alert intelligence, and AI-assisted governance.
            </p>
          </div>

          <div className="login-hero-grid">
            <div className="login-hero-card">
              <span className="hero-kicker">Live telemetry</span>
              <strong>32</strong>
              <span>sites streaming progress and alert density in real time.</span>
            </div>
            <div className="login-hero-card">
              <span className="hero-kicker">SPI focus</span>
              <strong>0.78</strong>
              <span>portfolio schedule performance with AI-generated recovery actions.</span>
            </div>
            <div className="login-hero-card">
              <span className="hero-kicker">Executive pulse</span>
              <strong>5 min</strong>
              <span>to prep board-ready reports directly from the control center.</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function Dashboard({
  theme,
  onToggleTheme,
  onOpenContract,
  weather,
}: {
  theme: Theme
  onToggleTheme: () => void
  onOpenContract: (project: Project) => void
  weather: WeatherSummary | null
}) {
  const [construction, setConstruction] = useState<Project[]>([])
  const [om, setOm] = useState<Project[]>([])
  const [planning, setPlanning] = useState<Project[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [selected, setSelected] = useState<Project | null>(null)
  const [hovered, setHovered] = useState<Project | null>(null)
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('All')
  const [contractFilter, setContractFilter] = useState<'ALL' | string>('ALL')
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [mapView, setMapView] = useState<MapView>('atlas')
  const [featureToggle, setFeatureToggle] = useState<MapFeatureToggle>({ geofences: true, intensity: false })
  const [analytics, setAnalytics] = useState<ProjectAnalytics | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [mapHeight, setMapHeight] = useState(520)
  const [isResizingMap, setIsResizingMap] = useState(false)
  const resizeSnapshot = useRef<{ startY: number; startHeight: number }>({ startY: 0, startHeight: 520 })
  const mapStatsRef = useRef<HTMLDivElement | null>(null)
  const prefetchControlCenter = useCallback((projectId: string) => {
    if (!projectId) return
    warmProjectControlCenter(projectId).catch(() => undefined)
  }, [])

  const applyFallbackProjects = useCallback(() => {
    const fallbackConstruction = [...(FALLBACK_PROJECTS_BY_PHASE['Construction'] ?? [])]
    const fallbackOm = [...(FALLBACK_PROJECTS_BY_PHASE['O&M'] ?? [])]
    const fallbackPlanning = [...(FALLBACK_PROJECTS_BY_PHASE['Planning & Design'] ?? [])]
    setConstruction(fallbackConstruction)
    setOm(fallbackOm)
    setPlanning(fallbackPlanning)
    setAnalytics(FALLBACK_ANALYTICS)
    setSelected((prev) => prev ?? FALLBACK_PROJECTS[0] ?? null)
  }, [])

  const loadProjects = useCallback(async () => {
    try {
      const [constructionSet, omSet, planningSet, analyticsSnapshot] = await Promise.all([
        fetchProjects('Construction'),
        fetchProjects('O&M'),
        fetchProjects('Planning & Design'),
        fetchProjectAnalytics(),
      ])

      const totalLoaded = constructionSet.length + omSet.length + planningSet.length
      if (totalLoaded === 0) {
        applyFallbackProjects()
        return
      }

      setConstruction(constructionSet)
      setOm(omSet)
      setPlanning(planningSet)

      const combined = [...constructionSet, ...omSet, ...planningSet]
      if (analyticsSnapshot && analyticsSnapshot.total_projects > 0) {
        setAnalytics(analyticsSnapshot)
      } else {
        setAnalytics(computeAnalytics(combined))
      }

      setSelected((prev) => {
        if (prev) {
          return combined.find((project) => project.id === prev.id) ?? prev
        }
        return combined[0] ?? null
      })
    } catch (error) {
      console.error('Failed to load projects', error)
      applyFallbackProjects()
    }
  }, [applyFallbackProjects])

  useEffect(() => {
    loadProjects().catch((err) => console.error('Failed to load projects', err))
  }, [loadProjects])

  useEffect(() => {
    if (selected) {
      fetchAlerts(selected.id)
        .then(setAlerts)
        .catch((err) => console.error('Failed to load alerts', err))
      prefetchControlCenter(selected.id)
    } else {
      setAlerts([])
    }
  }, [selected, prefetchControlCenter])

  const handleOpenContract = useCallback(
    (project: Project) => {
      setSelected(project)
      prefetchControlCenter(project.id)
      onOpenContract(project)
    },
    [onOpenContract, prefetchControlCenter],
  )

  const allProjects = useMemo(() => [...construction, ...om, ...planning], [construction, om, planning])
  const weatherByProject = useMemo(() => {
    const map = new Map<string, WeatherSummary['projects'][number]>()
    weather?.projects?.forEach((point) => {
      map.set(point.id, point)
    })
    return map
  }, [weather])

  const handleSelectProject = useCallback(
    (project: Project) => {
      setSelected(project)
      prefetchControlCenter(project.id)
    },
    [prefetchControlCenter],
  )

  const handleHoverProject = useCallback(
    (project: Project) => {
      setHovered(project)
      prefetchControlCenter(project.id)
    },
    [prefetchControlCenter],
  )

  const handleLeaveProject = useCallback(() => setHovered(null), [])

  useEffect(() => {
    if (!allProjects.length) return
    allProjects.slice(0, 3).forEach((project) => prefetchControlCenter(project.id))
  }, [allProjects, prefetchControlCenter])

  const contractIds = useMemo(
    () => Array.from(new Set(allProjects.map((project) => project.id))).sort(),
    [allProjects],
  )

  const filteredForMap = useMemo(() => {
    const base = contractFilter === 'ALL' ? allProjects : allProjects.filter((p) => p.id === contractFilter)
    if (phaseFilter === 'All') return base
    return base.filter((p) => p.phase === phaseFilter)
  }, [allProjects, phaseFilter, contractFilter])

  const activeProject = hovered ?? selected ?? filteredForMap[0] ?? null
  const activeProjectWeather = activeProject ? weatherByProject.get(activeProject.id) ?? null : null

  const mapRows = panelCollapsed ? 'auto 1fr minmax(0, 80px)' : `auto ${Math.round(mapHeight)}px minmax(0, 1fr)`

  const highlightColor = activeProject ? phaseAccentHex(activeProject.phase) : null
  const highlightStyles = highlightColor
    ? {
        background: `linear-gradient(135deg, ${hexToRgba(highlightColor, 0.18)}, ${hexToRgba(highlightColor, 0.42)})`,
        border: `1px solid ${hexToRgba(highlightColor, 0.35)}`,
        color: readableTextColor(highlightColor),
      }
    : undefined

  const handleResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    resizeSnapshot.current = { startY: event.clientY, startHeight: mapHeight }
    setIsResizingMap(true)
  }

  useEffect(() => {
    if (!isResizingMap) return
    const handleMouseMove = (event: MouseEvent) => {
      const delta = event.clientY - resizeSnapshot.current.startY
      const proposed = resizeSnapshot.current.startHeight + delta
      const viewportAllowance = Math.max(260, window.innerHeight - 280)
      const max = Math.min(760, viewportAllowance)
      const next = Math.max(320, Math.min(max, proposed))
      setMapHeight(next)
    }
    const handleMouseUp = () => {
      setIsResizingMap(false)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingMap])

  useEffect(() => {
    if (panelCollapsed && isResizingMap) {
      setIsResizingMap(false)
    }
  }, [panelCollapsed, isResizingMap])

  useEffect(() => {
    const clampHeight = () => {
      const viewportAllowance = Math.max(320, window.innerHeight - 320)
      const max = Math.min(760, viewportAllowance)
      setMapHeight((current) => {
        if (panelCollapsed) return current
        return Math.max(320, Math.min(max, current))
      })
    }
    clampHeight()
    window.addEventListener('resize', clampHeight)
    return () => window.removeEventListener('resize', clampHeight)
  }, [panelCollapsed])

  useEffect(() => {
    if (!mapStatsRef.current) return
    const cards = Array.from(mapStatsRef.current.querySelectorAll<HTMLDivElement>('.map-stats-card'))
    const toggleCard = cards.find((node) => node.dataset.card === 'toggles')
    const metricCards = cards.filter((node) => node !== toggleCard)
    const highlightCard = metricCards.find((node) => node.dataset.card === 'highlight')
    const baseCards = highlightCard ? metricCards.filter((node) => node !== highlightCard) : metricCards

    const available = Math.max(140, mapHeight - 160)
    const cardHeight = 120
    const slotCount = Math.max(1, Math.floor(available / cardHeight))

    if (highlightCard) {
      highlightCard.style.display = ''
      const remaining = Math.max(0, slotCount - 1)
      baseCards.forEach((card, index) => {
        card.style.display = index < remaining ? '' : 'none'
      })
    } else {
      baseCards.forEach((card, index) => {
        card.style.display = index < slotCount ? '' : 'none'
      })
    }

    if (toggleCard) {
      toggleCard.style.display = ''
    }
  }, [mapHeight, activeProject])

  useEffect(() => {
    if (!mapStatsRef.current) return
    const cards = Array.from(mapStatsRef.current.querySelectorAll<HTMLDivElement>('.map-stats-card'))
    const toggleCard = cards.find((node) => node.dataset.card === 'toggles')
    const metricCards = cards.filter((node) => node !== toggleCard)

    const available = Math.max(140, mapHeight - 160)
    const cardHeight = 118
    const maxVisible = Math.max(1, Math.min(metricCards.length, Math.floor(available / cardHeight)))

    metricCards.forEach((card, index) => {
      card.style.display = index < maxVisible ? '' : 'none'
    })

    if (toggleCard) {
      toggleCard.style.display = ''
    }
  }, [mapHeight])

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const payload = {
      name: String(formData.get('name') || ''),
      phase: String(formData.get('phase') || 'Construction'),
      status_pct: Number(formData.get('status_pct') || 0),
      status_label: formData.get('status_label') ? String(formData.get('status_label')) : undefined,
      alerts: Number(formData.get('alerts') || 0),
      image: formData.get('image') ? String(formData.get('image')) : undefined,
      address: formData.get('address') ? String(formData.get('address')) : undefined,
      geofence_radius_m: formData.get('geofence_radius_m') ? Number(formData.get('geofence_radius_m')) : undefined,
      lat: formData.get('lat') ? Number(formData.get('lat')) : undefined,
      lng: formData.get('lng') ? Number(formData.get('lng')) : undefined,
    }

    try {
      setIsSaving(true)
      const created = await createProject(payload)
      await loadProjects()
      setSelected(created)
      setShowModal(false)
    } catch (error) {
      console.error(error)
      window.alert((error as Error).message || 'Failed to create project')
    } finally {
      setIsSaving(false)
    }
  }

  const { url, attribution } = MAP_STYLES[mapView]
  const projectsAnalytics = analytics ?? { total_projects: 0, phase_breakdown: {}, average_progress: 0, alerts_total: 0 }

  return (
    <>
      <div className="main" style={{ gridTemplateRows: mapRows }}>
        <header className="header">
          <div className="header-leading">
            <Breadcrumbs items={[{ label: 'Dashboard' }]} />
            <div className="header-title-group">
            <h1>WAPDA Project Portfolio Dashboard</h1>
            <p>
              Proposal automation, construction execution, monitoring telemetry, and governance insights — one connected workspace.
            </p>
            <div className="header-metrics">
              <span className="metric-chip">
                <strong>{projectsAnalytics.total_projects}</strong>
                Projects
              </span>
              <span className="metric-chip">
                <strong>{Math.round(projectsAnalytics.average_progress)}%</strong>
                Avg. Progress
              </span>
              <span className="metric-chip">
                <strong>{projectsAnalytics.alerts_total}</strong>
                Alerts
              </span>
              {Object.entries(projectsAnalytics.phase_breakdown || {}).map(([phase, value]) => (
                <span key={phase} className="metric-chip subtle">
                  <strong>{value}</strong>
                  {phase}
                </span>
              ))}
            </div>
          </div>
          </div>

          <div className="header-controls">
            <div className="phase-toggle" role="group" aria-label="Filter projects by phase">
              {( ['All', 'Construction', 'O&M', 'Planning & Design'] as PhaseFilter[]).map((value) => (
                <button key={value} className={phaseFilter === value ? 'active' : ''} onClick={() => setPhaseFilter(value)}>
                  {value === 'All' ? 'All Projects' : value}
                </button>
              ))}
            </div>
            <button className="create-btn" onClick={() => setShowModal(true)}>
              <span className="icon">＋</span>
              Register New Site
            </button>
          </div>
        </header>

        <section className="map-section" style={!panelCollapsed ? { height: mapHeight } : undefined}>
          <div className="map-wrapper">
            <div className="map-gradient" aria-hidden="true" />
            <div className="map-toolbar">
              <button
                className="create-btn"
                style={{ padding: '10px 18px', fontSize: '0.92rem', boxShadow: '0 14px 30px rgba(59,130,246,0.28)' }}
                onClick={() => setPanelCollapsed((prev) => !prev)}
              >
                {panelCollapsed ? 'Show Project Gallery' : 'Focus Map View'}
              </button>
              <div className="map-view-toggle">
                {(Object.keys(MAP_STYLES) as MapView[]).map((viewKey) => (
                  <button key={viewKey} className={mapView === viewKey ? 'active' : ''} onClick={() => setMapView(viewKey)}>
                    {MAP_STYLES[viewKey].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="map-stats" ref={mapStatsRef}>
              <div className="map-stats-card">
                <span className="label">Projects Monitored</span>
                <strong>{projectsAnalytics.total_projects}</strong>
              </div>
              <div className="map-stats-card">
                <span className="label">Average Progress</span>
                <strong>{Math.round(projectsAnalytics.average_progress)}%</strong>
              </div>
              <div className="map-stats-card">
                <span className="label">Alerts in Focus</span>
                <strong>{projectsAnalytics.alerts_total}</strong>
              </div>
              {activeProject && (
                <div className="map-stats-card highlight" data-card="highlight" style={highlightStyles}>
                  <span className="label">Highlighted Site</span>
                  <strong>{activeProject.name}</strong>
                  <div className="map-stat-line subtle">{Math.round(activeProject.status_pct)}% completion</div>
                  <div className="map-stat-line subtle">{activeProject.alerts} active alerts</div>
                  {activeProjectWeather && (
                    <div className="map-stat-line subtle">
                      Weather {activeProjectWeather.temperatureC !== null && activeProjectWeather.temperatureC !== undefined ? `${Math.round(activeProjectWeather.temperatureC)}°C` : '--'} ·{' '}
                      {activeProjectWeather.weatherDescription ?? 'Conditions unavailable'}
                    </div>
                  )}
                </div>
              )}
              <div className="map-stats-card map-stats-toggle" data-card="toggles">
                <button
                  className={`btn-ghost ${featureToggle.geofences ? 'active' : ''}`}
                  onClick={() => setFeatureToggle((prev) => ({ ...prev, geofences: !prev.geofences }))}
                >
                  Geofences
                </button>
                <button
                  className={`btn-ghost ${featureToggle.intensity ? 'active' : ''}`}
                  onClick={() => setFeatureToggle((prev) => ({ ...prev, intensity: !prev.intensity }))}
                >
                  Heat
                </button>
              </div>
            </div>

            <MapContainer center={{ lat: 34.75, lng: 73.2 }} zoom={7} className="map-canvas" scrollWheelZoom doubleClickZoom={false}>
              <TileLayer key={`${mapView}-${theme}`} attribution={attribution} url={url} crossOrigin />
              <ZoomControl position="topright" />
              <ScaleControl position="bottomleft" />
              <MapResizeWatcher trigger={`${panelCollapsed}-${theme}-${mapView}-${filteredForMap.length}-${Math.round(mapHeight)}`} />
              <MapFocusUpdater project={selected} />

              {filteredForMap.map((project) => {
                const isActive = project.id === selected?.id || project.id === hovered?.id
                const weatherPoint = weatherByProject.get(project.id) ?? null
                const icon = createMarkerIcon(project, theme, isActive, weatherPoint)
                return (
                  <Marker
                    key={project.id}
                    position={[project.lat, project.lng]}
                    icon={icon ?? defaultIcon}
                    eventHandlers={{
                      click: () => {
                        setSelected(project)
                        prefetchControlCenter(project.id)
                        setPanelCollapsed(true)
                      },
                      mouseover: () => {
                        setHovered(project)
                        prefetchControlCenter(project.id)
                      },
                      mouseout: () => setHovered((prev) => (prev?.id === project.id ? null : prev)),
                    }}
                  >
                    <Popup>
                      <div style={{ minWidth: '200px' }}>
                        <strong>{project.name}</strong>
                        <div>Status: {Math.round(project.status_pct)}%</div>
                        <div>Alerts: {project.alerts}</div>
                        {project.address && <div>{project.address}</div>}
                        {project.status_label && <div>Label: {project.status_label}</div>}
                        {weatherPoint && (
                          <div>
                            Weather: {weatherPoint.temperatureC !== null && weatherPoint.temperatureC !== undefined ? `${Math.round(weatherPoint.temperatureC)}°C` : '--'} ·{' '}
                            {weatherPoint.weatherDescription ?? 'Conditions unavailable'}
                          </div>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                )
              })}

              {featureToggle.geofences &&
                filteredForMap.map((project) =>
                  project.geofence_radius_m ? (
                    <React.Fragment key={`geo-${project.id}`}>
                      <Circle
                        center={[project.lat, project.lng]}
                        radius={project.geofence_radius_m}
                        pathOptions={{
                          color: alertLevelColor(project.alerts),
                          dashArray: '8 6',
                          weight: 2,
                          fillColor: hexToRgba(alertLevelColor(project.alerts), 0.18),
                          fillOpacity: 0.2,
                        }}
                      >
                        <Tooltip direction="center" offset={[0, 0]} opacity={0.92} sticky>
                          <div style={{ textAlign: 'center' }}>
                            <strong>{project.name}</strong>
                            <div>{project.geofence_radius_m.toLocaleString()} m geofence</div>
                            <div>{project.alerts} active alerts</div>
                          </div>
                        </Tooltip>
                      </Circle>
                      <CircleMarker
                        center={[project.lat, project.lng]}
                        radius={6}
                        pathOptions={{
                          color: '#ffffff',
                          weight: 2,
                          fillColor: alertLevelColor(project.alerts),
                          fillOpacity: 0.9,
                        }}
                      />
                    </React.Fragment>
                  ) : null
                )}

              {featureToggle.intensity &&
                filteredForMap.map((project) => (
                  <CircleMarker
                    key={`intensity-${project.id}`}
                    center={[project.lat, project.lng]}
                    radius={Math.max(6, Math.min(16, Math.round(project.alerts / 2)))}
                    pathOptions={{ color: 'rgba(249, 115, 22, 0.6)', fillColor: 'rgba(249, 115, 22, 0.35)', fillOpacity: 0.6 }}
                  />
                ))}
            </MapContainer>

            {featureToggle.intensity && (
              <div className="map-legend">
                <span className="legend-title">Alert intensity</span>
                <div className="legend-scale">
                  <span className="legend-dot low" />
                  <span>Stable</span>
                  <span className="legend-dot medium" />
                  <span>Watch</span>
                  <span className="legend-dot high" />
                  <span>Critical</span>
                </div>
              </div>
            )}

            {selected && alerts.length > 0 && (
              <div className="alert-drawer">
                <div className="alert-header">
                  <span>Alert stream</span>
                  <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem' }} aria-label="Close alert">
                    ✕
                  </button>
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{alerts[0].title}</div>
                  <div style={{ fontSize: '0.86rem', color: 'var(--text-muted)' }}>
                    {alerts[0].location && <div>Location: {alerts[0].location}</div>}
                    {alerts[0].activity && <div>Activity: {alerts[0].activity}</div>}
                  </div>
                </div>
                <div className="alert-items">
                  {alerts[0].items.map((item, idx) => (
                    <div key={idx} className="alert-item">
                      <span>•</span>
                      <span>
                        <strong>{item.label}:</strong> {item.detail}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {!panelCollapsed && (
          <div
            className={`resize-bar ${isResizingMap ? 'dragging' : ''}`}
            role="separator"
            aria-orientation="horizontal"
            aria-label="Adjust map and gallery height"
            onMouseDown={handleResizeStart}
          >
            <span />
          </div>
        )}

        <div className={`projects-panel ${panelCollapsed ? 'collapsed' : ''}`}>
          <button className="panel-toggle" onClick={() => setPanelCollapsed((prev) => !prev)}>
            {panelCollapsed ? 'Expand portfolio ↑' : 'Collapse portfolio ↓'}
          </button>

          <ProjectsSection
            title="Operations & Maintenance (AOS)"
            badge={om.length}
            projects={om}
            onHover={handleHoverProject}
            onLeave={handleLeaveProject}
            onSelect={handleSelectProject}
            onOpenContract={handleOpenContract}
          />

          <ProjectsSection
            title="Construction Phase (ACCS)"
            badge={construction.length}
            projects={construction}
            onHover={handleHoverProject}
            onLeave={handleLeaveProject}
            onSelect={handleSelectProject}
            onOpenContract={handleOpenContract}
          />

          <ProjectsSection
            title="Planning & Design (CPDS)"
            badge={planning.length}
            projects={planning}
            onHover={handleHoverProject}
            onLeave={handleLeaveProject}
            onSelect={handleSelectProject}
            onOpenContract={handleOpenContract}
          />
        </div>

        {showModal && (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal" style={{ width: 'min(660px, 94vw)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Register new project site</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.1rem', cursor: 'pointer' }} aria-label="Close form">
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateProject} className="modal-form">
              <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <label>
                  Project name
                  <input name="name" placeholder="e.g. Skardu Pumped Storage" required />
                </label>
                <label>
                  Phase
                  <select name="phase" defaultValue="Construction">
                    <option value="Construction">Construction</option>
                    <option value="O&M">O&amp;M</option>
                    <option value="Planning & Design">Planning &amp; Design</option>
                  </select>
                </label>
                <label>
                  Status %
                  <input name="status_pct" type="number" min={0} max={100} defaultValue={50} />
                </label>
                <label>
                  Alerts
                  <input name="alerts" type="number" min={0} defaultValue={0} />
                </label>
              </div>

              <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <label>
                  Status label
                  <input name="status_label" placeholder="e.g. Commissioning" />
                </label>
                <label>
                  Primary image URL (optional)
                  <input name="image" placeholder="https://..." />
                </label>
                <label>
                  Geofence radius (m)
                  <input name="geofence_radius_m" type="number" min={0} placeholder="1500" />
                </label>
              </div>

              <label>
                Site address
                <input name="address" placeholder="Full site address for geocoding" />
              </label>

              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Provide either an address for automatic geocoding or explicit latitude/longitude coordinates.
              </div>

              <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <label>
                  Latitude
                  <input name="lat" type="number" step="0.0001" />
                </label>
                <label>
                  Longitude
                  <input name="lng" type="number" step="0.0001" />
                </label>
              </div>

              <div className="modal-actions">
                <button type="button" className="secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Create project'}
                </button>
              </div>
            </form>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function FitContractBounds({ bounds, focus }: { bounds: LatLngBoundsExpression; focus?: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [80, 80] })
    }
    if (focus) {
      map.flyTo(focus, 16, { duration: 0.6 })
    }
  }, [map, bounds, focus])
  return null
}

function MapResizeWatcher({ trigger }: { trigger: unknown }) {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
  }, [map, trigger])
  return null
}

function MapFocusUpdater({ project }: { project: Project | null }) {
  const map = useMap()
  useEffect(() => {
    if (project) {
      map.flyTo([project.lat, project.lng], 8, { duration: 0.8 })
    }
  }, [map, project])
  return null
}

type ProjectsSectionProps = {
  title: string
  badge: number
  projects: Project[]
  onSelect: (project: Project) => void
  onHover: (project: Project) => void
  onLeave: () => void
  onOpenContract: (project: Project) => void
}

function ProjectsSection({ title, badge, projects, onSelect, onHover, onLeave, onOpenContract }: ProjectsSectionProps) {
  return (
    <section style={{ marginTop: 36 }}>
      <div className="section-header">
        <div className="section-heading">
          <h2>{title}</h2>
          <span className="badge">{badge} active</span>
        </div>
        <div className="section-actions">
          <button type="button">Export snapshot</button>
        </div>
      </div>
      <div className="project-grid">
        {projects.map((project) => (
          <article
            key={project.id}
            className="project-card"
            onMouseEnter={() => onHover(project)}
            onMouseLeave={onLeave}
            onClick={() => onSelect(project)}
            onDoubleClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onOpenContract(project)
            }}
          >
            <div className="pill-stack">
              <span className="pill" style={{ borderColor: phaseAccent(project.phase), color: phaseAccent(project.phase) }}>
                {phaseLabel(project.phase)}
              </span>
              <span className="pill">Alerts: {project.alerts}</span>
            </div>
            <img
              src={project.image || '/images/ACCS/mohmand.jpg'}
              alt={project.name}
              loading="lazy"
              decoding="async"
              onDoubleClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onOpenContract(project)
              }}
            />
            <div className="body">
              <h3>{project.name}</h3>
              <div className="stats">
                <span>Status: {project.status_label || `${Math.round(project.status_pct)}%`}</span>
                <span className="dot" />
                <span>Phase: {project.phase}</span>
              </div>
              <div className="progress-bar">
                <span
                  style={{
                    width: `${Math.min(Math.max(project.status_pct, 0), 100)}%`,
                    background: `linear-gradient(135deg, ${phaseAccent(project.phase)}, #38bdf8)`,
                  }}
                />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
function ContractControlCenterPage({
  project,
  onBack,
  theme,
  onToggleTheme,
  isAuthenticated,
  weather,
  initialUtilityView,
  onUtilityViewApplied,
  initialFocusedContractId,
  onFocusedContractApplied,
}: {
  project: Project
  onBack: () => void
  theme: Theme
  onToggleTheme: () => void
  isAuthenticated: boolean
  weather: WeatherSummary | null
  initialUtilityView?: UtilityView
  onUtilityViewApplied?: () => void
  initialFocusedContractId?: string
  onFocusedContractApplied?: () => void
}) {
  const [payload, setPayload] = useState<ProjectControlCenterPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadControlCenter = useCallback(() => {
    const cached = getCachedProjectControlCenter(project.id)
    if (cached) {
      setPayload(cached)
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setPayload(null)
    warmProjectControlCenter(project.id)
      .then((data) => {
        setPayload(data)
      })
      .catch((err: Error) => {
        console.error('Failed to load control center', err)
        setError(err.message || 'Unable to load control center data.')
      })
      .finally(() => setLoading(false))
  }, [project.id])

  useEffect(() => {
    loadControlCenter()
  }, [loadControlCenter])

  return (
    <div className="contract-page-wrapper">
      <ContractControlCenterOverlay
        project={project}
        payload={payload}
        loading={loading}
        error={error}
        onClose={onBack}
        onRetry={loadControlCenter}
        theme={theme}
        onToggleTheme={onToggleTheme}
        isAuthenticated={isAuthenticated}
        weather={weather}
        initialUtilityView={initialUtilityView}
        onUtilityViewApplied={onUtilityViewApplied}
        initialFocusedContractId={initialFocusedContractId}
        onFocusedContractApplied={onFocusedContractApplied}
      />
    </div>
  )
}

type UtilityView =
  | 'scheduling'
  | 'financial'
  | 'sustainability'
  | 'procurement'
  | 'atom'
  | 'forecasting'

type RouteState = {
  openView?: View
  projectSnapshot?: Project
  utilityView?: UtilityView
  focusContractId?: string | null
  projectId?: string | null
} | null

function ContractControlCenterOverlay({
  project,
  payload,
  loading,
  error,
  onClose,
  onRetry,
  theme,
  onToggleTheme,
  isAuthenticated,
  weather,
  initialUtilityView,
  onUtilityViewApplied,
  initialFocusedContractId,
  onFocusedContractApplied,
}: {
  project: Project | null
  payload: ProjectControlCenterPayload | null
  loading: boolean
  error: string | null
  onClose: () => void
  onRetry: () => void
  theme?: Theme
  onToggleTheme?: () => void
  isAuthenticated: boolean
  weather: WeatherSummary | null
  initialUtilityView?: UtilityView
  onUtilityViewApplied?: () => void
  initialFocusedContractId?: string
  onFocusedContractApplied?: () => void
}) {
  const [focusedContractId, setFocusedContractId] = useState<string | null>(initialFocusedContractId ?? null)
  const [focusedSowId, setFocusedSowId] = useState<string | null>(null)
  const [expandedContracts, setExpandedContracts] = useState<Record<string, boolean>>({})
  const [mapView, setMapView] = useState<MapView>('atlas')
  const [featureToggle, setFeatureToggle] = useState<MapFeatureToggle>({ geofences: false, intensity: false })
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [centerMapHeight, setCenterMapHeight] = useState<number>(() => {
    if (typeof window === 'undefined') {
      return 520
    }
    const viewportAllowance = Math.max(MIN_CCC_MAP_HEIGHT, window.innerHeight * 0.45)
    return Math.max(MIN_CCC_MAP_HEIGHT, Math.min(MAX_CCC_MAP_HEIGHT, viewportAllowance))
  })
  const centerResizeSnapshot = useRef<{ startY: number; startHeight: number }>({ startY: 0, startHeight: centerMapHeight })
  const [isResizingCenterMap, setIsResizingCenterMap] = useState(false)
  const [hoveredContract, setHoveredContract] = useState<ContractSite | null>(null)
  const mapStatsRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()
  const [activeUtilityView, setActiveUtilityView] = useState<UtilityView | null>(initialUtilityView ?? null)
  const contractWeatherMap = useMemo(() => {
    const map = new Map<string, WeatherSummary['contracts'][number]>()
    weather?.contracts?.forEach((point) => {
      map.set(point.id, point)
    })
    return map
  }, [weather])
  useEffect(() => {
    if (!initialUtilityView) return
    setActiveUtilityView(initialUtilityView)
    onUtilityViewApplied?.()
  }, [initialUtilityView, onUtilityViewApplied])

  useEffect(() => {
    if (!initialFocusedContractId) return
    setFocusedContractId(initialFocusedContractId)
    onFocusedContractApplied?.()
  }, [initialFocusedContractId, onFocusedContractApplied])
  const mapShellRef = useRef<HTMLDivElement | null>(null)
  const [contractFilter, setContractFilter] = useState<'ALL' | string>('ALL')
  const handleCenterResizeStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      centerResizeSnapshot.current = { startY: event.clientY, startHeight: centerMapHeight }
      setIsResizingCenterMap(true)
    },
    [centerMapHeight],
  )

  useEffect(() => {
    if (!isResizingCenterMap) return
    const handleMouseMove = (event: MouseEvent) => {
      const delta = event.clientY - centerResizeSnapshot.current.startY
      const proposed = centerResizeSnapshot.current.startHeight + delta
      const viewportAllowance = Math.max(MIN_CCC_MAP_HEIGHT, window.innerHeight - MIN_CONTRACT_WIP_HEIGHT - 220)
      const max = Math.min(MAX_CCC_MAP_HEIGHT, viewportAllowance)
      const next = Math.max(MIN_CCC_MAP_HEIGHT, Math.min(max, proposed))
      setCenterMapHeight(next)
    }
    const handleMouseUp = () => {
      setIsResizingCenterMap(false)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingCenterMap])

  useEffect(() => {
    const clampHeight = () => {
      const viewportAllowance = Math.max(MIN_CCC_MAP_HEIGHT, window.innerHeight - MIN_CONTRACT_WIP_HEIGHT - 220)
      const max = Math.min(MAX_CCC_MAP_HEIGHT, viewportAllowance)
      setCenterMapHeight((current) => Math.max(MIN_CCC_MAP_HEIGHT, Math.min(max, current)))
    }
    clampHeight()
    window.addEventListener('resize', clampHeight)
    return () => window.removeEventListener('resize', clampHeight)
  }, [])

  const utilityViews: Array<{ id: UtilityView; label: string; icon: React.ReactNode }> = [
    {
      id: 'scheduling',
      label: 'Scheduling View',
      icon: (
        <svg viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor" fill="none">
          <rect x="4" y="5" width="16" height="15" rx="3" />
          <path d="M8 3v4" strokeLinecap="round" />
          <path d="M16 3v4" strokeLinecap="round" />
          <path d="M4 11h16" />
          <path d="M9 15h2" strokeLinecap="round" />
          <path d="M13 15h2" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: 'financial',
      label: 'Financial View',
      icon: (
        <svg viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor" fill="none">
          <rect x="4" y="6" width="16" height="13" rx="2" />
          <path d="M4 10h16" />
          <path d="M8 14h1" strokeLinecap="round" />
          <path d="M11 14h1" strokeLinecap="round" />
          <path d="M14 14h2" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: 'sustainability',
      label: 'Sustainability View',
      icon: (
        <svg viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor" fill="none">
          <path d="M12 21c4-2.5 6-5.5 6-9.5a6 6 0 0 0-12 0C6 15.5 8 18.5 12 21Z" />
          <path d="M12 10a2 2 0 0 1 2 2" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: 'procurement',
      label: 'Procurement / SCM View',
      icon: (
        <svg viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor" fill="none">
          <path d="M4 7h16" strokeLinecap="round" />
          <path d="M6 7v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
          <path d="M10 11h4" strokeLinecap="round" />
          <path d="M12 7V3" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: 'atom',
      label: 'Atom Manager',
      icon: (
        <svg viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor" fill="none">
          <circle cx="12" cy="12" r="2.4" />
          <path d="M4.5 8c3.5-6 11.5-6 15 0s-3.5 14-7.5 8-7.5-2-7.5-8Z" />
        </svg>
      ),
    },
    {
      id: 'forecasting',
      label: 'Forecasting View',
      icon: (
        <svg viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor" fill="none">
          <path d="M4 18h16" strokeLinecap="round" />
          <path d="M6 16l3.5-4 2.5 3 4.5-6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M17 9h3v3" strokeLinecap="round" />
        </svg>
      ),
    },
  ]
  const visibleUtilityViews = utilityViews.filter((view) => {
    if (view.id === 'scheduling' && !FEATURE_SCHEDULE_UI) return false
    if (view.id === 'financial' && !FEATURE_FINANCIAL_VIEW) return false
    if (view.id === 'atom' && !FEATURE_ATOM_MANAGER) return false
    return true
  })
  if (!project) {
    return null
  }

  const contracts = useMemo(() => {
    if (payload?.contracts?.length) {
      return payload.contracts
    }
    return FALLBACK_CONTRACTS[project.id] ?? []
  }, [payload, project.id])
  const contractCodeMap = useMemo(() => {
    const map = new Map<string, ContractSite>()
    contracts.forEach((contract) => {
      map.set(normaliseKey(extractContractCode(contract)), contract)
      map.set(normaliseKey(contract.name), contract)
      map.set(normaliseKey(contract.id), contract)
    })
    return map
  }, [contracts])
  const contractIds = useMemo(
    () => Array.from(new Set(contracts.map((contract) => contract.id))).sort(),
    [contracts],
  )
  const metrics = payload?.metrics ?? FALLBACK_CONTRACT_METRICS
  const workInProgressItems = useMemo<WorkInProgressMetric[]>(() => {
    const sanitise = (item: WorkInProgressMetric) => {
      const value = Number(item.percent)
      return {
        contract: item.contract,
        status: normaliseWorkStatus(item.status),
        percent: Number.isFinite(value) ? value : 0,
      }
    }
    if (metrics.workInProgress?.length) {
      return metrics.workInProgress.map(sanitise)
    }
    if (!contracts.length) {
      return []
    }
    return contracts.map((contract) =>
      sanitise({
        contract: contract.name ?? contract.id,
        status: normaliseWorkStatus(contract.status_label, contract.phase),
        percent: Math.round(contract.status_pct ?? 0),
      }),
    )
  }, [contracts, metrics.workInProgress])
  const hasWorkInProgress = workInProgressItems.length > 0

  const workInProgressByContract = useMemo(() => {
    const map = new Map<string, WorkInProgressMetric>()
    workInProgressItems.forEach((item) => {
      map.set(normaliseKey(item.contract), item)
    })
    return map
  }, [workInProgressItems])

  const sowGroups = payload?.sow_tree ?? []

  const filteredContracts = useMemo(() => {
    if (contractFilter === 'ALL') return contracts
    return contracts.filter((contract) => contract.id === contractFilter)
  }, [contracts, contractFilter])

  const focusedContract = filteredContracts.find((contract) => contract.id === focusedContractId) ?? filteredContracts[0]

  const handleScheduleNavigate = useCallback(() => {
    if (!FEATURE_SCHEDULE_UI) {
      return
    }
    if (!isAuthenticated) {
      navigate('/', { state: { openView: 'login' } })
      return
    }
    if (focusedContract) {
      navigate(`/contracts/${focusedContract.id}/schedule`, {
        state: {
          contractName: focusedContract.name,
          projectName: project?.name,
          projectId: project?.id,
          contractId: focusedContract.id,
          projectSnapshot: project ?? null,
          utilityView: 'scheduling',
        },
      })
      return
    }
    if (project?.id) {
      navigate('/schedule', {
        state: { projectId: project.id, projectName: project.name },
      })
    }
  }, [focusedContract, isAuthenticated, navigate, project])

  const handleFinancialNavigate = useCallback(() => {
    if (!FEATURE_FINANCIAL_VIEW) {
      return
    }
    if (!isAuthenticated) {
      navigate('/', { state: { openView: 'login' } })
      return
    }
    if (focusedContract) {
      navigate(`/contracts/${focusedContract.id}/financial`, {
        state: {
          contractName: focusedContract.name,
          projectName: project?.name,
          projectId: project?.id,
          contractId: focusedContract.id,
          projectSnapshot: project ?? null,
          utilityView: 'financial',
        },
      })
      return
    }
    if (project?.id) {
      navigate('/financial', {
        state: { projectId: project.id, projectName: project.name, projectSnapshot: project ?? null },
      })
    }
  }, [focusedContract, isAuthenticated, navigate, project])

  const handleAtomNavigate = useCallback(() => {
    if (!FEATURE_ATOM_MANAGER) {
      return
    }
    if (!isAuthenticated) {
      navigate('/', { state: { openView: 'login' } })
      return
    }
    const statePayload = {
      projectId: project?.id,
      projectName: project?.name,
      contractId: focusedContract?.id ?? null,
      contractName: focusedContract?.name ?? null,
      sowId: focusedSowId,
      role: 'contractor',
    }
    if (focusedContract) {
      navigate(`/contracts/${focusedContract.id}/atoms`, {
        state: statePayload,
      })
      return
    }
    if (project?.id) {
      navigate('/atoms', {
        state: statePayload,
      })
    }
  }, [FEATURE_ATOM_MANAGER, focusedContract, focusedSowId, isAuthenticated, navigate, project])

  const sowByContract = useMemo(() => {
    const map = new Map<string, typeof sowGroups[number]['sections']>()
    sowGroups.forEach((group) => {
      map.set(group.contract_id, group.sections)
    })
    return map
  }, [sowGroups])

  const focusedContractSections = useMemo(() => {
    if (!focusedContract) {
      return []
    }
    return sowByContract.get(focusedContract.id) ?? []
  }, [focusedContract, sowByContract])

  const handleContractSelect = useCallback((contract: ContractSite) => {
    setFocusedContractId(contract.id)
    useScheduleStore.setState({ currentContractId: contract.id })
    if (FEATURE_CCC_V2) {
      const sections = sowByContract.get(contract.id) ?? []
      if (sections.length) {
        setFocusedSowId(sections[0].id)
      } else {
        setFocusedSowId(null)
      }
    }
  }, [FEATURE_CCC_V2, sowByContract])

  const toggleContractExpansion = useCallback(
    (contract: ContractSite) => {
      setExpandedContracts((prev) => {
        const next = !prev[contract.id]
        if (next) {
          handleContractSelect(contract)
        }
        return { ...prev, [contract.id]: next }
      })
    },
    [handleContractSelect],
  )

  const contractDialItems = useMemo(() => {
    if (!FEATURE_CCC_V2) {
      return []
    }
    return contracts
      .map((contract) => {
        const key = normaliseKey(contract.name)
        const wip = workInProgressByContract.get(key) || workInProgressByContract.get(normaliseKey(extractContractCode(contract)))
        const percent = wip ? Math.max(0, Math.min(100, wip.percent)) : Math.max(0, Math.min(100, Math.round(contract.status_pct ?? 0)))
        const stage = resolveStageLabel(wip?.status ?? contract.status_label ?? contract.phase)
        return {
          id: contract.id,
          name: contract.name,
          percent,
          color: contractAccent(contract.name),
          stage,
        }
      })
      .sort((a, b) => b.percent - a.percent)
  }, [FEATURE_CCC_V2, contracts, workInProgressByContract])

  const stageSummary = useMemo(() => {
    if (!FEATURE_CCC_V2) {
      return []
    }
    return STAGE_LABELS.map((stage) => {
      const stageContracts = contractDialItems.filter((item) => item.stage === stage)
      const count = stageContracts.length
      const average = count ? stageContracts.reduce((sum, item) => sum + item.percent, 0) / count : 0
      return { name: stage, count, average }
    })
  }, [FEATURE_CCC_V2, contractDialItems])

  const projectWipPercent = useMemo(() => {
    if (!FEATURE_CCC_V2 || !contractDialItems.length) {
      return null
    }
    const total = contractDialItems.reduce((sum, item) => sum + Math.max(0, Math.min(100, item.percent)), 0)
    return total / contractDialItems.length
  }, [FEATURE_CCC_V2, contractDialItems])


  const phaseGroups = useMemo(() => {
    const groups: Record<string, ContractSite[]> = {}
    for (const contract of filteredContracts) {
      groups[contract.phase] = groups[contract.phase] || []
      groups[contract.phase].push(contract)
    }
    return Object.entries(groups)
  }, [filteredContracts])

  const mapStyle = MAP_STYLES[mapView]

  const mapSplitTrigger = useMemo(() => Math.round(centerMapHeight).toString(), [centerMapHeight])

  const wipPaneContent = (
    <div className="contract-wip-card">
      {FEATURE_CCC_V2 ? (
        contractDialItems.length ? (
          <HierarchyWipBoard
            projectLabel={project.name}
            projectPercent={projectWipPercent}
            stages={stageSummary}
            contractItems={contractDialItems}
          />
        ) : (
          <div className="pp-wip-status">Preparing work in progress…</div>
        )
      ) : hasWorkInProgress ? (
        <WorkInProgressBoard items={workInProgressItems} theme={theme} />
      ) : (
        <div className="pp-wip-status">Preparing work in progress…</div>
      )}
    </div>
  )

  const bounds = useMemo(() => {
    if (!filteredContracts.length) return undefined
    const latLngs = filteredContracts.map((contract) => [contract.lat, contract.lng]) as [number, number][]
    return L.latLngBounds(latLngs).pad(0.2)
  }, [filteredContracts])

  useEffect(() => {
    if (filteredContracts.length === 0) {
      setFocusedContractId(null)
      useScheduleStore.setState({ currentContractId: null })
      return
    }
    setFocusedContractId((prev) => (prev && filteredContracts.some((contract) => contract.id === prev) ? prev : filteredContracts[0].id))
  }, [filteredContracts])

  const mapCenter: [number, number] = focusedContract ? [focusedContract.lat, focusedContract.lng] : [project.lat, project.lng]

  const alertCount = focusedContract?.alerts ?? project.alerts ?? 0

  const contractIconCache = useRef<Record<string, DivIcon>>({})

  const createContractIcon = useCallback(
    (contract: ContractSite, active: boolean, weatherPoint?: WeatherSummary['contracts'][number] | null) => {
      const statusKey = Math.round(contract.status_pct || 0)
      const weatherKey = weatherPoint
        ? `${Math.round(weatherPoint.temperatureC ?? -999)}-${weatherPoint.weatherCode ?? 'na'}`
        : 'none'
      const cacheKey = `${contract.id}-${statusKey}-${contract.alerts}-${active ? 'on' : 'off'}-${weatherKey}`
      if (contractIconCache.current[cacheKey]) {
        return contractIconCache.current[cacheKey]
      }

      const accent = accentColor(contract)
      const intensity = Math.min(1, Math.max(0, contract.alerts / 6))
      const alertsBadge = contract.alerts ? `<span class="contract-pin__badge">${contract.alerts}</span>` : ''
      const temperature = weatherPoint?.temperatureC
      const weatherDescription = weatherPoint?.weatherDescription
      const weatherHtml = weatherPoint
        ? `<div class="contract-pin__weather">${
            temperature !== null && temperature !== undefined ? `<span class="temp">${Math.round(temperature)}°C</span>` : ''
          }${weatherDescription ? `<span class="desc">${weatherDescription}</span>` : ''}</div>`
        : ''

      const icon = L.divIcon({
        className: `contract-pin ${active ? 'contract-pin--active' : ''}`,
        html: `
        <div class="contract-pin__glow" style="--contract-accent:${accent};--contract-intensity:${intensity}"></div>
        <div class="contract-pin__core" style="--contract-accent:${accent}">
          <span class="contract-pin__value">${statusKey}%</span>
          ${alertsBadge}
          ${weatherHtml}
        </div>
      `,
        iconSize: [54, 54],
        iconAnchor: [27, 27],
        popupAnchor: [0, -20],
      })

      contractIconCache.current[cacheKey] = icon
      return icon
    },
    [],
  )

  const activeContractDisplay = hoveredContract ?? focusedContract ?? null
  const activeContractWeather = activeContractDisplay ? contractWeatherMap.get(activeContractDisplay.id) ?? null : null

  const projectCrumbLabel = project.name ? project.name.replace(/\s+/g, '_') : 'Project'

  return (
    <div className="contract-page">
      <header className="contract-topbar">
        <Breadcrumbs
          items={[
            { label: 'Dashboard', onClick: onClose },
            { label: projectCrumbLabel },
            { label: 'Construction Control Center' },
          ]}
        />
        <div className="contract-top-actions">
          {onToggleTheme && <ThemeToggleButton theme={theme ?? 'light'} onToggle={onToggleTheme} />}
          <button type="button" className="top-icon" aria-label="Scheduling" title="Scheduling">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4" strokeLinecap="round" />
              <path d="M8 2v4" strokeLinecap="round" />
              <path d="M3 10h18" />
            </svg>
          </button>
          <button type="button" className="top-icon" aria-label="Financials" title="Financial dashboards">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 20v-6" strokeLinecap="round" />
              <path d="M10 20v-10" strokeLinecap="round" />
              <path d="M16 20v-4" strokeLinecap="round" />
              <path d="M2 20h20" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" className="top-icon alert" aria-label="Alerts" title="Alerts">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M12 3l9 16H3z" strokeLinejoin="round" />
              <path d="M12 9v4" strokeLinecap="round" />
              <path d="M12 17h.01" strokeLinecap="round" />
            </svg>
            <span className="badge">{alertCount}</span>
          </button>
          <button type="button" className="top-icon" aria-label="Collaborators" title="Collaborators">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="9" cy="9" r="3" />
              <circle cx="17" cy="10" r="2.5" />
              <path d="M4 19a5 5 0 0 1 10 0" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 19a4 4 0 0 1 6 0" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </header>

      <div className="contract-panel">
        <div className="contract-body pp-layout">
          <aside className="contract-list pp-leftRail">
            <div className="contract-filter">
              <span>Contracts</span>
              <select value={contractFilter} onChange={(event) => setContractFilter(event.target.value)}>
                <option value="ALL">All Contracts</option>
                {contractIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
            <div className="contract-list-scroll">
              {error && (
                <div className="contract-error">
                  {error}
                  <button onClick={onRetry}>Retry</button>
                </div>
              )}
              {loading && <div className="contract-loading">Loading contracts…</div>}
              {!loading && phaseGroups.length === 0 && <div className="contract-loading">No contract data available yet.</div>}
              {phaseGroups.map(([phase, items]) => (
                <section key={phase} className="contract-phase">
                  <header className="contract-phase-title">{phase}</header>
                  <ul>
                    {items.map((contract) => {
                      const sections = sowByContract.get(contract.id) ?? []
                      const expanded = expandedContracts[contract.id]
                      const isActive = contract.id === focusedContractId
                      const wipStatus =
                        workInProgressByContract.get(normaliseKey(contract.name)) ||
                        workInProgressByContract.get(normaliseKey(extractContractCode(contract)))
                      const stageLabel = resolveStageLabel(wipStatus?.status ?? contract.status_label ?? contract.phase)
                      const stageModifier = stageLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'construction'
                      return (
                        <li key={contract.id} className={isActive ? 'active' : undefined}>
                          <div className="contract-row">
                            <button
                              type="button"
                              className="contract-row__body"
                              onClick={() => handleContractSelect(contract)}
                            >
                              <div className="contract-row__info">
                                <span className="contract-name">{contract.name}</span>
                                <span className={`contract-stage-badge contract-stage-badge--${stageModifier}`}>
                                  {stageLabel}
                                </span>
                              </div>
                              <span className="contract-progress">{Math.round(contract.status_pct)}%</span>
                            </button>
                            {sections.length > 0 && (
                              <button
                                type="button"
                                className="contract-toggle"
                                onClick={() => toggleContractExpansion(contract)}
                                aria-label={`Toggle ${contract.name}`}
                              >
                                {expanded ? '−' : '+'}
                              </button>
                            )}
                          </div>
                          {sections.length > 0 && expanded && (
                            <div className="sow-list sow-list--scroll">
                              {sections.map((section) => {
                                const isSowActive = section.id === focusedSowId
                                const processes = section.clauses ?? []
                                return (
                                  <div key={section.id} className={`sow-item${isSowActive ? ' active' : ''}`}>
                                    <button
                                      type="button"
                                      className="sow-item__header"
                                      onClick={() => setFocusedSowId(section.id)}
                                    >
                                      <span>{section.title}</span>
                                      <span>{Math.round(Number(section.progress ?? 0))}%</span>
                                    </button>
                                    {isSowActive && processes.length > 0 && (
                                      <ul className="sow-item__processes">
                                        {processes.map((clause) => (
                                          <li key={clause.id}>{clause.title}</li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </aside>

          <div className="ccc-center-column">
            <section className="ccc-map-section" style={{ height: centerMapHeight }}>
              <div className="contract-map-card">
                <div className="contract-map-shell" ref={mapShellRef}>
                  <div className="map-toolbar">
                    <div className="map-toolbar-row">
                      <div className="map-view-toggle" role="tablist" aria-label="Switch basemap style">
                        {(Object.keys(MAP_STYLES) as MapView[]).map((viewKey) => {
                          const style = MAP_STYLES[viewKey]
                          return (
                            <button
                              key={viewKey}
                              className={mapView === viewKey ? 'active' : ''}
                              onClick={() => setMapView(viewKey)}
                              type="button"
                              role="tab"
                              aria-selected={mapView === viewKey}
                            >
                              {style.label}
                            </button>
                          )
                        })}
                      </div>

                      <div className="map-layer-buttons" role="group" aria-label="Map feature overlays">
                        <button
                          type="button"
                          className={`btn-map-toggle ${featureToggle.geofences ? 'active' : ''}`}
                          onClick={() => setFeatureToggle((prev) => ({ ...prev, geofences: !prev.geofences }))}
                        >
                          Geofence
                        </button>
                        <button
                          type="button"
                          className={`btn-map-toggle ${featureToggle.intensity ? 'active' : ''}`}
                          onClick={() => setFeatureToggle((prev) => ({ ...prev, intensity: !prev.intensity }))}
                        >
                          Heat
                        </button>
                      </div>
                    </div>

                    {activeContractDisplay && (
                      <div className="map-active-card">
                        <div>
                          <span className="map-active-name">{activeContractDisplay.name}</span>
                          <span className="map-active-phase">{activeContractDisplay.phase}</span>
                        </div>
                        <div className="map-active-meta">
                          <span>{Math.round(activeContractDisplay.status_pct)}% complete</span>
                          <span>Alerts {activeContractDisplay.alerts ?? 0}</span>
                          {activeContractDisplay.status_label && <span>{activeContractDisplay.status_label}</span>}
                          {activeContractWeather && (
                            <span>
                              Weather {activeContractWeather.temperatureC !== null && activeContractWeather.temperatureC !== undefined ? `${Math.round(activeContractWeather.temperatureC)}°C` : '--'} ·{' '}
                              {activeContractWeather.weatherDescription ?? 'Conditions unavailable'}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {loading && <div className="contract-loading">Preparing map…</div>}
                  {!loading && (
                    <MapContainer
                      key={`${mapView}-${theme}`}
                      center={mapCenter}
                      zoom={12}
                      className="contract-leaflet"
                      scrollWheelZoom
                      zoomControl={false}
                      doubleClickZoom={false}
                      style={{ flex: 1 }}
                    >
                      <TileLayer attribution={mapStyle.attribution} url={mapStyle.url} />
                      <ZoomControl position="topright" />
                      <ScaleControl position="bottomleft" />
                      {bounds && (
                        <FitContractBounds
                          bounds={bounds}
                          focus={focusedContract ? [focusedContract.lat, focusedContract.lng] : undefined}
                        />
                      )}
                      <MapResizeWatcher
                        trigger={`${panelCollapsed}-${theme}-${mapView}-${filteredContracts.length}-${Math.round(
                          (mapShellRef.current?.offsetHeight ?? 0) * 100,
                        )}-${mapSplitTrigger}`}
                      />

                      {featureToggle.intensity &&
                        filteredContracts.map((contract) => {
                          const index = Math.min(ALERT_COLOR_MAP.length - 1, Math.max(0, contract.alerts - 1))
                          const [r, g, b] = ALERT_COLOR_MAP[index]
                          return (
                            <Circle
                              key={`${contract.id}-intensity`}
                              center={[contract.lat, contract.lng]}
                              radius={900 + (contract.alerts || 0) * 250}
                              pathOptions={{
                                color: 'transparent',
                                fillColor: `rgba(${r}, ${g}, ${b}, 0.22)`,
                                fillOpacity: 0.22,
                              }}
                            />
                          )
                        })}

                      {featureToggle.geofences &&
                        filteredContracts
                          .filter((contract) => contract.geofence_radius_m || project.geofence_radius_m)
                          .map((contract) => {
                            const [r, g, b] = statusColor(contract.status_label ?? '')
                            const radius = Math.max(contract.geofence_radius_m ?? project.geofence_radius_m ?? 0, 900) * 1.05
                            return (
                              <Circle
                                key={`${contract.id}-geofence`}
                                center={[contract.lat, contract.lng]}
                                radius={radius}
                                pathOptions={{
                                  color: `rgba(${r}, ${g}, ${b}, 0.85)`,
                                  opacity: 0.8,
                                  weight: 2,
                                  dashArray: '6 6',
                                  fillOpacity: 0,
                                }}
                              />
                            )
                          })}

                      {filteredContracts.map((contract) => {
                        const isActive = contract.id === focusedContractId
                        const weatherPoint = contractWeatherMap.get(contract.id) ?? null
                        const icon = createContractIcon(contract, theme ?? 'light', isActive, weatherPoint)
                        return (
                          <Marker
                            key={contract.id}
                            position={[contract.lat, contract.lng]}
                            icon={icon}
                            eventHandlers={{
                              click: () => handleContractSelect(contract),
                              mouseover: () => setHoveredContract(contract),
                              mouseout: () => setHoveredContract((prev) => (prev?.id === contract.id ? null : prev)),
                            }}
                          >
                            <Tooltip direction="top" offset={[0, -30]} opacity={0.9}>
                              <div style={{ display: 'grid', gap: 4 }}>
                                <strong>{contract.name}</strong>
                                <span style={{ fontSize: '0.75rem' }}>
                                  {Math.round(contract.status_pct)}% · Alerts {contract.alerts}
                                </span>
                                {weatherPoint && (
                                  <span style={{ fontSize: '0.7rem' }}>
                                    Weather {weatherPoint.temperatureC !== null && weatherPoint.temperatureC !== undefined ? `${Math.round(weatherPoint.temperatureC)}°C` : '--'} ·{' '}
                                    {weatherPoint.weatherDescription ?? 'Conditions unavailable'}
                                  </span>
                                )}
                              </div>
                            </Tooltip>
                          </Marker>
                        )
                      })}
                    </MapContainer>
                  )}
                </div>
              </div>
            </section>
            <div
              className={`ccc-resize-bar ${isResizingCenterMap ? 'dragging' : ''}`}
              role="separator"
              aria-orientation="horizontal"
              aria-label="Adjust map and work in progress height"
              onMouseDown={handleCenterResizeStart}
            >
              <span />
            </div>
            <section className="ccc-wip-section">{wipPaneContent}</section>
          </div>

            <ProjectProductivityPanel
              projectId={project.id}
              initialContractId={focusedContract?.id ?? contracts[0]?.id}
            />
          </div>
      </div>
      <div className="contract-utility-floating" aria-label="Contract utility views">
        {visibleUtilityViews.map((view) => {
          const active = view.id === activeUtilityView
          return (
            <button
              key={view.id}
              type="button"
              className={`utility-dock-btn ${active ? 'active' : ''}`}
              onClick={() => {
                if (view.id === 'scheduling') {
                  setActiveUtilityView(view.id)
                  handleScheduleNavigate()
                } else if (view.id === 'financial') {
                  setActiveUtilityView(view.id)
                  handleFinancialNavigate()
                } else if (view.id === 'atom') {
                  setActiveUtilityView(view.id)
                  handleAtomNavigate()
                } else {
                  setActiveUtilityView(view.id)
                }
              }}
              aria-pressed={active}
              title={view.label}
            >
              <span aria-hidden>{view.icon}</span>
              <span className="sr-only">{view.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const WORK_STATUS_COLORS: Record<string, string> = {
  Construction: '#1d4ed8',
  Bidding: '#c2410c',
  'Pre-PQ': '#d97706',
  PQ: '#7c3aed',
}
const WORK_STATUS_ORDER: Array<keyof typeof WORK_STATUS_COLORS> = ['Construction', 'Bidding', 'Pre-PQ', 'PQ']

type WorkStatusFilter = keyof typeof WORK_STATUS_COLORS | 'All'

const normaliseWorkStatus = (status?: string | null, phase?: string | null): keyof typeof WORK_STATUS_COLORS => {
  const source = `${status ?? ''} ${phase ?? ''}`.toLowerCase()
  if (source.includes('pre-pq') || source.includes('pre pq') || source.includes('prequalification') || source.includes('prequal')) {
    return 'Pre-PQ'
  }
  if (source.includes('pq')) {
    return 'PQ'
  }
  if (source.includes('bid') || source.includes('tender') || source.includes('procure')) {
    return 'Bidding'
  }
  return 'Construction'
}

function WorkInProgressBoard({ items, theme }: { items: WorkInProgressMetric[]; theme?: Theme }) {
  if (!items.length) {
    return null
  }
  const [activeStatus, setActiveStatus] = useState<WorkStatusFilter>('Construction')

  useEffect(() => {
    if (activeStatus === 'All') {
      return
    }
    const hasItems = items.some((item) => item.status === activeStatus)
    if (!hasItems && items.length) {
      setActiveStatus('All')
    }
  }, [activeStatus, items])

  const summary = useMemo(
    () =>
      WORK_STATUS_ORDER.map((status) => {
        const bucket = items.filter((item) => item.status === status)
        const count = bucket.length
        const average = count ? bucket.reduce((sum, item) => sum + item.percent, 0) / count : null
        return { status, count, color: WORK_STATUS_COLORS[status], average }
      }),
    [items],
  )

  const filteredItems = useMemo(() => {
    if (activeStatus === 'All') return items
    return items.filter((item) => item.status === activeStatus)
  }, [items, activeStatus])

  const legendEntries = useMemo(
    () =>
      Array.from(
        new Map(
          filteredItems.map((item) => [item.contract, { contract: item.contract, color: contractAccent(item.contract) }]),
        ).values(),
      ),
    [filteredItems],
  )

  const rankedItems = useMemo(() => [...filteredItems].sort((a, b) => b.percent - a.percent), [filteredItems])
  const totalProjects = items.length
  const emptyState = !rankedItems.length
  const filterLabel = activeStatus === 'All' ? 'All contracts' : `${activeStatus} contracts`
  const stageHint =
    activeStatus === 'All'
      ? `Showing ${rankedItems.length} of ${totalProjects} contracts`
      : rankedItems.length
      ? `${rankedItems.length} ${rankedItems.length === 1 ? 'contract' : 'contracts'} in ${activeStatus}`
      : `No contracts currently in ${activeStatus}`

  return (
    <div className="contract-wip-board pp-wip">
      <div className="wip-header">
        <h4>Work in progress</h4>
        <span>{filterLabel} · {stageHint}</span>
      </div>

      <div className="wip-summary">
        {summary.map(({ status, count, color, average }) => {
          const isActive = activeStatus === status
          const projectsLabel = count === 1 ? 'Contract' : 'Contracts'
          const averageLabel = average !== null ? `${Math.round(average)}% avg` : 'No progress yet'
          return (
            <button
              key={status}
              type="button"
              className={`wip-summary-chip ${isActive ? 'active' : ''}`}
              style={{ '--chip-accent': color } as React.CSSProperties}
              aria-pressed={isActive}
              onClick={() => setActiveStatus((prev) => (prev === status ? 'All' : status))}
            >
              <span className="wip-summary-label">{status}</span>
              <span className="wip-summary-count">{count}</span>
              <span className="wip-summary-sub">
                {projectsLabel}
                {count ? ` · ${averageLabel}` : ''}
              </span>
            </button>
          )
        })}
      </div>

      {emptyState ? (
        <div className="wip-empty-state">No active contracts in this stage. Try another status.</div>
      ) : (
        <>
          <div className="wip-track">
            {rankedItems.map((item) => {
              const progress = Math.max(0, Math.min(100, item.percent))
              const accent = WORK_STATUS_COLORS[item.status] ?? contractAccent(item.contract)
              const circumference = 2 * Math.PI * 36
              const dashOffset = circumference * (1 - progress / 100)
              const gradientId = `wip-dial-${item.contract.replace(/[^a-z0-9]/gi, '')}-${item.status.replace(/[^a-z0-9]/gi, '')}`
              const haloId = `${gradientId}-halo`
              const textColor = theme === 'light' ? '#0f172a' : '#f8fafc'
              const trackColor = theme === 'light' ? '#e2e8f0' : 'rgba(148, 163, 184, 0.35)'
              const tone = progress >= 65 ? 'ahead' : progress >= 40 ? 'steady' : 'lagging'
              return (
                <div key={item.contract + item.status} className={`wip-card tone-${tone}`}>
                  <svg className="wip-dial" viewBox="0 0 120 120" role="presentation" aria-hidden>
                    <defs>
                      <radialGradient id={haloId} cx="50%" cy="50%" r="60%">
                        <stop offset="0%" stopColor={accent} stopOpacity={0.55} />
                        <stop offset="65%" stopColor={accent} stopOpacity={0.16} />
                        <stop offset="100%" stopColor={accent} stopOpacity={0} />
                      </radialGradient>
                      <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={accent} stopOpacity={0.9} />
                        <stop offset="100%" stopColor={accent} stopOpacity={0.5} />
                      </linearGradient>
                    </defs>
                    <circle className="wip-dial-halo" cx="60" cy="60" r="50" fill={`url(#${haloId})`} />
                    <circle className="wip-dial-track" cx="60" cy="60" r="36" stroke={trackColor} />
                    <circle
                      className="wip-dial-progress"
                      cx="60"
                      cy="60"
                      r="36"
                      stroke={`url(#${gradientId})`}
                      strokeDasharray={`${circumference} ${circumference}`}
                      strokeDashoffset={dashOffset}
                    />
                    <text x="60" y="64" className="wip-dial-text" fill={textColor}>
                      {Math.round(progress)}%
                    </text>
                  </svg>
                  <div className="wip-details">
                    <strong>{item.contract}</strong>
                    <span className="wip-status-chip">{item.status}</span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="wip-legend">
            {legendEntries.map((entry) => (
              <div key={entry.contract} className="wip-legend-chip">
                <span className="wip-legend-dot" style={{ background: entry.color }} />
                <span>{entry.contract}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
