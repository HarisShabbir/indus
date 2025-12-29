import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'

import { createChangeRequest, fetchChangeRequests, fetchProgressHierarchy, type ChangeRequest, type ProgressHierarchyResponse } from '../../api'
import { SidebarNav, sidebarItems, ACCS_NAV_INDEX, type ThemeMode } from '../../layout/navigation'
import TopBar from '../../layout/TopBar'
import TopBarGlobalActions from '../../layout/TopBarActions'
import { applyTheme, resolveInitialTheme, toggleThemeValue } from '../../utils/theme'

type OriginInfo = {
  path: string
  label: string
  chain?: string[]
  state?: unknown
}

type LocationState = {
  projectId?: string | null
  projectName?: string | null
  contractId?: string | null
  contractName?: string | null
  sowId?: string | null
  sowName?: string | null
  processId?: string | null
  processName?: string | null
  origin?: OriginInfo
} | null

type ChangeForm = {
  projectId: string | ''
  contractId: string | ''
  sowId: string | ''
  processId: string | ''
  atomType: string
  atomVariant: string
  capacity: string
  capacityUnits: string
  specifications: string
  deploymentWindowStart: string
  deploymentWindowEnd: string
  riskRating: 'low' | 'medium' | 'high'
  rollbackPlan: string
  requester: string
  approver: string
  approvalGroup: string
  changeId: string
  justification: string
  budgetImpact: string
  attachmentUrl: string
}

const CHANGE_PAGE_SIZE = 6
const QUEUE_PAGE_SIZE = 3

type ChangeStageId = 'intake' | 'assessment' | 'approval' | 'execution' | 'audit'

const CHANGE_PIPELINE: Array<{ id: ChangeStageId; label: string; helper: string }> = [
  { id: 'intake', label: 'Intake', helper: 'Request logged' },
  { id: 'assessment', label: 'Assessment', helper: 'Risk & scope review' },
  { id: 'approval', label: 'Action', helper: 'Approve / reject / return / hold' },
  { id: 'execution', label: 'Execution', helper: 'Field implementation' },
  { id: 'audit', label: 'Audit', helper: 'Close-out & compliance' },
]

const STATUS_STAGE_MAP: Record<string, ChangeStageId> = {
  draft: 'intake',
  pending_submission: 'intake',
  pending_pm_approval: 'assessment',
  pending_assessment: 'assessment',
  cab_review: 'approval',
  awaiting_execution: 'approval',
  approved_for_execution: 'approval',
  implementing: 'execution',
  executing: 'execution',
  implemented: 'execution',
  closed: 'audit',
  rejected: 'audit',
}

const DEFAULT_FORM: ChangeForm = {
  projectId: '',
  contractId: '',
  sowId: '',
  processId: '',
  atomType: '',
  atomVariant: '',
  capacity: '',
  capacityUnits: 'units',
  specifications: '',
  deploymentWindowStart: '',
  deploymentWindowEnd: '',
  riskRating: 'medium',
  rollbackPlan: '',
  requester: '',
  approver: '',
  approvalGroup: '',
  changeId: '',
  justification: '',
  budgetImpact: '',
  attachmentUrl: '',
}

function resolveScopeNames(
  hierarchy: ProgressHierarchyResponse | null,
  projectId: string | null,
  contractId: string | null,
  sowId: string | null,
  processId: string | null,
) {
  if (!hierarchy) {
    return {
      projectName: null,
      contractName: null,
      sowName: null,
      processName: null,
    }
  }
  const project = hierarchy.projects.find((item) => item.code === projectId) ?? null
  const contract = project?.contracts.find((item) => item.code === contractId) ?? null
  const sow = contract?.sows.find((item) => item.code === sowId) ?? null
  const process = sow?.processes.find((item) => item.code === processId) ?? null
  return {
    projectName: project?.name ?? null,
    contractName: contract?.name ?? null,
    sowName: sow?.name ?? null,
    processName: process?.name ?? null,
  }
}

const normaliseStatus = (status: string | null | undefined) => (status ?? 'pending').toLowerCase()

function deriveStageFromStatus(status: string | null | undefined): ChangeStageId {
  const key = normaliseStatus(status)
  if (STATUS_STAGE_MAP[key]) return STATUS_STAGE_MAP[key]
  if (key.includes('pending')) return 'assessment'
  if (key.includes('approve') || key.includes('review')) return 'approval'
  if (key.includes('exec') || key.includes('implement')) return 'execution'
  if (key.includes('close') || key.includes('reject') || key.includes('hold')) return 'audit'
  return 'intake'
}

const stageDescriptions: Record<ChangeStageId, string> = {
  intake: 'Change logged and awaiting triage.',
  assessment: 'PMs reviewing scope, risk, and dependencies.',
  approval: 'Approvals and decisions in motion.',
  execution: 'Implementation in flight with QA watching.',
  audit: 'Change completed and recorded for compliance.',
}

