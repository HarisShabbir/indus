import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { SidebarNav, sidebarItems, ACCS_NAV_INDEX, type ThemeMode } from '../../layout/navigation'
import TopBar from '../../layout/TopBar'
import TopBarGlobalActions from '../../layout/TopBarActions'
import { applyTheme, resolveInitialTheme, toggleThemeValue } from '../../utils/theme'
import { fetchAtomExperience, fetchAtomManifestation, type AtomExperienceResponse, type AtomManifestationResponse } from '../../api'
import { getCategoryIcon } from './components/categoryIcons'
import AtomNavTree from './components/AtomNavTree'
import AtomUtilityDock from './components/AtomUtilityDock'
import {
  CATEGORY_ORDER,
  DEFAULT_EXPANDED_IDS,
  NAV_CATEGORY_MAP,
  NAV_PARENT_MAP,
  NAV_TREE,
  findNavIdForCategory,
  findNavNodeByDetailKey,
  type NavNode,
} from './data/atomNavigation'
import { hasAtomDetail, type AtomDetailContent } from './data/atomDetailLibrary'
import { resolveAtomExperienceConfig } from './data/atomExperienceMap'
import { getAtomDetailKeyFromParams } from './components/AtomDetailView'
import { MobilizationNodesBoard, ExecutionDashboard } from './components/ExperienceLayouts'

type DetailLocationState = {
  from?: 'atom-manager'
  role?: 'client' | 'contractor'
  projectId?: string | null
  projectName?: string | null
  contractId?: string | null
  sowId?: string | null
  processId?: string | null
} | null

type TabKey = 'info' | 'manifestation' | 'mobilization' | 'execution'

type ExperienceState = {
  loading: boolean
  data: AtomExperienceResponse | null
  error: string | null
}

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'info', label: 'Info' },
  { key: 'manifestation', label: 'Manifestation' },
  { key: 'mobilization', label: 'Mobilization' },
  { key: 'execution', label: 'Execution' },
]

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const countItems = (node: NavNode | undefined): number => {
  if (!node) return 0
  let total = node.kind === 'item' ? 1 : 0
  if (node.children) {
    total += node.children.reduce((acc, child) => acc + countItems(child), 0)
  }
  return total
}

function formatAttributeValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number') return Number.isInteger(value) ? value.toString() : value.toFixed(1)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) {
    return value.map((item) => formatAttributeValue(item)).join(', ')
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${key.replace(/_/g, ' ')}: ${formatAttributeValue(val)}`)
      .join(' • ')
  }
  return String(value)
}

function ManifestationPanel({
  loading,
  error,
  manifestation,
  experience,
}: {
  loading: boolean
  error: string | null
  manifestation: AtomManifestationResponse | null
  experience: AtomExperienceResponse | null
}) {
  if (loading) {
    return <div className="atom-experience-panel"><p className="atom-experience-placeholder">Loading manifestation data…</p></div>
  }
  if (error) {
    return (
      <div className="atom-experience-panel">
        <p className="atom-experience-error">{error}</p>
      </div>
    )
  }
  if (!manifestation) {
    const category = experience?.info.category?.toLowerCase()
    if (category === 'actors') {
      const attributeMap = new Map(
        (experience?.attributes ?? []).map((attr) => [attr.label.toLowerCase(), attr.value as Record<string, unknown>]),
      )
      const demographics = (attributeMap.get('demographics') ?? {}) as Record<string, unknown>
      const governance = (attributeMap.get('governance') ?? {}) as Record<string, unknown>
      const complianceRaw = Number(governance.complianceScore ?? 0.96)
      const compliancePercent = `${Math.max(0, Math.min(100, complianceRaw * 100)).toFixed(1)}%`
      return (
        <div className="atom-experience-panel actor-manifest">
          <section>
            <header>
              <h4>Demographic profile</h4>
            </header>
            <dl>
              <div>
                <dt>Jurisdiction</dt>
                <dd>{(demographics['jurisdiction'] as string) ?? 'Government of Pakistan'}</dd>
              </div>
              <div>
                <dt>Project office</dt>
                <dd>{(demographics['projectOffice'] as string) ?? 'Diamer Dam Site'}</dd>
              </div>
              <div>
                <dt>Executive sponsor</dt>
                <dd>{(demographics['executiveSponsor'] as string) ?? 'Chairman WAPDA'}</dd>
              </div>
            </dl>
          </section>
          <section>
            <header>
              <h4>Governance signals</h4>
            </header>
            <ul>
              <li>Approval SLA: {governance['approvalSLAHours'] ?? 48} hours</li>
              <li>Pending change requests: {governance['pendingChangeRequests'] ?? 3}</li>
              <li>Compliance score: {compliancePercent}</li>
            </ul>
          </section>
        </div>
      )
    }
    return (
      <div className="atom-experience-panel">
        <p className="atom-experience-placeholder">Select a vendor-backed atom to view manifestation details.</p>
      </div>
    )
  }
  return (
    <div className="atom-experience-panel">
      <div className="atom-detail__panel atom-detail__panel--table">
        <table className="atom-detail__table">
          <thead>
            <tr>
              <th>Attribute</th>
              <th>Value</th>
              <th>Units</th>
            </tr>
          </thead>
          <tbody>
            {manifestation.attributes.map((attribute) => (
              <tr key={attribute.id}>
                <td>{attribute.name}</td>
                <td>{attribute.value ?? '—'}</td>
                <td>{attribute.units ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function InfoPanel({
  experience,
  description,
  image,
  heroLabel,
  library,
}: {
  experience: AtomExperienceResponse
  description: string | null
  image: string | null
  heroLabel?: string
  library: AtomDetailContent | null
}) {
  const identityRows = useMemo(() => {
    const info = experience.info
    const libraryInfo = library?.info
    return [
      { label: 'Atom ID', value: info.atomId },
      { label: 'Type', value: info.typeName || libraryInfo?.subClass2 || '—' },
      { label: 'Provider', value: libraryInfo?.provider || info.contractor || '—' },
      { label: 'Owner', value: libraryInfo?.owner || 'Operations' },
      { label: 'Home Entity', value: info.homeCode ? `${info.homeCode} (${info.homeLevel ?? 'Level'})` : '—' },
    ]
  }, [experience.info])

  const backendAttributes = experience.attributes
  const specEntries = Object.entries(experience.info.spec ?? {})
  const libraryAttributes = library?.attributes ?? []

  return (
    <div className="atom-experience-panel">
      <section className="atom-experience-hero">
        {image ? (
          <figure>
            <img src={image} alt={`${experience.info.name} visual`} />
          </figure>
        ) : null}
        <div className="atom-experience-hero__body">
          <span>{heroLabel ?? 'Atom Overview'}</span>
          <h3>{experience.info.name}</h3>
          <p>{description ?? 'Operational profile generated from latest telematics and mobilization sources.'}</p>
          <div className="atom-experience-identity">
            {identityRows.map((row) => (
              <div key={row.label}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="atom-experience-attributes">
        <h4>Key Attributes</h4>
        <div className="atom-experience-attributes__grid">
          {backendAttributes.length === 0 && specEntries.length === 0 && libraryAttributes.length === 0 ? (
            <p className="atom-experience-placeholder">No attribute metadata captured for this atom yet.</p>
          ) : null}
          {backendAttributes.map((attribute) => (
            <article key={attribute.id}>
              <span>{attribute.label}</span>
              <strong>{formatAttributeValue(attribute.value)}</strong>
            </article>
          ))}
          {libraryAttributes.map((attribute) => (
            <article key={attribute.label}>
              <span>{attribute.label}</span>
              <strong>{attribute.value}</strong>
            </article>
          ))}
          {specEntries.map(([label, value]) => (
            <article key={label}>
              <span>{label.replace(/_/g, ' ')}</span>
              <strong>{formatAttributeValue(value)}</strong>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

export default function AtomDetailExperiencePage(): JSX.Element {
  const { slug } = useParams<{ slug: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state as DetailLocationState) ?? null

  const detailKey = getAtomDetailKeyFromParams(slug ?? null)
  const detailMatch = useMemo(() => (detailKey ? findNavNodeByDetailKey(detailKey) : null), [detailKey])
  const config = useMemo(() => resolveAtomExperienceConfig(detailKey), [detailKey])

  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme())
  const [activeNavIndex, setActiveNavIndex] = useState(ACCS_NAV_INDEX)
  const [activeTab, setActiveTab] = useState<TabKey>('info')

  const firstCategoryId = CATEGORY_ORDER[0]?.id ?? 'materials'

  const [expandedNav, setExpandedNav] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {}
    DEFAULT_EXPANDED_IDS.forEach((id) => {
      map[id] = true
    })
    detailMatch?.path.forEach((id) => {
      map[id] = true
    })
    return map
  })
  const [selectedNavId, setSelectedNavId] = useState<string>(detailMatch?.node.id ?? NAV_TREE[0].id)
  const [activeCategory, setActiveCategory] = useState<string>(() => {
    if (detailMatch) {
      const category = NAV_CATEGORY_MAP.get(detailMatch.node.id)
      if (category) return category
    }
    return firstCategoryId
  })

  const navTotals = useMemo(() => {
    const totals: Record<string, { total: number; engaged: number; idle: number }> = {}
    CATEGORY_ORDER.forEach(({ id }) => {
      const node = NAV_TREE.find((candidate) => candidate.id === id)
      totals[id] = {
        total: countItems(node),
        engaged: 0,
        idle: 0,
      }
    })
    return totals
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const viewContext = {
    from: 'atom-manager' as const,
    role: state?.role ?? 'client',
    projectId: state?.projectId ?? null,
    projectName: state?.projectName ?? null,
    contractId: state?.contractId ?? null,
    sowId: state?.sowId ?? null,
    processId: state?.processId ?? null,
  }

  const handleThemeToggle = () => setTheme((prev) => toggleThemeValue(prev))
  const handleNavSelect = (index: number) => {
    setActiveNavIndex(index)
    if (index === sidebarItems.findIndex((item) => item.label === 'Home')) {
      navigate('/')
    }
  }

  const scopeForActions = {
    projectId: viewContext.projectId,
    projectName: viewContext.projectName,
    contractId: viewContext.contractId,
    sowId: viewContext.sowId,
    processId: viewContext.processId,
  }

  const dockScopeState = useMemo(
    () => ({
      projectId: viewContext.projectId,
      projectName: viewContext.projectName,
      contractId: viewContext.contractId,
      sowId: viewContext.sowId,
      processId: viewContext.processId,
      role: viewContext.role,
    }),
    [viewContext.contractId, viewContext.processId, viewContext.projectId, viewContext.projectName, viewContext.role, viewContext.sowId],
  )

  const scopeTitle = viewContext.projectName ?? 'Portfolio catalog'
  const scopeSubtitle = viewContext.projectName ? 'Project repository' : 'Atom repository'

  const expandAncestors = useCallback((nodeId: string) => {
    setExpandedNav((prev) => {
      const next = { ...prev }
      let current: string | null | undefined = NAV_PARENT_MAP.get(nodeId)
      while (current) {
        next[current] = true
        current = NAV_PARENT_MAP.get(current)
      }
      return next
    })
  }, [])

  const handleNavToggle = useCallback((id: string) => {
    setExpandedNav((prev) => ({
      ...prev,
      [id]: !(prev[id] ?? true),
    }))
  }, [])

  const handleNavSelectNode = useCallback(
    (node: NavNode) => {
      expandAncestors(node.id)
      setSelectedNavId(node.id)
      const category = NAV_CATEGORY_MAP.get(node.id)
      if (category) {
        setActiveCategory(category)
      }
      if (node.detailKey && hasAtomDetail(node.detailKey)) {
        navigate(`/atoms/catalog/${encodeURIComponent(node.detailKey)}`, {
          replace: true,
          state: viewContext,
        })
        return
      }
      if (node.children && node.children.length && node.kind !== 'item') {
        setExpandedNav((prev) => ({
          ...prev,
          [node.id]: !(prev[node.id] ?? true),
        }))
      }
    },
    [expandAncestors, navigate, viewContext],
  )

  const breadcrumbs = useMemo(() => {
    const libraryInfo = config.library?.info
    return [
      { label: 'Dashboard', onClick: () => navigate('/', { state: { openView: 'dashboard' } }) },
      {
        label: 'Atom Manager',
        onClick: () =>
          navigate('/atoms', {
            replace: false,
            state: viewContext,
          }),
      },
      libraryInfo
        ? { label: `${libraryInfo.subClass2} · ${libraryInfo.provider}`, onClick: undefined }
        : { label: 'Atom Detail', onClick: undefined },
      libraryInfo ? { label: libraryInfo.atomName, isCurrent: true } : { label: detailKey ?? 'Not found', isCurrent: true },
    ]
  }, [config.library, detailKey, navigate, viewContext])

  useEffect(() => {
    if (!detailKey) {
      setSelectedNavId(NAV_TREE[0].id)
      setActiveCategory(firstCategoryId)
      return
    }
    const match = findNavNodeByDetailKey(detailKey)
    if (!match) return
    setSelectedNavId(match.node.id)
    setExpandedNav((prev) => {
      const next = { ...prev }
      match.path.forEach((id) => {
        next[id] = true
      })
      return next
    })
    const category = NAV_CATEGORY_MAP.get(match.node.id)
    if (category) {
      setActiveCategory(category)
    }
  }, [detailKey, firstCategoryId])

  const [experienceState, setExperienceState] = useState<ExperienceState>(() => ({
    loading: Boolean(config.atomUuid),
    data: null,
    error: null,
  }))
  const [manifestation, setManifestation] = useState<AtomManifestationResponse | null>(null)
  const [manifestationLoading, setManifestationLoading] = useState(false)
  const [manifestationError, setManifestationError] = useState<string | null>(null)

  useEffect(() => {
    if (!config.atomUuid) {
      setExperienceState({ loading: false, data: null, error: null })
      return
    }
    let cancelled = false
    setExperienceState({ loading: true, data: null, error: null })
    fetchAtomExperience(config.atomUuid)
      .then((data) => {
        if (cancelled) return
        setExperienceState({ loading: false, data, error: null })
      })
      .catch((error) => {
        if (cancelled) return
        setExperienceState({ loading: false, data: null, error: error instanceof Error ? error.message : 'Unable to load atom insight.' })
      })

    return () => {
      cancelled = true
    }
  }, [config.atomUuid])

  useEffect(() => {
    if (activeTab !== 'manifestation') return
    const source = config.library?.manifestationSource
    if (!source) return
    setManifestationLoading(true)
    setManifestationError(null)
    fetchAtomManifestation({
      vendor: source.vendor,
      machineType: source.machineType,
      model: source.model,
    })
      .then((data) => {
        setManifestation(data)
      })
      .catch((error) => {
        setManifestationError(error instanceof Error ? error.message : 'Failed to load manifestation data.')
      })
      .finally(() => setManifestationLoading(false))
  }, [activeTab, config.library])

  const experience = experienceState.data

  return (
    <div className="atom-manager" data-theme={theme}>
      <SidebarNav activeIndex={activeNavIndex} onSelect={handleNavSelect} theme={theme} onToggleTheme={handleThemeToggle} />
      <div className="app-shell topbar-layout">
        <TopBar breadcrumbs={breadcrumbs} actions={<TopBarGlobalActions theme={theme} onToggleTheme={handleThemeToggle} scope={scopeForActions} />} />
        <div className="atom-stage atom-stage--single atom-stage--docked">
          <aside className="atom-left">
            <header className="atom-left__header">
              <h2>{scopeTitle}</h2>
              <p>{scopeSubtitle}</p>
            </header>
            <div className="atom-nav__scroll">
              <AtomNavTree
                nodes={NAV_TREE}
                expanded={expandedNav}
                onToggle={handleNavToggle}
                onSelect={handleNavSelectNode}
                selectedId={selectedNavId}
                totals={navTotals}
                activeCategory={activeCategory}
              />
            </div>
          </aside>

          <div className="atom-detail-layout atom-detail-layout--experience">
            <div className="atom-filter-row atom-filter-row--detail">
              <span>Groups</span>
              <div>
                {CATEGORY_ORDER.map(({ id, label }) => {
                  const isActive = activeCategory === id
                  const icon = getCategoryIcon(id)
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`atom-group-chip ${isActive ? 'is-active' : ''}`}
                      onClick={() => {
                        setActiveCategory(id)
                        const navId = findNavIdForCategory(id)
                        if (navId) {
                          expandAncestors(navId)
                          setSelectedNavId(navId)
                          setExpandedNav((prev) => ({ ...prev, [navId]: true }))
                        }
                      }}
                    >
                      <span className="atom-group-chip__icon">{icon}</span>
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="atom-detail atom-detail--experience">
              <header className="atom-experience-header">
                <div>
                  <h3>{config.library?.info.atomName ?? experience?.info.name ?? 'Atom Detail'}</h3>
                  <span>
                    {config.library?.info.mainClass ?? experience?.info.category}
                    {config.library?.info.subClass2 ? ` · ${config.library.info.subClass2}` : null}
                  </span>
                </div>
                <div className="atom-detail__meta">
                  <span>Atom ID · {config.library?.info.atomId ?? experience?.info.atomId ?? '—'}</span>
                  {config.library?.info.provider ? <span>Provider · {config.library.info.provider}</span> : null}
                  {config.library?.info.owner ? <span>Owner · {config.library.info.owner}</span> : null}
                </div>
              </header>

              <div className="atom-detail__tabs" role="tablist">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.key}
                    className={`atom-detail__tab ${activeTab === tab.key ? 'is-active' : ''}`}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {experienceState.loading ? (
                <div className="atom-experience-panel">
                  <p className="atom-experience-placeholder">Loading atom insights…</p>
                </div>
              ) : null}

              {experienceState.error ? (
                <div className="atom-experience-panel">
                  <p className="atom-experience-error">{experienceState.error}</p>
                </div>
              ) : null}

              {!experienceState.loading && !experienceState.error && !experience ? (
                <div className="atom-experience-panel">
                  <p className="atom-experience-placeholder">
                    Select an atom with telemetry data to explore the detailed experience. (No dataset mapped for <code>{detailKey}</code>.)
                  </p>
                </div>
              ) : null}

              {experience && activeTab === 'info' ? (
                <InfoPanel
                  experience={experience}
                  description={config.description}
                  image={config.image}
                  heroLabel={config.heroLabel}
                  library={config.library}
                />
              ) : null}

              {experience && activeTab === 'mobilization' ? <MobilizationNodesBoard experience={experience} /> : null}

              {experience && activeTab === 'execution' ? (
                <ExecutionDashboard experience={experience} image={config.image} library={config.library} />
              ) : null}

              {activeTab === 'manifestation' ? (
                <ManifestationPanel
                  loading={manifestationLoading}
                  error={manifestationError}
                  manifestation={manifestation}
                  experience={experience}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <AtomUtilityDock activeView="manager" scopeState={dockScopeState} />
    </div>
  )
}
