import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import {
  fetchAtomProductivity,
  fetchAtomSchedule,
  fetchAtomPayments,
  fetchAtomSummary,
  fetchAtomDailySchedule,
  createAtomScheduleAllocation,
  updateAtomScheduleAllocation,
  deleteAtomScheduleAllocation,
  fetchFinancialSummaryV2,
  fetchProgressSummaryV2,
  fetchScheduleSummaryV2,
  type AtomCategory,
  type AtomProductivityResponse,
  type AtomProductivityTrendPoint,
  type AtomSummaryCard,
  type AtomSummaryResponse,
  type AtomScheduleResponse,
  type AtomScheduleDailyResponse,
  type AtomScheduleCreatePayload,
  type AtomScheduleUpdatePayload,
  type AtomPaymentResponse,
  type FinancialSummaryResponseV2,
  type ProgressSummaryResponse,
  type ScheduleSummaryResponse,
  fetchProgressHierarchy,
  type ProgressHierarchyResponse,
} from '../../api'
import { SidebarNav, sidebarItems, ACCS_NAV_INDEX, CHANGE_NAV_INDEX, HOME_NAV_INDEX, type ThemeMode } from '../../layout/navigation'
import TopBar from '../../layout/TopBar'
import TopBarGlobalActions from '../../layout/TopBarActions'
import { FEATURE_ATOM_MANAGER, FEATURE_PROGRESS_V2, FEATURE_SCM_VISUAL } from '../../config'
import { applyTheme, resolveInitialTheme, toggleThemeValue } from '../../utils/theme'
import { useProgressSummary } from '../../hooks/useProgress'
import { formatNumber, formatCurrency, formatPercent, ratio, formatShortDate, formatHours, formatDate } from './utils'
import AtomNavTree from './components/AtomNavTree'
import AtomDetailView from './components/AtomDetailView'
import AtomScheduleBoard from './components/AtomScheduleBoard'
import AtomPaymentsBoard from './components/AtomPaymentsBoard'
import AtomScheduleTimeline from './components/AtomScheduleTimeline'
import AtomScheduleWorkspace from './components/AtomScheduleWorkspace'
import AtomUtilityDock, { AtomUtilityView } from './components/AtomUtilityDock'
import { getCategoryIcon } from './components/categoryIcons'
import { hasAtomDetail } from './data/atomDetailLibrary'
import {
  NAV_TREE,
  CATEGORY_ORDER,
  TAG_MAPPING,
  DEFAULT_EXPANDED_IDS,
  NAV_PARENT_MAP,
  NAV_CATEGORY_MAP,
  findNavIdForCategory,
  type NavNode,
} from './data/atomNavigation'
import { resolveAtomExperienceConfig } from './data/atomExperienceMap'

type LocationState = {
  projectId?: string
  projectName?: string
  contractId?: string | null
  contractName?: string | null
  sowId?: string | null
  sowName?: string | null
  processId?: string | null
  processName?: string | null
  role?: 'client' | 'contractor'
  atomId?: string | null
  atomName?: string | null
} | null

type ProductivityRange = '7' | '14' | '30'
type ProductivityCategoryFilter = 'all' | AtomCategory
type AtomManagerPageProps = {
  view?: 'overview' | 'schedule' | 'payments'
}
const CREATE_MENU_OPTIONS = [
  { id: 'create-atom', label: 'Atom' },
  { id: 'create-inheritance', label: 'Atom from Inheritance' },
  { id: 'create-logical', label: 'Logical Node' },
  { id: 'create-alert', label: 'Alert Node' },
  { id: 'create-static', label: 'Static Value Node' },
]

const MiniTrendChart = ({ values, stroke = 'var(--accent)' }: { values: number[]; stroke?: string }) => {
  const rawId = useId()
  const gradientId = `atom-trend-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`

  if (!values || values.length === 0) {
    return <div className="atom-card__trend-placeholder">No trend data</div>
  }
  const data = values.length === 1 ? [values[0], values[0]] : values
  const width = 160
  const height = 60
  const max = Math.max(...data, 0.01)
  const paddingY = 6
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width
    const y = height - ((value / max) * (height - paddingY * 2) + paddingY)
    return { x, y }
  })
  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
  const areaPath = [
    `M 0 ${height}`,
    ...points.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`),
    `L ${width} ${height}`,
    'Z',
  ].join(' ')
  const lastPoint = points[points.length - 1]

  return (
    <svg className="atom-card__trend-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Engagement trend">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.4} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0.05} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastPoint.x} cy={lastPoint.y} r={3.2} fill={stroke} />
    </svg>
  )
}

const ShiftTrendChart = ({ data }: { data: AtomProductivityTrendPoint[] }) => {
  const margin = { top: 28, right: 28, bottom: 36, left: 36 }
  const plotHeight = 200
  const plotWidth = Math.max(420, data.length * 80)
  const width = plotWidth + margin.left + margin.right
  const height = plotHeight + margin.top + margin.bottom

  const maxValue = data.reduce((acc, point) => Math.max(acc, point.productiveHours, point.idleHours), 0) || 1
  const xStep = data.length > 1 ? plotWidth / (data.length - 1) : 0

  const points = data.map((point, index) => {
    const x = margin.left + (data.length > 1 ? index * xStep : plotWidth / 2)
    const productiveY = margin.top + plotHeight - (point.productiveHours / maxValue) * plotHeight
    const idleY = margin.top + plotHeight - (point.idleHours / maxValue) * plotHeight
    return { x, productiveY, idleY, point }
  })

  const buildPath = (selector: (p: typeof points[number]) => number) => {
    if (!points.length) return ''
    return points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${selector(point).toFixed(2)}`)
      .join(' ')
  }

  const productivePath = buildPath((p) => p.productiveY)
  const idlePath = buildPath((p) => p.idleY)

  return (
    <div className="atom-shift-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Shift utilisation trend">
        <defs>
          <linearGradient id="productiveArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(56, 189, 248, 0.4)" />
            <stop offset="100%" stopColor="rgba(56, 189, 248, 0.05)" />
          </linearGradient>
          <linearGradient id="idleArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(248, 113, 113, 0.35)" />
            <stop offset="100%" stopColor="rgba(248, 113, 113, 0.05)" />
          </linearGradient>
          <linearGradient id="gridGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(148, 163, 184, 0.08)" />
            <stop offset="100%" stopColor="rgba(148, 163, 184, 0.02)" />
          </linearGradient>
          <filter id="glow" x="-10" y="-10" width="200" height="200">
            <feGaussianBlur stdDeviation="8" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect
          x={margin.left}
          y={margin.top}
          width={plotWidth}
          height={plotHeight}
          fill="url(#gridGradient)"
          stroke="rgba(148,163,184,0.12)"
          rx={18}
          opacity={0.12}
        />

        <path
          d={`${productivePath} L ${margin.left + plotWidth} ${margin.top + plotHeight} L ${margin.left} ${margin.top + plotHeight} Z`}
          fill="url(#productiveArea)"
          stroke="none"
        />
        <path
          d={`${idlePath} L ${margin.left + plotWidth} ${margin.top + plotHeight} L ${margin.left} ${margin.top + plotHeight} Z`}
          fill="url(#idleArea)"
          stroke="none"
        />

        <path d={productivePath} stroke="rgba(56, 189, 248, 0.9)" strokeWidth={3} fill="none" filter="url(#glow)" />
        <path d={idlePath} stroke="rgba(248, 113, 113, 0.85)" strokeWidth={2.5} fill="none" strokeDasharray="6 6" />

        {points.map(({ x, productiveY, idleY, point }) => (
          <g key={point.logDate}>
            <circle cx={x} cy={productiveY} r={4} fill="rgba(56, 189, 248, 0.95)" />
            <circle cx={x} cy={idleY} r={4} fill="rgba(248, 113, 113, 0.9)" />
            <text x={x} y={productiveY - 10} textAnchor="middle" className="atom-shift-chart__total">
              {point.productiveHours ? `${point.productiveHours.toFixed(1)}h` : ''}
            </text>
            <text x={x} y={margin.top + plotHeight + 22} textAnchor="middle" className="atom-shift-chart__date">
              {formatShortDate(point.logDate)}
            </text>
          </g>
        ))}
      </svg>
      <div className="atom-shift-chart__legend">
        <span>
          <span className="legend-swatch legend-swatch--productive" /> Productive
        </span>
        <span>
          <span className="legend-swatch legend-swatch--idle" /> Idle
        </span>
      </div>
    </div>
  )
}

