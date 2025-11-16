import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import L, { DivIcon } from 'leaflet'
import { Circle, MapContainer, Marker, ScaleControl, TileLayer, Tooltip, ZoomControl, useMap } from 'react-leaflet'

import Breadcrumbs from '../../components/breadcrumbs/Breadcrumbs'
import { SidebarNav, ACCS_NAV_INDEX } from '../../layout/navigation'
import TopBarGlobalActions from '../../layout/TopBarActions'
import HierarchyWipBoard from '../../components/wip/HierarchyWipBoard'
import { fetchCccRightPanel, fetchCccSummary } from '../../api'
import type { CccSummary, MapMarker, RightPanelKpiPayload } from '../../types/ccc'
import { RCC_FACILITIES, RCC_MAP_MARKERS, RCC_PROCESSES } from '../../data/rccDamSow'

import 'leaflet/dist/leaflet.css'

type RouteParams = {
  projectId: string
  contractId: string
}

type SowHierarchyNode = {
  id: string
  label: string
  children?: Array<{ id: string; label: string }>
}

type SowControlCenterPageProps = {
  variant?: 'default' | 'rcc-dam'
}

const SOW_HIERARCHY: SowHierarchyNode[] = [
  {
    id: 'sow-mw01-rcc',
    label: 'RCC Dam',
    children: [
      { id: 'clause-mw01-rcc-raw-material', label: 'Raw Material Source & Verification' },
      { id: 'clause-mw01-rcc-simulations', label: 'Simulations' },
      { id: 'clause-mw01-rcc-mix-design', label: 'Concrete Mix Design' },
      { id: 'clause-mw01-rcc-placement-schedules', label: 'Placement Schedules & Thermal Design' },
      { id: 'clause-mw01-rcc-batching-plant', label: 'Concrete Batching Plant' },
      { id: 'clause-mw01-rcc-aggregate-plant', label: 'Aggregate Plant' },
      { id: 'clause-mw01-rcc-transportation', label: 'Transportation System' },
      { id: 'clause-mw01-rcc-trial', label: 'RCC Trial Construction' },
      { id: 'clause-mw01-rcc-lab', label: 'RCC Lab' },
      { id: 'clause-mw01-rcc-preparations', label: 'Placement Preparations' },
      { id: 'clause-mw01-rcc-formwork', label: 'Formwork Installation' },
      { id: 'clause-mw01-rcc-production', label: 'Concrete Production' },
      { id: 'clause-mw01-rcc-transport', label: 'Concrete Transportation' },
      { id: 'clause-mw01-rcc-placement', label: 'Concrete Placement' },
      { id: 'clause-mw01-rcc-curing', label: 'Concrete Curing' },
      { id: 'clause-mw01-rcc-strength', label: 'Concrete Strength Monitoring' },
      { id: 'clause-mw01-rcc-formwork-removal', label: 'Formwork Removal' },
      { id: 'clause-mw01-rcc-payment', label: 'Payment' },
    ],
  },
  { id: 'sow-mw01-dam-pit', label: 'Dam Pit' },
  { id: 'sow-mw01-ds-coffer', label: 'D/S Coffer Dam' },
  { id: 'sow-mw01-lb-power-intake', label: 'LB Power Intake' },
  { id: 'sow-mw01-dam-right-abutment', label: 'Dam Right Abutment' },
  { id: 'sow-mw01-permanent-bridge', label: 'Permanent Bridge' },
  { id: 'sow-mw01-dam-left-abutment', label: 'Dam Left Abutment' },
  { id: 'sow-mw01-rb-power-intake', label: 'RB Power Intake' },
  { id: 'sow-mw01-diversion-tunnel-1', label: 'Diversion Tunnel 1' },
  { id: 'sow-mw01-diversion-tunnel-2', label: 'Diversion Tunnel 2' },
  { id: 'sow-mw01-diversion-canal', label: 'Diversion Canal' },
  { id: 'sow-mw01-guide-wall', label: 'Guide Wall' },
  { id: 'sow-mw01-us-coffer', label: 'U/S Coffer Dam' },
]

const STAGE_LABEL_BY_STATUS: Record<MapMarker['status'], 'Construction' | 'Pre-PQ' | 'Bidding'> = {
  'on-track': 'Construction',
  monitoring: 'Pre-PQ',
  risk: 'Bidding',
}

type SowMapView = 'atlas' | 'satellite' | 'terrain' | 'blueprint'

const SOW_MAP_STYLES: Record<SowMapView, { label: string; url: string; attribution: string }> = {
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
  },
  terrain: {
    label: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)',
  },
  blueprint: {
    label: 'Blueprint',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  },
}

const STATUS_ACCENTS: Record<MapMarker['status'], string> = {
  'on-track': '#22c55e',
  monitoring: '#facc15',
  risk: '#ef4444',
}

const RCC_MAP_MIN_HEIGHT = 320
const RCC_MAP_MAX_HEIGHT = 3200

