import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { createChangeRequest, fetchChangeRequests, fetchProgressHierarchy, type ChangeRequest, type ProgressHierarchyResponse } from '../../api'
import { SidebarNav, sidebarItems, ACCS_NAV_INDEX, type ThemeMode } from '../../layout/navigation'
import TopBar from '../../layout/TopBar'
import TopBarGlobalActions from '../../layout/TopBarActions'
import { applyTheme, resolveInitialTheme, toggleThemeValue } from '../../utils/theme'

type LocationState = {
  projectId?: string | null
  projectName?: string | null
  contractId?: string | null
  contractName?: string | null
  sowId?: string | null
  sowName?: string | null
  processId?: string | null
  processName?: string | null
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

  const breadcrumbs = useMemo(
    () => [
      { label: 'Dashboard', onClick: () => navigate('/', { state: { openView: 'dashboard' } }) },
      { label: 'Change Management' },
    ],
    [navigate],
  )

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
        <TopBar breadcrumbs={breadcrumbs} actions={<TopBarGlobalActions theme={theme} onToggleTheme={handleThemeToggle} scope={actionScope} />} />
        <main className="change-management__body">
          <section className="change-management__form">
            <header className="change-management__header">
              <h1>Integrated Change Management</h1>
              <p>
                Capture scope, impact, and approvals for operational atom adjustments. Inspired by Remedy workflows and
                tuned for construction execution.
              </p>
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
          </section>

          <aside className="change-management__summary">
            <div className="summary-card">
              <h2>Scope snapshot</h2>
              {hierarchyError ? <p className="summary-card__error">{hierarchyError}</p> : null}
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

            <div className="summary-card">
              <h2>Submission review</h2>
              {submitted && submissionSummary ? (
                <>
                  <p className="summary-card__timestamp">
                    Generated on {new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                  <ul className="summary-list">
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
                    <div className="summary-card__note">
                      <span>Justification</span>
                      <p>{submissionSummary.justification}</p>
                    </div>
                  ) : null}
                  {lastCreatedRequest ? (
                    <div className="summary-card__note">
                      <span>Workflow status</span>
                      <p>
                        {formatRequestStatus(lastCreatedRequest.status)} ·{' '}
                        {new Date(lastCreatedRequest.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                      <p className="summary-card__note-meta">
                        Alarm thread: {lastCreatedRequest.alert_id ? lastCreatedRequest.alert_id.slice(0, 8).toUpperCase() : 'Pending dispatch'}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="summary-card__placeholder">
                  Draft a request to preview the change package that will be routed for approvals.
                </p>
              )}
            </div>

            <div className="summary-card summary-card--queue">
              <h2>Workflow queue</h2>
              {loadingRequests ? (
                <p className="summary-card__placeholder">Loading workflow…</p>
              ) : requestError ? (
                <p className="summary-card__error">{requestError}</p>
              ) : changeRequests.length ? (
                <ul className="change-queue">
                  {changeRequests.map((request) => (
                    <li key={request.id}>
                      <div className="change-queue__header">
                        <strong>{request.atom_type}</strong>
                        <span className={`status-chip ${resolveStatusChipClass(request.status)}`}>{formatRequestStatus(request.status)}</span>
                      </div>
                      <p className="change-queue__timestamp">
                        {new Date(request.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                      <div className="change-queue__meta">
                        <span>{request.requested_units} {request.requested_units === 1 ? 'unit' : 'units'}</span>
                        {request.model ? <span>{request.model}</span> : null}
                        {request.alert_id ? <span>Alarm {request.alert_id.slice(0, 8).toUpperCase()}</span> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="summary-card__placeholder">No change requests captured for this scope.</p>
              )}
            </div>
          </aside>
        </main>
      </div>
    </div>
  )
}