function SummaryCards({
  cards,
  filters,
  activeCategory,
  onSelectCategory,
  onOpenCategory,
}: {
  cards: AtomSummaryCard[]
  filters: Set<string>
  activeCategory: string | null
  onSelectCategory: (category: string | null) => void
  onOpenCategory?: (card: AtomSummaryCard) => void
}) {
  const visible = useMemo(() => {
    if (!filters.size) return cards
    return cards.filter((card) => filters.has(card.category))
  }, [cards, filters])

  return (
    <div className="atom-cards">
      {visible.map((card) => {
        const total = Math.max(1, card.total)
        const engagedRatio = ratio(card.engaged, total)
        const idleRatio = ratio(card.idle, total)
        const utilization = card.total > 0 ? (card.engaged / card.total) * 100 : 0
        const engagedPercent = card.total > 0 ? card.engaged / card.total : null
        const idlePercent = card.total > 0 ? card.idle / card.total : null
        const available = Math.max(0, card.total - card.engaged - card.idle)
        const availablePercent = card.total > 0 ? available / card.total : null
        const isActive = card.category === activeCategory

        return (
          <button
            key={card.category}
            type="button"
            className={`atom-card ${isActive ? 'is-active' : ''}`}
            onClick={() => {
              const nextCategory = isActive ? null : card.category
              onSelectCategory(nextCategory)
              if (!isActive) {
                onOpenCategory?.(card)
              }
            }}
          >
            <header className="atom-card__header">
              <div className="atom-card__title">
                <span className="atom-card__label">{card.label}</span>
                <span className="atom-card__total">{formatNumber(card.total)} total</span>
              </div>
              <div className="atom-card__util">
                <span>Utilisation</span>
                <strong>{Number.isFinite(utilization) ? `${utilization.toFixed(1)}%` : '--'}</strong>
              </div>
            </header>
            <div className="atom-card__metrics">
              <div className="atom-card__metric">
                <span>Engaged</span>
                <div className="atom-card__metric-value">
                  <strong>{formatNumber(card.engaged)}</strong>
                  <em>{engagedPercent != null ? formatPercent(engagedPercent) : '--'}</em>
                </div>
              </div>
              <div className="atom-card__metric">
                <span>Idle</span>
                <div className="atom-card__metric-value">
                  <strong>{formatNumber(card.idle)}</strong>
                  <em>{idlePercent != null ? formatPercent(idlePercent) : '--'}</em>
                </div>
              </div>
              <div className="atom-card__metric">
                <span>Available</span>
                <div className="atom-card__metric-value">
                  <strong>{formatNumber(available)}</strong>
                  <em>{availablePercent != null ? formatPercent(availablePercent) : '--'}</em>
                </div>
              </div>
            </div>
            <div className="atom-card__bar">
              <div className="atom-card__bar-engaged" style={{ width: `${Math.round(engagedRatio * 100)}%` }} />
              <div className="atom-card__bar-idle" style={{ width: `${Math.round(idleRatio * 100)}%` }} />
            </div>
            {(card.totalCost != null || card.engagedCost != null) ? (
              <div className="atom-card__financials">
                {card.engagedCost != null ? (
                  <div>
                    <span>Deployed value</span>
                    <strong>{formatCurrency(card.engagedCost, 1)}</strong>
                  </div>
                ) : null}
                {card.totalCost != null ? (
                  <div>
                    <span>Total value</span>
                    <strong>{formatCurrency(card.totalCost, 1)}</strong>
                  </div>
                ) : null}
              </div>
            ) : null}
            <footer>
              <span>Engagement trend</span>
              <MiniTrendChart values={card.trend} />
            </footer>
          </button>
        )
      })}
    </div>
  )
}

