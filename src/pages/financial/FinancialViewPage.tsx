import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import {
  fetchFinancialSummary,
  fetchFinancialAllocation,
  fetchFinancialExpenses,
  fetchFinancialFundFlow,
  fetchFinancialIncoming,
  fetchFinancialOutgoing,
  fetchProjectControlCenter,
  type FinancialSummary,
  type FinancialAllocationResponse,
  type FinancialExpenseRow,
  type FinancialFundFlow,
  type FinancialIncomingResponse,
  type FinancialOutgoingResponse,
  type Project,
  type ContractSite,
} from '../../api'
import { FEATURE_FINANCIAL_VIEW } from '../../config'
import {
  SidebarNav,
  ThemeToggleButton,
  HOME_NAV_INDEX,
  ACCS_NAV_INDEX,
  type ThemeMode,
} from '../../layout/navigation'
import Breadcrumbs from '../../components/breadcrumbs/Breadcrumbs'
import ESankey from '../../components/charts/ESankey'
import { useScheduleStore } from '../../state/scheduleStore'
import { readAuthToken } from '../../utils/auth'

const formatCompactCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '--'
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000_000) {
    return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`
  }
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(1)}K`
  }
  return `${sign}$${abs.toFixed(0)}`
}

const formatIndex = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--'
  return value.toFixed(2)
}

type LocationState = {
  projectId?: string
  projectName?: string
  projectSnapshot?: Project | null
  contractId?: string | null
} | null

