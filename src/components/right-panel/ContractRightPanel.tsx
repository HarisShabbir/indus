import React, { useEffect, useMemo, useState } from 'react'

import { FEATURE_CONTRACT_RIGHT_PANEL_ECHARTS } from '../../config'
import { useLatest, useSeries } from '../../hooks/useKpi'
import { EAreaLine } from '../charts/EAreaLine'
import { EDonut } from '../charts/EDonut'
import { EStackedBar } from '../charts/EStackedBar'
import { EDial } from '../charts/EDial'

type Props = {
  contractId: string | null | undefined
}

const percentageFormatter = (value: number) => `${value.toFixed(1)}%`

const toNumber = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const mergeSeries = (
  primary?: { dates: string[]; actual: Array<number | null>; planned: Array<number | null> } | null,
  fallback?: { dates: string[]; actual: Array<number | null>; planned: Array<number | null> } | null,
) => {
  if (!primary && !fallback) {
    return null
  }
  const map = new Map<string, { actual: number | null; planned: number | null }>()
  const append = (series?: { dates: string[]; actual: Array<number | null>; planned: Array<number | null> } | null, source: 'primary' | 'fallback' = 'primary') => {
    if (!series) return
    series.dates.forEach((date, index) => {
      const existing = map.get(date) ?? { actual: null, planned: null }
      const actualValue = series.actual[index] ?? null
      const plannedValue = series.planned?.[index] ?? null
      if (existing.actual === null && actualValue !== null) {
        existing.actual = actualValue
      }
      if (plannedValue !== null) {
        existing.planned = plannedValue
      } else if (source === 'fallback' && existing.planned === null && actualValue !== null) {
        existing.planned = actualValue
      }
      map.set(date, existing)
    })
  }
  append(primary, 'primary')
  append(fallback, 'fallback')
  const dates = Array.from(map.keys()).sort()
  return {
    dates,
    actual: dates.map((date) => map.get(date)?.actual ?? null),
    planned: dates.map((date) => map.get(date)?.planned ?? null),
  }
}

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
const compactNumberFormatter = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
const DAY_MS = 24 * 60 * 60 * 1000

type OutputStatus = 'Completed' | 'In Progress' | 'Not Started' | 'Delayed'

type DesignOutputRow = {
  contractId: string
  label: string
  status: OutputStatus
  planned: number
  actual: number
  notes: string
}

type PreparatoryOutputRow = {
  contractId: string
  label: string
  status: OutputStatus
  planned: number
  actual: number
  milestoneTotals: { completed: number; total: number }
  milestones: Array<{ label: string; status: OutputStatus; tooltip?: string }>
}

type ConstructionOutputRow = {
  contractId: string
  label: string
  status: OutputStatus
  planned: number
  actual: number
  unit: string
  commentary: string
}

const DESIGN_OUTPUT_ROWS: DesignOutputRow[] = [
  {
    contractId: 'mw-01-main-dam',
    label: 'MW-01 – CFD Modelling Stage 3',
    status: 'Completed',
    planned: 41.0,
    actual: 37.9,
    notes: 'Issued to site 2 days ahead of schedule.',
  },
  {
    contractId: 'mw-02-rb-powerhouse',
    label: 'MW-02 – Turbine Shop Drawings',
    status: 'In Progress',
    planned: 38.5,
    actual: 32.4,
    notes: 'Vendor mark-ups pending client approval.',
  },
  {
    contractId: 'hm-01',
    label: 'HM-1 – Tender Drawing Package',
    status: 'Completed',
    planned: 36.0,
    actual: 36.0,
    notes: 'Approved by technical board with minor comments.',
  },
]

