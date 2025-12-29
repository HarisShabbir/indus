import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { SidebarNav, HOME_NAV_INDEX, ACCS_NAV_INDEX, CHANGE_NAV_INDEX, type ThemeMode } from '../../layout/navigation'
import TopBar from '../../layout/TopBar'
import TopBarGlobalActions from '../../layout/TopBarActions'
import { applyTheme, resolveInitialTheme, toggleThemeValue } from '../../utils/theme'
import { ensureScheduleTheme } from '../../theme/echartsTheme'
import { FEATURE_SCM_VISUAL } from '../../config'
import {
  fetchScmDashboard,
  fetchScmProcessCanvas,
  fetchScmProcessStages,
  fetchProgressHierarchy,
  fetchAlerts,
  fetchChangeRequests,
  engageScmProcurementTeam,
  updateScmStageTransition,
  type ProgressHierarchyContract,
  type ProgressHierarchyProcess,
  type ProgressHierarchyProject,
  type ProgressHierarchyResponse,
  type ProgressHierarchySow,
  type ScmCanvasCard,
  type ScmCanvasLane,
  type ScmInventoryCard,
  type ScmDashboardResponse,
  type ScmInsight,
  type ScmInsightAction,
  type ScmProcessMetrics,
  type ScmProcessCanvasResponse,
  type ScmProcessStageResponse,
  type ScmStageNode,
  type Alert,
  type ChangeRequest,
} from '../../api'
import {
  annotateCard,
  ensureMetadata,
  buildInsight,
  buildReadinessInsights,
  METRIC_INSIGHT_MAP,
  mergeProcessCanvases,
  normalizeMetricKey,
  ReadinessCard,
  RISK_CLASS,
  ScmInsightModal,
  ScmInsightRail,
  type InsightModalState,
} from '../../components/scm/ScmInsightToolkit'
import ScmFlowOverview from '../../components/scm/ScmFlowOverview'
import { formatCurrency, formatNumber, formatShortDate } from './utils'
import AtomUtilityDock from './components/AtomUtilityDock'
import ScmProcessFlow from './components/ScmProcessFlow'

type ScopeState = {
  tenantId?: string | null
  projectId?: string | null
  projectName?: string | null
  contractId?: string | null
  contractName?: string | null
  sowId?: string | null
  sowName?: string | null
  processId?: string | null
  processName?: string | null
  source?: 'ccc' | 'atom'
} | null

const CANVAS_FILTERS = [
  { id: 'all', label: 'All cards' },
  { id: 'planned', label: 'Planned' },
  { id: 'progress', label: 'In flight' },
  { id: 'complete', label: 'Completed' },
]



function filterCardByStage(card: ScmCanvasCard, filter: string): boolean {
  if (filter === 'all') return true
  const status = (card.status ?? '').toLowerCase()
  if (filter === 'planned') return ['planned', 'draft', 'requested'].includes(status)
  if (filter === 'progress') return ['committed', 'in_flight', 'expediting', 'open', 'pending'].includes(status)
  if (filter === 'complete') return ['closed', 'received', 'delivered', 'fulfilled', 'consumed'].includes(status)
  return true
}