const formatCurrency = (value: number | null | undefined) => {
  if (!Number.isFinite(value ?? NaN) || !value) return '$0'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export default function ChangeManagementPage(): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state as LocationState) ?? null

  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme())
  const [activeNavIndex, setActiveNavIndex] = useState(ACCS_NAV_INDEX)
  const [hierarchy, setHierarchy] = useState<ProgressHierarchyResponse | null>(null)
  const [loadingHierarchy, setLoadingHierarchy] = useState(false)
  const [hierarchyError, setHierarchyError] = useState<string | null>(null)
  const [form, setForm] = useState<ChangeForm>(() => ({
    ...DEFAULT_FORM,
    projectId: state?.projectId ?? '',
    contractId: state?.contractId ?? '',
    sowId: state?.sowId ?? '',
    processId: state?.processId ?? '',
  }))
  const [submitted, setSubmitted] = useState(false)
  const [submissionSummary, setSubmissionSummary] = useState<ChangeForm | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null)
  const [lastCreatedRequest, setLastCreatedRequest] = useState<ChangeRequest | null>(null)
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([])
  const [loadingRequests, setLoadingRequests] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [changePage, setChangePage] = useState(0)
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null)
  const [queuePage, setQueuePage] = useState(0)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const handleThemeToggle = () => setTheme((prev) => toggleThemeValue(prev))

  useEffect(() => {
    let cancelled = false
    setLoadingHierarchy(true)
    setHierarchyError(null)
    fetchProgressHierarchy()
      .then((payload) => {
        if (cancelled) return
        setHierarchy(payload)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('Failed to load hierarchy for change management', error)
        setHierarchyError('Unable to load project hierarchy.')
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingHierarchy(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const projectOptions = hierarchy?.projects ?? []
  const contractOptions = useMemo(() => {
    if (!form.projectId) return []
    return projectOptions.find((project) => project.code === form.projectId)?.contracts ?? []
  }, [form.projectId, projectOptions])
  const sowOptions = useMemo(() => {
    if (!form.contractId) return []
    return contractOptions.find((contract) => contract.code === form.contractId)?.sows ?? []
  }, [form.contractId, contractOptions])
  const processOptions = useMemo(() => {
    if (!form.sowId) return []
    return sowOptions.find((sow) => sow.code === form.sowId)?.processes ?? []
  }, [form.sowId, sowOptions])

  const effectiveProjectId = form.projectId || state?.projectId || null
  const effectiveContractId = form.contractId || state?.contractId || null
  const effectiveSowId = form.sowId || state?.sowId || null
  const effectiveProcessId = form.processId || state?.processId || null

  const { projectName, contractName, sowName, processName } = useMemo(
    () => resolveScopeNames(hierarchy, effectiveProjectId, effectiveContractId, effectiveSowId, effectiveProcessId),
    [hierarchy, effectiveProjectId, effectiveContractId, effectiveSowId, effectiveProcessId],
  )

  const loadChangeRequests = useCallback(async () => {
    if (!effectiveProjectId) {
      setChangeRequests([])
      setLastCreatedRequest(null)
      return
    }
    setLoadingRequests(true)
    setRequestError(null)
    try {
      const requests = await fetchChangeRequests({
        tenantId: 'default',
        projectId: effectiveProjectId,
        contractId: effectiveContractId ?? undefined,
        sowId: effectiveSowId ?? undefined,
        processId: effectiveProcessId ?? undefined,
      })
      setChangeRequests(requests)
    } catch (error) {
      console.error('Failed to load change requests', error)
      setRequestError('Unable to load workflow history.')
    } finally {
      setLoadingRequests(false)
    }
  }, [effectiveProjectId, effectiveContractId, effectiveSowId, effectiveProcessId])

  useEffect(() => {
    loadChangeRequests()
  }, [loadChangeRequests])

  const sortedChangeRequests = useMemo(
    () =>
      [...changeRequests].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [changeRequests],
  )

  useEffect(() => {
    if (!selectedChangeId && sortedChangeRequests.length) {
      setSelectedChangeId(sortedChangeRequests[0].id)
      setChangePage(0)
    }
  }, [sortedChangeRequests, selectedChangeId])

  const formatRequestStatus = (status: string | null | undefined) => {
    if (!status) return 'Pending'
    return status
      .split('_')
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(' ')
  }

  const resolveStatusChipClass = (status: string | null | undefined) => {
    if (!status) return 'status-open'
    if (status === 'pending_pm_approval') return 'status-in_progress'
    if (status.includes('approved')) return 'status-mitigated'
    if (status.includes('rejected')) return 'status-closed'
    return `status-${status.replace(/[^a-z]/g, '_')}`
  }

  const awaitingApprovalCount = useMemo(
    () => sortedChangeRequests.filter((request) => deriveStageFromStatus(request.status) === 'approval').length,
    [sortedChangeRequests],
  )
  const executingCount = useMemo(
    () => sortedChangeRequests.filter((request) => deriveStageFromStatus(request.status) === 'execution').length,
    [sortedChangeRequests],
  )
  const closedCount = useMemo(
    () => sortedChangeRequests.filter((request) => deriveStageFromStatus(request.status) === 'audit').length,
    [sortedChangeRequests],
  )
  const totalBudgetImpact = useMemo(
    () => sortedChangeRequests.reduce((sum, request) => sum + (request.est_cost ?? 0), 0),
    [sortedChangeRequests],
  )
  const pagedChangeRequests = useMemo(() => {
    const start = changePage * CHANGE_PAGE_SIZE
    return sortedChangeRequests.slice(start, start + CHANGE_PAGE_SIZE)
  }, [sortedChangeRequests, changePage])
  const changePageCount = Math.max(1, Math.ceil(Math.max(sortedChangeRequests.length, 1) / CHANGE_PAGE_SIZE))

  const pagedQueueRequests = useMemo(() => {
    const start = queuePage * QUEUE_PAGE_SIZE
    return sortedChangeRequests.slice(start, start + QUEUE_PAGE_SIZE)
  }, [sortedChangeRequests, queuePage])
  const queuePageCount = Math.max(1, Math.ceil(Math.max(sortedChangeRequests.length, 1) / QUEUE_PAGE_SIZE))
  const todayChangeCount = useMemo(() => {
    const today = new Date().toDateString()
    return sortedChangeRequests.filter((request) => new Date(request.created_at).toDateString() === today).length
  }, [sortedChangeRequests])

  useEffect(() => {
    if (changePage >= changePageCount) {
      setChangePage(Math.max(0, changePageCount - 1))
    }
  }, [changePage, changePageCount])

  useEffect(() => {
    if (queuePage >= queuePageCount) {
      setQueuePage(Math.max(0, queuePageCount - 1))
    }
  }, [queuePage, queuePageCount])

  const selectedChange = useMemo(
    () => sortedChangeRequests.find((request) => request.id === selectedChangeId) ?? null,
    [sortedChangeRequests, selectedChangeId],
  )
  const activeStage = selectedChange ? deriveStageFromStatus(selectedChange.status) : 'intake'
  const activeStageIndex = CHANGE_PIPELINE.findIndex((stage) => stage.id === activeStage)
  const stagePosition = activeStageIndex >= 0 ? activeStageIndex : 0
  const heroScopeLabel = useMemo(() => {
    const chain = [
      projectName ?? state?.projectName,
      contractName ?? state?.contractName,
      sowName ?? state?.sowName,
      processName ?? state?.processName,
    ].filter(Boolean)
    return chain.length ? chain.join(' · ') : 'No scope selected'
  }, [contractName, processName, projectName, sowName, state?.contractName, state?.processName, state?.projectName, state?.sowName])
  const stageHint = stageDescriptions[activeStage]
  const stageStatusLabel = selectedChange ? formatRequestStatus(selectedChange.status) : 'Select a change to view status'
  const last7Days = useMemo(() => {
    const days: string[] = []
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      days.push(date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))
    }
    return days
  }, [])
  const dailyChangeSeries = useMemo(() => {
    const counts = last7Days.map(() => 0)
    sortedChangeRequests.forEach((request) => {
      const label = new Date(request.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      const index = last7Days.indexOf(label)
      if (index >= 0) counts[index] += 1
    })
    return counts
  }, [last7Days, sortedChangeRequests])
  const stageDistribution = useMemo(
    () =>
      CHANGE_PIPELINE.map((stage) => ({
        ...stage,
        count: sortedChangeRequests.filter((request) => deriveStageFromStatus(request.status) === stage.id).length,
      })),
    [sortedChangeRequests],
  )
  const dailyChartOption = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, bottom: 30, top: 30 },
      xAxis: {
        type: 'category',
        data: last7Days,
        axisLine: { lineStyle: { color: 'rgba(148,163,184,0.35)' } },
        axisLabel: { color: 'rgba(148,163,184,0.85)' },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: 'rgba(148,163,184,0.35)' } },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
      },
      series: [
        {
          name: 'Changes',
          data: dailyChangeSeries,
          type: 'bar',
          barWidth: 18,
          itemStyle: {
            color: 'rgba(59,130,246,0.85)',
          },
        },
      ],
    }),
    [dailyChangeSeries, last7Days],
  )
  const stagePieOption = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: {
        orient: 'vertical',
        right: 0,
        top: 'center',
        textStyle: { color: 'rgba(148,163,184,0.9)' },
      },
      series: [
        {
          name: 'Workflow stage',
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['45%', '50%'],
          label: { color: 'rgba(226,232,240,0.9)' },
          data:
            stageDistribution.some((stage) => stage.count > 0) || !sortedChangeRequests.length
              ? stageDistribution.map((stage) => ({ value: stage.count, name: stage.label }))
              : [{ value: 1, name: 'No data' }],
        },
      ],
    }),
    [stageDistribution, sortedChangeRequests.length],
  )

  const breadcrumbs = useMemo(() => {
    const originChain = state?.origin?.chain ?? [state?.origin?.label ?? 'Dashboard']
    const originPath = state?.origin?.path
    const originState = state?.origin?.state
    const items = originChain.map((label, index) => {
      const isClickable = originPath && index === 0
      return {
        label,
        onClick: isClickable ? () => navigate(originPath, { state: originState }) : undefined,
      }
    })
    items.push({ label: 'Change Management', isCurrent: true })
    return items
  }, [navigate, state?.origin?.chain, state?.origin?.path, state?.origin?.state, state?.origin?.label])

  const handleFormChange = (key: keyof ChangeForm, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'projectId') {
        next.contractId = ''
        next.sowId = ''
        next.processId = ''
      } else if (key === 'contractId') {
        next.sowId = ''
        next.processId = ''
      } else if (key === 'sowId') {
        next.processId = ''
      }
      return next
    })
    setSubmitted(false)
    setSubmissionMessage(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(false)
    setSubmissionSummary(null)
    if (!form.projectId) {
      setSubmissionMessage('Select a project to continue.')
      setLastCreatedRequest(null)
      return
    }
    const requestedUnits = Number(form.capacity)
    if (!Number.isFinite(requestedUnits) || requestedUnits <= 0) {
      setSubmissionMessage('Requested capacity must be greater than zero.')
      setLastCreatedRequest(null)
      return
    }

    setSubmitting(true)
    setSubmissionMessage(null)
    try {
      const response = await createChangeRequest({
        tenantId: 'default',
        projectId: form.projectId,
        contractId: form.contractId || undefined,
        sowId: form.sowId || undefined,
        processId: form.processId || undefined,
        atomType: form.atomType,
        model: form.atomVariant || form.atomType,
        requestedUnits,
        estCost: form.budgetImpact ? Number(form.budgetImpact.replace(/[^0-9.]/g, '')) || undefined : undefined,
        reason: form.justification || form.specifications ? `${form.justification}${form.specifications ? ` · ${form.specifications}` : ''}` : undefined,
        createdBy: form.requester || 'contractor',
      })
      setSubmissionSummary({
        ...form,
        changeId: response.id ? response.id.slice(0, 8).toUpperCase() : form.changeId,
      })
      setForm((prev) => ({
        ...prev,
        changeId: response.id ? response.id.slice(0, 8).toUpperCase() : prev.changeId,
      }))
      setLastCreatedRequest(response)
      if (response.id) {
        setSelectedChangeId(response.id)
        setChangePage(0)
        setQueuePage(0)
      }
      setSubmitted(true)
      setSubmissionMessage('Change request routed to command center.')
      await loadChangeRequests()
    } catch (error) {
      console.error('Failed to submit change request', error)
      setSubmissionMessage('Unable to submit change request right now.')
      setLastCreatedRequest(null)
    } finally {
      setSubmitting(false)
    }
  }

  const actionScope = {
    projectId: effectiveProjectId,
    projectName: projectName ?? state?.projectName ?? null,
    contractId: effectiveContractId,
    contractName: contractName ?? state?.contractName ?? null,
    sowId: effectiveSowId,
    sowName: sowName ?? state?.sowName ?? null,
    processId: effectiveProcessId,
    processName: processName ?? state?.processName ?? null,
  }

  return (
    <div className="change-management" data-theme={theme}>
      <SidebarNav
        activeIndex={activeNavIndex}
        onSelect={(index) => {
          setActiveNavIndex(index)
          if (index === sidebarItems.findIndex((item) => item.label === 'Home')) {
            navigate('/')
          }
        }}
        theme={theme}
        onToggleTheme={handleThemeToggle}
      />
      <div className="app-shell topbar-layout">
        <TopBar
          breadcrumbs={breadcrumbs}
          actions={<TopBarGlobalActions theme={theme} onToggleTheme={handleThemeToggle} scope={actionScope} changeCount={todayChangeCount} />}
        />
        <main className="change-hub">
        <section className="change-hero">
          <div className="change-hero__titles">
            <p>Change program</p>
            <h1>Integrated Change Command</h1>
            <span>{heroScopeLabel}</span>
          </div>
            <div className="change-hero__metrics">
              <div className="change-metric-card">
                <span>Total requests</span>
                <strong>{changeRequests.length}</strong>
                <small>Captured in current scope</small>
              </div>
              <div className="change-metric-card">
                <span>Awaiting approval</span>
                <strong>{awaitingApprovalCount}</strong>
                <small>Need CAB decision</small>
              </div>
              <div className="change-metric-card">
                <span>In execution</span>
                <strong>{executingCount}</strong>
                <small>{closedCount} closed</small>
              </div>
              <div className="change-metric-card">
                <span>Budget at risk</span>
                <strong>{formatCurrency(totalBudgetImpact)}</strong>
                <small>Across open changes</small>
              </div>
            </div>
          </section>
          <section className="change-analytics">
            <header>
              <div>
                <h3>Change analytics</h3>
                <p>Daily intake and stage distribution for this scope.</p>
              </div>
              <span>{sortedChangeRequests.length} total records</span>
            </header>
            <div className="change-analytics__grid">
              <div className="change-analytics__card change-analytics__card--wide">
                <h4>Daily intake (7 days)</h4>
                <ReactECharts option={dailyChartOption} style={{ height: 220 }} />
              </div>
              <div className="change-analytics__card">
                <h4>Workflow stage mix</h4>
                <ReactECharts option={stagePieOption} style={{ height: 220 }} />
              </div>
            </div>
          </section>

        <section className="change-body-grid">
          <div className="change-form-stack">
            <div className="change-form-panel">
              <header className="change-form-panel__header">
                <div>
                  <p>Request intake</p>
                  <h2>Raise a change</h2>
                  <span>Capture scope, impact, and approvals for operational atom adjustments.</span>
                </div>
                <div className="change-form-panel__status">
                  <span>Live queue</span>
                  <strong>{awaitingApprovalCount + executingCount}</strong>
                  <small>Awaiting action</small>
                </div>
              </header>

              <form className="change-form" onSubmit={handleSubmit}>
              <fieldset>
                <legend>Request scope</legend>
                <div className="form-grid">
                  <label>
                    <span>Project</span>
                    <select
                      value={form.projectId}
                      onChange={(event) => handleFormChange('projectId', event.target.value)}
                      disabled={loadingHierarchy || projectOptions.length === 0}
                      required
                    >
                      <option value="">{loadingHierarchy ? 'Loading…' : 'Select project'}</option>
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
                      value={form.contractId}
                      onChange={(event) => handleFormChange('contractId', event.target.value)}
                      disabled={!form.projectId || contractOptions.length === 0}
                    >
                      <option value="">{contractOptions.length ? 'Select contract' : 'No contracts available'}</option>
                      {contractOptions.map((contract) => (
                        <option key={contract.code} value={contract.code}>
                          {contract.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Statement of work</span>
                    <select
                      value={form.sowId}
                      onChange={(event) => handleFormChange('sowId', event.target.value)}
                      disabled={!form.contractId || sowOptions.length === 0}
                    >
                      <option value="">{sowOptions.length ? 'Select SOW' : 'No SOWs available'}</option>
                      {sowOptions.map((sow) => (
                        <option key={sow.code} value={sow.code}>
                          {sow.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Process lane</span>
                    <select
                      value={form.processId}
                      onChange={(event) => handleFormChange('processId', event.target.value)}
                      disabled={!form.sowId || processOptions.length === 0}
                    >
                      <option value="">{processOptions.length ? 'Select process' : 'No processes available'}</option>
                      {processOptions.map((process) => (
                        <option key={process.code} value={process.code}>
                          {process.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Atom requirements</legend>
                <div className="form-grid">
                  <label>
                    <span>Atom family</span>
                    <input
                      type="text"
                      value={form.atomType}
                      onChange={(event) => handleFormChange('atomType', event.target.value)}
                      placeholder="e.g. Concrete Pour Crew"
                      required
                    />
                  </label>
                  <label>
                    <span>Variant / model</span>
                    <input
                      type="text"
                      value={form.atomVariant}
                      onChange={(event) => handleFormChange('atomVariant', event.target.value)}
                      placeholder="e.g. High energy compaction crew"
                    />
                  </label>
                  <label>
                    <span>Required capacity</span>
                    <div className="input-with-addon">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={form.capacity}
                        onChange={(event) => handleFormChange('capacity', event.target.value)}
                        placeholder="e.g. 6"
                        required
                      />
                      <select
                        value={form.capacityUnits}
                        onChange={(event) => handleFormChange('capacityUnits', event.target.value)}
                      >
                        <option value="units">units</option>
                        <option value="crew">crew</option>
                        <option value="hours">hours</option>
                        <option value="m3">m³</option>
                      </select>
                    </div>
                  </label>
                  <label className="full-span">
                    <span>Key specifications & capabilities</span>
                    <textarea
                      value={form.specifications}
                      onChange={(event) => handleFormChange('specifications', event.target.value)}
                      rows={4}
                      placeholder="Document the expected performance envelop, telemetry, or safety requirements aligned with the change request."
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Deployment window & risk</legend>
                <div className="form-grid">
                  <label>
                    <span>Request start</span>
                    <input
                      type="date"
                      value={form.deploymentWindowStart}
                      onChange={(event) => handleFormChange('deploymentWindowStart', event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    <span>Target availability</span>
                    <input
                      type="date"
                      value={form.deploymentWindowEnd}
                      onChange={(event) => handleFormChange('deploymentWindowEnd', event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    <span>Risk rating</span>
                    <div className="chip-group">
                      {(['low', 'medium', 'high'] as const).map((level) => (
                        <button
                          key={level}
                          type="button"
                          className={`chip ${form.riskRating === level ? 'active' : ''}`}
                          onClick={() => handleFormChange('riskRating', level)}
                        >
                          {level.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="full-span">
                    <span>Rollback & contingency</span>
                    <textarea
                      value={form.rollbackPlan}
                      onChange={(event) => handleFormChange('rollbackPlan', event.target.value)}
                      rows={3}
                      placeholder="Describe the fallback plan in case the change introduces instability."
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Approvals & tracking</legend>
                <div className="form-grid">
                  <label>
                    <span>Requested by</span>
                    <input
                      type="text"
                      value={form.requester}
                      onChange={(event) => handleFormChange('requester', event.target.value)}
                      placeholder="Name / role"
                      required
                    />
                  </label>
                  <label>
                    <span>Approval routing</span>
                    <input
                      type="text"
                      value={form.approvalGroup}
                      onChange={(event) => handleFormChange('approvalGroup', event.target.value)}
                      placeholder="e.g. Operations Change Advisory Board"
                    />
                  </label>
                  <label>
                    <span>Approver</span>
                    <input
                      type="text"
                      value={form.approver}
                      onChange={(event) => handleFormChange('approver', event.target.value)}
                      placeholder="Designated final approver"
                    />
                  </label>
                  <label>
                    <span>Incident / change ID</span>
                    <input
                      type="text"
                      value={form.changeId}
                      onChange={(event) => handleFormChange('changeId', event.target.value)}
                      placeholder="CM-2025-0001"
                    />
                  </label>
                  <label className="full-span">
                    <span>Business justification</span>
                    <textarea
                      value={form.justification}
                      onChange={(event) => handleFormChange('justification', event.target.value)}
                      rows={3}
                      placeholder="Summarize why this atom adjustment is required and the consequence of no change."
                    />
                  </label>
                  <label>
                    <span>Estimated budget impact</span>
                    <input
                      type="text"
                      value={form.budgetImpact}
                      onChange={(event) => handleFormChange('budgetImpact', event.target.value)}
                      placeholder="e.g. $42,000 additional capex"
                    />
                  </label>
                  <label>
                    <span>Reference document / link</span>
                    <input
                      type="url"
                      value={form.attachmentUrl}
                      onChange={(event) => handleFormChange('attachmentUrl', event.target.value)}
                      placeholder="https://sharepoint.example.com/change-package"
                    />
                  </label>
                </div>
              </fieldset>

              <footer className="change-form__footer">
                <div className="btn-group">
                  <button type="submit" className="btn-primary" disabled={submitting}>
                    {submitting ? 'Submitting…' : 'Route change request'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setForm({
                        ...DEFAULT_FORM,
                        projectId: state?.projectId ?? '',
                        contractId: state?.contractId ?? '',
                        sowId: state?.sowId ?? '',
                        processId: state?.processId ?? '',
                      })
                      setSubmitted(false)
                      setSubmissionSummary(null)
                      setSubmissionMessage(null)
                      setLastCreatedRequest(null)
                    }}
                  >
                    Reset form
                  </button>
                </div>
                {submissionMessage ? (
                  <p className={`change-form__status ${lastCreatedRequest ? 'change-form__status--success' : 'change-form__status--error'}`}>
                    {submissionMessage}
                  </p>
                ) : null}
                <p className="change-form__note">All change records are synchronized with the command center ledger for audit traceability.</p>
              </footer>
              </form>
            </div>

            <section className="change-ledger">
              <div className="change-table-card">
                <header>
                  <div>
                    <h2>Change ledger</h2>
                    <p>Monitor approvals, origins, and execution cadence.</p>
                  </div>
                  <span>
                    Page {Math.min(changePage + 1, changePageCount)} / {changePageCount}
                  </span>
                </header>
                <div className="change-table-wrapper">
                  {pagedChangeRequests.length ? (
                    <table className="change-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Atom</th>
                          <th>Scope</th>
                          <th>Status</th>
                          <th>Submitter</th>
                          <th>Raised</th>
                          <th>Budget</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedChangeRequests.map((request) => {
                          const stage = deriveStageFromStatus(request.status)
                          const statusLabel = formatRequestStatus(request.status)
                          const isActiveRow = request.id === selectedChangeId
                          const scopeTag = request.process_id ?? request.sow_id ?? request.contract_id ?? request.project_id ?? '—'
                          return (
                            <tr key={request.id} className={isActiveRow ? 'is-active' : undefined} onClick={() => setSelectedChangeId(request.id)}>
                              <td>
                                <strong>{request.id.slice(0, 8).toUpperCase()}</strong>
                                <span>{stageDescriptions[stage]}</span>
                              </td>
                              <td>
                                <strong>{request.atom_type}</strong>
                                <span>{request.model ?? '—'}</span>
                              </td>
                              <td>
                                <span>{scopeTag}</span>
                                <small>
                                  {request.requested_units} {request.requested_units === 1 ? 'unit' : 'units'}
                                </small>
                              </td>
                              <td>
                                <span className={`status-chip ${resolveStatusChipClass(request.status)}`}>{statusLabel}</span>
                              </td>
                              <td>
                                <strong>{request.created_by || '—'}</strong>
                                <small>{request.alert_id ? request.alert_id.slice(0, 8).toUpperCase() : '—'}</small>
                              </td>
                              <td>
                                <span>{new Date(request.created_at).toLocaleDateString()}</span>
                                <small>{new Date(request.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                              </td>
                              <td>
                                <strong>{formatCurrency(request.est_cost)}</strong>
                                <small>{stage.toUpperCase()}</small>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="change-table__empty">No change requests logged yet.</div>
                  )}
                </div>
                <div className="change-table__pagination">
                  <button type="button" onClick={() => setChangePage((prev) => Math.max(0, prev - 1))} disabled={changePage === 0}>
                    Previous
                  </button>
                  <span>
                    Showing {pagedChangeRequests.length ? `${changePage * CHANGE_PAGE_SIZE + 1}-${changePage * CHANGE_PAGE_SIZE + pagedChangeRequests.length}` : 0} of{' '}
                    {sortedChangeRequests.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setChangePage((prev) => Math.min(changePageCount - 1, prev + 1))}
                    disabled={changePage >= changePageCount - 1}
                  >
                    Next
                  </button>
                </div>
              </div>

              <div className="change-stage-card">
                <header>
                  <div>
                    <h2>Workflow tracker</h2>
                    <p>{stageStatusLabel}</p>
                  </div>
                  {selectedChange ? (
                    <span>{selectedChange.alert_id ? `Alarm ${selectedChange.alert_id.slice(0, 8).toUpperCase()}` : selectedChange.created_by}</span>
                  ) : null}
                </header>
                {selectedChange ? (
                  <>
                    <div className="change-stage-flow">
                      {CHANGE_PIPELINE.map((stage, index) => (
                        <React.Fragment key={stage.id}>
                          <div
                            className={`change-stage-node${index < stagePosition ? ' is-complete' : ''}${index === stagePosition ? ' is-active' : ''}`}
                          >
                            <span>{stage.label}</span>
                            <small>{stage.helper}</small>
                          </div>
                          {index < CHANGE_PIPELINE.length - 1 ? (
                            <span className={`change-stage-connector${index < stagePosition ? ' is-complete' : ''}`} aria-hidden />
                          ) : null}
                        </React.Fragment>
                      ))}
                    </div>
                    <ul className="change-stage-meta">
                      <li>
                        <span>Atom</span>
                        <strong>{selectedChange.atom_type}</strong>
                        <small>{selectedChange.model ?? '—'}</small>
                      </li>
                      <li>
                        <span>Status</span>
                        <strong>{stageStatusLabel}</strong>
                        <small>{stageHint}</small>
                      </li>
                      <li>
                        <span>Requested</span>
                        <strong>
                          {selectedChange.requested_units} {selectedChange.requested_units === 1 ? 'unit' : 'units'}
                        </strong>
                        <small>{new Date(selectedChange.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</small>
                      </li>
                      <li>
                        <span>Budget impact</span>
                        <strong>{formatCurrency(selectedChange.est_cost)}</strong>
                        <small>Owner: {selectedChange.created_by}</small>
                      </li>
                      <li className="change-stage-meta__note">
                        <span>Audit trail</span>
                        <p>ID {selectedChange.id.slice(0, 8).toUpperCase()} · Alert {selectedChange.alert_id?.slice(0, 8).toUpperCase() ?? 'N/A'}</p>
                      </li>
                      {selectedChange.reason ? (
                        <li className="change-stage-meta__note">
                          <span>Reason</span>
                          <p>{selectedChange.reason}</p>
                        </li>
                      ) : null}
                    </ul>
                    <div className="change-stage-actions">
                      <button type="button">Notify stakeholders</button>
                      <button type="button">Share change log</button>
                      <button type="button">Advance stage</button>
                    </div>
                  </>
                ) : (
                  <p className="change-stage-placeholder">No change requests available for this scope.</p>
                )}
              </div>
            </section>
          </div>

          <aside className="change-side-panel">
            <div className="change-card">
              <div className="change-card__header">
                <h3>Scope snapshot</h3>
              </div>
              {hierarchyError ? <p className="change-card__error">{hierarchyError}</p> : null}
              <dl>
                <div>
                  <dt>Project</dt>
                  <dd>{projectName ?? 'Not selected'}</dd>
                </div>
                <div>
                  <dt>Contract</dt>
                  <dd>{contractName ?? 'Not selected'}</dd>
                </div>
                <div>
                  <dt>SOW</dt>
                  <dd>{sowName ?? 'Not selected'}</dd>
                </div>
                <div>
                  <dt>Process</dt>
                  <dd>{processName ?? 'Not selected'}</dd>
                </div>
              </dl>
            </div>

            <div className="change-card">
              <div className="change-card__header">
                <h3>Submission review</h3>
              </div>
              {submitted && submissionSummary ? (
                <>
                  <p className="change-card__timestamp">
                    Generated on {new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                  <ul className="change-card__list">
                    <li>
                      <strong>Atom:</strong> {submissionSummary.atomType || '—'} {submissionSummary.atomVariant ? `· ${submissionSummary.atomVariant}` : ''}
                    </li>
                    <li>
                      <strong>Capacity:</strong>{' '}
                      {submissionSummary.capacity
                        ? `${submissionSummary.capacity} ${submissionSummary.capacityUnits}`
                        : '—'}
                    </li>
                    <li>
                      <strong>Window:</strong>{' '}
                      {submissionSummary.deploymentWindowStart && submissionSummary.deploymentWindowEnd
                        ? `${submissionSummary.deploymentWindowStart} → ${submissionSummary.deploymentWindowEnd}`
                        : '—'}
                    </li>
                    <li>
                      <strong>Risk:</strong> {submissionSummary.riskRating.toUpperCase()}
                    </li>
                    <li>
                      <strong>Approver:</strong> {submissionSummary.approver || 'Pending routing'}
                    </li>
                    <li>
                      <strong>Change ID:</strong> {lastCreatedRequest?.id ? lastCreatedRequest.id.slice(0, 8).toUpperCase() : submissionSummary.changeId || 'Assigned post-approval'}
                    </li>
                  </ul>
                  {submissionSummary.justification ? (
                    <div className="change-card__note">
                      <span>Justification</span>
                      <p>{submissionSummary.justification}</p>
                    </div>
                  ) : null}
                  {lastCreatedRequest ? (
                    <div className="change-card__note">
                      <span>Workflow status</span>
                      <p>
                        {formatRequestStatus(lastCreatedRequest.status)} ·{' '}
                        {new Date(lastCreatedRequest.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                      <p className="change-card__note-meta">
                        Alarm thread: {lastCreatedRequest.alert_id ? lastCreatedRequest.alert_id.slice(0, 8).toUpperCase() : 'Pending dispatch'}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="change-card__placeholder">Draft a request to preview the change package that will be routed for approvals.</p>
              )}
            </div>

            <div className="change-card change-card--queue">
              <div className="change-card__header">
                <h3>Workflow queue</h3>
                <span>{sortedChangeRequests.length} total</span>
              </div>
              {loadingRequests ? (
                <p className="change-card__placeholder">Loading workflow…</p>
              ) : requestError ? (
                <p className="change-card__error">{requestError}</p>
              ) : sortedChangeRequests.length ? (
                <>
                  <ul className="change-queue">
                    {pagedQueueRequests.map((request) => (
                      <li key={request.id}>
                        <div className="change-queue__header">
                          <strong>{request.atom_type}</strong>
                          <span className={`status-chip ${resolveStatusChipClass(request.status)}`}>{formatRequestStatus(request.status)}</span>
                        </div>
                        <p className="change-queue__timestamp">
                          {new Date(request.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                        <div className="change-queue__meta">
                          <span>
                            {request.requested_units} {request.requested_units === 1 ? 'unit' : 'units'}
                          </span>
                          {request.model ? <span>{request.model}</span> : null}
                          {request.alert_id ? <span>Alarm {request.alert_id.slice(0, 8).toUpperCase()}</span> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="change-queue__pagination">
                    <button type="button" onClick={() => setQueuePage((prev) => Math.max(0, prev - 1))} disabled={queuePage === 0}>
                      Previous
                    </button>
                    <span>
                      {Math.min(queuePage + 1, queuePageCount)} / {queuePageCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQueuePage((prev) => Math.min(queuePageCount - 1, prev + 1))}
                      disabled={queuePage >= queuePageCount - 1}
                    >
                      Next
                    </button>
                  </div>
                </>
              ) : (
                <p className="change-card__placeholder">No change requests captured for this scope.</p>
              )}
            </div>
          </aside>
        </section>
        </main>
      </div>
    </div>
  )
}
