import type {
  FinancialAllocationResponse,
  FinancialExpenseRow,
  FinancialFundFlow,
  FinancialIncomingResponse,
  FinancialOutgoingResponse,
  FinancialSummary,
} from '../api'

type ContractKey = {
  summary: FinancialSummary
  allocation: FinancialAllocationResponse
  expenses: FinancialExpenseRow[]
  fundFlow: FinancialFundFlow
  incoming: FinancialIncomingResponse
  outgoing: FinancialOutgoingResponse
}

type ProjectFallback = {
  projectSummary: FinancialSummary
  projectAllocation: FinancialAllocationResponse
  projectExpenses: FinancialExpenseRow[]
  projectFundFlow: FinancialFundFlow
  incoming: FinancialIncomingResponse
  outgoing: FinancialOutgoingResponse
  contracts: Record<string, ContractKey>
}

const makeAllocationRow = (description: string, amount: number, status: string, contractId?: string) => ({
  description,
  amount,
  status,
  contractId,
})

const makeExpenseRow = (
  description: string,
  contractCode: string,
  actual: number,
  paid: number,
  balance: number,
  status: string,
  children: FinancialExpenseRow[] = [],
): FinancialExpenseRow => ({
  description,
  contractCode,
  actual,
  paid,
  balance,
  status,
  children,
})

const makeFundFlow = (projectId: string, contracts: Array<{ id: string; name: string; allocation: number; spent: number }>): FinancialFundFlow => {
  const projectNodeId = projectId
  const nodes = [
    { id: projectNodeId, label: 'Project Funds', type: 'project' },
    { id: `${projectId}-deposits`, label: 'Funding Pool', type: 'inflow' },
  ]
  const links: FinancialFundFlow['links'] = [
    { source: `${projectId}-deposits`, target: projectNodeId, value: contracts.reduce((sum, item) => sum + item.allocation, 0) },
  ]

  for (const contract of contracts) {
    const contractNode = { id: contract.id, label: contract.name, type: 'contract' as const }
    nodes.push(contractNode)
    links.push({ source: projectNodeId, target: contract.id, value: contract.allocation })

    const spentId = `${contract.id}-spent`
    nodes.push({ id: spentId, label: `${contract.name} Spend`, type: 'outflow' })
    links.push({ source: contract.id, target: spentId, value: contract.spent })
  }

  return { nodes, links }
}

const PROJECT_ID = 'diamer-basha'

const CONTRACT_DATA = {
  'mw-01-main-dam': {
    name: 'MW-01 Main Dam',
    allocation: 1850000000,
    spent: 1285000000,
    milestones: [
      { title: 'Cofferdam Works', actual: 320000000, paid: 320000000, status: 'Paid' },
      { title: 'Batching Plant Mobilisation', actual: 215000000, paid: 200000000, status: 'Processing' },
      { title: 'Grouting Galleries', actual: 145000000, paid: 145000000, status: 'Paid' },
      { title: 'Cement Procurement', actual: 98000000, paid: 65000000, status: 'Pending' },
    ],
  },
  'mw-02-rb-powerhouse': {
    name: 'MW-02 RB Powerhouse',
    allocation: 920000000,
    spent: 605000000,
    milestones: [
      { title: 'Excavation Package', actual: 210000000, paid: 210000000, status: 'Paid' },
      { title: 'Turbine Fabrication', actual: 165000000, paid: 125000000, status: 'Processing' },
      { title: 'Switchyard Civil Works', actual: 98000000, paid: 45000000, status: 'Awaiting Approval' },
    ],
  },
  'mw-02-lb-powerhouse': {
    name: 'MW-02 LB Powerhouse',
    allocation: 840000000,
    spent: 472000000,
    milestones: [
      { title: 'Penstock Fabrication', actual: 165000000, paid: 160000000, status: 'Paid' },
      { title: 'Transformer Foundations', actual: 90000000, paid: 60000000, status: 'Processing' },
      { title: 'Powerhouse Roofing', actual: 58000000, paid: 32000000, status: 'Scheduled' },
    ],
  },
} satisfies Record<string, { name: string; allocation: number; spent: number; milestones: Array<{ title: string; actual: number; paid: number; status: string }> }>