function ProductivityPanel({
  data,
  loading,
  error,
  range,
  category,
  onRangeChange,
  onCategoryChange,
}: {
  data: AtomProductivityResponse | null
  loading: boolean
  error: string | null
  range: ProductivityRange
  category: ProductivityCategoryFilter
  onRangeChange: (value: ProductivityRange) => void
  onCategoryChange: (value: ProductivityCategoryFilter) => void
}) {
  const summary = data?.summary
  const trend = data?.trend ?? []
  const logs = data?.logs ?? []
  const topLogs = logs.slice(0, 6)

  return (
    <section className="atom-productivity">
      <header className="atom-productivity__header">
        <div>
          <h3>Atom productivity</h3>
          <p>Rolling window insights with shift utilisation and output</p>
        </div>
        <div className="atom-productivity__filters">
          <label htmlFor="productivity-range">
            Range
            <select
              id="productivity-range"
              value={range}
              onChange={(event) => onRangeChange(event.target.value as ProductivityRange)}
            >
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
          </label>
          <label htmlFor="productivity-category">
            Category
            <select
              id="productivity-category"
              value={category}
              onChange={(event) => onCategoryChange(event.target.value as ProductivityCategoryFilter)}
            >
              <option value="all">All</option>
              {CATEGORY_ORDER.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {error && <div className="atom-error">{error}</div>}

      {loading ? (
        <div className="atom-loading">Loading productivity…</div>
      ) : (
        <div className="atom-productivity__content">
          <div className="atom-productivity__metrics">
            <div className="atom-productivity__metric">
              <span>Productive hours</span>
              <strong>{summary ? formatHours(summary.totalProductiveHours) : '--'}</strong>
              <em>Across logged shifts</em>
            </div>
            <div className="atom-productivity__metric">
              <span>Idle hours</span>
              <strong>{summary ? formatHours(summary.totalIdleHours) : '--'}</strong>
              <em>Monitor unused capacity</em>
            </div>
            <div className="atom-productivity__metric">
              <span>Avg utilisation</span>
              <strong>{formatPercent(summary?.averageUtilisation)}</strong>
              <em>Utilisation of engaged atoms</em>
            </div>
            <div className="atom-productivity__metric">
              <span>Total output</span>
              <strong>
                {summary?.totalOutputQuantity ? `${summary.totalOutputQuantity.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '--'}
              </strong>
              <em>Sum of reported quantities</em>
            </div>
          </div>

          <div className="atom-productivity__trend">
            <header>
              <h4>Shift utilisation trend</h4>
              <span>Productive vs idle hours per day</span>
            </header>
            {trend.length === 0 ? (
              <div className="atom-productivity__empty">No productivity logs in the selected window.</div>
            ) : (
              <ShiftTrendChart data={trend} />
            )}
          </div>

          <div className="atom-productivity__logs">
            <header>
              <h4>Recent shift logs</h4>
              <span>{summary ? `${summary.totalLogs.toLocaleString()} entries` : 'No entries'}</span>
            </header>
            {topLogs.length === 0 ? (
              <div className="atom-productivity__empty">Start logging productivity to unlock insights.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Atom</th>
                    <th>Shift</th>
                    <th>Productive</th>
                    <th>Idle</th>
                    <th>Output</th>
                  </tr>
                </thead>
                <tbody>
                  {topLogs.map((log) => (
                    <tr key={log.logId}>
                      <td>{formatShortDate(log.logDate)}</td>
                      <td>
                        <strong>{log.atomName}</strong>
                        <span className="atom-productivity__subtext">{log.atomType}</span>
                      </td>
                      <td className="capitalize">{log.shift}</td>
                      <td>{formatHours(log.productiveHours)}</td>
                      <td>{formatHours(log.idleHours)}</td>
                      <td>
                        {log.outputQuantity !== null && log.outputUnit
                          ? `${log.outputQuantity.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${log.outputUnit}`
                          : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function MetricCard({ label, value, helper }: { label: string; value: React.ReactNode; helper?: React.ReactNode }) {
  return (
    <div className="atom-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <em>{helper}</em> : null}
    </div>
  )
}

function ProgressSummaryPanel({
  summary,
  loading,
  refreshing,
  error,
  onRefresh,
  asOf,
}: {
  summary: ProgressSummaryResponse | null
  loading: boolean
  refreshing: boolean
  error: string | null
  onRefresh: () => void
  asOf: string | null
}) {
  return (
    <section className="atom-progress">
      <header>
        <div>
          <h3>Progress snapshot</h3>
          {asOf ? <span>As of {formatDate(asOf)}</span> : null}
        </div>
        <div className="atom-progress__actions">
          {error ? <span className="atom-error">{error}</span> : null}
          <button type="button" className="atom-refresh" onClick={onRefresh} disabled={loading || refreshing}>
            {loading ? 'Loading…' : refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>
      <div className="atom-progress__metrics">
        <MetricCard label="Earned value" value={summary ? formatCurrency(summary.ev) : '--'} />
        <MetricCard label="Planned value" value={summary ? formatCurrency(summary.pv) : '--'} />
        <MetricCard label="Actual cost" value={summary ? formatCurrency(summary.ac) : '--'} />
        <MetricCard label="SPI" value={summary?.spi !== null ? summary?.spi?.toFixed(2) : '--'} />
        <MetricCard label="CPI" value={summary?.cpi !== null ? summary?.cpi?.toFixed(2) : '--'} />
        <MetricCard
          label="% complete"
          value={summary?.percentComplete !== null && summary?.percentComplete !== undefined ? `${(summary.percentComplete * 100).toFixed(1)}%` : '--'}
        />
        <MetricCard label="Slips" value={summary ? `${summary.slips.toFixed(1)}d` : '--'} />
      </div>
    </section>
  )
}

function ScheduleSummaryPanel({
  summary,
  loading,
  error,
}: {
  summary: ScheduleSummaryResponse | null
  loading: boolean
  error: string | null
}) {
  return (
    <section className="atom-schedule">
      <header>
        <h3>Schedule</h3>
        {summary?.asOf ? <span>As of {formatDate(summary.asOf)}</span> : null}
      </header>
      {error ? (
        <div className="atom-error">{error}</div>
      ) : loading ? (
        <div className="atom-loading">Loading schedule…</div>
      ) : (
        <div className="atom-schedule__grid">
          <MetricCard
            label="Planned window"
            value={`${formatDate(summary?.plannedStart ?? null)} → ${formatDate(summary?.plannedFinish ?? null)}`}
          />
          <MetricCard
            label="Actual window"
            value={`${formatDate(summary?.actualStart ?? null)} → ${formatDate(summary?.actualFinish ?? null)}`}
          />
          <MetricCard
            label="Duration variance"
            value={summary?.durationVarianceDays !== null && summary?.durationVarianceDays !== undefined ? `${summary.durationVarianceDays >= 0 ? '+' : ''}${summary.durationVarianceDays.toFixed(1)}d` : '--'}
          />
        </div>
      )}
    </section>
  )
}

function FinancialSummaryPanel({
  summary,
  loading,
  error,
  breakdownCards,
}: {
  summary: FinancialSummaryResponseV2 | null
  loading: boolean
  error: string | null
  breakdownCards?: AtomSummaryCard[] | null
}) {
  const breakdown = useMemo(() => {
    if (!breakdownCards) return []
    return breakdownCards
      .filter((card) => (card.totalCost ?? 0) > 0)
      .map((card) => ({
        label: card.label,
        category: card.category,
        engagedCost: card.engagedCost ?? null,
        totalCost: card.totalCost ?? null,
        engaged: card.engaged,
        total: card.total,
      }))
  }, [breakdownCards])
  const portfolioTotals = useMemo(() => {
    if (!breakdown.length) {
      return { engaged: 0, total: 0 }
    }
    return breakdown.reduce(
      (acc, row) => {
        acc.engaged += row.engagedCost ?? 0
        acc.total += row.totalCost ?? 0
        return acc
      },
      { engaged: 0, total: 0 },
    )
  }, [breakdown])

  return (
    <section className="atom-financial">
      <header>
        <h3>Financial</h3>
        {summary?.asOf ? <span>As of {formatDate(summary.asOf)}</span> : null}
      </header>
      {error ? (
        <div className="atom-error">{error}</div>
      ) : loading ? (
        <div className="atom-loading">Loading financial summary…</div>
      ) : (
        <>
          <div className="atom-financial__grid">
            <MetricCard label="Earned value" value={summary ? formatCurrency(summary.ev) : '--'} />
            <MetricCard label="Planned value" value={summary ? formatCurrency(summary.pv) : '--'} />
            <MetricCard label="Actual cost" value={summary ? formatCurrency(summary.ac) : '--'} />
            <MetricCard label="Cost variance" value={summary ? formatVariance(summary.costVariance) : '--'} />
            <MetricCard label="Schedule variance" value={summary ? formatVariance(summary.scheduleVariance) : '--'} />
            <MetricCard label="Burn" value={summary ? formatBurn(summary.burnRate) : '--'} />
            {breakdown.length ? (
              <>
                <MetricCard
                  label="Deployed portfolio"
                  value={formatCurrency(portfolioTotals.engaged, 1)}
                  helper="Value of engaged atoms"
                />
                <MetricCard
                  label="Inventory on hand"
                  value={formatCurrency(portfolioTotals.total, 1)}
                  helper="Replacement value across categories"
                />
              </>
            ) : null}
          </div>
          {breakdown.length ? (
            <div className="atom-financial__table">
              <h4>Deployed portfolio value</h4>
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Deployed value</th>
                    <th>Total inventory</th>
                    <th>Engaged units</th>
                    <th>Average engaged unit</th>
                    <th>Share of deployed</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((row) => (
                    <tr key={row.category}>
                      <td>{row.label}</td>
                      <td>{row.engagedCost != null ? formatCurrency(row.engagedCost, 1) : '--'}</td>
                      <td>{row.totalCost != null ? formatCurrency(row.totalCost, 1) : '--'}</td>
                      <td>{formatNumber(row.engaged)}</td>
                      <td>
                        {row.engagedCost != null && row.engaged > 0
                          ? formatCurrency(row.engagedCost / row.engaged, 1)
                          : '--'}
                      </td>
                      <td>
                        {row.engagedCost != null && portfolioTotals.engaged > 0
                          ? formatPercent(row.engagedCost / portfolioTotals.engaged)
                          : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

export default function AtomManagerPage({ view = 'overview' }: AtomManagerPageProps): JSX.Element | null {
  const { id: routeContractId } = useParams<{ id?: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state as LocationState) ?? null
  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme())
  const [activeTagFilters, setActiveTagFilters] = useState<Set<string>>(new Set())
  const [summary, setSummary] = useState<AtomSummaryResponse | null>(null)
  const [productivity, setProductivity] = useState<AtomProductivityResponse | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [loadingProductivity, setLoadingProductivity] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [productivityError, setProductivityError] = useState<string | null>(null)
  const [selectedNavId, setSelectedNavId] = useState<string>(NAV_TREE[0]?.id ?? 'actors')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [productivityRange, setProductivityRange] = useState<ProductivityRange>('14')
  const [productivityCategory, setProductivityCategory] = useState<ProductivityCategoryFilter>('all')
  const [scheduleSummary, setScheduleSummary] = useState<ScheduleSummaryResponse | null>(null)
  const [financialSummary, setFinancialSummary] = useState<FinancialSummaryResponseV2 | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [financialError, setFinancialError] = useState<string | null>(null)
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [loadingFinancial, setLoadingFinancial] = useState(false)
  const [scheduleBoard, setScheduleBoard] = useState<AtomScheduleResponse | null>(null)
  const [scheduleBoardError, setScheduleBoardError] = useState<string | null>(null)
  const [loadingScheduleBoard, setLoadingScheduleBoard] = useState(false)
  const [paymentsBoard, setPaymentsBoard] = useState<AtomPaymentResponse | null>(null)
  const [paymentsBoardError, setPaymentsBoardError] = useState<string | null>(null)
  const [loadingPaymentsBoard, setLoadingPaymentsBoard] = useState(false)
  const [dailySchedule, setDailySchedule] = useState<AtomScheduleDailyResponse | null>(null)
  const [dailyScheduleError, setDailyScheduleError] = useState<string | null>(null)
  const [loadingDailySchedule, setLoadingDailySchedule] = useState(false)

  const [scheduleAtomContext, setScheduleAtomContext] = useState<{ atomId: string; atomName?: string | null } | null>(() =>
    state?.atomId ? { atomId: state.atomId, atomName: state.atomName ?? null } : null,
  )

  useEffect(() => {
    if (state?.atomId) {
      setScheduleAtomContext({ atomId: state.atomId, atomName: state.atomName ?? null })
    }
  }, [state?.atomId, state?.atomName])

  const isOverviewView = view === 'overview'
  const isScheduleView = view === 'schedule'
  const isPaymentsView = view === 'payments'
  const dockActiveView = (isScheduleView ? 'scheduling' : isPaymentsView ? 'financial' : 'manager') as AtomUtilityView
  const scheduleAtomId = scheduleAtomContext?.atomId ?? null
  const scheduleAtomName = scheduleAtomContext?.atomName ?? null
  const [expandedNav, setExpandedNav] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    DEFAULT_EXPANDED_IDS.forEach((id) => {
      initial[id] = true
    })
    return initial
  })
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const createMenuRef = useRef<HTMLDivElement | null>(null)
  const [selectedDetailKey, setSelectedDetailKey] = useState<string | null>(null)
  const selectedAtomConfig = useMemo(() => resolveAtomExperienceConfig(selectedDetailKey ?? undefined), [selectedDetailKey])
  const selectedAtomUuid = selectedAtomConfig.atomUuid ?? null
  const selectedAtomName = selectedAtomConfig.library?.info.atomName ?? null
  useEffect(() => {
    if (selectedAtomUuid) {
      setScheduleAtomContext({ atomId: selectedAtomUuid, atomName: selectedAtomName ?? selectedAtomConfig.library?.info.atomName ?? null })
    } else if (!isScheduleView) {
      setScheduleAtomContext((prev) => (state?.atomId ? prev : null))
    }
  }, [selectedAtomUuid, selectedAtomName, selectedAtomConfig.library?.info.atomName, isScheduleView, state?.atomId])
  const dailyScheduleLoaderRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const triggerDailySchedule = useCallback(() => dailyScheduleLoaderRef.current(), [])

  const role = state?.role ?? 'client'

  const initialSelectionRef = useRef({
    project: state?.projectId ?? null,
    contract: routeContractId ?? state?.contractId ?? null,
    sow: state?.sowId ?? null,
    process: state?.processId ?? null,
    applied: false,
  })

  const [hierarchy, setHierarchy] = useState<ProgressHierarchyResponse | null>(null)
  const [loadingHierarchy, setLoadingHierarchy] = useState(false)
  const [hierarchyError, setHierarchyError] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(state?.projectId ?? null)
  const [selectedContractId, setSelectedContractId] = useState<string | null>(routeContractId ?? state?.contractId ?? null)
  const [selectedSowId, setSelectedSowId] = useState<string | null>(state?.sowId ?? null)
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(state?.processId ?? null)

  useEffect(() => {
    let cancelled = false
    setLoadingHierarchy(true)
    setHierarchyError(null)
    fetchProgressHierarchy()
      .then((data) => {
        if (cancelled) return
        setHierarchy(data)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Failed to load project hierarchy', err)
        setHierarchyError('Unable to load project hierarchy.')
      })
      .finally(() => {
        if (cancelled) return
        setLoadingHierarchy(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

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

  const projectOptions = hierarchy?.projects ?? []
  const scopeTitle = selectedProject?.name ?? (loadingHierarchy ? 'Loading…' : 'Select a project')
  const scopeSubtitle =
    selectedProcess?.name ??
    selectedSow?.name ??
    selectedContract?.name ??
    (selectedProject ? 'Project repository' : 'Choose a project to view atoms')

  useEffect(() => {
    if (!hierarchy || hierarchy.projects.length === 0) {
      setSelectedProjectId(null)
      return
    }
    if (!selectedProjectId || !hierarchy.projects.some((project) => project.code === selectedProjectId)) {
      const fallback = (!initialSelectionRef.current.applied && initialSelectionRef.current.project && hierarchy.projects.some((project) => project.code === initialSelectionRef.current.project)
        ? initialSelectionRef.current.project
        : hierarchy.projects[0].code)
      setSelectedProjectId(fallback)
      return
    }
    if (!initialSelectionRef.current.applied) {
      initialSelectionRef.current.applied = true
      const projectNode = hierarchy.projects.find((project) => project.code === selectedProjectId)
      if (projectNode) {
        const contractNode = projectNode.contracts.find((contract) => contract.code === initialSelectionRef.current.contract) ?? null
        setSelectedContractId(contractNode?.code ?? null)
        const sowNode = contractNode?.sows.find((sow) => sow.code === initialSelectionRef.current.sow) ?? null
        setSelectedSowId(sowNode?.code ?? null)
        const processNode = sowNode?.processes.find((process) => process.code === initialSelectionRef.current.process) ?? null
        setSelectedProcessId(processNode?.code ?? null)
      }
    }
  }, [hierarchy, selectedProjectId])

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

  const activeScope = useMemo(() => {
    if (!selectedProject) {
      return null
    }
    return {
      projectId: selectedProject.code,
      projectName: selectedProject.name,
      contractId: selectedContract?.code ?? null,
      contractName: selectedContract?.name ?? null,
      sowId: selectedSow?.code ?? null,
      sowName: selectedSow?.name ?? null,
      processId: selectedProcess?.code ?? null,
      processName: selectedProcess?.name ?? null,
    }
  }, [selectedProject, selectedContract, selectedSow, selectedProcess])

  const activeScopeKey = useMemo(() => {
    if (!activeScope) return 'none'
    return JSON.stringify([activeScope.projectId, activeScope.contractId, activeScope.sowId, activeScope.processId])
  }, [activeScope])

  const atomScopeParams = useMemo(() => {
    if (!activeScope?.projectId) return null
    return {
      tenantId: 'default' as const,
      projectId: activeScope.projectId,
      contractId: activeScope.contractId ?? null,
      sowId: activeScope.sowId ?? null,
      processId: activeScope.processId ?? null,
    }
  }, [activeScope])

  const progressEnabled = FEATURE_ATOM_MANAGER && FEATURE_PROGRESS_V2 && Boolean(activeScope?.projectId)
  const {
    data: progressSummary,
    lastFetched: progressLastFetched,
    refresh: refreshProgress,
    error: progressError,
    loading: progressLoading,
    refreshing: progressRefreshing,
  } = useProgressSummary(
    {
      projectId: activeScope?.projectId ?? '',
      contractId: activeScope?.contractId ?? null,
      sowId: activeScope?.sowId ?? null,
      processId: activeScope?.processId ?? null,
      tenantId: 'default',
    },
    { enabled: progressEnabled },
  )


  const categoryTotals = useMemo(() => {
    const map: Record<string, { total: number; engaged: number; idle: number }> = {}
    summary?.cards.forEach((card) => {
      map[card.category] = {
        total: card.total,
        engaged: card.engaged,
        idle: card.idle,
      }
    })
    return map
  }, [summary])


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

useEffect(() => {
  if (!FEATURE_ATOM_MANAGER) {
    navigate('/', { replace: true })
  }
}, [navigate])

useEffect(() => {
  setActiveCategory(null)
  setSelectedNavId(NAV_TREE[0]?.id ?? 'actors')
  setSelectedDetailKey(null)
}, [activeScopeKey])

  useEffect(() => {
    if (!activeScope?.projectId) {
      setSummary(null)
      setError(null)
      setLoadingSummary(false)
      return
    }
    setLoadingSummary(true)
    setError(null)
    fetchAtomSummary({
      projectId: activeScope.projectId,
      contractId: activeScope.contractId ?? null,
      sowId: activeScope.sowId ?? null,
      processId: activeScope.processId ?? null,
    })
      .then((data) => {
        setSummary(data)
      })
      .catch((err) => {
        console.error('Failed to load atom summary', err)
        setError('Unable to load atom summary right now.')
      })
      .finally(() => setLoadingSummary(false))
  }, [activeScopeKey, progressLastFetched])

  /* Deployments moved to dedicated page */

  useEffect(() => {
    if (!activeScope?.projectId) {
      setProductivity(null)
      setProductivityError(null)
      setLoadingProductivity(false)
      return
    }
    setLoadingProductivity(true)
    setProductivityError(null)
    const end = new Date()
    const start = new Date(end)
    start.setDate(end.getDate() - Number(productivityRange) + 1)
    const startIso = start.toISOString().slice(0, 10)
    const endIso = end.toISOString().slice(0, 10)
    fetchAtomProductivity({
      projectId: activeScope.projectId,
      contractId: activeScope.contractId ?? null,
      sowId: activeScope.sowId ?? null,
      processId: activeScope.processId ?? null,
      category: productivityCategory === 'all' ? undefined : productivityCategory,
      startDate: startIso,
      endDate: endIso,
      limit: 240,
    })
      .then((data) => setProductivity(data))
      .catch((err) => {
        console.error('Failed to load atom productivity', err)
        setProductivityError('Unable to load productivity insights right now.')
      })
      .finally(() => setLoadingProductivity(false))
  }, [activeScopeKey, productivityRange, productivityCategory, progressLastFetched])

  useEffect(() => {
    if (!progressEnabled || !activeScope?.projectId) {
      setScheduleSummary(null)
      setFinancialSummary(null)
      setLoadingSchedule(false)
      setLoadingFinancial(false)
      setScheduleError(null)
      setFinancialError(null)
      return
    }

    const controller = new AbortController()
    setLoadingSchedule(true)
    setScheduleError(null)
    fetchScheduleSummaryV2(
      {
        projectId: activeScope.projectId,
        contractId: activeScope.contractId ?? null,
        sowId: activeScope.sowId ?? null,
        processId: activeScope.processId ?? null,
        tenantId: 'default',
      },
      controller.signal,
    )
      .then((data) => setScheduleSummary(data))
      .catch((err) => {
        console.error('Failed to load schedule summary', err)
        setScheduleError('Unable to load schedule summary.')
      })
      .finally(() => setLoadingSchedule(false))

    return () => controller.abort()
  }, [progressEnabled, activeScopeKey, progressLastFetched])

  useEffect(() => {
    if (!progressEnabled || !activeScope?.projectId) {
      setFinancialSummary(null)
      return
    }

    const controller = new AbortController()
    setLoadingFinancial(true)
    setFinancialError(null)
    fetchFinancialSummaryV2(activeScope.projectId, activeScope.contractId ?? null, 'default', controller.signal)
      .then((data) => setFinancialSummary(data))
      .catch((err) => {
        console.error('Failed to load financial summary', err)
        setFinancialError('Unable to load financial summary.')
      })
      .finally(() => setLoadingFinancial(false))

    return () => controller.abort()
  }, [progressEnabled, activeScopeKey, progressLastFetched])

  useEffect(() => {
    if (view !== 'schedule') {
      return
    }
    if (!atomScopeParams) {
      setScheduleBoard(null)
      setScheduleBoardError(null)
      setLoadingScheduleBoard(false)
      return
    }
    const controller = new AbortController()
    setLoadingScheduleBoard(true)
    setScheduleBoardError(null)
    fetchAtomSchedule(atomScopeParams, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setScheduleBoard(result)
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        console.error('Failed to load atom schedule', err)
        setScheduleBoardError('Unable to load atom schedule.')
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingScheduleBoard(false)
        }
      })

    return () => controller.abort()
  }, [view, atomScopeParams])

  useEffect(() => {
    triggerDailySchedule().catch(() => {
      /* error handled inside loader */
    })
  }, [triggerDailySchedule, isScheduleView, scheduleAtomId])

  useEffect(() => {
    if (view !== 'payments') {
      return
    }
    if (!atomScopeParams) {
      setPaymentsBoard(null)
      setPaymentsBoardError(null)
      setLoadingPaymentsBoard(false)
      return
    }
    const controller = new AbortController()
    setLoadingPaymentsBoard(true)
    setPaymentsBoardError(null)
    fetchAtomPayments(atomScopeParams, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setPaymentsBoard(result)
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        console.error('Failed to load atom payments', err)
        setPaymentsBoardError('Unable to load atom payments.')
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingPaymentsBoard(false)
        }
      })

    return () => controller.abort()
  }, [view, atomScopeParams])

  const breadcrumbProjectLabel = selectedProject?.name?.replace(/\s+/g, '_') ?? 'Projects'
  const breadcrumbs = useMemo(
    () => [
      { label: 'Dashboard', onClick: () => navigate('/', { state: { openView: 'dashboard' } }) },
      {
        label: breadcrumbProjectLabel,
        onClick: () => {
          if (selectedProjectId) {
            navigate('/', { state: { openView: 'contract', projectId: selectedProjectId } })
          }
        },
      },
      {
        label: 'Construction Control Center',
        onClick: () => {
          if (selectedProjectId) {
            navigate('/', { state: { openView: 'contract', projectId: selectedProjectId } })
          }
        },
      },
      { label: view === 'schedule' ? 'Atom Scheduling' : view === 'payments' ? 'Atom Cost' : 'Atom Manager' },
    ],
    [navigate, breadcrumbProjectLabel, selectedProjectId, view],
  )

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    dailyScheduleLoaderRef.current = () => {
      if (!isScheduleView) {
        setDailySchedule(null)
        setDailyScheduleError(null)
        return Promise.resolve()
      }
      if (!scheduleAtomId) {
        setDailySchedule(null)
        setDailyScheduleError(null)
        return Promise.resolve()
      }
      setLoadingDailySchedule(true)
      setDailyScheduleError(null)
      return fetchAtomDailySchedule(scheduleAtomId)
        .then((result) => {
          setDailySchedule(result)
        })
        .catch((err) => {
          console.error('Failed to load atom daily schedule', err)
          setDailyScheduleError('Unable to load daily allocations.')
        })
        .finally(() => {
          setLoadingDailySchedule(false)
        })
    }
  }, [isScheduleView, scheduleAtomId])

  const handleScheduleRefresh = useCallback(() => {
    if (!isScheduleView || !atomScopeParams) {
      return
    }
    setLoadingScheduleBoard(true)
    setScheduleBoardError(null)
    fetchAtomSchedule(atomScopeParams)
      .then((result) => {
        setScheduleBoard(result)
      })
      .catch((err) => {
        console.error('Failed to load atom schedule', err)
        setScheduleBoardError('Unable to load atom schedule.')
      })
      .finally(() => setLoadingScheduleBoard(false))
    triggerDailySchedule().catch(() => {
      /* handled inside */
    })
  }, [isScheduleView, atomScopeParams, triggerDailySchedule])

  const handleDailyScheduleRefresh = useCallback(() => {
    triggerDailySchedule().catch(() => {
      /* handled inside */
    })
  }, [triggerDailySchedule])

  const handleScheduleAllocationUpdate = useCallback(
    async (scheduleId: string, payload: AtomScheduleUpdatePayload) => {
      const result = await updateAtomScheduleAllocation(scheduleId, payload)
      handleScheduleRefresh()
      return result
    },
    [handleScheduleRefresh],
  )

  const handleScheduleAllocationCreate = useCallback(
    async (payload: AtomScheduleCreatePayload) => {
      const result = await createAtomScheduleAllocation(payload)
      handleScheduleRefresh()
      return result
    },
    [handleScheduleRefresh],
  )

  const handleScheduleAllocationDelete = useCallback(
    async (scheduleId: string) => {
      await deleteAtomScheduleAllocation(scheduleId)
      handleScheduleRefresh()
    },
    [handleScheduleRefresh],
  )

  const handlePaymentsRefresh = useCallback(() => {
    if (!isPaymentsView || !atomScopeParams) {
      return
    }
    setLoadingPaymentsBoard(true)
    setPaymentsBoardError(null)
    fetchAtomPayments(atomScopeParams)
      .then((result) => {
        setPaymentsBoard(result)
      })
      .catch((err) => {
        console.error('Failed to load atom payments', err)
        setPaymentsBoardError('Unable to load atom payments.')
      })
      .finally(() => setLoadingPaymentsBoard(false))
  }, [isPaymentsView, atomScopeParams])

  const handleThemeToggle = () => setTheme((prev) => toggleThemeValue(prev))
  const handleNavToggle = useCallback((id: string) => {
    setExpandedNav((prev) => ({
      ...prev,
      [id]: !(prev[id] ?? true),
    }))
  }, [])

  const handleNavSelectNode = useCallback(
    (node: NavNode) => {
      if (node.detailKey && hasAtomDetail(node.detailKey)) {
        navigate(`/atoms/catalog/${encodeURIComponent(node.detailKey)}`, {
          state: {
            from: 'atom-manager',
            role,
            projectId: activeScope?.projectId ?? null,
            projectName: selectedProject?.name ?? state?.projectName ?? null,
            contractId: activeScope?.contractId ?? null,
            sowId: activeScope?.sowId ?? null,
            processId: activeScope?.processId ?? null,
          },
        })
        return
      }
      if (node.children && node.children.length) {
        setExpandedNav((prev) => ({ ...prev, [node.id]: true }))
      }
      expandAncestors(node.id)
      setSelectedNavId(node.id)
      if (node.detailKey) {
        setSelectedDetailKey(node.detailKey)
      } else if (node.kind !== 'item') {
        setSelectedDetailKey(null)
      }
      const category = NAV_CATEGORY_MAP.get(node.id)
      if (category) {
        setActiveCategory(category)
      }
    },
    [activeScope, expandAncestors, navigate, role, selectedProject?.name, state],
  )

  const handleSummaryCategorySelect = useCallback(
    (category: string | null) => {
      if (category) {
        const navId = findNavIdForCategory(category)
        if (navId) {
          expandAncestors(navId)
          setSelectedNavId(navId)
        }
        setActiveCategory(category)
      } else {
        setActiveCategory(null)
      }
      setSelectedDetailKey(null)
    },
    [expandAncestors],
  )

  const handleOpenDeployments = useCallback(
    (card: AtomSummaryCard) => {
      if (!activeScope?.projectId) return
      const params = new URLSearchParams({
        projectId: activeScope.projectId,
        tenantId: 'default',
        category: card.category,
      })
      if (activeScope.contractId) params.set('contractId', activeScope.contractId)
      if (activeScope.sowId) params.set('sowId', activeScope.sowId)
      if (activeScope.processId) params.set('processId', activeScope.processId)
      navigate(`/atoms/deployments?${params.toString()}`, {
        state: {
          role,
          projectName: selectedProject?.name ?? null,
          projectId: activeScope.projectId,
          contractId: activeScope.contractId ?? null,
          sowId: activeScope.sowId ?? null,
          processId: activeScope.processId ?? null,
        },
      })
    },
    [activeScope, navigate, role, selectedProject?.name],
  )

  const handleCreateSelect = useCallback((optionId: string) => {
    setCreateMenuOpen(false)
    console.info('Create option selected:', optionId)
    // Placeholder for future creation flow.
  }, [])

  useEffect(() => {
    if (!createMenuOpen) return
    const handleClickAway = (event: MouseEvent) => {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
        setCreateMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickAway)
    return () => document.removeEventListener('mousedown', handleClickAway)
  }, [createMenuOpen])

  const [activeNavIndex, setActiveNavIndex] = useState(ACCS_NAV_INDEX)
  const handleNavSelect = (index: number) => {
    setActiveNavIndex(index)
    if (index === HOME_NAV_INDEX) {
      navigate('/')
      return
    }
    if (index === CHANGE_NAV_INDEX) {
      navigate('/change-management')
    }
  }

  const tagFilters = useMemo(() => Object.keys(TAG_MAPPING), [])

  const currentScopeState = useMemo(() => {
    return {
      tenantId: 'default',
      projectId: activeScope?.projectId ?? selectedProjectId ?? null,
      projectName: activeScope?.projectName ?? selectedProject?.name ?? state?.projectName ?? null,
      contractId: activeScope?.contractId ?? selectedContract?.code ?? null,
      contractName: activeScope?.contractName ?? selectedContract?.name ?? state?.contractName ?? null,
      sowId: activeScope?.sowId ?? selectedSow?.code ?? null,
      sowName: activeScope?.sowName ?? selectedSow?.name ?? state?.sowName ?? state?.sowId ?? null,
      processId: activeScope?.processId ?? selectedProcess?.code ?? null,
      processName: activeScope?.processName ?? selectedProcess?.name ?? state?.processName ?? state?.processId ?? null,
      atomId: selectedAtomUuid ?? scheduleAtomId ?? state?.atomId ?? null,
      atomName: selectedAtomName ?? scheduleAtomName ?? state?.atomName ?? null,
    }
  }, [
    activeScope,
    selectedProjectId,
    selectedProject,
    selectedContract,
    selectedSow,
    selectedProcess,
    state,
    selectedAtomUuid,
    selectedAtomName,
    scheduleAtomId,
    scheduleAtomName,
  ])

  const topBarActions = (
    <div className="atom-topbar-actions">
      <div className="atom-topbar-actions__links">
        <button
          type="button"
          className={`atom-topbar-button ${isScheduleView ? 'is-active' : ''}`}
          onClick={() => navigate('/atoms/scheduling', { state: currentScopeState })}
        >
          Atom Scheduling
        </button>
        <button
          type="button"
          className={`atom-topbar-button ${isPaymentsView ? 'is-active' : ''}`}
          onClick={() => navigate('/atoms/cost', { state: currentScopeState })}
        >
          Atom Cost
        </button>
        {FEATURE_SCM_VISUAL ? (
          <button
            type="button"
            className="atom-topbar-button"
            onClick={() =>
              navigate('/atoms/scm/visual', {
                state: currentScopeState,
              })
            }
          >
            SCM Visual Flow
          </button>
        ) : null}
      </div>
      <TopBarGlobalActions theme={theme} onToggleTheme={handleThemeToggle} scope={currentScopeState} />
    </div>
  )

  const cards = summary?.cards ?? []

  const stageClassName = isScheduleView ? 'atom-stage atom-stage--full-schedule' : 'atom-stage atom-stage--docked'

  return (
    <div className="atom-manager" data-theme={theme}>
      <SidebarNav activeIndex={activeNavIndex} onSelect={handleNavSelect} theme={theme} onToggleTheme={handleThemeToggle} />
      <div className="app-shell topbar-layout">
        <TopBar breadcrumbs={breadcrumbs} actions={topBarActions} />
        <div className={stageClassName}>
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
              totals={categoryTotals}
              activeCategory={activeCategory}
            />
          </div>
          {error && <div className="atom-error atom-error--inline">{error}</div>}
        </aside>

        <main className="atom-main atom-main--expanded">
          <header className="atom-main__header">
            <div className="atom-main__filters">
              <div className="atom-scope-bar">
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
                <span className="atom-scope-divider" aria-hidden />
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
                <span className="atom-scope-divider" aria-hidden />
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
                <span className="atom-scope-divider" aria-hidden />
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
              </div>
              <div className="atom-actions" ref={createMenuRef}>
                <button
                  type="button"
                  className="atom-create-btn"
                  onClick={() => setCreateMenuOpen((prev) => !prev)}
                  aria-haspopup="menu"
                  aria-expanded={createMenuOpen}
                >
                  Create
                  <span aria-hidden>{createMenuOpen ? '▲' : '▼'}</span>
                </button>
                {createMenuOpen && (
                  <ul className="atom-create-menu" role="menu">
                    {CREATE_MENU_OPTIONS.map((option) => (
                      <li key={option.id} role="menuitem">
                        <button type="button" onClick={() => handleCreateSelect(option.id)}>
                          {option.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {hierarchyError ? <div className="atom-error atom-error--inline">{hierarchyError}</div> : null}
          </header>

          {isOverviewView ? (
            <>
              <div className="atom-filter-row">
                <span>Types</span>
                <div>
                  {tagFilters.map((tag) => {
                    const categories = TAG_MAPPING[tag]
                    const primaryCategory = categories[0]
                    const active = activeTagFilters.has(primaryCategory)
                    const icon = getCategoryIcon(primaryCategory)
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`atom-group-chip ${active ? 'is-active' : ''}`}
                        onClick={() => {
                          const next = new Set(activeTagFilters)
                          if (active) {
                            categories.forEach((category) => next.delete(category))
                          } else {
                            categories.forEach((category) => next.add(category))
                          }
                          setActiveTagFilters(next)
                        }}
                      >
                        <span className="atom-group-chip__icon">{icon}</span>
                        {tag}
                      </button>
                    )
                  })}
                </div>
              </div>

              {error ? <div className="atom-error">{error}</div> : null}

              {progressEnabled ? (
                <>
                  <ProgressSummaryPanel
                    summary={progressSummary ?? null}
                    loading={progressLoading}
                    refreshing={progressRefreshing}
                    error={progressError}
                    onRefresh={refreshProgress}
                    asOf={progressSummary?.asOf ?? null}
                  />
                  <div className="atom-snapshots">
                    <ScheduleSummaryPanel summary={scheduleSummary} loading={loadingSchedule} error={scheduleError} />
                    <FinancialSummaryPanel
                      summary={financialSummary}
                      loading={loadingFinancial}
                      error={financialError}
                      breakdownCards={summary?.cards ?? null}
                    />
                  </div>
                </>
              ) : null}

              {!selectedProject ? (
                <div className="atom-loading">Select a project to explore the atom repository.</div>
              ) : loadingSummary ? (
                <div className="atom-loading">Loading summary…</div>
              ) : (
                <SummaryCards
                  cards={cards}
                  filters={activeTagFilters}
                  activeCategory={activeCategory}
                  onSelectCategory={handleSummaryCategorySelect}
                  onOpenCategory={handleOpenDeployments}
                />
              )}

              <AtomDetailView detailKey={selectedDetailKey} />

              {selectedProject ? (
                <ProductivityPanel
                  data={productivity}
                  loading={loadingProductivity}
                  error={productivityError}
                  range={productivityRange}
                  category={productivityCategory}
                  onRangeChange={(value) => setProductivityRange(value)}
                  onCategoryChange={(value) => setProductivityCategory(value)}
                />
              ) : null}
            </>
          ) : null}

          {isScheduleView ? (
            <div className="atom-schedule-stack">
              <AtomScheduleWorkspace
                scope={currentScopeState}
                data={scheduleBoard}
                loading={loadingScheduleBoard}
                error={scheduleBoardError}
                onRefresh={handleScheduleRefresh}
                onCreate={handleScheduleAllocationCreate}
                onUpdate={handleScheduleAllocationUpdate}
                onDelete={handleScheduleAllocationDelete}
              />

              {scheduleAtomId ? (
                <AtomScheduleTimeline
                  data={dailySchedule}
                  loading={loadingDailySchedule}
                  error={dailyScheduleError}
                  onRefresh={handleDailyScheduleRefresh}
                />
              ) : null}

              <AtomScheduleBoard
                data={scheduleBoard}
                loading={loadingScheduleBoard}
                error={scheduleBoardError}
                categoryFilter={activeCategory}
                onRefresh={handleScheduleRefresh}
              />
            </div>
          ) : null}

          {isPaymentsView ? (
            <AtomPaymentsBoard
              data={paymentsBoard}
              loading={loadingPaymentsBoard}
              error={paymentsBoardError}
              categoryFilter={activeCategory}
              onRefresh={handlePaymentsRefresh}
            />
          ) : null}
        </main>
      </div>
    </div>
    <AtomUtilityDock activeView={dockActiveView} scopeState={currentScopeState} />
  </div>
  )
}