const hexToRgba = (hex: string, alpha = 1) => {
  const sanitized = hex.replace('#', '')
  const bigint = Number.parseInt(sanitized, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const statusModifier = (status: string) => status.toLowerCase().replace(/[^a-z0-9]+/g, '-')

const createSowIcon = (marker: MapMarker, active: boolean) => {
  const statusColor =
    marker.status === 'on-track' ? '#22c55e' : marker.status === 'monitoring' ? '#facc15' : '#f87171'
  return L.divIcon({
    className: `sow-marker ${active ? 'is-active' : ''}`,
    html: `<div class="sow-marker__core" style="--marker-color:${statusColor}">
      <span>${marker.percent_complete.toFixed(0)}%</span>
      <strong>${marker.name}</strong>
    </div>`,
    iconSize: [110, 46],
    iconAnchor: [55, 23],
    popupAnchor: [0, -20],
  })
}

export default function SowControlCenterPage({ variant = 'default' }: SowControlCenterPageProps = {}): JSX.Element {
  const isRccVariant = variant === 'rcc-dam'
  const { projectId = 'diamer-basha', contractId = 'mw-01-main-dam' } = useParams<RouteParams>()
  const navigate = useNavigate()
  const [activeNavIndex, setActiveNavIndex] = useState(ACCS_NAV_INDEX)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [summary, setSummary] = useState<CccSummary | null>(null)
  const [contractKpis, setContractKpis] = useState<RightPanelKpiPayload | null>(null)
  const [kpis, setKpis] = useState<RightPanelKpiPayload | null>(null)
  const [selectedSowId, setSelectedSowId] = useState<string | null>(() => (isRccVariant ? 'sow-mw01-rcc' : null))
  const [expandedSows, setExpandedSows] = useState<Record<string, boolean>>({ 'sow-mw01-rcc': true })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mapView, setMapView] = useState<SowMapView>('atlas')
  const [mapToggles, setMapToggles] = useState<{ heat: boolean; geofences: boolean }>({ heat: false, geofences: true })
  const [mapHeight, setMapHeight] = useState(() => {
    if (typeof window === 'undefined') return 960
    return Math.max(RCC_MAP_MIN_HEIGHT, Math.min(1100, window.innerHeight - 80))
  })
  const [mapTab, setMapTab] = useState<'map' | 'process'>('map')
  const [showRccProcesses, setShowRccProcesses] = useState(isRccVariant)
  const [mapStatsCollapsed, setMapStatsCollapsed] = useState(false)
  const [isResizingMap, setIsResizingMap] = useState(false)
  const mapResizeSnapshot = useRef({ startY: 0, startHeight: 520 })
  const [productivityAccordions, setProductivityAccordions] = useState({
    design: true,
    preparatory: true,
    construction: true,
  })
  const [qualityAccordions, setQualityAccordions] = useState({
    ncr: true,
    qaor: false,
  })
  const [spiExpanded, setSpiExpanded] = useState(true)
  const [rccProcessesOpen, setRccProcessesOpen] = useState(true)
  const [rccFacilitiesOpen, setRccFacilitiesOpen] = useState(true)
  const [facilityExpanded, setFacilityExpanded] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    RCC_FACILITIES.forEach((facility) => {
      initial[facility.id] = true
    })
    return initial
  })
  const isRccProcessView = showRccProcesses
  useEffect(() => {
    if (isRccVariant) {
      setSelectedSowId('sow-mw01-rcc')
      setShowRccProcesses(true)
    }
  }, [isRccVariant])

  useEffect(() => {
    if (showRccProcesses && !selectedSowId) {
      setSelectedSowId('sow-mw01-rcc')
    }
  }, [showRccProcesses, selectedSowId])

  useEffect(() => {
    if (!showRccProcesses) {
      setMapTab('map')
    }
  }, [showRccProcesses])
  const utilityViews: Array<{ id: 'schedule' | 'financial' | 'supply' | 'alerts'; label: string; icon: React.ReactNode }> = useMemo(
    () => [
      {
        id: 'schedule',
        label: 'Scheduling',
        icon: (
          <svg viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor" fill="none">
            <rect x="4" y="5" width="16" height="15" rx="3" />
            <path d="M8 3v4" strokeLinecap="round" />
            <path d="M16 3v4" strokeLinecap="round" />
            <path d="M4 11h16" />
            <path d="M9.5 15h2" strokeLinecap="round" />
            <path d="M13 15h2" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        id: 'financial',
        label: 'Financial',
        icon: (
          <svg viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor" fill="none">
            <rect x="4" y="6" width="16" height="13" rx="2" />
            <path d="M4 11h16" />
            <path d="M8 15h2" strokeLinecap="round" />
            <path d="M12 15h4" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        id: 'supply',
        label: 'SCM',
        icon: (
          <svg viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor" fill="none">
            <path d="M4 8h16" strokeLinecap="round" />
            <path d="M6 8v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8" />
            <path d="M10 12h4" strokeLinecap="round" />
            <path d="M12 8V4" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        id: 'alerts',
        label: 'Alerts',
        icon: (
          <svg viewBox="0 0 24 24" strokeWidth="1.6" stroke="currentColor" fill="none">
            <path d="M12 3 3 20h18L12 3Z" strokeLinejoin="round" />
            <path d="M12 9v5" strokeLinecap="round" />
            <path d="M12 17h.01" strokeLinecap="round" />
          </svg>
        ),
      },
    ],
    [],
  )
  const [activeUtilityView, setActiveUtilityView] = useState<'schedule' | 'financial' | 'supply' | 'alerts' | null>(null)
  const sowLabelLookup = useMemo(() => {
    if (isRccProcessView) {
      return new Map(RCC_MAP_MARKERS.map((marker) => [marker.id, marker.name]))
    }
    const entries: Array<[string, string]> = []
    SOW_HIERARCHY.forEach((node) => {
      entries.push([node.id, node.label])
    })
    return new Map(entries)
  }, [isRccProcessView])
  const compactNumber = useMemo(
    () => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }),
    [],
  )
  const quantityFormatter = useMemo(() => new Intl.NumberFormat(), [])
  const formatPercent = (value?: number | null, digits = 1) =>
    typeof value === 'number' ? `${value.toFixed(digits)}%` : '--'
  const formatDays = (value?: number | null) => (typeof value === 'number' ? `${Math.round(value)}d` : '--')
  const formatCompact = (value?: number | null) => (typeof value === 'number' ? compactNumber.format(value) : '--')
  const formatNumber = (value?: number | null) => (typeof value === 'number' ? quantityFormatter.format(value) : '--')

  const toggleProductivitySection = (key: keyof typeof productivityAccordions) => {
    setProductivityAccordions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleQualitySection = (key: keyof typeof qualityAccordions) => {
    setQualityAccordions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchCccSummary({ projectId, contractId })
      .then((payload) => {
        if (cancelled) return
        setSummary(payload)
        const sowMarker = payload.map.find((marker) => marker.type === 'sow')
        setSelectedSowId((prev) => prev ?? sowMarker?.id ?? null)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Failed to load SOW summary', err)
        setError('Unable to load SOW map.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [contractId, projectId])

  useEffect(() => {
    let cancelled = false
    fetchCccRightPanel({ projectId, contractId })
      .then((payload) => {
        if (cancelled) return
        setContractKpis(payload)
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('Failed to load contract KPI baseline', err)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, contractId])

  useEffect(() => {
    if (!selectedSowId) return
    let cancelled = false
    setKpis(null)
    fetchCccRightPanel({ projectId, contractId, sowId: selectedSowId })
      .then((payload) => {
        if (cancelled) return
        setKpis(payload)
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('Failed to load sow KPIs', err)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, contractId, selectedSowId])

  useEffect(() => {
    if (!isResizingMap) return
    const handleMouseMove = (event: MouseEvent) => {
      const delta = event.clientY - mapResizeSnapshot.current.startY
      const proposed = mapResizeSnapshot.current.startHeight + delta
      const dynamicMax = Math.min(RCC_MAP_MAX_HEIGHT, Math.max(window.innerHeight * 1.5, 1200))
      const next = Math.max(RCC_MAP_MIN_HEIGHT, Math.min(dynamicMax, proposed))
      setMapHeight(next)
    }
    const handleMouseUp = () => setIsResizingMap(false)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingMap])

  useEffect(() => {
    const clampHeight = () => {
      const dynamicMax = Math.min(RCC_MAP_MAX_HEIGHT, Math.max(window.innerHeight * 1.5, 1200))
      setMapHeight((current) => Math.max(RCC_MAP_MIN_HEIGHT, Math.min(dynamicMax, current)))
    }
    clampHeight()
    window.addEventListener('resize', clampHeight)
    return () => window.removeEventListener('resize', clampHeight)
  }, [])

  const sowMarkers = useMemo(() => {
    if (isRccProcessView) {
      return RCC_MAP_MARKERS
    }
    return summary?.map.filter((marker) => marker.type === 'sow') ?? []
  }, [isRccProcessView, summary])
  const sowBounds = useMemo(() => {
    if (!sowMarkers.length) return null
    const latLngs = sowMarkers.map((marker) => [marker.lat, marker.lon]) as [number, number][]
    return L.latLngBounds(latLngs).pad(0.1)
  }, [sowMarkers])
  const centerLatLng: [number, number] = useMemo(() => {
    if (selectedSowId) {
      const marker = sowMarkers.find((item) => item.id === selectedSowId)
      if (marker) {
        return [marker.lat, marker.lon]
      }
    }
    if (sowMarkers.length) {
      return [sowMarkers[0].lat, sowMarkers[0].lon]
    }
    return [35.6264, 74.6189]
  }, [selectedSowId, sowMarkers])

  const stageSummary = useMemo(() => {
    const summaryByStage: Record<string, { total: number; count: number }> = {}
    sowMarkers.forEach((marker) => {
      const stage = STAGE_LABEL_BY_STATUS[marker.status]
      summaryByStage[stage] = summaryByStage[stage] || { total: 0, count: 0 }
      summaryByStage[stage].total += marker.percent_complete
      summaryByStage[stage].count += 1
    })
    return Object.entries(summaryByStage).map(([stage, stats]) => ({
      name: stage,
      count: stats.count,
      average: stats.count ? stats.total / stats.count : 0,
    }))
  }, [sowMarkers])

  const sowDialItems = useMemo(
    () =>
      sowMarkers.map((marker) => ({
        id: marker.id,
        name: marker.name,
        percent: marker.percent_complete,
        color: marker.status === 'on-track' ? '#22c55e' : marker.status === 'risk' ? '#f87171' : '#facc15',
        stage: STAGE_LABEL_BY_STATUS[marker.status],
      })),
    [sowMarkers],
  )

  const projectPercent = useMemo(() => {
    if (!sowMarkers.length) return null
    const total = sowMarkers.reduce((sum, marker) => sum + marker.percent_complete, 0)
    return total / sowMarkers.length
  }, [sowMarkers])

  const highlightedMarker = useMemo(() => {
    if (!selectedSowId) return sowMarkers[0] ?? null
    return sowMarkers.find((marker) => marker.id === selectedSowId) ?? sowMarkers[0] ?? null
  }, [selectedSowId, sowMarkers])

  const mapStyle = SOW_MAP_STYLES[mapView]
  const showProcessTabs = isRccProcessView
  const processImageSrc = '/images/jpg_output/process.png'

  const fallbackAverage = useMemo(() => {
    if (!sowMarkers.length) return null
    return sowMarkers.reduce((sum, marker) => sum + marker.percent_complete, 0) / sowMarkers.length
  }, [sowMarkers])

  const mapStats = useMemo(() => {
    const actual = kpis?.physical.actual_percent ?? contractKpis?.physical.actual_percent ?? fallbackAverage
    const planned = kpis?.physical.planned_percent ?? contractKpis?.physical.planned_percent ?? null
    const quality = kpis?.quality_summary?.quality_conformance ?? contractKpis?.quality_summary?.quality_conformance ?? null
    const spi = kpis?.performance.spi ?? contractKpis?.performance.spi ?? null
    return { actual, planned, quality, spi }
  }, [contractKpis, kpis, fallbackAverage])
  const physicalActual = kpis?.physical.actual_percent ?? contractKpis?.physical.actual_percent ?? null
  const physicalPlanned = kpis?.physical.planned_percent ?? contractKpis?.physical.planned_percent ?? null

  const progressActual = mapStats.actual ?? null
  const progressPlanned = mapStats.planned ?? null
  const progressVariance = progressActual !== null && progressPlanned !== null ? progressActual - progressPlanned : null
  const progressRadialStyle = {
    '--progress-angle': `${Math.max(0, Math.min(100, progressActual ?? 0)) * 3.6}deg`,
    '--progress-color': progressVariance !== null && progressVariance >= 0 ? '#22c55e' : '#f97316',
  } as React.CSSProperties

  const designOutputItems = useMemo(
    () => [
      { label: 'CFD Modeling for Stage 3 River Diversion', status: 'In Progress' },
      { label: 'CFD Modeling of Power Outlet Area using FLOW-3D', status: 'In Progress' },
    ],
    [],
  )

  const preparatoryMilestones = useMemo(
    () => [
      { label: 'Milestone A', status: 'Completed' },
      { label: 'Milestone B', status: 'In Progress' },
      { label: 'Milestone C', status: 'In Progress' },
      { label: 'Milestone D', status: 'Completed' },
    ],
    [],
  )

  const constructionOutputs = useMemo(
    () => [
      {
        id: 'dam-pit',
        label: 'MW-1 Dam Pit Excavation',
        status: 'Delayed',
        type: 'vertical' as const,
        actualPercent: 62,
        plannedPercent: 78,
        totals: { actual: 48000, planned: 52000, total: 76000 },
      },
      {
        id: 'right-abutment',
        label: 'MW-1 Right Bank Abutment',
        status: 'In Progress',
        type: 'horizontal' as const,
        actualPercent: 68,
        plannedPercent: 74,
        totals: { actual: 34000, planned: 36000, total: 50000 },
      },
    ],
    [],
  )

  const qualityBreakdown = useMemo(() => {
    const ncrOpen = kpis?.quality_summary?.ncr_open ?? contractKpis?.quality_summary?.ncr_open ?? 0
    const ncrClosed = kpis?.quality_summary?.ncr_closed ?? contractKpis?.quality_summary?.ncr_closed ?? 0
    const qaorOpen = kpis?.quality_summary?.qaor_open ?? contractKpis?.quality_summary?.qaor_open ?? 0
    const qaorClosed = kpis?.quality_summary?.qaor_closed ?? contractKpis?.quality_summary?.qaor_closed ?? 0
    return {
      ncr: { open: ncrOpen, closed: ncrClosed, issued: ncrOpen + ncrClosed },
      qaor: { open: qaorOpen, closed: qaorClosed, issued: qaorOpen + qaorClosed },
    }
  }, [contractKpis, kpis])

  const spiInitiatives = useMemo(
    () => [
      {
        label: 'Main Facilities for RCC',
        status: 'In Progress',
        impact: '5%',
        stats: ['Formwork flights 11 & 12 pouring this week', 'Batch plant automation tuned for night pours'],
      },
      {
        label: 'Dam Pit Excavation',
        status: 'Delayed',
        impact: '4.8%',
        stats: ['North bench slip due to debris removal', 'Overbreak monitoring crew reassigned'],
      },
      {
        label: 'MW-2 Commencement',
        status: 'In Progress',
        impact: '10%',
        stats: ['Diversion canal commissioning with MW-01 logistics team'],
      },
      {
        label: 'HM-1 Commencement',
        status: 'In Progress',
        impact: '10%',
        stats: ['Turbine barrel segments staged', 'QA walk-through scheduled with OEM'],
      },
    ],
    [],
  )

  const sowIconCache = useRef<Record<string, DivIcon>>({})

  const createSowPin = useCallback(
    (marker: MapMarker, active: boolean) => {
      const percent = Math.round(marker.percent_complete)
      const accent = STATUS_ACCENTS[marker.status]
      const cacheKey = `${marker.id}-${percent}-${marker.status}-${active ? 'active' : 'idle'}`
      if (sowIconCache.current[cacheKey]) {
        return sowIconCache.current[cacheKey]
      }
      const icon = L.divIcon({
        className: `sow-pin ${active ? 'sow-pin--active' : ''}`,
        html: `
          <div class="sow-pin__halo" style="--sow-accent:${accent}"></div>
          <div class="sow-pin__core" style="--sow-accent:${accent}">
            <span class="sow-pin__value">${percent}%</span>
            <span class="sow-pin__label">${marker.name}</span>
          </div>
        `,
        iconSize: [140, 60],
        iconAnchor: [70, 32],
        popupAnchor: [0, -32],
      })
      sowIconCache.current[cacheKey] = icon
      return icon
    },
    [],
  )

  const handleMapResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    mapResizeSnapshot.current = { startY: event.clientY, startHeight: mapHeight }
    setIsResizingMap(true)
  }

  const selectedSowLabel = useMemo(() => {
    if (!selectedSowId) return null
    if (sowLabelLookup.has(selectedSowId)) {
      return sowLabelLookup.get(selectedSowId) ?? null
    }
    const marker = sowMarkers.find((item) => item.id === selectedSowId)
    return marker?.name ?? null
  }, [selectedSowId, sowLabelLookup, sowMarkers])

  const handleToggleSow = (id: string) => {
    setExpandedSows((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleSelectSow = (id: string) => {
    setSelectedSowId(id)
    if (id === 'sow-mw01-rcc') {
      setShowRccProcesses(true)
      setMapTab('process')
    } else {
      setShowRccProcesses(false)
      setMapTab('map')
    }
  }

  const toggleFacilityCard = (id: string) => {
    setFacilityExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleRccProcessSelect = (processId: string, markerId?: string) => {
    setSelectedSowId(markerId ?? processId)
    setMapTab('process')
  }

  const handleExitRccProcesses = () => {
    setShowRccProcesses(false)
    setSelectedSowId('sow-mw01-rcc')
    setMapTab('map')
  }

  const handleNavigateBack = () => {
    navigate('/', { state: { openView: 'contract', projectId, focusContractId: contractId } })
  }

  const breadcrumbs = useMemo(
    () => [
      { label: 'Dashboard', onClick: () => navigate('/') },
      { label: 'MW-01 – Main Dam', onClick: handleNavigateBack },
      { label: 'SOW View', isCurrent: true },
    ],
    [navigate],
  )

  const handleMarkerClick = (marker: MapMarker) => {
    setSelectedSowId(marker.id)
    if (marker.id === 'sow-mw01-rcc' || marker.name.toLowerCase().includes('rcc dam')) {
      setShowRccProcesses(true)
      setMapTab('process')
    } else if (marker.type === 'sow') {
      setShowRccProcesses(false)
      setMapTab('map')
    }
  }

  const handleUtilityNavigate = (viewId: 'schedule' | 'financial' | 'supply' | 'alerts') => {
    setActiveUtilityView(viewId)
    if (viewId === 'schedule') {
      navigate(`/contracts/${contractId}/schedule`, { state: { focusSowId: selectedSowId } })
      return
    }
    if (viewId === 'financial') {
      navigate(`/contracts/${contractId}/financial`)
      return
    }
    if (viewId === 'supply') {
      navigate('/atoms/scm', {
        state: {
          projectId,
          contractId,
          sowId: selectedSowId,
        },
      })
      return
    }
    navigate('/alarms', {
      state: {
        projectId,
        contractId,
      },
    })
  }

  const productivityItems = useMemo(() => {
    if (!kpis) return []
    const overrides: Record<string, string> = {
      Design: 'Design Work Output',
      Preparatory: 'Preparatory Work Output',
      Construction: 'Construction Work Output',
    }
    return kpis.work_output.items.map((item) => ({
      key: item.name,
      label: overrides[item.name] ?? item.name,
      actual: item.actual_percent ?? null,
      planned: item.planned_percent ?? null,
      variance: item.variance_percent ?? null,
    }))
  }, [kpis])

  const qualitySummary = kpis?.quality_summary ?? contractKpis?.quality_summary ?? null
  const spiValue = kpis?.performance.spi ?? contractKpis?.performance.spi ?? null
  const spiProgress = spiValue === null ? 0 : Math.max(0, Math.min(spiValue, 1.2)) / 1.2
  const spiColor = spiValue === null ? '#f97316' : spiValue >= 1 ? '#22c55e' : spiValue >= 0.9 ? '#f59e0b' : '#ef4444'
  const spiGaugeStyle = {
    '--spi-progress': `${(spiProgress * 360).toFixed(1)}deg`,
    '--spi-color': spiColor,
  } as React.CSSProperties

  return (
    <div className="app-shell view-contract" data-theme={theme}>
      <SidebarNav activeIndex={activeNavIndex} onSelect={setActiveNavIndex} theme={theme} onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))} />
      <div className="content-shell">
        <div className="contract-page sow-control-center" data-theme={theme}>
          <header className="contract-topbar">
          <Breadcrumbs items={breadcrumbs} />
          <div className="contract-top-actions">
            <TopBarGlobalActions theme={theme} onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))} scope={{ projectId, contractId }} />
          </div>
        </header>

        <div className="pp-layout sow-layout">
          <aside className="contract-list sow-list-panel">
            <div className="contract-filter">
              <span>{isRccVariant ? 'RCC Dam Scope' : 'Scope of Work'}</span>
            </div>
            <div className="contract-list-scroll">
              {isRccProcessView ? (
                <div className="rcc-panel">
                  <button type="button" className="rcc-backlink" onClick={handleExitRccProcesses}>
                    <span aria-hidden>←</span>
                    <span>All SOWs</span>
                  </button>
                  <section className="rcc-panel-section">
                    <button type="button" className="rcc-panel-heading" onClick={() => setRccProcessesOpen((prev) => !prev)}>
                      <div>
                        <strong>Processes</strong>
                        <span className="rcc-chip">{RCC_PROCESSES.length}</span>
                      </div>
                      <span className={`rcc-caret ${rccProcessesOpen ? 'open' : ''}`} aria-hidden />
                    </button>
                    {rccProcessesOpen && (
                      <ul className="rcc-process-list">
                        {RCC_PROCESSES.map((process) => {
                          const markerId = process.markerId ?? process.id
                          const isActive = selectedSowId === markerId
                          return (
                            <li key={process.id} className={isActive ? 'active' : ''}>
                              <button type="button" onClick={() => handleRccProcessSelect(process.id, markerId)}>
                                <div className="rcc-process-meta">
                                  <strong>{process.label}</strong>
                                  <span>{Math.round(process.percent)}%</span>
                                </div>
                                <div className="rcc-process-status">
                                  {process.badge ? <span className="rcc-chip">{process.badge}</span> : null}
                                  <span className={`rcc-status is-${statusModifier(process.status)}`}>{process.status}</span>
                                </div>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </section>
                  <section className="rcc-panel-section">
                    <button type="button" className="rcc-panel-heading" onClick={() => setRccFacilitiesOpen((prev) => !prev)}>
                      <div>
                        <strong>RCC Facilities</strong>
                        <span className="rcc-chip">{RCC_FACILITIES.length}</span>
                      </div>
                      <span className={`rcc-caret ${rccFacilitiesOpen ? 'open' : ''}`} aria-hidden />
                    </button>
                    {rccFacilitiesOpen && (
                      <div className="rcc-facility-list">
                        {RCC_FACILITIES.map((facility) => {
                          const expanded = facilityExpanded[facility.id]
                          return (
                            <article key={facility.id} className="rcc-facility-card">
                              <button type="button" className="rcc-facility-header" onClick={() => toggleFacilityCard(facility.id)}>
                                <div>
                                  <strong>{facility.label}</strong>
                                  <span className={`rcc-status is-${statusModifier(facility.status)}`}>{facility.status}</span>
                                </div>
                                <span className={`rcc-caret ${expanded ? 'open' : ''}`} aria-hidden />
                              </button>
                              {expanded && (
                                <ul>
                                  {facility.steps.map((step) => (
                                    <li key={step.id}>
                                      <span>{step.label}</span>
                                      <span className={`rcc-status is-${statusModifier(step.status)}`}>{step.status}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </article>
                          )
                        })}
                      </div>
                    )}
                  </section>
                </div>
              ) : (
                SOW_HIERARCHY.map((node) => {
                  const percent = sowMarkers.find((marker) => marker.id === node.id)?.percent_complete ?? null
                  const isActive = node.id === selectedSowId
                  const hasChildren = Boolean(node.children?.length)
                  const expanded = !!expandedSows[node.id]
                  return (
                    <div key={node.id} className={`sow-node ${isActive ? 'active' : ''}`}>
                      <button type="button" className="sow-node__header" onClick={() => handleSelectSow(node.id)}>
                        <div>
                          <strong>{node.label}</strong>
                          {percent !== null ? <span>{Math.round(percent)}%</span> : null}
                        </div>
                        {hasChildren ? (
                          <span
                            className="sow-node__toggle"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleToggleSow(node.id)
                            }}
                          >
                            {expanded ? '−' : '+'}
                          </span>
                        ) : null}
                      </button>
                      {hasChildren && expanded && (
                        <ul className="sow-node__children">
                          {node.children?.map((child) => (
                            <li key={child.id}>{child.label}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </aside>

          <section className="sow-center-column">
            <div className="sow-map-shell" style={{ height: mapHeight }}>
              <div className="map-wrapper">
                <div className="map-gradient" aria-hidden="true" />
                <div className="map-toolbar">
                  <div className="map-view-toggle">
                    {(Object.keys(SOW_MAP_STYLES) as SowMapView[]).map((viewKey) => (
                      <button key={viewKey} className={mapView === viewKey ? 'active' : ''} onClick={() => setMapView(viewKey)}>
                        {SOW_MAP_STYLES[viewKey].label}
                      </button>
                    ))}
                  </div>
                  <div className="map-toolbar-toggles">
                    <button
                      type="button"
                      className={`btn-ghost ${mapToggles.geofences ? 'active' : ''}`}
                      onClick={() => setMapToggles((prev) => ({ ...prev, geofences: !prev.geofences }))}
                    >
                      Geofence
                    </button>
                    <button
                      type="button"
                      className={`btn-ghost ${mapToggles.heat ? 'active' : ''}`}
                      onClick={() => setMapToggles((prev) => ({ ...prev, heat: !prev.heat }))}
                    >
                      Heat
                    </button>
                  </div>
                </div>

                {showProcessTabs && (
                  <div className="sow-map-tabs" role="tablist" aria-label="RCC Dam view mode">
                    <button
                      type="button"
                      className={mapTab === 'map' ? 'active' : ''}
                      onClick={() => {
                        setMapTab('map')
                        setShowRccProcesses(true)
                      }}
                    >
                      RCC Map
                    </button>
                    <button
                      type="button"
                      className={mapTab === 'process' ? 'active' : ''}
                      onClick={() => {
                        setShowRccProcesses(true)
                        setMapTab('process')
                      }}
                    >
                      Process
                    </button>
                  </div>
                )}

                <div className={`map-stats ${isRccProcessView ? 'map-stats--side' : ''} ${mapStatsCollapsed ? 'map-stats--collapsed' : ''}`}>
                  <button type="button" className="map-stats__collapse" onClick={() => setMapStatsCollapsed((prev) => !prev)}>
                    {mapStatsCollapsed ? 'Show KPIs' : 'Hide KPIs'}
                  </button>
                  {!mapStatsCollapsed && (
                    <>
                      <div className="map-stats-card">
                        <span className="label">Active Scope</span>
                        <strong>{highlightedMarker?.name ?? 'Select a SOW'}</strong>
                        <div className="map-stat-line subtle">
                          {highlightedMarker ? `${Math.round(highlightedMarker.percent_complete)}% complete` : 'Awaiting selection'}
                        </div>
                      </div>
                      <div className="map-stats-card">
                        <span className="label">Actual Progress</span>
                        <strong>{formatPercent(mapStats.actual)}</strong>
                        <div className="map-stat-line subtle">Planned {formatPercent(mapStats.planned)}</div>
                      </div>
                      <div className="map-stats-card">
                        <span className="label">Quality</span>
                        <strong>{formatPercent(mapStats.quality)}</strong>
                        <div className="map-stat-line subtle">SPI {mapStats.spi ? mapStats.spi.toFixed(2) : '--'}</div>
                      </div>
                    </>
                  )}
                </div>

                {showProcessTabs && mapTab === 'process' ? (
                  <div className="sow-process-panel" role="img" aria-label="RCC Dam process overview">
                    <img src={processImageSrc} alt="RCC Dam process overview" loading="lazy" decoding="async" />
                  </div>
                ) : error ? (
                  <div className="contract-loading">{error}</div>
                ) : loading ? (
                  <div className="contract-loading">Preparing SOW map…</div>
                ) : (
                  <MapContainer center={centerLatLng} zoom={15} className="contract-leaflet sow-map-canvas" scrollWheelZoom zoomControl={false}>
                    <TileLayer attribution={mapStyle.attribution} url={mapStyle.url} />
                    <ZoomControl position="topright" />
                    <ScaleControl position="bottomleft" />
                    {sowBounds ? (
                      <FitSowBounds bounds={sowBounds} focus={highlightedMarker ? ([highlightedMarker.lat, highlightedMarker.lon] as [number, number]) : undefined} />
                    ) : null}
                    <SowMapResizeWatcher trigger={`${mapHeight}-${mapView}-${sowMarkers.length}-${mapToggles.heat}-${mapToggles.geofences}`} />
                    {mapToggles.geofences && (
                      <Circle
                        center={centerLatLng}
                        radius={520}
                        pathOptions={{
                          color: 'rgba(255,255,255,0.55)',
                          dashArray: '10 6',
                          weight: 2,
                          opacity: 0.8,
                          fillOpacity: 0,
                        }}
                      />
                    )}
                    {mapToggles.heat &&
                      sowMarkers.map((marker) => (
                        <Circle
                          key={`${marker.id}-heat`}
                          center={[marker.lat, marker.lon]}
                          radius={450 - Math.max(30, marker.percent_complete * 2)}
                          pathOptions={{
                            color: hexToRgba(STATUS_ACCENTS[marker.status], 0.45),
                            fillColor: hexToRgba(STATUS_ACCENTS[marker.status], 0.15),
                            fillOpacity: 0.35,
                            weight: 1,
                          }}
                        />
                      ))}
                    {sowMarkers.map((marker) => (
                      <Marker
                        key={marker.id}
                        position={[marker.lat, marker.lon]}
                        icon={createSowPin(marker, marker.id === selectedSowId)}
                        eventHandlers={{ click: () => handleMarkerClick(marker) }}
                      >
                        <Tooltip direction="top" offset={[0, -20]} opacity={0.9}>
                          <div style={{ display: 'grid', gap: 4 }}>
                            <strong>{marker.name}</strong>
                            <span>{marker.percent_complete.toFixed(1)}% complete</span>
                          </div>
                        </Tooltip>
                      </Marker>
                    ))}
                  </MapContainer>
                )}
              </div>
            </div>
            <div
              className={`ccc-resize-bar ${isResizingMap ? 'dragging' : ''}`}
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize map height"
              onMouseDown={handleMapResizeStart}
            >
              <span />
            </div>
            <div className="sow-wip-card">
              <HierarchyWipBoard projectLabel="MW-01 – Main Dam" projectPercent={projectPercent} stages={stageSummary} contractItems={sowDialItems} />
            </div>
          </section>

          <aside className="sow-right-panel">
            {kpis ? (
              <>
                <section className="sow-card sow-card--progress">
                  <header className="sow-card__header">
                    <div>
                      <span className="sow-card__eyebrow">Physical works completed</span>
                      <h3>Progress vs Plan</h3>
                    </div>
                    <span className="sow-chip sow-chip--glow">{formatPercent(contractKpis?.physical.actual_percent)}</span>
                  </header>
                  <div className="sow-progress-content">
                    <div className="sow-progress-radial" style={progressRadialStyle}>
                      <div className="sow-progress-radial__inner">
                        <strong>{formatPercent(progressActual)}</strong>
                        <small>Actual</small>
                      </div>
                    </div>
                    <ul className="sow-progress-meta">
                      <li>
                        <span>Planned</span>
                        <strong>{formatPercent(progressPlanned)}</strong>
                      </li>
                      <li>
                        <span>Variance</span>
                        <strong className={progressVariance !== null && progressVariance >= 0 ? 'positive' : 'negative'}>
                          {progressVariance !== null ? `${progressVariance >= 0 ? '+' : ''}${progressVariance.toFixed(1)}%` : '--'}
                        </strong>
                      </li>
                      <li>
                        <span>SPI</span>
                        <strong>{mapStats.spi ? mapStats.spi.toFixed(2) : '--'}</strong>
                      </li>
                    </ul>
                  </div>
                  <div className="sow-stat-grid">
                    <div>
                      <span>Actual</span>
                      <strong>{formatPercent(progressActual)}</strong>
                    </div>
                    <div>
                      <span>Planned</span>
                      <strong>{formatPercent(progressPlanned)}</strong>
                    </div>
                  </div>
                </section>
                <section className="sow-card sow-card--productivity">
                  <header className="sow-card__header">
                    <div>
                      <span className="sow-card__eyebrow">Work output drilldown</span>
                      <h3>Project Productivity</h3>
                      {selectedSowLabel ? <span>{selectedSowLabel}</span> : null}
                    </div>
                    <span className="sow-chip">As of {new Date(kpis.as_of).toLocaleDateString()}</span>
                  </header>
                  {productivityItems.length ? (
                    <>
                      <div className="sow-physical-summary">
                        <div>
                          <span className="sow-physical-summary__label">Physical Works Completed</span>
                          <div className="sow-physical-summary__grid">
                            <div>
                              <span>Actual</span>
                              <strong>{formatPercent(physicalActual)}</strong>
                            </div>
                            <div>
                              <span>Planned</span>
                              <strong>{formatPercent(physicalPlanned)}</strong>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="sow-productivity-grid">
                        {productivityItems.map((item) => (
                          <div key={item.key} className="sow-productivity-item">
                            <div className="sow-productivity-item__header">
                              <span>{item.label}</span>
                              <strong>{formatPercent(item.actual)}</strong>
                            </div>
                            <div className="sow-productivity-bar" aria-hidden="true">
                              <div
                                className="sow-productivity-bar__planned"
                                style={{ width: `${Math.min(100, Math.max(0, item.planned ?? 0))}%` }}
                              />
                              <div
                                className="sow-productivity-bar__actual"
                                style={{ width: `${Math.min(100, Math.max(0, item.actual ?? 0))}%` }}
                              />
                            </div>
                            <div className="sow-productivity-meta">
                              <span>Planned {formatPercent(item.planned)}</span>
                              {typeof item.variance === 'number' ? (
                                <span className={item.variance >= 0 ? 'positive' : 'negative'}>
                                  {item.variance >= 0 ? '+' : ''}
                                  {item.variance.toFixed(1)}%
                                </span>
                              ) : (
                                <span>Δ --</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="sow-accordion-group">
                        <div className={`sow-accordion ${productivityAccordions.design ? 'open' : ''}`}>
                          <button type="button" className="sow-accordion__header" onClick={() => toggleProductivitySection('design')}>
                            <div>
                              <strong>Design Work Output</strong>
                              <span className={`sow-status-badge sow-status-badge--${statusModifier('In Progress')}`}>In Progress</span>
                            </div>
                            <span className="sow-accordion__chevron" aria-hidden />
                          </button>
                          {productivityAccordions.design && (
                            <div className="sow-accordion__content">
                              <ul className="sow-task-list">
                                {designOutputItems.map((task) => (
                                  <li key={task.label}>
                                    <div className="sow-task-header">
                                      <span>{task.label}</span>
                                      <span className={`sow-status-badge sow-status-badge--${statusModifier(task.status)}`}>{task.status}</span>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                        <div className={`sow-accordion ${productivityAccordions.preparatory ? 'open' : ''}`}>
                          <button type="button" className="sow-accordion__header" onClick={() => toggleProductivitySection('preparatory')}>
                            <div>
                              <strong>Preparatory Work Output</strong>
                              <span className={`sow-status-badge sow-status-badge--${statusModifier('In Progress')}`}>In Progress</span>
                            </div>
                            <span className="sow-accordion__chevron" aria-hidden />
                          </button>
                          {productivityAccordions.preparatory && (
                            <div className="sow-accordion__content">
                              <div className="sow-milestone-card">
                                <p>
                                  MW-1 RCC Facilities <span className={`sow-status-badge sow-status-badge--${statusModifier('In Progress')}`}>In Progress</span>
                                </p>
                                <ul className="sow-milestone-list">
                                  {preparatoryMilestones.map((milestone) => (
                                    <li key={milestone.label} className={`sow-milestone sow-milestone--${statusModifier(milestone.status)}`}>
                                      <span>{milestone.label}</span>
                                      <strong>{milestone.status}</strong>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className={`sow-accordion ${productivityAccordions.construction ? 'open' : ''}`}>
                          <button type="button" className="sow-accordion__header" onClick={() => toggleProductivitySection('construction')}>
                            <div>
                              <strong>Construction Work Output</strong>
                              <span className={`sow-status-badge sow-status-badge--${statusModifier('Active')}`}>Detailed view</span>
                            </div>
                            <span className="sow-accordion__chevron" aria-hidden />
                          </button>
                          {productivityAccordions.construction && (
                            <div className="sow-accordion__content sow-construction-grid">
                              {constructionOutputs.map((entry) =>
                                entry.type === 'vertical' ? (
                                  <div key={entry.id} className="sow-construction-card vertical">
                                    <div className="sow-construction-header">
                                      <span>{entry.label}</span>
                                      <span className={`sow-status-badge sow-status-badge--${statusModifier(entry.status)}`}>{entry.status}</span>
                                    </div>
                                    <div className="sow-progress-vertical">
                                      <div className="sow-progress-vertical__track">
                                        <div className="sow-progress-vertical__planned" style={{ height: `${Math.min(100, Math.max(0, entry.plannedPercent))}%` }} />
                                        <div className="sow-progress-vertical__actual" style={{ height: `${Math.min(100, Math.max(0, entry.actualPercent))}%` }} />
                                      </div>
                                      <ul className="sow-progress-vertical__stats">
                                        <li>
                                          <span>Actual</span>
                                          <strong>{formatNumber(entry.totals.actual)}</strong>
                                        </li>
                                        <li>
                                          <span>Planned</span>
                                          <strong>{formatNumber(entry.totals.planned)}</strong>
                                        </li>
                                        <li>
                                          <span>Total</span>
                                          <strong>{formatNumber(entry.totals.total)}</strong>
                                        </li>
                                      </ul>
                                    </div>
                                  </div>
                                ) : (
                                  <div key={entry.id} className="sow-construction-card horizontal">
                                    <div className="sow-construction-header">
                                      <span>{entry.label}</span>
                                      <span className={`sow-status-badge sow-status-badge--${statusModifier(entry.status)}`}>{entry.status}</span>
                                    </div>
                                    <div className="sow-construction-progress">
                                      <div className="sow-construction-progress__bar">
                                        <div className="planned" style={{ width: `${Math.min(100, Math.max(0, entry.plannedPercent))}%` }} />
                                        <div className="actual" style={{ width: `${Math.min(100, Math.max(0, entry.actualPercent))}%` }} />
                                      </div>
                                      <div className="sow-construction-progress__stats">
                                        <span>Actual {formatNumber(entry.totals.actual)}</span>
                                        <span>Planned {formatNumber(entry.totals.planned)}</span>
                                        <span>Total {formatNumber(entry.totals.total)}</span>
                                      </div>
                                    </div>
                                  </div>
                                ),
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="sow-card-empty">No productivity tracking available for this scope.</div>
                  )}
                </section>
                <section className="sow-card sow-card--quality">
                  <header className="sow-card__header">
                    <div>
                      <span className="sow-card__eyebrow">Quality controls</span>
                      <h3>Project Quality Performance</h3>
                    </div>
                    <span className="sow-chip sow-chip--muted">{formatPercent(qualitySummary?.quality_conformance)}</span>
                  </header>
                  <div className="sow-accordion-group">
                    {(['ncr', 'qaor'] as const).map((key) => (
                      <div key={key} className={`sow-accordion sow-accordion--quality ${qualityAccordions[key] ? 'open' : ''}`}>
                        <button type="button" className="sow-accordion__header" onClick={() => toggleQualitySection(key)}>
                          <div>
                            <strong>{key === 'ncr' ? 'NCR' : 'QAOR'}</strong>
                            <span className="sow-quality-count">{qualityBreakdown[key].open} open</span>
                          </div>
                          <span className="sow-accordion__chevron" aria-hidden />
                        </button>
                        {qualityAccordions[key] && (
                          <div className="sow-accordion__content">
                            <div className="sow-quality-breakdown">
                              <div>
                                <span>Closed</span>
                                <strong>{qualityBreakdown[key].closed}</strong>
                              </div>
                              <div>
                                <span>Open</span>
                                <strong>{qualityBreakdown[key].open}</strong>
                              </div>
                              <div>
                                <span>Issued</span>
                                <strong>{qualityBreakdown[key].issued}</strong>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="sow-quality-tile">
                      <span className="sow-quality-label">Quality Conformance</span>
                      <strong className="sow-quality-value">{formatPercent(qualitySummary?.quality_conformance)}</strong>
                      <span className="sow-quality-meta">Spec compliance</span>
                    </div>
                  </div>
                </section>
                <section className="sow-card sow-card--spi">
                  <header className="sow-card__header">
                    <div>
                      <span className="sow-card__eyebrow">Performance snapshot</span>
                      <h3>Schedule Performance Index</h3>
                    </div>
                    <span className="sow-chip sow-chip--glow">{spiValue !== null ? spiValue.toFixed(2) : '--'}</span>
                  </header>
                  <div className="sow-spi-content">
                    <div className="sow-spi-gauge" style={spiGaugeStyle}>
                      <div className="sow-spi-gauge__inner">
                        <strong>{spiValue !== null ? spiValue.toFixed(2) : '--'}</strong>
                        <small>Schedule</small>
                      </div>
                    </div>
                    <ul className="sow-spi-meta">
                      <li>
                        <span>Burn Rate</span>
                        <strong>{formatDays(kpis.performance.burn_rate_days)}</strong>
                      </li>
                      <li>
                        <span>Runway</span>
                        <strong>{formatDays(kpis.performance.runway_days)}</strong>
                      </li>
                      <li>
                        <span>Cash Flow</span>
                        <strong>{formatCompact(kpis.performance.cash_flow)}</strong>
                      </li>
                    </ul>
                  </div>
                  <div className={`sow-accordion sow-accordion--spi ${spiExpanded ? 'open' : ''}`}>
                    <button type="button" className="sow-accordion__header" onClick={() => setSpiExpanded((prev) => !prev)}>
                      <div>
                        <strong>Schedule Initiatives</strong>
                        <span className="sow-quality-meta">Impact by scope</span>
                      </div>
                      <span className="sow-accordion__chevron" aria-hidden />
                    </button>
                    {spiExpanded && (
                      <ul className="sow-spi-initiatives">
                        {spiInitiatives.map((initiative) => (
                          <li key={initiative.label}>
                            <div className="sow-spi-initiative__header">
                              <span>{initiative.label}</span>
                              <span className={`sow-status-badge sow-status-badge--${statusModifier(initiative.status)}`}>{initiative.status}</span>
                            </div>
                            <div className="sow-spi-initiative__meta">Impact {initiative.impact}</div>
                            <ul className="sow-spi-initiative__notes">
                              {initiative.stats.map((note) => (
                                <li key={note}>{note}</li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              </>
            ) : (
              <div className="contract-loading">Loading metrics…</div>
            )}
          </aside>
        </div>
        </div>
        <div className="contract-utility-floating sow-utility-dock" aria-label="Scope shortcuts">
          {utilityViews.map((view) => {
            const active = activeUtilityView === view.id
            return (
              <button
                key={view.id}
                type="button"
                className={`utility-dock-btn ${active ? 'active' : ''}`}
                onClick={() => handleUtilityNavigate(view.id)}
                aria-pressed={active}
                title={view.label}
                aria-label={view.label}
              >
                <span aria-hidden>{view.icon}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function FitSowBounds({ bounds, focus }: { bounds: L.LatLngBoundsExpression; focus?: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(bounds, { padding: [60, 60] })
    if (focus) {
      map.flyTo(focus, 16, { duration: 0.6 })
    }
  }, [map, bounds, focus])
  return null
}

function SowMapResizeWatcher({ trigger }: { trigger: unknown }) {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
  }, [map, trigger])
  return null
}
