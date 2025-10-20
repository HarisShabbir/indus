import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import Breadcrumbs from '../../components/breadcrumbs/Breadcrumbs'
import {
  fetchAtomDeployments,
  fetchAtomRepository,
  fetchAtomSummary,
  type AtomDeploymentRecord,
  type AtomRepositoryNode,
  type AtomSummaryCard,
  type AtomSummaryResponse,
} from '../../api'
import { SidebarNav, sidebarItems, ACCS_NAV_INDEX, ThemeToggleButton, type ThemeMode } from '../../layout/navigation'
import { FEATURE_ATOM_MANAGER } from '../../config'

type LocationState = {
  projectId?: string
  projectName?: string
  contractId?: string | null
  contractName?: string | null
  sowId?: string | null
  processId?: string | null
  role?: 'client' | 'contractor'
} | null

type ScopeOption = {
  label: string
  level: 'project' | 'contract' | 'sow' | 'process'
  projectId: string
  contractId?: string | null
  sowId?: string | null
  processId?: string | null
}

type TreeNode = AtomRepositoryNode & { children: TreeNode[] }

const CATEGORY_ORDER: Array<{ id: string; label: string; tag: string }> = [
  { id: 'actors', label: 'Actors', tag: 'People' },
  { id: 'materials', label: 'Materials & Elements', tag: 'Materials' },
  { id: 'machinery', label: 'Machinery', tag: 'Machinery' },
  { id: 'consumables', label: 'Consumables', tag: 'Consumables' },
  { id: 'tools', label: 'Tools', tag: 'Tools' },
  { id: 'equipment', label: 'Equipment', tag: 'Equipment' },
  { id: 'systems', label: 'Systems', tag: 'Systems' },
  { id: 'technologies', label: 'Technologies', tag: 'Technologies' },
  { id: 'financials', label: 'Financials', tag: 'Financials' },
]

const TAG_MAPPING: Record<string, string[]> = {
  People: ['actors'],
  Materials: ['materials'],
  Consumables: ['consumables'],
  Machinery: ['machinery'],
  Tools: ['tools'],
  Equipment: ['equipment'],
  Systems: ['systems'],
  Technologies: ['technologies'],
  Financials: ['financials'],
}

const formatNumber = (value: number) =>
  value >= 1000 ? `${Math.round(value / 10) / 100}k` : value.toLocaleString(undefined, { maximumFractionDigits: 0 })

const formatDate = (value: string | null) => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleDateString()
}

const buildTree = (nodes: AtomRepositoryNode[]): TreeNode[] => {
  const map = new Map<string, TreeNode>()
  const roots: TreeNode[] = []

  nodes.forEach((node) => {
    map.set(node.id, { ...node, children: [] })
  })

  nodes.forEach((node) => {
    const treeNode = map.get(node.id)!
    if (!node.parentId) {
      roots.push(treeNode)
    } else {
      const parent = map.get(node.parentId)
      if (parent) {
        parent.children.push(treeNode)
      } else {
        roots.push(treeNode)
      }
    }
  })

  return roots
}

const ratio = (numerator: number, denominator: number) => {
  if (denominator <= 0) return 0
  return Math.max(0, Math.min(1, numerator / denominator))
}