const totalAllocation = Object.values(CONTRACT_DATA).reduce((sum, item) => sum + item.allocation, 0)
const totalSpent = Object.values(CONTRACT_DATA).reduce((sum, item) => sum + item.spent, 0)

const baseIncoming: FinancialIncomingResponse = {
  available: [
    { id: 'TR-ACC-001', accountName: 'WAPDA Main Trust', fundsDeposited: 1200000000, dateOfDeposit: '2024-03-21' },
    { id: 'TR-ACC-002', accountName: 'Saudi Fund (Phase 2)', fundsDeposited: 650000000, dateOfDeposit: '2024-01-09' },
  ],
  expected: [
    { id: 'TR-EXP-101', accountName: 'ADB Tranche 3', fundsExpected: 430000000, expectedDateOfDeposit: '2024-07-30' },
    { id: 'TR-EXP-205', accountName: 'Chinese EXIM Facility', fundsExpected: 520000000, expectedDateOfDeposit: '2024-09-15' },
  ],
}

const baseOutgoing: FinancialOutgoingResponse = {
  actual: [
    { id: 'EXP-501', accountName: 'Civil Works Disbursement', expenseValue: 275000000, dateOfExpense: '2024-02-18' },
    { id: 'EXP-742', accountName: 'Equipment Logistics', expenseValue: 88000000, dateOfExpense: '2024-03-02' },
  ],
  expected: [
    { id: 'EXP-903', accountName: 'Powerhouse Fit-out', expectedExpenseValue: 165000000, expectedDateOfExpense: '2024-05-10' },
    { id: 'EXP-1012', accountName: 'Consultancy Fees Q3', expectedExpenseValue: 72000000, expectedDateOfExpense: '2024-08-01' },
  ],
}

const projectSummary: FinancialSummary = {
  ev: totalSpent,
  pv: totalAllocation * 0.82,
  ac: totalSpent * 0.95,
  spi: totalSpent / (totalAllocation * 0.82),
  cpi: totalSpent / (totalSpent * 0.95),
  burn_rate: totalSpent * 0.05,
  variance_abs: totalSpent - totalAllocation * 0.82,
  variance_pct: (totalSpent - totalAllocation * 0.82) / (totalAllocation * 0.82),
  as_of: new Date().toISOString(),
}

const projectAllocation: FinancialAllocationResponse = {
  project: makeAllocationRow('Diamer Basha Dam', totalAllocation, 'Approved'),
  contracts: Object.entries(CONTRACT_DATA).map(([id, info]) => makeAllocationRow(info.name, info.allocation, info.spent / info.allocation > 0.75 ? 'Running' : 'Under Approval', id)),
}

const projectExpenses: FinancialExpenseRow[] = Object.entries(CONTRACT_DATA).map(([id, info]) => {
  const balance = info.allocation - info.spent
  return makeExpenseRow(
    info.name,
    id.toUpperCase(),
    info.spent,
    info.spent * 0.92,
    balance,
    balance > info.allocation * 0.25 ? 'On Track' : 'Monitor',
    info.milestones.map((milestone, index) =>
      makeExpenseRow(
        milestone.title,
        `${id.toUpperCase()}-M${index + 1}`,
        milestone.actual,
        milestone.paid,
        Math.max(0, milestone.actual - milestone.paid),
        milestone.status,
      ),
    ),
  )
})

const projectFundFlow = makeFundFlow(PROJECT_ID, Object.entries(CONTRACT_DATA).map(([id, value]) => ({ id, name: value.name, allocation: value.allocation, spent: value.spent })))

