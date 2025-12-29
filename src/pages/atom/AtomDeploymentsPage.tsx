import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import {
  fetchAtomDeploymentReport,
  fetchAtomSummary,
  fetchProgressHierarchy,
  fetchProgressSummaryV2,
  type AtomDeploymentGroupReport,
  type AtomSummaryCard,
  type AtomSummaryResponse,
  type ProgressSummaryResponse,
} from '../../api'
import { SidebarNav, sidebarItems, ACCS_NAV_INDEX, CHANGE_NAV_INDEX, HOME_NAV_INDEX, type ThemeMode } from '../../layout/navigation'
import TopBar from '../../layout/TopBar'
import TopBarGlobalActions from '../../layout/TopBarActions'
import { FEATURE_ATOM_MANAGER, FEATURE_PROGRESS_V2 } from '../../config'
import { applyTheme, resolveInitialTheme, toggleThemeValue } from '../../utils/theme'
import { useProgressSummary } from '../../hooks/useProgress'
import type { ProgressHierarchyResponse } from '../../api'

import DeploymentList from './components/DeploymentList'
import { getDeploymentFallback } from './data/atomDeploymentsFallback'
import NextActivitiesPanel from './components/NextActivitiesPanel'
import { formatNumber, formatDate } from './utils'
import AtomUtilityDock from './components/AtomUtilityDock'

const DEPLOYMENT_PAGE_SIZE = 30

const DEPLOYMENT_STATUS_OPTIONS: Array<{ id: 'active' | 'idle' | 'completed'; label: string }> = [
  { id: 'active', label: 'Active' },
  { id: 'idle', label: 'Idle' },
  { id: 'completed', label: 'Completed' },
]

type ProgressNextActivity = ProgressSummaryResponse['nextActivities'][number]

type LocationState = {
  role?: 'client' | 'contractor'
  projectName?: string | null
  projectId?: string | null
  contractId?: string | null
  sowId?: string | null
  processId?: string | null
} | null

type DeploymentDataset = {
  groups: AtomDeploymentGroupReport[]
  totals: Record<string, number>
  asOf: string | null
}

const createEmptyDataset = (): DeploymentDataset => ({
  groups: [],
  totals: { active: 0, idle: 0, completed: 0 },
  asOf: null,
})

const resolveDeploymentStatus = (group: AtomDeploymentGroupReport): 'active' | 'idle' | 'completed' => {
  const status = (group.deploymentStatus || group.journeyStatus || '').toLowerCase()
  if (status.startsWith('complete')) {
    return 'completed'
  }
  if (['warehouse', 'in_transit', 'on_site'].includes(status)) {
    return 'idle'
  }
  return status === 'engaged' ? 'active' : 'idle'
}