const PREPARATORY_OUTPUT_ROWS: PreparatoryOutputRow[] = [
  {
    contractId: 'mw-01-main-dam',
    label: 'MW-01 – RCC Facilities',
    status: 'In Progress',
    planned: 39.5,
    actual: 34.5,
    milestoneTotals: { completed: 3, total: 5 },
    milestones: [
      { label: 'Batching plant install', status: 'Completed' },
      { label: 'Power feed upgrade', status: 'Completed' },
      { label: 'Aggregate stockpile', status: 'Completed' },
      { label: 'Cooling tower commission', status: 'In Progress', tooltip: 'Lagging due to pump delivery' },
      { label: 'QA lab certification', status: 'Not Started', tooltip: 'Inspection scheduled next week' },
    ],
  },
  {
    contractId: 'mw-02-rb-powerhouse',
    label: 'MW-02 – Cavern Prep',
    status: 'Delayed',
    planned: 42.0,
    actual: 30.2,
    milestoneTotals: { completed: 2, total: 5 },
    milestones: [
      { label: 'Access drift support', status: 'Completed' },
      { label: 'Ventilation upgrade', status: 'In Progress', tooltip: 'Fan procurement delayed' },
      { label: 'Lighting install', status: 'Delayed', tooltip: 'Awaiting HSE permit' },
      { label: 'Drainage checks', status: 'Not Started' },
      { label: 'Survey sign-off', status: 'Not Started' },
    ],
  },
  {
    contractId: 'hm-01',
    label: 'HM-1 – Intake Channel',
    status: 'Completed',
    planned: 33.0,
    actual: 34.2,
    milestoneTotals: { completed: 4, total: 4 },
    milestones: [
      { label: 'Silt berm removal', status: 'Completed' },
      { label: 'Foundation proof roll', status: 'Completed' },
      { label: 'Guide wall pour', status: 'Completed' },
      { label: 'Survey verification', status: 'Completed' },
    ],
  },
]

const CONSTRUCTION_OUTPUT_ROWS: ConstructionOutputRow[] = [
  {
    contractId: 'mw-01-main-dam',
    label: 'MW-01 – Dam Pit Excavation',
    status: 'Delayed',
    planned: 72.7,
    actual: 68.2,
    unit: 'm³',
    commentary: 'Excavation slowed by water ingress; grouting crew mobilised.',
  },
  {
    contractId: 'mw-02-rb-powerhouse',
    label: 'MW-02 – Right Bank Abutment',
    status: 'In Progress',
    planned: 64.0,
    actual: 62.1,
    unit: 'm³',
    commentary: 'Holding pattern while steel ribs arrive on site.',
  },
  {
    contractId: 'hm-01',
    label: 'HM-1 – Spiral Case Pour',
    status: 'Completed',
    planned: 55.0,
    actual: 56.8,
    unit: 'm³',
    commentary: 'Concrete quality exceeded spec; QA sign-off complete.',
  },
]

const extractLatestPoint = (
  series?: { actual: Array<number | null>; planned: Array<number | null> } | null,
  fallbackActual = 0,
) => {
  if (!series) {
    return { actual: fallbackActual, planned: fallbackActual }
  }
  for (let index = series.actual.length - 1; index >= 0; index -= 1) {
    const actualValue = series.actual[index]
    const plannedValue = series.planned[index]
    if (actualValue !== null || plannedValue !== null) {
      const actual = actualValue ?? fallbackActual
      const planned = plannedValue ?? actual
      return { actual, planned }
    }
  }
  return { actual: fallbackActual, planned: fallbackActual }
}