export default function FinancialViewPage(): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const { id: routeContractId } = useParams<{ id?: string }>()
  const locationState = (location.state as LocationState) ?? null
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const scheduleStore = useScheduleStore()
  const isAuthenticated = readAuthToken()

  const initialProjectId =
    locationState?.projectId ?? searchParams.get('projectId') ?? locationState?.projectSnapshot?.id ?? null
  const initialProjectName =
    locationState?.projectName ?? searchParams.get('projectName') ?? locationState?.projectSnapshot?.name ?? 'Project'

  const initialContractId = useMemo(
    () => routeContractId ?? locationState?.contractId ?? scheduleStore.currentContractId ?? null,
    [routeContractId, locationState?.contractId, scheduleStore.currentContractId],
  )

  const [theme, setTheme] = useState<ThemeMode>('light')
  const [selectedContractId, setSelectedContractId] = useState<string | null>(initialContractId)
  const [project, setProject] = useState<Project | null>(locationState?.projectSnapshot ?? null)
  const [contracts, setContracts] = useState<ContractSite[]>([])
  const [summary, setSummary] = useState<FinancialSummary | null>(null)
  const [allocation, setAllocation] = useState<FinancialAllocationResponse | null>(null)
  const [expenses, setExpenses] = useState<FinancialExpenseRow[]>([])
  const [fundFlow, setFundFlow] = useState<FinancialFundFlow | null>(null)
  const [incoming, setIncoming] = useState<FinancialIncomingResponse | null>(null)
  const [outgoing, setOutgoing] = useState<FinancialOutgoingResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedContracts, setExpandedContracts] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState<'owner' | 'engineer'>('owner')

  useEffect(() => {
    setSelectedContractId(initialContractId)
  }, [initialContractId])

  useEffect(() => {
    if (!selectedContractId) {
      useScheduleStore.setState({ currentContractId: null })
    } else {
      useScheduleStore.setState({ currentContractId: selectedContractId })
    }
  }, [selectedContractId])

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/', { state: { openView: 'login' } })
    }
  }, [isAuthenticated, navigate])

  useEffect(() => {
    if (!initialProjectId || !FEATURE_FINANCIAL_VIEW) return
    let cancelled = false

    async function loadProjectShell() {
      try {
        const payload = await fetchProjectControlCenter(initialProjectId)
        if (cancelled) return
        setProject(payload.project)
        setContracts(payload.contracts ?? [])
        setExpandedContracts((current) => {
          const next: Record<string, boolean> = {}
          payload.contracts?.forEach((contract) => {
            next[contract.id] = current[contract.id] ?? false
          })
          return next
        })
      } catch (err) {
        if (!cancelled) {
          console.warn('Failed to load project control center snapshot', err)
        }
      }
    }

    loadProjectShell()
    return () => {
      cancelled = true
    }
  }, [initialProjectId])

  useEffect(() => {
    if (!FEATURE_FINANCIAL_VIEW || !initialProjectId || !isAuthenticated) {
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    async function loadFinancialData() {
      try {
        const [summaryRes, allocationRes, expensesRes, flowRes, incomingRes, outgoingRes] = await Promise.all([
          fetchFinancialSummary(initialProjectId, selectedContractId ?? undefined),
          fetchFinancialAllocation(initialProjectId),
          fetchFinancialExpenses(initialProjectId, selectedContractId ?? undefined),
          fetchFinancialFundFlow(initialProjectId, selectedContractId ?? undefined),
          fetchFinancialIncoming(initialProjectId),
          fetchFinancialOutgoing(initialProjectId, selectedContractId ?? undefined),
        ])
        if (cancelled) return
        setSummary(summaryRes)
        setAllocation(allocationRes)
        setExpenses(expensesRes)
        setFundFlow(flowRes)
        setIncoming(incomingRes)
        setOutgoing(outgoingRes)
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load financial data', err)
          setError('Unable to load financial data right now.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadFinancialData()
    return () => {
      cancelled = true
    }
  }, [initialProjectId, selectedContractId, isAuthenticated])

  const projectId = initialProjectId
  const projectName = project?.name ?? initialProjectName

  const handleThemeToggle = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))

  const handleNavSelect = (index: number) => {
    if (index === HOME_NAV_INDEX) {
      navigate('/')
    }
  }

  const projectSlug = projectName.replace(/\s+/g, '_')

  const handleNavigateToCcc = useCallback(() => {
    if (!projectId) {
      navigate('/')
      return
    }
    navigate('/', {
      state: {
        openView: 'contract',
        projectId,
        projectSnapshot: project ?? null,
        utilityView: 'financial',
      },
    })
  }, [navigate, project, projectId])

  const breadcrumbs = useMemo(
    () => [
      { label: 'Dashboard', onClick: () => navigate('/', { state: { openView: 'dashboard' } }) },
      { label: projectSlug, onClick: handleNavigateToCcc },
      { label: 'Construction Control Center', onClick: handleNavigateToCcc },
      { label: 'Financial View' },
    ],
    [handleNavigateToCcc, navigate, projectSlug],
  )

  const engineerRows = useMemo(() => {
    const rows: FinancialExpenseRow[] = []
    expenses.forEach((contractRow) => {
      contractRow.children.forEach((child) => {
        rows.push({
          ...child,
          description: `${contractRow.contractCode ?? contractRow.description} · ${child.description}`,
        })
      })
    })
    return rows
  }, [expenses])

  const handleContractSelect = (contract: ContractSite | null) => {
    if (!projectId) return
    if (!contract) {
      setSelectedContractId(null)
      navigate('/financial', {
        replace: true,
        state: {
          projectId,
          projectName,
          projectSnapshot: project ?? null,
        },
      })
      return
    }
    setSelectedContractId(contract.id)
    navigate(`/contracts/${contract.id}/financial`, {
      replace: true,
      state: {
        projectId,
        projectName,
        contractId: contract.id,
        projectSnapshot: project ?? null,
      },
    })
  }

  const toggleContractRow = (contractId: string) => {
    setExpandedContracts((prev) => ({ ...prev, [contractId]: !prev[contractId] }))
  }

  if (!isAuthenticated) {
    return null
  }

  if (!FEATURE_FINANCIAL_VIEW) {
    return (
      <div className="financial-disabled">
        <h2>Financial view is disabled</h2>
        <p>This environment does not have the Financial View feature flag enabled.</p>
      </div>
    )
  }

  if (!projectId) {
    return (
      <div className="financial-disabled">
        <h2>Select a project to view financials</h2>
        <p>Return to the Construction Control Center and choose a project.</p>
      </div>
    )
  }

  const summaryAsOf = summary?.as_of ? new Date(summary.as_of).toLocaleString() : '--'

  return (
    <div className="financial-view" data-theme={theme}>
      <SidebarNav activeIndex={ACCS_NAV_INDEX} onSelect={handleNavSelect} theme={theme} onToggleTheme={handleThemeToggle} />
      <div className="financial-stage">
        <aside className="financial-left" aria-label="Project and contracts">
          <div className="financial-left-header">
            <h2>{projectName}</h2>
            <p>{contracts.length} active contracts</p>
          </div>
          <nav className="financial-contract-nav" aria-label="Select contract">
            <button
              type="button"
              className={`financial-contract-btn ${selectedContractId ? '' : 'active'}`}
              onClick={() => handleContractSelect(null)}
            >
              <span className="financial-contract-name">Project Overview</span>
              <span className="financial-contract-meta">All contracts</span>
            </button>
            {contracts.map((contract) => {
              const active = selectedContractId === contract.id
              return (
                <button
                  key={contract.id}
                  type="button"
                  className={`financial-contract-btn ${active ? 'active' : ''}`}
                  onClick={() => handleContractSelect(contract)}
                >
                  <span className="financial-contract-name">{contract.name}</span>
                  <span className="financial-contract-meta">SPI {contract.status_pct?.toFixed?.(0) ?? '--'}%</span>
                </button>
              )
            })}
          </nav>
        </aside>
        <main className="financial-main">
          <header className="financial-header">
            <Breadcrumbs items={breadcrumbs} />
            <div className="financial-summary">
              <div className="financial-summary-card">
                <span>Earned Value (EV)</span>
                <strong>{formatCompactCurrency(summary?.ev ?? null)}</strong>
              </div>
              <div className="financial-summary-card">
                <span>Planned Value (PV)</span>
                <strong>{formatCompactCurrency(summary?.pv ?? null)}</strong>
              </div>
              <div className="financial-summary-card">
                <span>Actual Cost (AC)</span>
                <strong>{formatCompactCurrency(summary?.ac ?? null)}</strong>
              </div>
              <div className="financial-summary-card">
                <span>SPI / CPI</span>
                <strong>
                  {formatIndex(summary?.spi ?? null)} / {formatIndex(summary?.cpi ?? null)}
                </strong>
                <small>As of {summaryAsOf}</small>
              </div>
            </div>
          </header>

          <div className="financial-tabs" role="tablist" aria-label="Financial perspectives">
            <button
              type="button"
              role="tab"
              className={`financial-tab ${activeTab === 'owner' ? 'active' : ''}`}
              aria-selected={activeTab === 'owner'}
              onClick={() => setActiveTab('owner')}
            >
              Owner View
            </button>
            <button
              type="button"
              role="tab"
              className={`financial-tab ${activeTab === 'engineer' ? 'active' : ''}`}
              aria-selected={activeTab === 'engineer'}
              onClick={() => setActiveTab('engineer')}
            >
              Engineer View
            </button>
          </div>

          {error && <div className="financial-error">{error}</div>}

          {activeTab === 'owner' ? (
            <div className="financial-grid">
              <section className="financial-table-card" aria-labelledby="fund-allocation-heading">
                <div className="financial-card-header">
                  <h3 id="fund-allocation-heading">Fund Allocation</h3>
                  <span>Budget allocations by contract</span>
                </div>
                <table className="financial-table" role="table">
                  <thead>
                    <tr>
                      <th scope="col">Description</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="financial-row-project">
                      <th scope="row">{allocation?.project.description ?? projectName}</th>
                      <td>{formatCompactCurrency(allocation?.project.amount ?? null)}</td>
                      <td>{allocation?.project.status ?? '—'}</td>
                    </tr>
                    {allocation?.contracts.map((row) => (
                      <tr key={row.contractId ?? row.description}>
                        <th scope="row">{row.description}</th>
                        <td>{formatCompactCurrency(row.amount ?? null)}</td>
                        <td>{row.status ?? '—'}</td>
                      </tr>
                    )) ?? null}
                  </tbody>
                </table>
              </section>

              <section className="financial-table-card" aria-labelledby="expenses-heading">
                <div className="financial-card-header">
                  <h3 id="expenses-heading">Expenses</h3>
                  <span>Actual spend and balances</span>
                </div>
                <table className="financial-table" role="table">
                  <thead>
                    <tr>
                      <th scope="col">Description</th>
                      <th scope="col">Contract</th>
                      <th scope="col" className="numeric">Actual</th>
                      <th scope="col" className="numeric">Paid</th>
                      <th scope="col" className="numeric">Balance</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((row) => {
                      const isExpanded = expandedContracts[row.contractCode ?? row.description] ?? false
                      const key = row.contractCode ?? row.description
                      return (
                        <React.Fragment key={key}>
                          <tr className="financial-contract-row">
                            <th scope="row">
                              <button
                                type="button"
                                className="financial-expand-btn"
                                onClick={() => toggleContractRow(key)}
                                aria-expanded={isExpanded}
                                aria-controls={`expense-${key}`}
                              >
                                {isExpanded ? '−' : '+'}
                              </button>
                              <span>{row.description}</span>
                            </th>
                            <td>{row.contractCode ?? '—'}</td>
                            <td className="numeric">{formatCompactCurrency(row.actual)}</td>
                            <td className="numeric">{formatCompactCurrency(row.paid)}</td>
                            <td className="numeric">{formatCompactCurrency(row.balance)}</td>
                            <td>{row.status ?? '—'}</td>
                          </tr>
                          {isExpanded && row.children.length > 0 && (
                            <tr id={`expense-${key}`} className="financial-sow-group">
                              <td colSpan={6}>
                                <table className="financial-subtable">
                                  <tbody>
                                    {row.children.map((child, index) => (
                                      <tr key={`${key}-child-${index}`}>
                                        <th scope="row">{child.description}</th>
                                        <td>{child.contractCode ?? '—'}</td>
                                        <td className="numeric">{formatCompactCurrency(child.actual)}</td>
                                        <td className="numeric">{formatCompactCurrency(child.paid)}</td>
                                        <td className="numeric">{formatCompactCurrency(child.balance)}</td>
                                        <td>{child.status ?? '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </section>
            </div>
          ) : (
            <section className="financial-table-card" aria-labelledby="engineer-heading">
              <div className="financial-card-header">
                <h3 id="engineer-heading">Engineering Packages</h3>
                <span>Spend by SOW / engineering package</span>
              </div>
              <table className="financial-table" role="table">
                <thead>
                  <tr>
                    <th scope="col">Package</th>
                    <th scope="col">Contract</th>
                    <th scope="col" className="numeric">Actual</th>
                    <th scope="col" className="numeric">Paid</th>
                    <th scope="col" className="numeric">Balance</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {engineerRows.map((row, index) => (
                    <tr key={`${row.contractCode ?? row.description}-${index}`}>
                      <th scope="row">{row.description}</th>
                      <td>{row.contractCode ?? '—'}</td>
                      <td className="numeric">{formatCompactCurrency(row.actual)}</td>
                      <td className="numeric">{formatCompactCurrency(row.paid)}</td>
                      <td className="numeric">{formatCompactCurrency(row.balance)}</td>
                      <td>{row.status ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </main>

        <aside className="financial-right" aria-label="Fund flow and cash tables">
          <section className="financial-panel">
            <div className="financial-card-header">
              <h3>Project Fund Flow</h3>
              <span>Sankey view of fund movement</span>
            </div>
            <ESankey nodes={fundFlow?.nodes ?? []} links={fundFlow?.links ?? []} loading={loading} height={320} />
          </section>

          <section className="financial-panel">
            <div className="financial-card-header">
              <h3>Incoming Fund Accounts</h3>
              <span>Available deposits</span>
            </div>
            <table className="financial-table" role="table">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Account</th>
                  <th scope="col" className="numeric">Funds Deposited</th>
                  <th scope="col">Date</th>
                </tr>
              </thead>
              <tbody>
                {(incoming?.available ?? []).map((row) => (
                  <tr key={`available-${row.id}`}>
                    <th scope="row">{row.id}</th>
                    <td>{row.accountName}</td>
                    <td className="numeric">{formatCompactCurrency(row.fundsDeposited)}</td>
                    <td>{row.dateOfDeposit ?? '—'}</td>
                  </tr>
                ))}
                {!incoming?.available?.length && (
                  <tr>
                    <td colSpan={4} className="empty">
                      No deposits recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="financial-card-subheading">Expected deposits</div>
            <table className="financial-table" role="table">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Account</th>
                  <th scope="col" className="numeric">Funds Expected</th>
                  <th scope="col">Expected Date</th>
                </tr>
              </thead>
              <tbody>
                {(incoming?.expected ?? []).map((row) => (
                  <tr key={`expected-${row.id}`}>
                    <th scope="row">{row.id}</th>
                    <td>{row.accountName}</td>
                    <td className="numeric">{formatCompactCurrency(row.fundsExpected)}</td>
                    <td>{row.expectedDateOfDeposit ?? '—'}</td>
                  </tr>
                ))}
                {!incoming?.expected?.length && (
                  <tr>
                    <td colSpan={4} className="empty">
                      No expected deposits scheduled.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="financial-panel">
            <div className="financial-card-header">
              <h3>Outgoing Expenses</h3>
              <span>Actual and forecast spend</span>
            </div>
            <table className="financial-table" role="table">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Account</th>
                  <th scope="col" className="numeric">Expense Value</th>
                  <th scope="col">Date</th>
                </tr>
              </thead>
              <tbody>
                {(outgoing?.actual ?? []).map((row) => (
                  <tr key={`out-actual-${row.id}`}>
                    <th scope="row">{row.id}</th>
                    <td>{row.accountName}</td>
                    <td className="numeric">{formatCompactCurrency(row.expenseValue)}</td>
                    <td>{row.dateOfExpense ?? '—'}</td>
                  </tr>
                ))}
                {!outgoing?.actual?.length && (
                  <tr>
                    <td colSpan={4} className="empty">
                      No expenses recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="financial-card-subheading">Expected expenses</div>
            <table className="financial-table" role="table">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Account</th>
                  <th scope="col" className="numeric">Expected Value</th>
                  <th scope="col">Expected Date</th>
                </tr>
              </thead>
              <tbody>
                {(outgoing?.expected ?? []).map((row) => (
                  <tr key={`out-expected-${row.id}`}>
                    <th scope="row">{row.id}</th>
                    <td>{row.accountName}</td>
                    <td className="numeric">{formatCompactCurrency(row.expectedExpenseValue)}</td>
                    <td>{row.expectedDateOfExpense ?? '—'}</td>
                  </tr>
                ))}
                {!outgoing?.expected?.length && (
                  <tr>
                    <td colSpan={4} className="empty">
                      No forecast expenses scheduled.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </aside>
      </div>
    </div>
  )
}
