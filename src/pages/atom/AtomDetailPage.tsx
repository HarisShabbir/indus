import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { SidebarNav, sidebarItems, ACCS_NAV_INDEX, CHANGE_NAV_INDEX, HOME_NAV_INDEX, type ThemeMode } from '../../layout/navigation'
import TopBar from '../../layout/TopBar'
import TopBarGlobalActions from '../../layout/TopBarActions'
import { applyTheme, resolveInitialTheme, toggleThemeValue } from '../../utils/theme'
import AtomDetailView, { getAtomDetail, getAtomDetailKeyFromParams } from './components/AtomDetailView'
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
import { hasAtomDetail } from './data/atomDetailLibrary'

type DetailLocationState = {
  from?: 'atom-manager'
  role?: 'client' | 'contractor'
  projectId?: string | null
  projectName?: string | null
  contractId?: string | null
  sowId?: string | null
  processId?: string | null
} | null

const countItems = (node: NavNode | undefined): number => {
  if (!node) return 0
  let total = node.kind === 'item' ? 1 : 0
  if (node.children) {
    total += node.children.reduce((acc, child) => acc + countItems(child), 0)
  }
  return total
}

export default function AtomDetailPage(): JSX.Element {
  const { slug } = useParams<{ slug: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state as DetailLocationState) ?? null

  const detailKey = getAtomDetailKeyFromParams(slug ?? null)
  const detail = useMemo(() => getAtomDetail(detailKey), [detailKey])
  const detailMatch = useMemo(() => (detailKey ? findNavNodeByDetailKey(detailKey) : null), [detailKey])

  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme())
  const [activeNavIndex, setActiveNavIndex] = useState(ACCS_NAV_INDEX)

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
    if (index === HOME_NAV_INDEX) {
      navigate('/')
      return
    }
    if (index === CHANGE_NAV_INDEX) {
      navigate('/change-management', {
        state: {
          projectId: viewContext.projectId,
          contractId: viewContext.contractId,
          sowId: viewContext.sowId,
          processId: viewContext.processId,
        },
      })
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

  const breadcrumbs = useMemo(
    () => [
      { label: 'Dashboard', onClick: () => navigate('/', { state: { openView: 'dashboard' } }) },
      {
        label: 'Atom Manager',
        onClick: () =>
          navigate('/atoms', {
            replace: false,
            state: viewContext,
          }),
      },
      detail ? { label: `${detail.info.subClass2} · ${detail.info.provider}`, onClick: undefined } : { label: 'Atom Detail' },
      detail ? { label: detail.info.atomName, isCurrent: true } : { label: 'Not found', isCurrent: true },
    ],
    [detail, navigate, viewContext],
  )

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

          <div className="atom-detail-layout">
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

            {detailKey ? (
              <AtomDetailView detailKey={detailKey} />
            ) : (
              <section className="atom-detail atom-detail--empty">
                <p>The requested atom could not be found. Return to the Atom Manager to select another item.</p>
                <button type="button" className="btn-primary" onClick={() => navigate('/atoms')}>
                  Back to Atom Manager
                </button>
              </section>
            )}
          </div>
        </div>
      </div>
      <AtomUtilityDock activeView="manager" scopeState={dockScopeState} />
    </div>
  )
}