function matchesSearch(card: ScmCanvasCard, query: string): boolean {
  if (!query) return true
  const haystack = [
    card.title,
    card.subtitle,
    card.status,
    ...(card.tags ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query.toLowerCase())
}

export default function AtomScmPage(): JSX.Element | null {
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state as ScopeState) ?? null

  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme())
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    ensureScheduleTheme()
  }, [])

  const [activeNavIndex, setActiveNavIndex] = useState(ACCS_NAV_INDEX)
  const handleNavSelect = (index: number) => {
    setActiveNavIndex(index)
    if (index === HOME_NAV_INDEX) {
      navigate('/')
      return
    }
    if (index === CHANGE_NAV_INDEX) {
      navigate('/change-management', {
        state: {
          projectId,
          contractId,
          sowId,
          processId,
        },
      })
    }
  }

  const tenantId = state?.tenantId ?? 'default'
  const projectId = state?.projectId ?? null
  const contractId = state?.contractId ?? null
  const sowId = state?.sowId ?? null
  const processId = state?.processId ?? null
  const source = (state as Record<string, unknown> | null)?.source === 'ccc' ? 'ccc' : 'atom'
  const shouldRenderContractSummary = !processId && source === 'ccc'
  const shouldRequireProcess = !processId && source !== 'ccc'
  const isAtomSource = source === 'atom'

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => toggleThemeValue(prev))
  }, [])

  const handleOpenInAtomManager = useCallback(() => {
    navigate('/atoms', {
      state: {
        tenantId,
        projectId,
        projectName: state?.projectName ?? null,
        contractId,
        contractName: state?.contractName ?? null,
        sowId,
        sowName: state?.sowName ?? null,
        processId,
        processName: state?.processName ?? null,
      },
    })
  }, [contractId, navigate, processId, projectId, sowId, state?.contractName, state?.processName, state?.projectName, state?.sowName, tenantId])

  const [canvas, setCanvas] = useState<ScmProcessCanvasResponse | null>(null)
  const [dashboard, setDashboard] = useState<ScmDashboardResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canvasFilter, setCanvasFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [scopeNotice, setScopeNotice] = useState<string | null>(null)
  const [aggregateCanvas, setAggregateCanvas] = useState<ScmProcessCanvasResponse | null>(null)
  const [insightModal, setInsightModal] = useState<InsightModalState | null>(null)
  const [viewMode, setViewMode] = useState<'timeline' | 'canvas'>('timeline')
  const [actionFeedback, setActionFeedback] = useState<{ message: string; tone: 'success' | 'error'; alertId?: string | null } | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [flowHighlight, setFlowHighlight] = useState<'demand' | 'procurement' | 'logistics' | 'inventory' | null>('demand')
  const [stageSummary, setStageSummary] = useState<ScmProcessStageResponse | null>(null)
  const [stageLoading, setStageLoading] = useState(false)
  const [stageError, setStageError] = useState<string | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([])
  const hierarchyCacheRef = useRef<ProgressHierarchyResponse | null>(null)
  const [scopeHierarchy, setScopeHierarchy] = useState<ProgressHierarchyResponse | null>(null)
  const [scopeHierarchyLoading, setScopeHierarchyLoading] = useState(false)
  const [scopeHierarchyError, setScopeHierarchyError] = useState<string | null>(null)

  const currentScopeState = useMemo(
    () => ({
      tenantId,
      projectId,
      projectName: state?.projectName ?? null,
      contractId,
      contractName: state?.contractName ?? null,
      sowId,
      sowName: state?.sowName ?? null,
      processId,
      processName: state?.processName ?? null,
      source,
    }),
    [tenantId, projectId, contractId, sowId, processId, source, state?.projectName, state?.contractName, state?.sowName, state?.processName],
  )

  const selectedProjectNode = useMemo(() => {
    if (!projectId || !scopeHierarchy) return null
    return scopeHierarchy.projects.find((project) => project.code === projectId) ?? null
  }, [projectId, scopeHierarchy])

  const selectedContractNode = useMemo(() => {
    if (!contractId || !selectedProjectNode) return null
    return selectedProjectNode.contracts.find((contract) => contract.code === contractId) ?? null
  }, [contractId, selectedProjectNode])

  const selectedSowNode = useMemo(() => {
    if (!sowId || !selectedContractNode) return null
    return (selectedContractNode.sows ?? []).find((sow) => sow.code === sowId) ?? null
  }, [sowId, selectedContractNode])

  const selectedProcessNode = useMemo(() => {
    if (!processId || !selectedSowNode) return null
    return (selectedSowNode.processes ?? []).find((process) => process.code === processId) ?? null
  }, [processId, selectedSowNode])

  const projectOptions = useMemo(() => scopeHierarchy?.projects ?? [], [scopeHierarchy])
  const contractOptions = useMemo(() => selectedProjectNode?.contracts ?? [], [selectedProjectNode])
  const sowOptions = useMemo(() => selectedContractNode?.sows ?? [], [selectedContractNode])
  const processOptions = useMemo(() => selectedSowNode?.processes ?? [], [selectedSowNode])

  const handleProjectSelect = useCallback(
    (projectCode: string | null) => {
      if (!isAtomSource) return
      const nextProject = projectCode ? projectOptions.find((project) => project.code === projectCode) ?? null : null
      const nextProjectId = nextProject?.code ?? null
      if ((projectId ?? null) === nextProjectId) return
      navigate('/atoms/scm', {
        replace: true,
        state: {
          tenantId,
          projectId: nextProjectId,
          projectName: nextProject?.name ?? null,
          contractId: null,
          contractName: null,
          sowId: null,
          sowName: null,
          processId: null,
          processName: null,
          source: 'atom',
        },
      })
    },
    [isAtomSource, navigate, projectId, projectOptions, tenantId],
  )

  const handleContractSelect = useCallback(
    (contractCode: string | null) => {
      if (!isAtomSource) return
      const projectNode = selectedProjectNode
      if (!projectNode) return
      const nextContract = contractCode ? projectNode.contracts.find((contract) => contract.code === contractCode) ?? null : null
      const nextContractId = nextContract?.code ?? null
      if ((contractId ?? null) === nextContractId) return
      navigate('/atoms/scm', {
        replace: true,
        state: {
          tenantId,
          projectId: projectNode.code,
          projectName: projectNode.name ?? null,
          contractId: nextContractId,
          contractName: nextContract?.name ?? null,
          sowId: null,
          sowName: null,
          processId: null,
          processName: null,
          source: 'atom',
        },
      })
    },
    [contractId, isAtomSource, navigate, selectedProjectNode, tenantId],
  )

  const handleSowSelect = useCallback(
    (sowCode: string | null) => {
      if (!isAtomSource) return
      const projectNode = selectedProjectNode
      const contractNode = selectedContractNode
      if (!projectNode || !contractNode) return
      const nextSow = sowCode ? (contractNode.sows ?? []).find((sow) => sow.code === sowCode) ?? null : null
      const nextSowId = nextSow?.code ?? null
      if ((sowId ?? null) === nextSowId) return
      navigate('/atoms/scm', {
        replace: true,
        state: {
          tenantId,
          projectId: projectNode.code,
          projectName: projectNode.name ?? null,
          contractId: contractNode.code,
          contractName: contractNode.name ?? null,
          sowId: nextSowId,
          sowName: nextSow?.name ?? null,
          processId: null,
          processName: null,
          source: 'atom',
        },
      })
    },
    [isAtomSource, navigate, selectedContractNode, selectedProjectNode, sowId, tenantId],
  )

  const handleProcessSelect = useCallback(
    (processCode: string | null) => {
      if (!isAtomSource) return
      const projectNode = selectedProjectNode
      const contractNode = selectedContractNode
      const sowNode = selectedSowNode
      if (!projectNode || !contractNode || !sowNode) return
      const nextProcess = processCode ? (sowNode.processes ?? []).find((process) => process.code === processCode) ?? null : null
      const nextProcessId = nextProcess?.code ?? null
      if ((processId ?? null) === nextProcessId) return
      navigate('/atoms/scm', {
        replace: true,
        state: {
          tenantId,
          projectId: projectNode.code,
          projectName: projectNode.name ?? null,
          contractId: contractNode.code,
          contractName: contractNode.name ?? null,
          sowId: sowNode.code,
          sowName: sowNode.name ?? null,
          processId: nextProcessId,
          processName: nextProcess?.name ?? null,
          source: 'atom',
        },
      })
    },
    [isAtomSource, navigate, processId, selectedContractNode, selectedProjectNode, selectedSowNode, tenantId],
  )

  useEffect(() => {
    let cancelled = false
    setScopeHierarchyLoading(true)
    setScopeHierarchyError(null)
    fetchProgressHierarchy(tenantId)
      .then((hierarchy) => {
        if (cancelled) return
        hierarchyCacheRef.current = hierarchy
        setScopeHierarchy(hierarchy)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Failed to load hierarchy for SCM scope picker', err)
        setScopeHierarchyError('Unable to load scope hierarchy. Try refreshing.')
      })
      .finally(() => {
        if (cancelled) return
        setScopeHierarchyLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tenantId])

  const fetchContractAggregate = useCallback(
    async (signal: AbortSignal): Promise<ScmProcessCanvasResponse | null> => {
      if (!projectId || !contractId) return null
      let hierarchy = hierarchyCacheRef.current ?? scopeHierarchy
      if (!hierarchy) {
        hierarchy = await fetchProgressHierarchy(tenantId)
        if (signal.aborted) return null
        hierarchyCacheRef.current = hierarchy
        setScopeHierarchy(hierarchy)
      }
      const projectNode = hierarchy.projects.find((project) => project.code === projectId)
      if (!projectNode) return null
      const contractNode = projectNode.contracts.find((contract) => contract.code === contractId)
      if (!contractNode) return null

      const processNodes = contractNode.sows.flatMap((sow) =>
        (sow.processes ?? []).map((proc) => ({
          processCode: proc.code,
          processName: proc.name,
          sowCode: sow.code,
        })),
      )

      if (!processNodes.length) return null

      const canvases: ScmProcessCanvasResponse[] = []
      for (const node of processNodes) {
        if (signal.aborted) break
        try {
          const canvasResponse = await fetchScmProcessCanvas(
            {
              tenantId,
              projectId: projectId ?? undefined,
              contractId,
              sowId: node.sowCode,
              processId: node.processCode,
            },
            signal,
          )
          canvases.push(canvasResponse)
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            return null
          }
          console.warn('Unable to fetch SCM process canvas for contract summary', err)
        }
      }

      return mergeProcessCanvases(canvases, {
        code: contractNode.code,
        name: contractNode.name,
      })
    },
    [contractId, projectId, tenantId, scopeHierarchy],
  )

  const loadData = useCallback(() => {
    if (!projectId) {
      setCanvas(null)
      setDashboard(null)
      setError('Select a project before opening SCM.')
      setScopeNotice(null)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    if (shouldRequireProcess) {
      setCanvas(null)
      setAggregateCanvas(null)
      setDashboard(null)
      setScopeNotice(null)
      setLoading(false)
      return () => controller.abort()
    }

    if (shouldRenderContractSummary) {
      Promise.all([
        fetchScmDashboard(
          {
            scopeLevel: 'contract',
            tenantId,
            projectId,
            contractId,
            sowId,
          },
          controller.signal,
        ),
        fetchContractAggregate(controller.signal),
      ])
        .then(([dashboardPayload, aggregate]) => {
          setDashboard(dashboardPayload)
          setAggregateCanvas(aggregate)
          if (!aggregate) {
            setScopeNotice('No process-level SCM data found for this contract. Add processes to view readiness details.')
          } else {
            setScopeNotice('Contract-level summary · select a process for deeper readiness insights.')
          }
        })
        .catch((err) => {
          if ((err as Error).name === 'AbortError') return
          console.error('Failed to load contract SCM summary', err)
          setError('Unable to load SCM data. Please try again.')
          setAggregateCanvas(null)
          setScopeNotice(null)
        })
        .finally(() => {
          setLoading(false)
        })

      return () => controller.abort()
    }

    setScopeNotice(null)
    setAggregateCanvas(null)

    Promise.all([
      fetchScmProcessCanvas(
        {
          tenantId,
          projectId,
          contractId,
          sowId,
          processId,
        },
        controller.signal,
      ),
      fetchScmDashboard(
        {
          scopeLevel: 'process',
          tenantId,
          projectId,
          contractId,
          sowId,
          processId,
        },
        controller.signal,
      ),
    ])
      .then(([canvasPayload, dashboardPayload]) => {
        setCanvas(canvasPayload)
        setDashboard(dashboardPayload)
      })
      .catch(async (err) => {
        if (err.name === 'AbortError') return
        const message = typeof err.message === 'string' ? err.message : ''
        const processMissing = message.includes('Process not found')
        if (processMissing && contractId) {
          console.warn('Process-level SCM data unavailable; falling back to contract scope')
          try {
            const [fallbackDashboard, fallbackAggregate] = await Promise.all([
              fetchScmDashboard(
                {
                  scopeLevel: 'contract',
                  tenantId,
                  projectId,
                  contractId,
                  sowId,
                },
                controller.signal,
              ),
              fetchContractAggregate(controller.signal),
            ])
            setCanvas(fallbackAggregate)
            setAggregateCanvas(fallbackAggregate)
            setDashboard(fallbackDashboard)
            setScopeNotice('Process-level SCM data not available. Showing contract rollup.')
            setError(null)
            return
          } catch (fallbackErr) {
            if (fallbackErr.name === 'AbortError') return
            console.error('SCM contract fallback failed', fallbackErr)
          }
        }
        console.error('Failed to load SCM data', err)
        setError('Unable to load SCM data. Please try again.')
        setCanvas(null)
        setDashboard(null)
        setScopeNotice(null)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [contractId, fetchContractAggregate, processId, projectId, shouldRenderContractSummary, shouldRequireProcess, sowId, tenantId])

  useEffect(() => {
    const abort = loadData()
    return () => {
      if (typeof abort === 'function') abort()
    }
  }, [loadData])

  const loadStageSummary = useCallback(() => {
    if (!projectId || !processId) {
      setStageSummary(null)
      setStageError(null)
      return
    }
    setStageLoading(true)
    setStageError(null)
    fetchScmProcessStages(
      {
        tenantId,
        projectId,
        contractId: contractId ?? undefined,
        sowId: sowId ?? undefined,
        processId,
      },
    )
      .then((payload) => {
        setStageSummary(payload)
      })
      .catch((error) => {
        console.error('Failed to load SCM stage summary', error)
        setStageError('Unable to load stage summary.')
        setStageSummary(null)
      })
      .finally(() => setStageLoading(false))
  }, [contractId, processId, projectId, sowId, tenantId])

  useEffect(() => {
    loadStageSummary()
  }, [loadStageSummary])

  const handleStageTransition = useCallback(
    async (resourceId: string, stage: string) => {
      if (!projectId || !processId) return
      try {
        await updateScmStageTransition({
          tenantId,
          projectId,
          contractId: contractId ?? undefined,
          sowId: sowId ?? undefined,
          processId,
          resourceId,
          stage,
        })
        loadStageSummary()
      } catch (error) {
        console.error('Failed to update stage transition', error)
        setActionFeedback({ message: 'Unable to update stage. Try again shortly.', tone: 'error' })
      }
    },
    [contractId, loadStageSummary, processId, projectId, sowId, tenantId],
  )

  useEffect(() => {
    if (!projectId) {
      setAlerts([])
      setChangeRequests([])
      return
    }
    fetchAlerts(projectId)
      .then((data) => setAlerts(data ?? []))
      .catch((error) => {
        console.error('Failed to load alerts for SCM context', error)
        setAlerts([])
      })
    fetchChangeRequests({
      tenantId: tenantId ?? undefined,
      projectId,
      contractId: contractId ?? undefined,
      sowId: sowId ?? undefined,
      processId: processId ?? undefined,
    })
      .then((results) => setChangeRequests(results ?? []))
      .catch((error) => {
        console.error('Failed to load change requests for SCM context', error)
        setChangeRequests([])
      })
  }, [contractId, processId, projectId, sowId, tenantId])


  const activeCanvas = processId ? canvas : aggregateCanvas
  const filteredProcurementLanes = useMemo(() => {
    if (!activeCanvas) return []
    return activeCanvas.procurement.map((lane) => ({
      ...lane,
      cards: lane.cards.filter((card) => filterCardByStage(card, canvasFilter) && matchesSearch(card, searchTerm)),
    }))
  }, [activeCanvas, canvasFilter, searchTerm])

  const filteredLogistics = useMemo(() => {
    if (!activeCanvas) return []
    return activeCanvas.logistics.filter((card) => filterCardByStage(card, canvasFilter) && matchesSearch(card, searchTerm))
  }, [activeCanvas, canvasFilter, searchTerm])

  const visibleRequirements = useMemo(() => {
    if (!activeCanvas) return []
    return activeCanvas.requirements.filter((card) => filterCardByStage(card, canvasFilter) && matchesSearch(card, searchTerm))
  }, [activeCanvas, canvasFilter, searchTerm])

  const visibleInputs = useMemo(() => {
    if (!activeCanvas) return []
    return activeCanvas.inputs.filter((card) => filterCardByStage(card, canvasFilter) && matchesSearch(card, searchTerm))
  }, [activeCanvas, canvasFilter, searchTerm])

  const visibleOutputs = useMemo(() => {
    if (!activeCanvas) return []
    return activeCanvas.outputs.filter((card) => filterCardByStage(card, canvasFilter) && matchesSearch(card, searchTerm))
  }, [activeCanvas, canvasFilter, searchTerm])

  useEffect(() => {
    if (activeCanvas) {
      setFlowHighlight('demand')
    }
  }, [activeCanvas?.generatedAt])

  const readinessInsights = useMemo(() => buildReadinessInsights(activeCanvas), [activeCanvas])
  const insightsByMetric = useMemo(() => {
    const map = new Map<string, ScmInsight>()
    ;(dashboard?.insights ?? []).forEach((insight) => {
      map.set(normalizeMetricKey(insight.metric), insight)
    })
    return map
  }, [dashboard?.insights])
  const actionInsights = dashboard?.insights ?? []
  const coverageInsight = insightsByMetric.get(normalizeMetricKey('Demand coverage'))
  const poInsight = insightsByMetric.get(normalizeMetricKey('Open POs'))
  const logisticsInsight =
    insightsByMetric.get(normalizeMetricKey('Overdue shipments')) ??
    insightsByMetric.get(normalizeMetricKey('Open shipments'))
  const flowGraphHighlight = useMemo(() => {
    if (!flowHighlight) return null
    return flowHighlight
  }, [flowHighlight])

  const handleRefresh = () => loadData()
  const metricToHighlight = useCallback(
    (metricTitle: string): 'demand' | 'procurement' | 'logistics' | 'inventory' | null => {
      const key = normalizeMetricKey(metricTitle)
      switch (METRIC_INSIGHT_MAP[key] ?? '') {
        case 'demandCoverage':
          return 'demand'
        case 'committedValue':
        case 'openPos':
          return 'procurement'
        case 'openShipments':
        case 'overdueShipments':
          return 'logistics'
        case 'inventoryValue':
          return 'inventory'
        default:
          return null
      }
    },
    [],
  )
  const handleMetricClick = useCallback(
    (metricTitle: string) => {
      const metricKey = normalizeMetricKey(metricTitle)
      const highlightTarget = metricToHighlight(metricTitle)
      if (highlightTarget) {
        setFlowHighlight(highlightTarget)
      }
      const metricInsight = insightsByMetric.get(metricKey)
      if (metricInsight) {
        setInsightModal({
          title: metricInsight.headline,
          description: metricInsight.summary,
          severity: metricInsight.severity,
          details: metricInsight.details,
          actions: metricInsight.actions,
        })
        return
      }
      const kind = METRIC_INSIGHT_MAP[metricKey]
      if (!kind) {
        setInsightModal({
          title: metricTitle,
          description: 'No detailed insight is available yet for this KPI.',
        })
        return
      }
      if (!activeCanvas) {
        setInsightModal({
          title: metricTitle,
          description: 'Detailed workflow insights require supply-chain canvas data for this scope.',
        })
        return
      }
      const data = buildInsight(activeCanvas, kind)
      if (data) {
        setInsightModal(data)
        return
      }
      setInsightModal({
        title: metricTitle,
        description: 'No detailed insight is available yet for this KPI.',
      })
    },
    [activeCanvas, insightsByMetric, metricToHighlight],
  )

  const handleInsightAction = useCallback(
    async (action: ScmInsightAction) => {
      if (action.intent === 'engageProcurement') {
        if (!activeCanvas) {
          setActionFeedback({ message: 'Load a scope with procurement data before engaging the team.', tone: 'error' })
          return
        }
        const procurementLane = activeCanvas.procurement.find((lane) => lane.title.toLowerCase().includes('purchase'))
        const actionableCards = procurementLane?.cards.filter((card) => {
          const status = (card.status ?? '').toLowerCase()
          return status && !['closed', 'completed', 'received'].includes(status)
        })
        if (!actionableCards || actionableCards.length === 0) {
          setActionFeedback({ message: 'No open purchase orders found to escalate.', tone: 'error' })
          return
        }
        setPendingAction(action.intent)
        try {
          const payloadOrders = actionableCards.map((card) => {
            const metadata = ensureMetadata(card.metadata)
            return {
              number: card.title,
              status: card.status ?? metadata.status ?? null,
              eta: metadata.expectedDate ?? card.neededDate ?? card.eta ?? null,
              supplier: card.subtitle ?? metadata.supplier ?? metadata.vendor ?? null,
              value: metadata.committedValue ?? metadata.value ?? card.quantity ?? null,
              process: metadata.processName ?? null,
            }
          })

          const response = await engageScmProcurementTeam({
            tenantId,
            projectId,
            contractId,
            sowId,
            processId,
            purchaseOrders: payloadOrders,
            note: action.description ?? null,
          })

          setActionFeedback({
            message: response.message ?? 'Procurement team engaged.',
            tone: 'success',
            alertId: response.alertId ?? null,
          })
          setInsightModal(null)
        } catch (err) {
          console.error('Failed to engage procurement team', err)
          setActionFeedback({ message: 'Unable to notify procurement team. Try again shortly.', tone: 'error' })
        } finally {
          setPendingAction(null)
        }
        return
      }

      if (action.href) {
        window.location.href = action.href
        return
      }
      if (action.description) {
        window.alert(action.description)
      }
    },
    [activeCanvas, tenantId, projectId, contractId, sowId, processId],
  )

  const breadcrumbs = useMemo(() => {
    if (isAtomSource) {
      const buildState = (overrides: Partial<ScopeState>) => ({
        tenantId,
        projectId,
        projectName: state?.projectName ?? null,
        contractId,
        contractName: state?.contractName ?? null,
        sowId,
        sowName: state?.sowName ?? null,
        processId,
        processName: state?.processName ?? null,
        ...overrides,
      })
      const crumbs: Array<{ label: string; onClick?: () => void }> = [
        {
          label: 'Atom Manager',
          onClick: () => navigate('/atoms', { state: buildState({}) }),
        },
      ]
      if (projectId) {
        crumbs.push({
          label: state?.projectName ?? projectId,
          onClick: () => navigate('/atoms', { state: buildState({ contractId: null, sowId: null, processId: null }) }),
        })
      }
      if (contractId) {
        crumbs.push({
          label: state?.contractName ?? contractId,
          onClick: () => navigate('/atoms', { state: buildState({ contractId, sowId: null, processId: null }) }),
        })
      }
      if (sowId) {
        crumbs.push({
          label: state?.sowName ?? sowId,
          onClick: () => navigate('/atoms', { state: buildState({ sowId, processId: null }) }),
        })
      }
      if (processId) {
        crumbs.push({
          label: state?.processName ?? processId,
          onClick: () => navigate('/atoms', { state: buildState({ processId }) }),
        })
      }
      crumbs.push({ label: 'Supply Chain Management' })
      return crumbs
    }

    return [
      { label: 'Dashboard', onClick: () => navigate('/', { state: { openView: 'dashboard' } }) },
      {
        label: state?.contractName ?? state?.projectName ?? 'Construction Control Center',
        onClick: () =>
          navigate('/', {
            state: {
              openView: 'contract',
              projectId,
              focusContractId: contractId ?? null,
            },
          }),
      },
      { label: 'Supply Chain Management' },
    ]
  }, [
    contractId,
    isAtomSource,
    navigate,
    processId,
    projectId,
    sowId,
    state?.contractName,
    state?.processName,
    state?.projectName,
    state?.sowName,
    tenantId,
  ])

  const closeInsightModal = useCallback(() => setInsightModal(null), [])

  useEffect(() => {
    if (!insightModal) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeInsightModal()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [closeInsightModal, insightModal])

  if (!projectId) {
    return (
      <div className="atom-scm-layout" data-theme={theme}>
        <SidebarNav activeIndex={activeNavIndex} onSelect={handleNavSelect} theme={theme} onToggleTheme={setTheme} />
        <div className="atom-scm-main">
          <TopBar breadcrumbs={[]} actions={null} />
          <main className="atom-scm-content">
            <div className="atom-scm-empty">Select a project scope before opening SCM.</div>
          </main>
        </div>
        <AtomUtilityDock activeView="procurement" scopeState={currentScopeState} />
      </div>
    )
  }

  if (shouldRequireProcess) {
    return (
      <div className="atom-scm-layout" data-theme={theme}>
        <SidebarNav activeIndex={activeNavIndex} onSelect={handleNavSelect} theme={theme} onToggleTheme={setTheme} />
        <div className="atom-scm-main">
          <TopBar breadcrumbs={breadcrumbs} actions={null} />
          <main className="atom-scm-content">
            <div className="atom-scm-empty atom-scm-empty--blocking">
              <h3>Supply Chain Management</h3>
              <p>Select a process in Atom Manager to open detailed supply-chain readiness insights.</p>
              <button
                type="button"
                onClick={() =>
                  navigate('/atoms', {
                    state: {
                      tenantId,
                      projectId,
                      contractId,
                    },
                  })
                }
              >
                Go to Atom Manager
              </button>
            </div>
          </main>
        </div>
        <AtomUtilityDock activeView="procurement" scopeState={currentScopeState} />
      </div>
    )
  }

  const scopeTitle = 'Supply Chain Management'
  const scopeSubtitle = processId
    ? state?.processName ?? processId ?? ''
    : source === 'ccc'
      ? state?.contractName ?? state?.projectName ?? 'Contract summary'
      : 'Select a process to view detailed readiness'
  const updatedAtSource = (processId ? canvas?.generatedAt : aggregateCanvas?.generatedAt ?? dashboard?.generatedAt) ?? null
  const timelineLanes = activeCanvas?.timeline ?? []

  return (
    <div className="atom-scm-layout" data-theme={theme}>
      <SidebarNav activeIndex={activeNavIndex} onSelect={handleNavSelect} theme={theme} onToggleTheme={handleToggleTheme} />
      <div className="atom-scm-main">
        <TopBar breadcrumbs={breadcrumbs} actions={<TopBarGlobalActions theme={theme} onToggleTheme={handleToggleTheme} scope={currentScopeState} />} />

        <main className="atom-scm-content">
          <section className="atom-scm-controls">
            <div className="atom-scm-top-meta">
              <span className="atom-scm-top-title">{scopeTitle}</span>
              {scopeSubtitle ? <span className="atom-scm-top-subtitle">{scopeSubtitle}</span> : null}
              {activeCanvas?.metrics ? (
                <span className={`atom-scm-badge atom-scm-badge--${activeCanvas.metrics.riskLevel}`}>
                  Risk {activeCanvas.metrics.riskLevel.charAt(0).toUpperCase() + activeCanvas.metrics.riskLevel.slice(1)}
                </span>
              ) : null}
              <span className="atom-scm-top-range">
                Updated {updatedAtSource ? new Date(updatedAtSource).toLocaleString() : new Date().toLocaleString()}
              </span>
            </div>
            {FEATURE_SCM_VISUAL ? (
              <div className="atom-scm-visual-launch">
                <Link to="/atoms/scm/visual" state={currentScopeState} className="atom-scm-visual-launch__link">
                  Launch Visual Flow
                </Link>
                <span>Live synthetic readiness canvas</span>
              </div>
            ) : null}
            {isAtomSource ? (
              <div className="atom-scm-scope-picker" role="group" aria-label="Supply chain scope selectors">
                <div className="atom-scm-scope-field">
                  <label htmlFor="atom-scm-project">Project</label>
                  <select
                    id="atom-scm-project"
                    value={projectId ?? ''}
                    onChange={(event) => handleProjectSelect(event.target.value || null)}
                    disabled={scopeHierarchyLoading && !projectOptions.length}
                  >
                    <option value="">Select project</option>
                    {projectOptions.map((project) => (
                      <option key={project.code} value={project.code}>
                        {project.name ?? project.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="atom-scm-scope-field">
                  <label htmlFor="atom-scm-contract">Contract</label>
                  <select
                    id="atom-scm-contract"
                    value={contractId ?? ''}
                    onChange={(event) => handleContractSelect(event.target.value || null)}
                    disabled={!projectId || !contractOptions.length}
                  >
                    <option value="">{projectId ? 'Select contract' : 'Select project first'}</option>
                    {contractOptions.map((contract) => (
                      <option key={contract.code} value={contract.code}>
                        {contract.name ?? contract.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="atom-scm-scope-field">
                  <label htmlFor="atom-scm-sow">SOW</label>
                  <select
                    id="atom-scm-sow"
                    value={sowId ?? ''}
                    onChange={(event) => handleSowSelect(event.target.value || null)}
                    disabled={!contractId || !sowOptions.length}
                  >
                    <option value="">{contractId ? 'Select SOW' : 'Select contract first'}</option>
                    {(sowOptions ?? []).map((sow) => (
                      <option key={sow.code} value={sow.code}>
                        {sow.name ?? sow.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="atom-scm-scope-field">
                  <label htmlFor="atom-scm-process">Process</label>
                  <select
                    id="atom-scm-process"
                    value={processId ?? ''}
                    onChange={(event) => handleProcessSelect(event.target.value || null)}
                    disabled={!sowId || !processOptions.length}
                  >
                    <option value="">{sowId ? 'Select process' : 'Select SOW first'}</option>
                    {(processOptions ?? []).map((process) => (
                      <option key={process.code} value={process.code}>
                        {process.name ?? process.code}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="button" className="atom-scm-return" onClick={handleOpenInAtomManager} disabled={!projectId}>
                  Open in Atom Manager
                </button>
                {scopeHierarchyLoading ? <span className="atom-scm-scope-status">Loading scope…</span> : null}
                {scopeHierarchyError ? <span className="atom-scm-scope-status error">{scopeHierarchyError}</span> : null}
              </div>
            ) : null}
            {scopeNotice ? <div className="atom-scm-notice">{scopeNotice}</div> : null}
            {actionFeedback ? (
              <div className={`atom-scm-feedback atom-scm-feedback--${actionFeedback.tone}`}>
                <span>{actionFeedback.message}</span>
                <div className="atom-scm-feedback__actions">
                  {actionFeedback.alertId ? (
                    <button
                      type="button"
                      onClick={() =>
                        navigate('/alarms', {
                          state: {
                            tenantId,
                            projectId,
                            contractId,
                            sowId,
                            processId,
                            focusAlertId: actionFeedback.alertId,
                          },
                        })
                      }
                    >
                      Open alarm center
                    </button>
                  ) : null}
                  <button type="button" onClick={() => setActionFeedback(null)}>
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}
            <div className="atom-scm-filter-row">
              <div className="atom-chip-group">
                {CANVAS_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    className={`atom-filter-chip ${canvasFilter === filter.id ? 'active' : ''}`}
                    onClick={() => setCanvasFilter(filter.id)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <input
                type="search"
                className="atom-scm-search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search materials, POs, shipments…"
              />
              <button type="button" className="atom-scm-refresh" onClick={handleRefresh} disabled={loading}>
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </section>

          {error ? <div className="atom-scm-error">{error}</div> : null}

          {timelineLanes.length ? (
            <section className="atom-scm-timeline">
              {timelineLanes.map((lane) => (
                <article key={lane.title} className="atom-scm-timeline-lane">
                  <header>
                    <h4>{lane.title}</h4>
                    <span>{lane.cards.length} items</span>
                  </header>
                  <div className="atom-scm-timeline-cards">
                    {lane.cards.map((card) => {
                      const metadata = (card.metadata ?? {}) as Record<string, unknown>
                      const swimlane = typeof metadata.swimlane === 'string' ? metadata.swimlane : null
                      const location = typeof metadata.location === 'string' ? metadata.location : null
                      const timeBucket = typeof metadata.timeBucket === 'string' ? metadata.timeBucket : null
                      return (
                        <div key={card.id} className={`atom-scm-timeline-card${card.risk ? ` risk-${card.risk}` : ''}`}>
                          <div className="atom-scm-timeline-card__title">{card.title}</div>
                          <div className="atom-scm-timeline-card__meta">
                            {card.subtitle ? <span>{card.subtitle}</span> : null}
                            {swimlane ? <span>{swimlane}</span> : null}
                            {location ? <span>{location}</span> : null}
                          </div>
                          <div className="atom-scm-timeline-card__footer">
                            {timeBucket ? <span>{timeBucket}</span> : null}
                            {card.quantity ? (
                              <span>
                                {card.quantity.toLocaleString()}
                                {card.unit ? ` ${card.unit}` : ''}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </article>
              ))}
            </section>
          ) : null}

          {activeCanvas?.metrics ? (
            <section className="atom-scm-readiness">
              <ReadinessCard
                title="Material readiness"
                value={activeCanvas.metrics.coveragePct}
                unit="%"
                subtitle={coverageInsight?.summary ?? 'Committed vs required'}
                bullets={coverageInsight?.details?.length ? coverageInsight.details : readinessInsights.material}
                actions={coverageInsight?.actions}
                onOpen={() => handleMetricClick('Demand coverage')}
                onAction={handleInsightAction}
                busy={Boolean(pendingAction)}
              />
              <ReadinessCard
                title="PO coverage"
                value={activeCanvas.metrics.openPurchaseOrders === 0 && activeCanvas.metrics.openRequisitions === 0 ? 100 : Math.max(0, 100 - activeCanvas.metrics.openPurchaseOrders * 12)}
                unit="%"
                subtitle={poInsight?.summary ?? `${activeCanvas.metrics.openPurchaseOrders} open POs`}
                bullets={poInsight?.details?.length ? poInsight.details : readinessInsights.purchaseOrders}
                actions={poInsight?.actions}
                onOpen={() => handleMetricClick('Open POs')}
                onAction={handleInsightAction}
                busy={Boolean(pendingAction)}
              />
              <ReadinessCard
                title="Logistics on track"
                value={activeCanvas.metrics.openShipments === 0 ? 100 : Math.max(0, 100 - activeCanvas.metrics.openShipments * 15)}
                unit="%"
                subtitle={logisticsInsight?.summary ?? `${activeCanvas.metrics.openShipments} shipments in transit`}
                bullets={logisticsInsight?.details?.length ? logisticsInsight.details : readinessInsights.logistics}
                actions={logisticsInsight?.actions}
                onOpen={() => handleMetricClick('Overdue shipments')}
                onAction={handleInsightAction}
                busy={Boolean(pendingAction)}
              />
            </section>
          ) : null}

          {actionInsights.length ? (
            <ScmInsightRail insights={actionInsights} onSelect={handleMetricClick} />
          ) : null}

          {isAtomSource ? (
            <ScmProcessFlow
              stageSummary={stageSummary}
              loading={stageLoading}
              error={stageError ?? undefined}
              alerts={alerts}
              changeRequests={changeRequests}
              canvas={activeCanvas}
              onStageChange={handleStageTransition}
              onRefresh={loadStageSummary}
            />
          ) : activeCanvas ? (
            <section className="atom-scm-flow">
              <header>
                <div>
                  <h3>Supply network flow</h3>
                  <span>Visualise demand, procurement, logistics, and inventory alignment across this scope.</span>
                </div>
              </header>
              <ScmFlowOverview canvas={activeCanvas} highlight={flowGraphHighlight ?? undefined} />
            </section>
          ) : null}

          <section className="atom-scm-metrics">
            {(dashboard?.kpis ?? []).map((metric) => {
              const metricKey = normalizeMetricKey(metric.title)
              const canOpen = Boolean(METRIC_INSIGHT_MAP[metricKey] || insightsByMetric.get(metricKey))
              return (
                <button
                  key={metricKey || metric.title}
                  type="button"
                  className={`atom-scm-metric-card ${metric.status ? `status-${metric.status}` : ''}`}
                  onClick={() => handleMetricClick(metric.title)}
                  disabled={!canOpen}
                  onMouseEnter={() => {
                    const next = metricToHighlight(metric.title)
                    if (next) setFlowHighlight(next)
                  }}
                  onFocus={() => {
                    const next = metricToHighlight(metric.title)
                    if (next) setFlowHighlight(next)
                  }}
                  onMouseLeave={() => setFlowHighlight(null)}
                  onBlur={() => setFlowHighlight(null)}
                >
                  <span>{metric.title}</span>
                  <strong>
                    {metric.unit === 'USD'
                      ? formatCurrency(metric.value, 1)
                      : metric.unit === '%'
                        ? `${metric.value.toFixed(1)}%`
                        : formatNumber(metric.value)}
                  </strong>
                </button>
              )
            })}
          </section>

          <section className="atom-scm-canvas">
            <div className="atom-scm-column">
              <header>
                <h3>Requirements</h3>
                <span>{visibleRequirements.length} open</span>
              </header>
              <div className="atom-scm-card-grid">
                {visibleRequirements.map((card) => (
                  <CanvasCard key={card.id} card={card} />
                ))}
                {!visibleRequirements.length && <p className="atom-scm-placeholder">No requirements in this view.</p>}
              </div>

              <header>
                <h3>Inputs</h3>
                <span>{visibleInputs.length} in flight</span>
              </header>
              <div className="atom-scm-card-grid">
                {visibleInputs.map((card) => (
                  <CanvasCard key={card.id} card={card} />
                ))}
                {!visibleInputs.length && <p className="atom-scm-placeholder">No inbound materials.</p>}
              </div>

              <header>
                <h3>Outputs</h3>
                <span>{visibleOutputs.length} ready</span>
              </header>
              <div className="atom-scm-card-grid">
                {visibleOutputs.map((card) => (
                  <CanvasCard key={card.id} card={card} />
                ))}
                {!visibleOutputs.length && <p className="atom-scm-placeholder">No completed outputs yet.</p>}
              </div>
            </div>

            <div className="atom-scm-column atom-scm-column--lanes">
              {filteredProcurementLanes.map((lane) => (
                <div className="atom-scm-lane" key={lane.title}>
                  <header>
                    <h3>{lane.title}</h3>
                    <span>{lane.cards.length}</span>
                  </header>
                  <div className="atom-scm-card-stack">
                    {lane.cards.map((card) => (
                      <CanvasCard key={card.id} card={card} />
                    ))}
                    {!lane.cards.length && <p className="atom-scm-placeholder">No items in this lane.</p>}
                  </div>
                </div>
              ))}
            </div>

            <div className="atom-scm-column">
              <header>
                <h3>Logistics</h3>
                <span>{filteredLogistics.length}</span>
              </header>
              <div className="atom-scm-card-grid">
                {filteredLogistics.map((card) => (
                  <CanvasCard key={card.id} card={card} />
                ))}
                {!filteredLogistics.length && <p className="atom-scm-placeholder">No active shipments.</p>}
              </div>

              <header>
                <h3>Inventory</h3>
                <span>{canvas?.inventory.length ?? 0}</span>
              </header>
              <div className="atom-scm-inventory">
                {(canvas?.inventory ?? []).map((item) => (
                  <div key={item.id} className="atom-scm-inventory-card">
                    <div className="atom-scm-inventory-header">
                      <strong>{item.itemName}</strong>
                      <span>{item.itemCode}</span>
                    </div>
                    <div className="atom-scm-inventory-metrics">
                      <span>On hand: {formatNumber(item.onHand)}</span>
                      <span>Reserved: {formatNumber(item.reserved)}</span>
                      <span>Available: {formatNumber(item.available)}</span>
                    </div>
                    <div className="atom-scm-inventory-footer">
                      <span>{item.location ?? 'Unassigned'}</span>
                      <span>{formatShortDate(item.snapshotDate)}</span>
                    </div>
                  </div>
                ))}
                {!canvas?.inventory.length && <p className="atom-scm-placeholder">No inventory snapshots.</p>}
              </div>
            </div>
          </section>
        </main>
      </div>
      <AtomUtilityDock activeView="procurement" scopeState={currentScopeState} />
      {insightModal ? (
        <ScmInsightModal data={insightModal} onClose={closeInsightModal} onAction={handleInsightAction} pendingIntent={pendingAction} />
      ) : null}
    </div>
  )
}

function CanvasCard({ card }: { card: ScmCanvasCard }) {
  const riskClass = card.risk ? ` ${RISK_CLASS[card.risk] ?? ''}` : ''
  return (
    <article className={`atom-scm-card ${riskClass}`}>
      <header>
        <span className="atom-scm-card-title">{card.title}</span>
        {card.status ? <span className="atom-scm-card-status">{card.status}</span> : null}
      </header>
      {card.subtitle ? <p className="atom-scm-card-subtitle">{card.subtitle}</p> : null}
      <div className="atom-scm-card-body">
        {typeof card.quantity === 'number' ? (
          <span className="atom-scm-card-quantity">
            {formatNumber(card.quantity)}
            {card.unit ? ` ${card.unit}` : ''}
          </span>
        ) : null}
        {card.neededDate ? <span>Needed {formatShortDate(card.neededDate)}</span> : null}
        {card.eta ? <span>ETA {formatShortDate(card.eta)}</span> : null}
        {typeof card.progress === 'number' ? <span>Committed {card.progress.toFixed(0)}%</span> : null}
      </div>
        {card.tags?.length ? (
          <footer className="atom-scm-card-tags">
            {card.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </footer>
        ) : null}
        {typeof card.progress === 'number' ? (
          <div className="atom-scm-progress">
            <div className="atom-scm-progress__label">{card.progress.toFixed(0)}% committed</div>
            <div className="atom-scm-progress__bar" aria-hidden>
              <span style={{ width: `${Math.min(100, Math.max(0, card.progress))}%` }} />
            </div>
          </div>
        ) : null}
      </article>
    )
}