function TreeSection({
  nodes,
  activeCategory,
  onCategorySelect,
}: {
  nodes: TreeNode[]
  activeCategory: string | null
  onCategorySelect: (category: string) => void
}) {
  return (
    <div className="atom-tree">
      {nodes.map((node) => {
        const expanded = activeCategory === node.id
        return (
          <div key={node.id} className="atom-tree__section">
            <button
              type="button"
              className={`atom-tree__category ${expanded ? 'active' : ''}`}
              onClick={() => onCategorySelect(node.id)}
            >
              <span>{node.name}</span>
              <span>{node.total}</span>
            </button>
            {expanded && (
              <div className="atom-tree__content">
                {node.children.map((child) => (
                  <TreeGroup key={child.id} node={child} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TreeGroup({ node }: { node: TreeNode }) {
  const [expanded, setExpanded] = useState(true)
  return (
    <div className="atom-tree__group">
      <button type="button" className="atom-tree__group-toggle" onClick={() => setExpanded((prev) => !prev)}>
        <span>{node.name}</span>
        <span>{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <ul>
          {node.children.map((child) => (
            <li key={child.id}>
              <span>{child.name}</span>
              <span>{child.total}</span>
              {child.children.length > 0 && (
                <ul>
                  {child.children.map((atom) => (
                    <li key={atom.id} className="atom-tree__item">
                      <span>{atom.name}</span>
                      <span>{atom.total}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SummaryCards({ cards, filters }: { cards: AtomSummaryCard[]; filters: Set<string> }) {
  const visible = useMemo(() => {
    if (!filters.size) return cards
    return cards.filter((card) => filters.has(card.category))
  }, [cards, filters])

  return (
    <div className="atom-cards">
      {visible.map((card) => {
        const engagedRatio = ratio(card.engaged, Math.max(1, card.total))
        const idleRatio = ratio(card.idle, Math.max(1, card.total))
        return (
          <article key={card.category} className="atom-card">
            <header>
              <h3>{card.label}</h3>
              <span>Total {formatNumber(card.total)}</span>
            </header>
            <div className="atom-card__metrics">
              <div>
                <span>No. Engaged</span>
                <strong>{formatNumber(card.engaged)}</strong>
              </div>
              <div>
                <span>Idle</span>
                <strong>{formatNumber(card.idle)}</strong>
              </div>
            </div>
            <div className="atom-card__bar">
              <div className="atom-card__bar-engaged" style={{ width: `${Math.round(engagedRatio * 100)}%` }} />
              <div className="atom-card__bar-idle" style={{ width: `${Math.round(idleRatio * 100)}%` }} />
            </div>
            <footer>
              <span>Engagement trend</span>
              <div className="atom-card__trend">
                {card.trend.map((value, index) => (
                  <span key={`${card.category}-trend-${index}`} style={{ height: `${Math.round(value * 80 + 20)}%` }} />
                ))}
              </div>
            </footer>
          </article>
        )
      })}
    </div>
  )
}

function DeploymentList({ deployments }: { deployments: AtomDeploymentRecord[] }) {
  if (!deployments.length) {
    return <div className="atom-deployments__empty">No active deployments in this scope.</div>
  }
  return (
    <table className="atom-deployments">
      <thead>
        <tr>
          <th>Atom</th>
          <th>Type</th>
          <th>Category</th>
          <th>Process</th>
          <th>Status</th>
          <th>Started</th>
          <th>Closed</th>
        </tr>
      </thead>
      <tbody>
        {deployments.map((deployment) => (
          <tr key={deployment.deploymentId}>
            <td>{deployment.atomName}</td>
            <td>{deployment.atomType}</td>
            <td className="capitalize">{deployment.category}</td>
            <td>{deployment.processName}</td>
            <td className={`status status-${deployment.status}`}>{deployment.status}</td>
            <td>{formatDate(deployment.startTs)}</td>
            <td>{formatDate(deployment.endTs)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function AtomManagerPage(): JSX.Element | null {
  const { id: routeContractId } = useParams<{ id?: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state as LocationState) ?? null
  const [theme, setTheme] = useState<ThemeMode>('light')
  const [activeTagFilters, setActiveTagFilters] = useState<Set<string>>(new Set())
  const [repositoryNodes, setRepositoryNodes] = useState<TreeNode[]>([])
  const [summary, setSummary] = useState<AtomSummaryResponse | null>(null)
  const [deployments, setDeployments] = useState<AtomDeploymentRecord[]>([])
  const [loadingRepo, setLoadingRepo] = useState(false)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [loadingDeployments, setLoadingDeployments] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const projectId = state?.projectId ?? 'diamer-basha'
  const projectName = state?.projectName ?? 'Diamer Basha Dam'
  const contractId = routeContractId ?? state?.contractId ?? null
  const contractName = state?.contractName ?? null
  const sowId = state?.sowId ?? null
  const processId = state?.processId ?? null
  const role = state?.role ?? 'client'

  const scopeOptions: ScopeOption[] = useMemo(() => {
    const options: ScopeOption[] = [
      { label: projectName, level: 'project', projectId },
    ]
    if (contractId) {
      options.push({ label: contractName ?? contractId, level: 'contract', projectId, contractId })
    }
    if (sowId) {
      options.push({ label: sowId, level: 'sow', projectId, contractId, sowId })
    }
    if (processId) {
      options.push({ label: processId, level: 'process', projectId, contractId, sowId, processId })
    }
    return options
  }, [contractId, contractName, processId, projectId, projectName, sowId])

  const [activeScope, setActiveScope] = useState<ScopeOption>(() => scopeOptions[scopeOptions.length - 1])

  useEffect(() => {
    setActiveScope(scopeOptions[scopeOptions.length - 1])
  }, [scopeOptions])

  useEffect(() => {
    if (!FEATURE_ATOM_MANAGER) {
      navigate('/', { replace: true })
    }
  }, [navigate])

  useEffect(() => {
    setLoadingRepo(true)
    setError(null)
    fetchAtomRepository({ projectId, contractId })
      .then((data) => {
        const tree = buildTree(data.nodes)
        setRepositoryNodes(tree)
        if (!activeCategory && tree.length) {
          setActiveCategory(tree[0].id)
        }
      })
      .catch((err) => {
        console.error('Failed to load atom repository', err)
        setError('Unable to load atom repository.')
      })
      .finally(() => setLoadingRepo(false))
  }, [projectId, contractId, activeCategory])

  useEffect(() => {
    if (!activeScope) return
    setLoadingSummary(true)
    setError(null)
    fetchAtomSummary({
      projectId: activeScope.projectId,
      contractId: activeScope.contractId,
      sowId: activeScope.sowId,
      processId: activeScope.processId,
    })
      .then((data) => {
        setSummary(data)
      })
      .catch((err) => {
        console.error('Failed to load atom summary', err)
        setError('Unable to load atom summary right now.')
      })
      .finally(() => setLoadingSummary(false))
  }, [activeScope])

  useEffect(() => {
    if (!activeScope) return
    setLoadingDeployments(true)
    setError(null)
    fetchAtomDeployments({
      projectId: activeScope.projectId,
      contractId: activeScope.contractId,
      sowId: activeScope.sowId,
      processId: activeScope.processId,
    })
      .then((data) => setDeployments(data.deployments))
      .catch((err) => {
        console.error('Failed to load atom deployments', err)
        setError('Unable to load deployment data.')
      })
      .finally(() => setLoadingDeployments(false))
  }, [activeScope])

  const breadcrumbs = useMemo(
    () => [
      { label: 'Dashboard', onClick: () => navigate('/', { state: { openView: 'dashboard' } }) },
      { label: projectName.replace(/\s+/g, '_'), onClick: () => navigate('/', { state: { openView: 'contract', projectId } }) },
      { label: 'Construction Control Center', onClick: () => navigate('/', { state: { openView: 'contract', projectId } }) },
      { label: 'Atom Manager' },
    ],
    [navigate, projectId, projectName],
  )

  const handleThemeToggle = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))

  const [activeNavIndex, setActiveNavIndex] = useState(ACCS_NAV_INDEX)
  const handleNavSelect = (index: number) => {
    setActiveNavIndex(index)
    if (index === sidebarItems.findIndex((item) => item.label === 'Home')) {
      navigate('/')
    }
  }

  const tagFilters = useMemo(() => Object.keys(TAG_MAPPING), [])

  const cards = summary?.cards ?? []

  return (
    <div className="atom-manager" data-theme={theme}>
      <SidebarNav activeIndex={activeNavIndex} onSelect={handleNavSelect} theme={theme} onToggleTheme={handleThemeToggle} />
      <div className="atom-stage">
        <aside className="atom-left">
          <header className="atom-left__header">
            <h2>{projectName}</h2>
            <p>{contractName ?? 'Project repository'}</p>
          </header>
          {loadingRepo ? (
            <div className="atom-loading">Loading repository…</div>
          ) : (
            <div className="atom-tree__scroll">
              <TreeSection nodes={repositoryNodes.filter((node) => node.level === 'category')} activeCategory={activeCategory} onCategorySelect={setActiveCategory} />
            </div>
          )}
        </aside>

        <main className="atom-main">
          <header className="atom-main__header">
            <Breadcrumbs items={breadcrumbs} />
            <div className="atom-scope">
              <label htmlFor="atom-scope-select">Scope</label>
              <select
                id="atom-scope-select"
                value={activeScope.level}
                onChange={(event) => {
                  const option = scopeOptions.find((item) => item.level === event.target.value)
                  if (option) {
                    setActiveScope(option)
                  }
                }}
              >
                {scopeOptions.map((option) => (
                  <option key={option.level} value={option.level}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </header>

          <div className="atom-filter-row">
            <span>Types</span>
            <div>
              {tagFilters.map((tag) => {
                const active = activeTagFilters.has(TAG_MAPPING[tag][0])
                return (
                  <button
                    key={tag}
                    type="button"
                    className={`atom-filter-chip ${active ? 'active' : ''}`}
                    onClick={() => {
                      const next = new Set(activeTagFilters)
                      const categories = TAG_MAPPING[tag]
                      if (active) {
                        categories.forEach((category) => next.delete(category))
                      } else {
                        categories.forEach((category) => next.add(category))
                      }
                      setActiveTagFilters(next)
                    }}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          </div>

          {error && <div className="atom-error">{error}</div>}

          {loadingSummary ? <div className="atom-loading">Loading summary…</div> : <SummaryCards cards={cards} filters={activeTagFilters} />}
        </main>

        <aside className="atom-right">
          <div className="atom-right__header">
            <h3>Deployments</h3>
            <span>{scopeOptions.find((item) => item.level === activeScope.level)?.label}</span>
          </div>
          {loadingDeployments ? <div className="atom-loading">Loading deployments…</div> : <DeploymentList deployments={deployments} />}
          {role !== 'contractor' && <p className="atom-right__hint">Sign in as contractor to modify deployments.</p>}
        </aside>
      </div>
    </div>
  )
}

