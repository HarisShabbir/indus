import React from 'react'

import { formatNumber } from '../utils'
import { NAV_CATEGORY_MAP, type NavNode } from '../data/atomNavigation'

type AtomNavTreeProps = {
  nodes: NavNode[]
  depth?: number
  expanded: Record<string, boolean>
  onToggle: (id: string) => void
  onSelect: (node: NavNode) => void
  selectedId: string
  totals: Record<string, { total: number; engaged: number; idle: number }>
  activeCategory: string
}

const AtomNavTree: React.FC<AtomNavTreeProps> = ({
  nodes,
  depth = 0,
  expanded,
  onToggle,
  onSelect,
  selectedId,
  totals,
  activeCategory,
}) => {
  return (
    <ul className={`atom-nav__list depth-${depth}`}>
      {nodes.map((node) => {
        const hasChildren = Boolean(node.children && node.children.length)
        const isExpanded = hasChildren ? expanded[node.id] !== false : false
        const nodeCategory = NAV_CATEGORY_MAP.get(node.id)
        const totalsForCategory = nodeCategory ? totals[nodeCategory] : undefined
        const isSelected = selectedId === node.id || (node.kind === 'category' && node.id === activeCategory)

        return (
          <li key={node.id} className={`atom-nav__item atom-nav__item--${node.kind} ${isSelected ? 'is-active' : ''}`}>
            <div className="atom-nav__row" style={{ paddingLeft: `${depth * 16}px` }}>
              {hasChildren ? (
                <button
                  type="button"
                  className="atom-nav__toggle"
                  onClick={() => onToggle(node.id)}
                  aria-label={isExpanded ? `Collapse ${node.label}` : `Expand ${node.label}`}
                >
                  {isExpanded ? '−' : '+'}
                </button>
              ) : (
                <span className="atom-nav__toggle atom-nav__toggle--placeholder" aria-hidden>
                  ·
                </span>
              )}
              <button type="button" className="atom-nav__button" onClick={() => onSelect(node)}>
                <span className="atom-nav__label">{node.label}</span>
                {totalsForCategory && node.kind === 'category' ? (
                  <span className="atom-nav__count">{formatNumber(totalsForCategory.total)}</span>
                ) : null}
              </button>
            </div>
            {hasChildren && isExpanded ? (
              <AtomNavTree
                nodes={node.children ?? []}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                onSelect={onSelect}
                selectedId={selectedId}
                totals={totals}
                activeCategory={activeCategory}
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

export default AtomNavTree