export function ContractRightPanel({ contractId }: Props) {
  const enabled = FEATURE_CONTRACT_RIGHT_PANEL_ECHARTS
  const latestState = useLatest(contractId, enabled)
  const physicalActualSeriesState = useSeries(contractId, 'prod_actual_pct', 90, enabled)
  const physicalPlannedSeriesState = useSeries(contractId, 'prod_planned_pct', 90, enabled)
  const designSeriesState = useSeries(contractId, 'design_output', 90, enabled)
  const prepSeriesState = useSeries(contractId, 'prep_output', 90, enabled)
  const constSeriesState = useSeries(contractId, 'const_output', 90, enabled)
  const spiSeriesState = useSeries(contractId, 'spi', 90, enabled)

  const physicalSeries = useMemo(
    () => mergeSeries(physicalActualSeriesState.data, physicalPlannedSeriesState.data),
    [physicalActualSeriesState.data, physicalPlannedSeriesState.data],
  )

  if (!enabled) {
    return null
  }

  const designSeries = designSeriesState.data
  const prepSeries = prepSeriesState.data
  const constSeries = constSeriesState.data
  const spiSeries = spiSeriesState.data
  const spiMomentum = useMemo(() => {
    if (!spiSeries?.actual?.length) {
      return null
    }
    const points: Array<{ value: number; index: number }> = []
    spiSeries.actual.forEach((value, index) => {
      if (value !== null && Number.isFinite(value)) {
        points.push({ value, index })
      }
    })
    if (points.length < 2) {
      return null
    }
    const latest = points[points.length - 1]
    let baseline = points[0]
    for (let i = points.length - 2; i >= 0; i -= 1) {
      const candidate = points[i]
      if (latest.index - candidate.index >= 6) {
        baseline = candidate
        break
      }
      baseline = candidate
    }
    const latestDate = new Date(spiSeries.dates?.[latest.index] ?? '')
    const baselineDate = new Date(spiSeries.dates?.[baseline.index] ?? '')
    const latestTime = latestDate.getTime()
    const baselineTime = baselineDate.getTime()
    const hasValidDates = Number.isFinite(latestTime) && Number.isFinite(baselineTime)
    const spanMs = hasValidDates ? Math.max(DAY_MS, Math.abs(latestTime - baselineTime)) : DAY_MS
    const spanDays = Math.max(1, Math.round(spanMs / DAY_MS))
    const delta = latest.value - baseline.value
    const perDay = delta / spanDays
    return { delta, perDay, spanDays }
  }, [spiSeries])

  const latest = latestState.data?.latest ?? {}

  const physicalActual = toNumber(latest.prod_actual_pct) ?? 0
  const physicalPlanned = toNumber(latest.prod_planned_pct) ?? 0
  const ncrOpen = toNumber(latest.ncr_open) ?? 0
  const ncrClosed = toNumber(latest.ncr_closed) ?? 0
  const qaorOpen = toNumber(latest.qaor_open) ?? 0
  const qaorClosed = toNumber(latest.qaor_closed) ?? 0
  const qualityConf = toNumber(latest.quality_conf)
  const spiValue = toNumber(latest.spi)
  const designActual = toNumber(latest.design_output) ?? 0
  const prepActual = toNumber(latest.prep_output) ?? 0
  const constActual = toNumber(latest.const_output) ?? 0
  const scheduleProgress = toNumber(latest.schedule_progress_pct)
  const costPerformance = toNumber(latest.cpi)
  const earnedValue = toNumber(latest.ev)
  const plannedValue = toNumber(latest.pv)
  const actualCost = toNumber(latest.ac)

  const designPoint = extractLatestPoint(designSeries, designActual)
  const prepPoint = extractLatestPoint(prepSeries, prepActual)
  const constPoint = extractLatestPoint(constSeries, constActual)

  const designVariance = designPoint.actual - designPoint.planned
  const prepVariance = prepPoint.actual - prepPoint.planned
  const constVariance = constPoint.actual - constPoint.planned
  const physicalVariance = physicalActual - physicalPlanned

  const physicalLoading = physicalActualSeriesState.loading || physicalPlannedSeriesState.loading
  const designLoading = designSeriesState.loading
  const prepLoading = prepSeriesState.loading
  const constLoading = constSeriesState.loading
  const spiLoading = spiSeriesState.loading
  const showMomentum = !spiLoading && spiMomentum !== null

  const designRows = useMemo(() => {
    return DESIGN_OUTPUT_ROWS.map((row) =>
      contractId && row.contractId === contractId
        ? {
            ...row,
            planned: Number(designPoint.planned.toFixed(1)),
            actual: Number(designPoint.actual.toFixed(1)),
          }
        : row,
    )
  }, [contractId, designPoint])

  const [designSelection, setDesignSelection] = useState<string>(() => designRows[0]?.contractId ?? '')
  const resolvedDesignSelection =
    designRows.find((row) => row.contractId === designSelection) ?? designRows[0] ?? DESIGN_OUTPUT_ROWS[0]

  useEffect(() => {
    if (!designRows.some((row) => row.contractId === designSelection)) {
      setDesignSelection(designRows[0]?.contractId ?? '')
    }
  }, [designRows, designSelection])

  useEffect(() => {
    if (contractId && designRows.some((row) => row.contractId === contractId) && designSelection !== contractId) {
      setDesignSelection(contractId)
    }
  }, [contractId, designRows, designSelection])

  const preparatoryRows = useMemo(() => {
    return PREPARATORY_OUTPUT_ROWS.map((row) =>
      contractId && row.contractId === contractId
        ? {
            ...row,
            planned: Number(prepPoint.planned.toFixed(1)),
            actual: Number(prepPoint.actual.toFixed(1)),
          }
        : row,
    )
  }, [contractId, prepPoint])

  const constructionRows = useMemo(() => {
    return CONSTRUCTION_OUTPUT_ROWS.map((row) =>
      contractId && row.contractId === contractId
        ? {
            ...row,
            planned: Number(constPoint.planned.toFixed(1)),
            actual: Number(constPoint.actual.toFixed(1)),
          }
        : row,
    )
  }, [contractId, constPoint])

  const designVarianceActive = resolvedDesignSelection ? resolvedDesignSelection.actual - resolvedDesignSelection.planned : designVariance

  const wipActual = [designPoint.actual, prepPoint.actual, constPoint.actual]
  const wipPlanned = [designPoint.planned, prepPoint.planned, constPoint.planned]
  const wipLoading = designLoading || prepLoading || constLoading
  const hasWipData =
    wipActual.some((value) => value !== null) || wipPlanned.some((value) => value !== null)

  const earnedVsPlan = plannedValue && plannedValue !== 0 ? (earnedValue ?? 0) / plannedValue * 100 : null
  const earnedVsCost = actualCost && actualCost !== 0 ? (earnedValue ?? 0) / actualCost * 100 : null
  const costVariance = earnedValue !== null && actualCost !== null ? earnedValue - actualCost : null
  const formatCompact = (value: number | null | undefined) =>
    value === null || value === undefined ? '—' : compactNumberFormatter.format(value)

  if (!contractId) {
    return <div className="right-panel right-panel--empty">Select a contract to view performance.</div>
  }

  if (latestState.error) {
    return <div className="right-panel right-panel--error">{latestState.error}</div>
  }

  if (!latestState.data) {
    return <div className="right-panel right-panel--empty">Loading contract performance…</div>
  }

  return (
    <section className="contract-right-panel" aria-live="polite">
      <div className="panel-grid">
        <div className="panel-card panel-card--tall">
          <header>
            <h3>Physical Works Completed</h3>
            <div className="panel-kpi">
              <span className="panel-kpi__label">Actual</span>
              <span className="panel-kpi__value">{numberFormatter.format(physicalActual)}%</span>
              <span className="panel-kpi__label muted">Planned</span>
              <span className="panel-kpi__value muted">{numberFormatter.format(physicalPlanned)}%</span>
              <span className={`panel-kpi__delta ${physicalVariance >= 0 ? 'positive' : 'negative'}`}>
                {physicalVariance >= 0 ? '▲' : '▼'} {numberFormatter.format(Math.abs(physicalVariance))}%
              </span>
            </div>
          </header>
          {physicalLoading || !physicalSeries ? (
            <div className="chart-placeholder">{physicalLoading ? 'Loading trend…' : 'No trend data available.'}</div>
          ) : (
            <EAreaLine
              dates={physicalSeries.dates}
              actual={physicalSeries.actual}
              planned={physicalSeries.planned}
              height={240}
              loading={physicalLoading}
              valueFormatter={percentageFormatter}
              actualLabel="Actual %"
              plannedLabel="Planned %"
            />
          )}
        </div>

        <div className="panel-card panel-card--compact">
          <header>
            <h3>Work in Progress</h3>
          </header>
          {wipLoading ? (
            <div className="chart-placeholder">Loading work in progress…</div>
          ) : hasWipData ? (
            <EStackedBar
              categories={['Design', 'Preparatory', 'Construction']}
              actual={wipActual}
              planned={wipPlanned}
              height={220}
              loading={wipLoading}
              actualLabel="Actual %"
              plannedLabel="Planned %"
              valueFormatter={percentageFormatter}
            />
          ) : (
            <div className="chart-placeholder">No work in progress data available.</div>
          )}
          <div className="mini-grid">
            {[
              { label: 'Design variance', value: designVariance },
              { label: 'Preparatory variance', value: prepVariance },
              { label: 'Construction variance', value: constVariance },
            ].map((item) => (
              <div key={item.label} className="mini-card">
                <span className="mini-card__title">{item.label}</span>
                <span className={`mini-card__delta ${item.value >= 0 ? 'positive' : 'negative'}`}>
                  {item.value >= 0 ? '+' : '−'}
                  {numberFormatter.format(Math.abs(item.value))}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-card panel-card--compact">
          <header>
            <h3>Work Output</h3>
          </header>
          <div className="work-output-grid">
            <div className="work-output-section">
              <div className="work-output-section__heading">
                <span className="work-output-section__title">Design Output</span>
                <span className={`status-pill status-pill--${resolvedDesignSelection.status.replace(/\s+/g, '-').toLowerCase()}`}>
                  {resolvedDesignSelection.status}
                </span>
              </div>
              <label htmlFor="design-contract-select" className="work-output-label">
                Contract package
              </label>
              <select
                id="design-contract-select"
                value={designSelection}
                onChange={(event) => setDesignSelection(event.target.value)}
                className="work-output-select"
              >
                {designRows.map((row) => (
                  <option key={row.contractId} value={row.contractId}>
                    {row.label}
                  </option>
                ))}
              </select>
              {designLoading && designSelection === contractId ? (
                <div className="chart-placeholder">Loading…</div>
              ) : (
                <div className="work-meter" aria-label="Design output actual versus planned">
                  <div className="work-meter__bars">
                    <div className="work-meter__bar planned">
                      <span style={{ width: `${Math.max(0, Math.min(resolvedDesignSelection.planned, 100))}%` }} />
                      <small>Planned</small>
                    </div>
                    <div className="work-meter__bar actual">
                      <span style={{ width: `${Math.max(0, Math.min(resolvedDesignSelection.actual, 100))}%` }} />
                      <small>Actual</small>
                    </div>
                  </div>
                  <div className="work-meter__legend">
                    <span>
                      <strong>{resolvedDesignSelection.actual.toFixed(1)}%</strong> actual
                    </span>
                    <span>
                      <strong>{resolvedDesignSelection.planned.toFixed(1)}%</strong> planned
                    </span>
                  </div>
                </div>
              )}
              <p className="work-output-note">{resolvedDesignSelection.notes}</p>
              <span
                className={`work-output-variance ${designVarianceActive >= 0 ? 'positive' : 'negative'}`}
              >
                {designVarianceActive >= 0 ? '+' : '−'}
                {numberFormatter.format(Math.abs(designVarianceActive))}% vs plan
              </span>
            </div>

            <div className="work-output-section">
              <div className="work-output-section__heading">
                <span className="work-output-section__title">Preparatory Work Output</span>
              </div>
              <div className="prep-output-list">
                {preparatoryRows.map((row) => {
                  const variance = row.actual - row.planned
                  const clampedPlanned = Math.max(0, Math.min(row.planned, 100))
                  const clampedActual = Math.max(0, Math.min(row.actual, 100))
                  const isLoadingRow = prepLoading && row.contractId === contractId
                  return (
                    <div key={row.contractId} className="prep-output-card">
                      <div className="prep-output-card__header">
                        <strong>{row.label}</strong>
                        <span className={`status-pill status-pill--${row.status.replace(/\s+/g, '-').toLowerCase()}`}>{row.status}</span>
                      </div>
                      {isLoadingRow ? (
                        <div className="chart-placeholder">Loading…</div>
                      ) : (
                        <>
                          <div className="work-meter work-meter--inline">
                            <div className="work-meter__bars">
                              <div className="work-meter__bar planned">
                                <span style={{ width: `${clampedPlanned}%` }} />
                                <small>Planned</small>
                              </div>
                              <div className="work-meter__bar actual">
                                <span style={{ width: `${clampedActual}%` }} />
                                <small>Actual</small>
                              </div>
                            </div>
                          </div>
                          <div className="work-meter__legend">
                            <span>
                              <strong>{row.actual.toFixed(1)}%</strong> actual
                            </span>
                            <span>
                              <strong>{row.planned.toFixed(1)}%</strong> planned
                            </span>
                          </div>
                        </>
                      )}
                      <div className="prep-output-milestones">
                        <span className="prep-output-milestones__summary">
                          {row.milestoneTotals.completed}/{row.milestoneTotals.total} milestones
                        </span>
                        <div className="prep-output-milestones__chips">
                          {row.milestones.map((milestone) => (
                            <span
                              key={`${row.contractId}-${milestone.label}`}
                              className={`milestone-chip milestone-chip--${milestone.status.replace(/\s+/g, '-').toLowerCase()}`}
                              title={milestone.tooltip || milestone.status}
                            >
                              {milestone.label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className={`work-output-variance ${variance >= 0 ? 'positive' : 'negative'}`}>
                        {variance >= 0 ? '+' : '−'}
                        {numberFormatter.format(Math.abs(variance))}% vs plan
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="work-output-section">
              <div className="work-output-section__heading">
                <span className="work-output-section__title">Construction Work Output</span>
              </div>
              <div className="construction-output-list">
                {constructionRows.map((row) => {
                  const variance = row.actual - row.planned
                  const clampedActual = Math.max(0, Math.min(row.actual, 100))
                  const clampedPlanned = Math.max(0, Math.min(row.planned, 100))
                  const isLoadingRow = constLoading && row.contractId === contractId
                  return (
                    <div key={row.contractId} className="construction-output-card">
                      <div className="construction-output-card__header">
                        <strong>{row.label}</strong>
                        <span className={`status-pill status-pill--${row.status.replace(/\s+/g, '-').toLowerCase()}`}>{row.status}</span>
                      </div>
                      {isLoadingRow ? (
                        <div className="chart-placeholder">Loading…</div>
                      ) : (
                        <>
                          <div className="construction-output-progress" aria-label="Construction progress actual versus planned">
                            <div
                              className="construction-output-progress__actual"
                              style={{ width: `${clampedActual}%` }}
                            />
                            <span
                              className="construction-output-progress__benchmark"
                              style={{ left: `${clampedPlanned}%` }}
                            />
                          </div>
                          <div className="construction-output-meta">
                            <div>
                              <span className="construction-output-meta__label">Actual</span>
                              <strong>{row.actual.toFixed(1)}%</strong>
                            </div>
                            <div>
                              <span className="construction-output-meta__label">Planned</span>
                              <strong>{row.planned.toFixed(1)}%</strong>
                            </div>
                          </div>
                        </>
                      )}
                      <p className="construction-output-commentary">{row.commentary}</p>
                      <span className={`work-output-variance ${variance >= 0 ? 'positive' : 'negative'}`}>
                        {variance >= 0 ? '+' : '−'}
                        {numberFormatter.format(Math.abs(variance))}% vs plan
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="panel-card panel-card--stacked">
          <header>
            <h3>Performance Snapshot</h3>
          </header>
          <div className="kpi-dial-grid">
            <EDial
              title="Schedule Progress"
              value={scheduleProgress}
              min={0}
              max={100}
              unit="%"
              height={200}
              decimals={1}
              thresholds={{ danger: 70, warning: 90 }}
              loading={latestState.loading}
            />
            <EDial
              title="Cost Performance Index"
              value={costPerformance}
              min={0.7}
              max={1.3}
              height={200}
              decimals={2}
              thresholds={{ danger: 0.95, warning: 1.05 }}
              loading={latestState.loading}
            />
            <EDial
              title="Earned vs Planned"
              value={earnedVsPlan}
              min={60}
              max={140}
              unit="%"
              height={200}
              decimals={0}
              thresholds={{ danger: 90, warning: 100 }}
              loading={latestState.loading}
            />
            <EDial
              title="Earned vs Actual Cost"
              value={earnedVsCost}
              min={60}
              max={140}
              unit="%"
              height={200}
              decimals={0}
              thresholds={{ danger: 95, warning: 105 }}
              loading={latestState.loading}
            />
          </div>
          <div className="mini-grid">
            {[
              { type: 'value' as const, label: 'Earned value', value: earnedValue },
              { type: 'value' as const, label: 'Planned value', value: plannedValue },
              { type: 'value' as const, label: 'Actual cost', value: actualCost },
              { type: 'delta' as const, label: 'Cost variance', value: costVariance },
            ].map((item) => (
              <div key={item.label} className="mini-card">
                <span className="mini-card__title">{item.label}</span>
                {item.type === 'delta' ? (
                  <span
                    className={`mini-card__delta ${item.value !== null && item.value < 0 ? 'negative' : 'positive'}`}
                  >
                    {item.value === null
                      ? '—'
                      : `${item.value >= 0 ? '+' : '−'}${formatCompact(Math.abs(item.value))}`}
                  </span>
                ) : (
                  <span className="mini-card__value">{formatCompact(item.value)}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="panel-card panel-card--stacked">
          <header>
            <h3>Quality Performance</h3>
          </header>
          <div className="quality-grid">
            <EDonut title="NCR Status" open={ncrOpen} closed={ncrClosed} height={200} loading={latestState.loading} />
            <EDonut title="QAOR Status" open={qaorOpen} closed={qaorClosed} height={200} loading={latestState.loading} />
            <EDial
              title="Quality Conformance"
              value={qualityConf}
              min={0}
              max={100}
              unit="%"
              thresholds={{ danger: 95, warning: 97 }}
              height={220}
              loading={latestState.loading}
              decimals={1}
            />
          </div>
        </div>

        <div className="panel-card panel-card--stacked">
          <header>
            <h3>Schedule Performance</h3>
          </header>
          <div className="schedule-card">
            <EDial
              title="Schedule Performance Index"
              value={spiValue}
              min={0.7}
              max={1.3}
              thresholds={{ danger: 1.0, warning: 1.05 }}
              height={220}
              loading={spiLoading}
              decimals={2}
            />
            {spiLoading || !spiSeries ? (
              <div className="chart-placeholder">{spiLoading ? 'Loading SPI trend…' : 'No SPI trend available.'}</div>
            ) : (
              <EAreaLine
                dates={spiSeries.dates}
                actual={spiSeries.actual}
                planned={spiSeries.planned}
                height={180}
                loading={spiLoading}
                actualLabel="SPI"
                plannedLabel="Plan"
                valueFormatter={(val) => val.toFixed(2)}
              />
            )}
          </div>
          {showMomentum && spiMomentum && (
            <div className={`schedule-insight schedule-insight--${spiMomentum.delta >= 0 ? 'positive' : 'negative'}`}>
              <span className="schedule-insight__label">7-day SPI momentum</span>
              <span className="schedule-insight__value">
                {spiMomentum.delta >= 0 ? '+' : '-'}
                {Math.abs(spiMomentum.delta).toFixed(2)}
              </span>
              <span className="schedule-insight__hint">
                {spiMomentum.delta >= 0 ? 'Pace improving' : 'Recovery needed'} · {spiMomentum.spanDays} day window ·{' '}
                {spiMomentum.perDay >= 0 ? '+' : '-'}
                {Math.abs(spiMomentum.perDay).toFixed(3)}
                /day
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default ContractRightPanel