const PROJECT_FALLBACK: ProjectFallback = {
  projectSummary,
  projectAllocation,
  projectExpenses,
  projectFundFlow,
  incoming: baseIncoming,
  outgoing: baseOutgoing,
  contracts: Object.fromEntries(
    Object.entries(CONTRACT_DATA).map(([id, info]) => {
      const contractSummary: FinancialSummary = {
        ev: info.spent,
        pv: info.allocation * 0.8,
        ac: info.spent * 0.94,
        spi: info.spent / (info.allocation * 0.8),
        cpi: info.spent / (info.spent * 0.94),
        burn_rate: info.spent * 0.06,
        variance_abs: info.spent - info.allocation * 0.8,
        variance_pct: (info.spent - info.allocation * 0.8) / (info.allocation * 0.8),
        as_of: new Date().toISOString(),
      }

      const allocation: FinancialAllocationResponse = {
        project: makeAllocationRow(info.name, info.allocation, info.spent / info.allocation > 0.75 ? 'Running' : 'Under Approval', id),
        contracts: [],
      }

      const expenses = [
        makeExpenseRow(info.name, id.toUpperCase(), info.spent, info.spent * 0.92, info.allocation - info.spent, 'Active', info.milestones.map((m, index) => makeExpenseRow(m.title, `${id.toUpperCase()}-M${index + 1}`, m.actual, m.paid, Math.max(0, m.actual - m.paid), m.status))),
      ]

      const fundFlow = makeFundFlow(id, [{ id: `${id}-fund`, name: info.name, allocation: info.allocation, spent: info.spent }])

      return [
        id,
        {
          summary: contractSummary,
          allocation,
          expenses,
          fundFlow,
          incoming: baseIncoming,
          outgoing: baseOutgoing,
        } satisfies ContractKey,
      ]
    }),
  ),
}

const FINANCIAL_FALLBACKS: Record<string, ProjectFallback> = {
  [PROJECT_ID]: PROJECT_FALLBACK,
}

export function getFinancialFallbackSummary(projectId: string, contractId?: string | null): FinancialSummary | null {
  const fallback = FINANCIAL_FALLBACKS[projectId]
  if (!fallback) return null
  if (contractId) {
    return fallback.contracts[contractId]?.summary ?? null
  }
  return fallback.projectSummary
}

export function getFinancialFallbackAllocation(projectId: string, contractId?: string | null): FinancialAllocationResponse | null {
  const fallback = FINANCIAL_FALLBACKS[projectId]
  if (!fallback) return null
  if (contractId) {
    return fallback.contracts[contractId]?.allocation ?? null
  }
  return fallback.projectAllocation
}

export function getFinancialFallbackExpenses(projectId: string, contractId?: string | null): FinancialExpenseRow[] | null {
  const fallback = FINANCIAL_FALLBACKS[projectId]
  if (!fallback) return null
  if (contractId) {
    return fallback.contracts[contractId]?.expenses ?? null
  }
  return fallback.projectExpenses
}

export function getFinancialFallbackFundFlow(projectId: string, contractId?: string | null): FinancialFundFlow | null {
  const fallback = FINANCIAL_FALLBACKS[projectId]
  if (!fallback) return null
  if (contractId) {
    return fallback.contracts[contractId]?.fundFlow ?? null
  }
  return fallback.projectFundFlow
}

export function getFinancialFallbackIncoming(projectId: string): FinancialIncomingResponse | null {
  return FINANCIAL_FALLBACKS[projectId]?.incoming ?? null
}

export function getFinancialFallbackOutgoing(projectId: string, contractId?: string | null): FinancialOutgoingResponse | null {
  const fallback = FINANCIAL_FALLBACKS[projectId]
  if (!fallback) return null
  if (contractId) {
    return fallback.contracts[contractId]?.outgoing ?? null
  }
  return fallback.outgoing
}