export default function AtomDeploymentsPage(): JSX.Element | null {
  const location = useLocation()
  const state = (location.state as LocationState) ?? null
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preservedStateRef = useRef<LocationState>(state)
  const scopeSignatureRef = useRef<string | null>(null)

  const initialProjectId = searchParams.get('projectId')
  const initialContractId = searchParams.get('contractId')
  const initialSowId = searchParams.get('sowId')
  const initialProcessId = searchParams.get('processId')
  const initialCategory = searchParams.get('category') ?? 'actors'

  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme())
  const [activeNavIndex, setActiveNavIndex] = useState(ACCS_NAV_INDEX)
  const [hierarchy, setHierarchy] = useState<ProgressHierarchyResponse | null>(null)
  const [loadingHierarchy, setLoadingHierarchy] = useState(false)
  const [hierarchyError, setHierarchyError] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialProjectId)
  const [selectedContractId, setSelectedContractId] = useState<string | null>(initialContractId)
  const [selectedSowId, setSelectedSowId] = useState<string | null>(initialSowId)
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(initialProcessId)
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory)
  const [categoryManuallySelected, setCategoryManuallySelected] = useState(false)
  const [deploymentStatusFilter, setDeploymentStatusFilter] = useState<'active' | 'idle' | 'completed'>('active')
  const [deploymentDatasets, setDeploymentDatasets] = useState<Record<'active' | 'idle' | 'completed', DeploymentDataset>>(() => ({
    active: createEmptyDataset(),
    idle: createEmptyDataset(),
    completed: createEmptyDataset(),
  }))
  const [deploymentTotals, setDeploymentTotals] = useState<{ active: number; idle: number; completed: number }>({
    active: 0,
    idle: 0,
    completed: 0,
  })
  const [deploymentPages, setDeploymentPages] = useState<{ active: number; idle: number; completed: number }>({
    active: 1,
    idle: 1,
    completed: 1,
  })
  const [loadingDeploymentReport, setLoadingDeploymentReport] = useState(false)
  const [deploymentReportError, setDeploymentReportError] = useState<string | null>(null)
  const [summary, setSummary] = useState<AtomSummaryResponse | null>(null)
  const activeSummaryCard = useMemo(
    () => summary?.cards.find((card) => card.category === selectedCategory) ?? null,
    [summary, selectedCategory],
  )

  const role = state?.role ?? 'client'

  const progressEnabled = FEATURE_ATOM_MANAGER && FEATURE_PROGRESS_V2 && Boolean(selectedProjectId)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (state !== null) {
      preservedStateRef.current = state
    }
  }, [state])

  const handleThemeToggle = useCallback(() => setTheme((prev) => toggleThemeValue(prev)), [])

  const handleNavSelect = (index: number) => {
    setActiveNavIndex(index)
    if (index === HOME_NAV_INDEX) {
      navigate('/')
      return
    }
    if (index === CHANGE_NAV_INDEX) {
      navigate('/change-management', {
        state: {
          projectId: preservedStateRef.current?.projectId ?? null,
          contractId: preservedStateRef.current?.contractId ?? null,
        },
      })
    }
  }

  useEffect(() => {
    setLoadingHierarchy(true)
    setHierarchyError(null)
    fetchProgressHierarchy()
      .then((data) => {
        setHierarchy(data)
      })
      .catch((err) => {
        console.error('Failed to load project hierarchy', err)
        setHierarchyError('Unable to load project hierarchy.')
      })
      .finally(() => setLoadingHierarchy(false))
  }, [])

  const projectOptions = hierarchy?.projects ?? []

  const selectedProject = useMemo(
    () => hierarchy?.projects.find((project) => project.code === selectedProjectId) ?? null,
    [hierarchy, selectedProjectId],
  )
  const selectedContract = useMemo(
    () => selectedProject?.contracts.find((contract) => contract.code === selectedContractId) ?? null,
    [selectedProject, selectedContractId],
  )
  const selectedSow = useMemo(
    () => selectedContract?.sows.find((sow) => sow.code === selectedSowId) ?? null,
    [selectedContract, selectedSowId],
  )
  const selectedProcess = useMemo(
    () => selectedSow?.processes.find((process) => process.code === selectedProcessId) ?? null,
    [selectedSow, selectedProcessId],
  )

  const dockScopeState = useMemo(
    () => ({
      projectId: selectedProjectId ?? null,
      projectName: selectedProject?.name ?? null,
      contractId: selectedContractId ?? null,
      contractName: selectedContract?.name ?? null,
      sowId: selectedSowId ?? null,
      sowName: selectedSow?.name ?? null,
      processId: selectedProcessId ?? null,
      processName: selectedProcess?.name ?? null,
    }),
    [selectedContract?.name, selectedContractId, selectedProcess?.name, selectedProcessId, selectedProject?.name, selectedProjectId, selectedSow?.name, selectedSowId],
  )

  useEffect(() => {
    if (!selectedProjectId && projectOptions.length > 0) {
      setSelectedProjectId(projectOptions[0].code)
    }
  }, [projectOptions, selectedProjectId])

  useEffect(() => {
    if (!selectedProject) {
      if (selectedContractId !== null) setSelectedContractId(null)
      if (selectedSowId !== null) setSelectedSowId(null)
      if (selectedProcessId !== null) setSelectedProcessId(null)
      return
    }
    if (selectedContractId && !selectedProject.contracts.some((contract) => contract.code === selectedContractId)) {
      setSelectedContractId(null)
      setSelectedSowId(null)
      setSelectedProcessId(null)
    }
  }, [selectedProject, selectedContractId, selectedSowId, selectedProcessId])

  useEffect(() => {
    if (!selectedContract) {
      if (selectedSowId !== null) setSelectedSowId(null)
      if (selectedProcessId !== null) setSelectedProcessId(null)
      return
    }
    if (selectedSowId && !selectedContract.sows.some((sow) => sow.code === selectedSowId)) {
      setSelectedSowId(null)
      setSelectedProcessId(null)
    }
  }, [selectedContract, selectedSowId, selectedProcessId])

  useEffect(() => {
    if (!selectedSow) {
      if (selectedProcessId !== null) setSelectedProcessId(null)
      return
    }
    if (selectedProcessId && !selectedSow.processes.some((process) => process.code === selectedProcessId)) {
      setSelectedProcessId(null)
    }
  }, [selectedSow, selectedProcessId])

  useEffect(() => {
    if (!selectedProjectId) {
      scopeSignatureRef.current = null
      return
    }
    const scopeSignature = JSON.stringify([
      selectedProjectId,
      selectedContractId,
      selectedSowId,
      selectedProcessId,
      selectedCategory,
    ])
    if (scopeSignatureRef.current !== scopeSignature) {
      scopeSignatureRef.current = scopeSignature
      setDeploymentPages({ active: 1, idle: 1, completed: 1 })
    }
    const params = new URLSearchParams({
      projectId: selectedProjectId,
      tenantId: 'default',
      category: selectedCategory,
    })
    if (selectedContractId) params.set('contractId', selectedContractId)
    if (selectedSowId) params.set('sowId', selectedSowId)
    if (selectedProcessId) params.set('processId', selectedProcessId)
    const nextSearch = params.toString()
    const currentSearch = location.search.startsWith('?') ? location.search.slice(1) : location.search
    if (currentSearch === nextSearch) {
      return
    }
    navigate(`/atoms/deployments?${nextSearch}`, {
      replace: true,
      state: preservedStateRef.current ?? undefined,
    })
  }, [selectedProjectId, selectedContractId, selectedSowId, selectedProcessId, selectedCategory, navigate, location.search])

  useEffect(() => {
    if (!selectedProjectId) return
    setCategoryManuallySelected(false)
    setSummary(null)
    fetchAtomSummary({
      projectId: selectedProjectId,
      contractId: selectedContractId ?? undefined,
      sowId: selectedSowId ?? undefined,
      processId: selectedProcessId ?? undefined,
    })
      .then((data) => setSummary(data))
      .catch((err) => {
        console.error('Failed to load atom summary', err)
      })
  }, [selectedProjectId, selectedContractId, selectedSowId, selectedProcessId])

  useEffect(() => {
    if (categoryManuallySelected || !summary || summary.cards.length === 0) return
    const availableCategories = summary.cards.map((card) => card.category)
    if (!availableCategories.includes(selectedCategory)) {
      const firstCategory = availableCategories[0]
      if (firstCategory) {
        setSelectedCategory(firstCategory)
      }
      return
    }
    const currentCard = summary.cards.find((card) => card.category === selectedCategory)
    if (currentCard && (currentCard.engaged > 0 || currentCard.idle > 0 || currentCard.total > 0)) {
      return
    }
    const fallbackCard = summary.cards.find((card) => card.engaged > 0 || card.idle > 0 || card.total > 0)
    if (fallbackCard && fallbackCard.category !== selectedCategory) {
      setSelectedCategory(fallbackCard.category)
    }
  }, [summary, selectedCategory, categoryManuallySelected])

  useEffect(() => {
    if (!selectedProjectId) {
      scopeSignatureRef.current = null
      setDeploymentDatasets({
        active: createEmptyDataset(),
        idle: createEmptyDataset(),
        completed: createEmptyDataset(),
      })
      setDeploymentTotals({ active: 0, idle: 0, completed: 0 })
      setDeploymentReportError(null)
      setLoadingDeploymentReport(false)
      return
    }

    let cancelled = false

    const fetchAllForStatus = async (statusKey: 'active' | 'idle') => {
      const aggregated: AtomDeploymentGroupReport[] = []
      let asOf: string | null = null
      let totals: Record<string, number> = { active: 0, idle: 0, completed: 0 }
      let page = 1
      const pageSize = 100

      while (!cancelled) {
        const response = await fetchAtomDeploymentReport({
          tenantId: 'default',
          projectId: selectedProjectId,
          contractId: selectedContractId ?? undefined,
          sowId: selectedSowId ?? undefined,
          processId: selectedProcessId ?? undefined,
          status: statusKey,
          page,
          size: pageSize,
          category: selectedCategory ?? undefined,
        })
        if (cancelled) {
          return null
        }
        if (!asOf) {
          asOf = response.asOf
        }
        totals = response.totals ?? totals
        const groups = response.groups ?? []
        aggregated.push(...groups)
        const pagination = response.pagination
        const totalGroups = pagination?.totalGroups ?? aggregated.length
        if (!pagination || aggregated.length >= totalGroups || groups.length === 0 || page >= 10) {
          break
        }
        page += 1
      }

      return { groups: aggregated, asOf, totals }
    }

    const load = async () => {
      setLoadingDeploymentReport(true)
      setDeploymentReportError(null)
      try {
        const [activePayload, idlePayload] = await Promise.all([fetchAllForStatus('active'), fetchAllForStatus('idle')])
        if (cancelled) return

        const activeData: DeploymentDataset =
          activePayload ?? { groups: [], asOf: null, totals: { active: 0, idle: 0, completed: 0 } }
        const idleData: DeploymentDataset =
          idlePayload ?? { groups: [], asOf: activeData.asOf, totals: activeData.totals }

        const fallbackTotalsInput =
          activeSummaryCard !== null
            ? {
                active: activeSummaryCard.engaged,
                idle: activeSummaryCard.idle,
                completed: Math.max(0, activeSummaryCard.total - activeSummaryCard.engaged - activeSummaryCard.idle),
              }
            : undefined

        const fallback =
          activeData.groups.length === 0 && idleData.groups.length === 0
            ? getDeploymentFallback(selectedCategory, fallbackTotalsInput)
            : null

        if (fallback) {
          setDeploymentDatasets({
            active: { groups: fallback.active, asOf: fallback.asOf, totals: fallback.totals },
            idle: { groups: fallback.idle, asOf: fallback.asOf, totals: fallback.totals },
            completed: { groups: fallback.completed, asOf: fallback.asOf, totals: fallback.totals },
          })
          setDeploymentTotals({
            active: fallback.totals.active,
            idle: fallback.totals.idle,
            completed: fallback.totals.completed,
          })
          return
        }

        const idleGroups = idleData.groups.filter((group) => resolveDeploymentStatus(group) !== 'completed')
        const completedGroups = idleData.groups.filter((group) => resolveDeploymentStatus(group) === 'completed')

        setDeploymentDatasets({
          active: { groups: activeData.groups, asOf: activeData.asOf, totals: activeData.totals },
          idle: { groups: idleGroups, asOf: idleData.asOf ?? activeData.asOf, totals: idleData.totals },
          completed: { groups: completedGroups, asOf: idleData.asOf ?? activeData.asOf, totals: idleData.totals },
        })
        setDeploymentTotals({
          active: idleData.totals?.active ?? activeData.totals?.active ?? activeData.groups.length,
          idle: idleData.totals?.idle ?? idleGroups.length,
          completed: idleData.totals?.completed ?? completedGroups.length,
        })
      } catch (err) {
        console.error('Failed to load deployment report', err)
        if (cancelled) return

        const message = err instanceof Error ? err.message : String(err)
        let detail = ''
        try {
          const parsed = JSON.parse(message)
          detail = typeof parsed.detail === 'string' ? parsed.detail : ''
        } catch {
          detail = ''
        }
        const combinedDetail = (detail || message).toLowerCase()
        const shouldFallback = combinedDetail.includes('not found') || combinedDetail.includes('unavailable') || combinedDetail.includes('failed to fetch')

        if (shouldFallback) {
          const fallbackTotalsInput =
            activeSummaryCard !== null
              ? {
                  active: activeSummaryCard.engaged,
                  idle: activeSummaryCard.idle,
                  completed: Math.max(0, activeSummaryCard.total - activeSummaryCard.engaged - activeSummaryCard.idle),
                }
              : undefined
          const fallback = getDeploymentFallback(selectedCategory, fallbackTotalsInput)
          if (fallback) {
            setDeploymentDatasets({
              active: { groups: fallback.active, asOf: fallback.asOf, totals: fallback.totals },
              idle: { groups: fallback.idle, asOf: fallback.asOf, totals: fallback.totals },
              completed: { groups: fallback.completed, asOf: fallback.asOf, totals: fallback.totals },
            })
            setDeploymentTotals({
              active: fallback.totals.active,
              idle: fallback.totals.idle,
              completed: fallback.totals.completed,
            })
            setDeploymentReportError(null)
            return
          }
        }

        setDeploymentReportError('Unable to load deployment report.')
      } finally {
        if (!cancelled) {
          setLoadingDeploymentReport(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [selectedProjectId, selectedContractId, selectedSowId, selectedProcessId, selectedCategory, activeSummaryCard])

  useEffect(() => {
    setDeploymentPages((prev) => {
      let changed = false
      const next = { ...prev }
      ;(['active', 'idle', 'completed'] as const).forEach((statusKey) => {
        const total = deploymentDatasets[statusKey].groups.length
        const maxPage = Math.max(1, Math.ceil(Math.max(total, 1) / DEPLOYMENT_PAGE_SIZE))
        if (prev[statusKey] > maxPage) {
          next[statusKey] = maxPage
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [deploymentDatasets])

  const {
    data: progressSummary,
    loading: progressLoading,
    refreshing: progressRefreshing,
    error: progressError,
  } = useProgressSummary(
    {
      projectId: selectedProjectId ?? '',
      contractId: selectedContractId,
      sowId: selectedSowId,
      processId: selectedProcessId,
      tenantId: 'default',
    },
    { enabled: progressEnabled },
  )

  const breadcrumbProjectLabel = selectedProject?.name?.replace(/\s+/g, '_') ?? state?.projectName ?? 'Projects'
  const breadcrumbs = useMemo(
    () => [
      { label: 'Dashboard', onClick: () => navigate('/', { state: { openView: 'dashboard' } }) },
      { label: breadcrumbProjectLabel, onClick: () => navigate('/', { state: { openView: 'contract', projectId: selectedProjectId } }) },
      {
        label: 'Atom Manager',
        onClick: () =>
          navigate('/atoms', {
            state: {
              projectId: selectedProjectId,
              contractId: selectedContractId,
              sowId: selectedSowId,
              processId: selectedProcessId,
              role,
              projectName: selectedProject?.name ?? state?.projectName ?? null,
            },
          }),
      },
      { label: 'Atom Deployments' },
    ],
    [breadcrumbProjectLabel, navigate, selectedContractId, selectedProcessId, selectedProjectId, selectedSowId, role],
  )

  const datasetForStatus = deploymentDatasets[deploymentStatusFilter]
  const currentPage = deploymentPages[deploymentStatusFilter] ?? 1
  const startIndex = (currentPage - 1) * DEPLOYMENT_PAGE_SIZE
  const currentGroups = datasetForStatus.groups.slice(startIndex, startIndex + DEPLOYMENT_PAGE_SIZE)
  const currentPagination = {
    page: currentPage,
    size: DEPLOYMENT_PAGE_SIZE,
    totalGroups: datasetForStatus.groups.length,
  }
  const deploymentReportAsOf = datasetForStatus.asOf

  const nextActivities: ProgressNextActivity[] = progressSummary?.nextActivities ?? []

  const handleDeploymentPageChange = (status: 'active' | 'idle' | 'completed', page: number) => {
    setDeploymentPages((prev) => ({ ...prev, [status]: page }))
  }

  const handleCategoryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCategory(event.target.value)
    setCategoryManuallySelected(true)
    setDeploymentPages({ active: 1, idle: 1, completed: 1 })
  }

  if (!selectedProjectId) {
    return (
      <div className="atom-manager" data-theme={theme}>
        <SidebarNav activeIndex={activeNavIndex} onSelect={handleNavSelect} theme={theme} onToggleTheme={handleThemeToggle} />
        <div className="app-shell topbar-layout">
          <TopBar breadcrumbs={breadcrumbs} actions={null} />
          <div className="atom-main atom-main--expanded" style={{ padding: 32 }}>
            <div className="atom-error">Select a project scope from Atom Manager before viewing deployments.</div>
          </div>
        </div>
        <AtomUtilityDock activeView="manager" scopeState={dockScopeState} />
      </div>
    )
  }

  const topBarActions = (
    <TopBarGlobalActions
      theme={theme}
      onToggleTheme={handleThemeToggle}
      scope={{
        projectId: selectedProjectId,
        projectName: selectedProject?.name ?? state?.projectName ?? null,
        contractId: selectedContractId,
        contractName: selectedContract?.name ?? null,
        sowId: selectedSowId,
        sowName: selectedSow?.name ?? null,
        processId: selectedProcessId,
        processName: selectedProcess?.name ?? null,
      }}
    />
  )

  const scopeLabel =
    selectedProcess?.name ??
    selectedSow?.name ??
    selectedContract?.name ??
    selectedProject?.name ??
    state?.projectName ??
    'Selected scope'

  const headerSummary = activeSummaryCard ?? null

  return (
    <div className="atom-manager" data-theme={theme}>
      <SidebarNav activeIndex={activeNavIndex} onSelect={handleNavSelect} theme={theme} onToggleTheme={handleThemeToggle} />
      <div className="app-shell topbar-layout">
        <TopBar breadcrumbs={breadcrumbs} actions={topBarActions} />
        <div className="atom-stage atom-stage--single atom-stage--docked deployments-layout">
          <aside className="atom-left">
            <header className="atom-left__header">
              <h2>{scopeLabel}</h2>
              <p>Atom deployments overview</p>
            </header>
            <div className="atom-nav__scroll">
              <div className="atom-scope-bar atom-scope-bar--vertical">
                <label>
                  <span>Project</span>
                  <select
                    value={selectedProjectId ?? ''}
                    onChange={(event) => setSelectedProjectId(event.target.value || null)}
                    disabled={loadingHierarchy || projectOptions.length === 0}
                  >
                    <option value="" disabled={projectOptions.length > 0}>
                      {projectOptions.length === 0 ? 'No projects available' : 'Select project'}
                    </option>
                    {projectOptions.map((project) => (
                      <option key={project.code} value={project.code}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Contract</span>
                  <select
                    value={selectedContractId ?? ''}
                    onChange={(event) => setSelectedContractId(event.target.value || null)}
                    disabled={!selectedProject || selectedProject.contracts.length === 0}
                  >
                    <option value="">All contracts</option>
                    {selectedProject?.contracts.map((contract) => (
                      <option key={contract.code} value={contract.code}>
                        {contract.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>SOW</span>
                  <select
                    value={selectedSowId ?? ''}
                    onChange={(event) => setSelectedSowId(event.target.value || null)}
                    disabled={!selectedContract || selectedContract.sows.length === 0}
                  >
                    <option value="">All SOWs</option>
                    {selectedContract?.sows.map((sow) => (
                      <option key={sow.code} value={sow.code}>
                        {sow.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Process</span>
                  <select
                    value={selectedProcessId ?? ''}
                    onChange={(event) => setSelectedProcessId(event.target.value || null)}
                    disabled={!selectedSow || selectedSow.processes.length === 0}
                  >
                    <option value="">All processes</option>
                    {selectedSow?.processes.map((process) => (
                      <option key={process.code} value={process.code}>
                        {process.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Category</span>
                  <select value={selectedCategory} onChange={handleCategoryChange}>
                    {summary?.cards.map((card) => (
                      <option key={card.category} value={card.category}>
                        {card.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {hierarchyError ? <div className="atom-error atom-error--inline">{hierarchyError}</div> : null}
            </div>
          </aside>

          <main className="atom-main atom-main--expanded">
            <header className="atom-right__header deployments-header">
              <div>
                <h3>Atom deployments</h3>
                <span>{scopeLabel}</span>
                {deploymentReportAsOf && <small className="atom-right__asof">As of {formatDate(deploymentReportAsOf)}</small>}
              </div>
              <div className="atom-right__summary" role="group" aria-label="Deployment totals">
                <div>
                  <span>Engaged</span>
                  <strong>{formatNumber(headerSummary?.engaged ?? deploymentTotals.active)}</strong>
                </div>
                <div>
                  <span>Idle</span>
                  <strong>{formatNumber(headerSummary?.idle ?? deploymentTotals.idle)}</strong>
                </div>
                <div>
                  <span>Available</span>
                  <strong>
                    {formatNumber(
                      headerSummary ? Math.max(0, headerSummary.total - headerSummary.engaged - headerSummary.idle) : 0,
                    )}
                  </strong>
                </div>
              </div>
              <div className="atom-status-tabs" role="tablist" aria-label="Deployment status filter">
                {DEPLOYMENT_STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="tab"
                    aria-selected={deploymentStatusFilter === option.id}
                    className={`atom-status-tab ${deploymentStatusFilter === option.id ? 'active' : ''}`}
                    onClick={() => setDeploymentStatusFilter(option.id)}
                  >
                    {option.label}
                    <span>
                      {formatNumber(
                        option.id === 'active'
                          ? deploymentTotals.active
                          : option.id === 'idle'
                          ? deploymentTotals.idle
                          : deploymentTotals.completed,
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </header>

            {loadingDeploymentReport ? (
              <div className="atom-loading">Loading deployments…</div>
            ) : deploymentReportError ? (
              <div className="atom-error">{deploymentReportError}</div>
            ) : (
              <DeploymentList
                groups={currentGroups}
                status={deploymentStatusFilter}
                pagination={currentPagination}
                onPageChange={(page) => handleDeploymentPageChange(deploymentStatusFilter, page)}
              />
            )}

            {progressEnabled && (
              <NextActivitiesPanel
                activities={nextActivities}
                loading={progressLoading || progressRefreshing}
                error={progressError}
                asOf={progressSummary?.asOf}
              />
            )}
          </main>
        </div>
      </div>
      <AtomUtilityDock activeView="manager" scopeState={dockScopeState} />
    </div>
  )
}
