import React, { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, TileLayer, Tooltip, ZoomControl } from 'react-leaflet'

import type { AtomDetailContent } from '../data/atomDetailLibrary'
import type { AtomDetailResponse, AtomExperienceResponse, AtomMobilizationRecord, AtomTrendSeries } from '../../../api'
import { TrendSparkline } from './AtomExperienceFragments'

type HumanProfilePanelProps = {
  detail: AtomDetailContent | null
  detailData: AtomDetailResponse | null
  experience: AtomExperienceResponse | null
  image?: string | null
}

type HumanMobilizationPanelProps = {
  detailData: AtomDetailResponse | null
}

type HumanExecutionPanelProps = {
  detailData: AtomDetailResponse | null
  image?: string | null
}

type JsonRecord = Record<string, unknown>

const toRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null

const getAttributeRecord = (detailData: AtomDetailResponse | null, label: string): JsonRecord | null => {
  if (!detailData) return null
  const attribute = detailData.attributes.find((item) => item.label.toLowerCase() === label.toLowerCase())
  return attribute ? toRecord(attribute.value) : null
}

const coercePercent = (value: unknown): number | null => {
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return null
    return value <= 1 ? value * 100 : value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ''))
    if (Number.isNaN(parsed)) return null
    return parsed <= 1 ? parsed * 100 : parsed
  }
  return null
}

const coerceNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

const coerceString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value.toString()
  return null
}

const formatPercent = (value: number | null, digits = 1): string => {
  if (value === null) return '—'
  const safe = Math.max(0, Math.min(100, value))
  return `${safe.toFixed(digits)}%`
}

const formatNumber = (value: number | null, unit?: string | null, digits = 1): string => {
  if (value === null) return '—'
  return `${value.toFixed(digits)}${unit ? ` ${unit}` : ''}`
}

const buildTrendSeries = (id: string, label: string, raw: unknown, isPercent = true): AtomTrendSeries | null => {
  if (!Array.isArray(raw)) return null
  const points = raw
    .map((entry) => {
      const record = toRecord(entry)
      if (!record) return null
      const date = coerceString(record.date)
      const valueRaw = typeof record.value === 'number' ? record.value : coerceNumber(record.value)
      if (!date || valueRaw === null) return null
      const value = isPercent ? coercePercent(valueRaw) : valueRaw
      if (value === null) return null
      return { date, value }
    })
    .filter((point): point is { date: string; value: number } => !!point)
  if (!points.length) return null
  return {
    id,
    label,
    unit: isPercent ? '%' : undefined,
    points,
  }
}

const characteristicsToList = (characteristics: unknown): Array<{ label: string; value: string }> => {
  if (!Array.isArray(characteristics)) return []
  return characteristics
    .map((entry) => {
      const record = toRecord(entry)
      if (!record) return null
      const label = coerceString(record.label)
      const value = coerceString(record.value)
      if (!label || !value) return null
      return { label, value }
    })
    .filter((item): item is { label: string; value: string } => !!item)
}

export function HumanProfilePanel({ detail, detailData, experience, image }: HumanProfilePanelProps) {
  const profileAttr = useMemo(() => getAttributeRecord(detailData, 'Human Profile'), [detailData])
  const highlightsAttr = useMemo(() => getAttributeRecord(detailData, 'Career Highlights'), [detailData])
  const skillsAttr = useMemo(() => getAttributeRecord(detailData, 'Skills Matrix'), [detailData])
  const wellnessAttr = useMemo(() => getAttributeRecord(detailData, 'Wellness & Readiness'), [detailData])

  const name = detailData?.info.name ?? detail?.info.atomName ?? 'Civil Engineer'
  const description = detail?.info.description ?? experience?.info.spec?.description ?? ''
  const provider = detail?.info.provider ?? experience?.info.contractor ?? 'FWO'
  const owner = detailData?.info.contractor ?? detail?.info.owner ?? 'FWO'

  const contactRecord = toRecord(profileAttr?.contact)
  const educationRecord = toRecord(profileAttr?.education)
  const experienceRecord = toRecord(profileAttr?.experience)
  const demographicsRecord = toRecord(profileAttr?.demographics)

  const characteristics = characteristicsToList(profileAttr?.characteristics)
  const specialties = Array.isArray(experienceRecord?.specialties)
    ? (experienceRecord?.specialties as unknown[]).map(coerceString).filter(Boolean) as string[]
    : []
  const licenses = Array.isArray(experienceRecord?.licenses)
    ? (experienceRecord?.licenses as unknown[]).map(coerceString).filter(Boolean) as string[]
    : []
  const safetyTraining = Array.isArray(experienceRecord?.safetyTraining)
    ? (experienceRecord?.safetyTraining as unknown[])
        .map((entry) => {
          const record = toRecord(entry)
          if (!record) return null
          const label = coerceString(record.name)
          const completed = coerceString(record.completed)
          if (!label) return null
          return { label, completed }
        })
        .filter((item): item is { label: string; completed: string | null } => !!item)
    : []
  const strengths = Array.isArray(profileAttr?.strengths)
    ? (profileAttr?.strengths as unknown[]).map(coerceString).filter(Boolean) as string[]
    : []

  return (
    <div className="human-atom-profile">
      <section className="human-atom-profile__hero">
        <div className="human-atom-profile__media">
          {image || detail?.info.image ? (
            <figure>
              <img src={image ?? detail?.info.image ?? ''} alt={name} />
            </figure>
          ) : (
            <div className="human-atom-profile__placeholder" aria-hidden="true">
              <span>{name.slice(0, 1)}</span>
            </div>
          )}
        </div>
        <div className="human-atom-profile__hero-body">
          <h3>{name}</h3>
          {description ? <p>{description}</p> : null}
          <div className="human-atom-profile__hero-meta">
            <span>
              Provider <strong>{provider}</strong>
            </span>
            <span>
              Owner <strong>{owner}</strong>
            </span>
            {demographicsRecord?.nationality ? (
              <span>
                Nationality <strong>{String(demographicsRecord.nationality)}</strong>
              </span>
            ) : null}
            {Array.isArray(demographicsRecord?.languages) ? (
              <span>
                Languages{' '}
                <strong>
                  {(demographicsRecord.languages as unknown[]).map(coerceString).filter(Boolean).join(' · ')}
                </strong>
              </span>
            ) : null}
          </div>
          <div className="human-atom-profile__contact">
            {contactRecord?.phone ? <span>📞 {String(contactRecord.phone)}</span> : null}
            {contactRecord?.email ? <span>✉️ {String(contactRecord.email)}</span> : null}
          </div>
        </div>
      </section>

      <section className="human-atom-profile__grid">
        <article className="human-atom-profile__card">
          <h4>Core characteristics</h4>
          <dl>
            {characteristics.map((item) => (
              <div key={`${item.label}-${item.value}`}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
            {experienceRecord?.availability ? (
              <div>
                <dt>Availability</dt>
                <dd>{String(experienceRecord.availability)}</dd>
              </div>
            ) : null}
            {demographicsRecord?.homeBase ? (
              <div>
                <dt>Home base</dt>
                <dd>{String(demographicsRecord.homeBase)}</dd>
              </div>
            ) : null}
          </dl>
        </article>

        <article className="human-atom-profile__card">
          <h4>Experience & discipline</h4>
          <ul className="human-atom-profile__list">
            {specialties.length ? (
              <li>
                <strong>Specialties</strong>
                <span>{specialties.join(' · ')}</span>
              </li>
            ) : null}
            {licenses.length ? (
              <li>
                <strong>Licenses</strong>
                <span>{licenses.join(' · ')}</span>
              </li>
            ) : null}
            {Array.isArray(experienceRecord?.certifications) && experienceRecord?.certifications?.length ? (
              <li>
                <strong>Certifications</strong>
                <span>
                  {(experienceRecord.certifications as unknown[]).map(coerceString).filter(Boolean).join(' · ')}
                </span>
              </li>
            ) : null}
            {educationRecord ? (
              <li>
                <strong>Education</strong>
                <span>
                  {educationRecord.degree ?? 'Master of Civil Engineering'}, {educationRecord.university ?? 'UET'}
                </span>
              </li>
            ) : null}
          </ul>
        </article>

        <article className="human-atom-profile__card human-atom-profile__card--compact">
          <h4>Safety training</h4>
          <ul className="human-atom-profile__list">
            {safetyTraining.map((item) => (
              <li key={item.label}>
                <strong>{item.label}</strong>
                <span>{item.completed ? `Completed ${item.completed}` : 'Currency verified'}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="human-atom-profile__card human-atom-profile__card--compact">
          <h4>Strengths</h4>
          <ul className="human-atom-profile__list">
            {strengths.map((item) => (
              <li key={item}>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>

        {highlightsAttr ? (
          <article className="human-atom-profile__card">
            <h4>Career highlights</h4>
            <ul className="human-atom-profile__list">
              {highlightsAttr.notable ? <li key="notable">{String(highlightsAttr.notable)}</li> : null}
              {Array.isArray(highlightsAttr.awards)
                ? (highlightsAttr.awards as unknown[])
                    .map(coerceString)
                    .filter(Boolean)
                    .map((award) => (
                      <li key={award}>
                        <span>{award}</span>
                      </li>
                    ))
                : null}
            </ul>
          </article>
        ) : null}

        {wellnessAttr ? (
          <article className="human-atom-profile__card human-atom-profile__card--compact">
            <h4>Readiness</h4>
            <dl>
              {wellnessAttr.wellnessScore !== undefined ? (
                <div>
                  <dt>Wellness score</dt>
                  <dd>{formatPercent(coercePercent(wellnessAttr.wellnessScore), 0)}</dd>
                </div>
              ) : null}
              {wellnessAttr.fatigueRisk ? (
                <div>
                  <dt>Fatigue risk</dt>
                  <dd>{String(wellnessAttr.fatigueRisk)}</dd>
                </div>
              ) : null}
              {wellnessAttr.lastBreak ? (
                <div>
                  <dt>Last break</dt>
                  <dd>{String(wellnessAttr.lastBreak)}</dd>
                </div>
              ) : null}
            </dl>
          </article>
        ) : null}
      </section>
    </div>
  )
}

export function HumanMobilizationPanel({ detailData }: HumanMobilizationPanelProps) {
  const mobilizationAttr = useMemo(() => getAttributeRecord(detailData, 'Mobilization KPIs'), [detailData])
  const kpis = toRecord(mobilizationAttr?.kpis)
  const assignmentsAttr = Array.isArray(mobilizationAttr?.assignments) ? (mobilizationAttr?.assignments as unknown[]) : []
  const trendsAttr = toRecord(mobilizationAttr?.trend)
  const contextNotes = Array.isArray(mobilizationAttr?.contextNotes)
    ? (mobilizationAttr?.contextNotes as unknown[]).map(coerceString).filter(Boolean)
    : []

  const assignments: Array<{
    location: string
    role?: string | null
    startDate?: string | null
    endDate?: string | null
    status?: string | null
  }> = assignmentsAttr
    .map((entry) => {
      const record = toRecord(entry)
      if (!record) return null
      const location = coerceString(record.location)
      if (!location) return null
      return {
        location,
        role: coerceString(record.role),
        startDate: coerceString(record.startDate),
        endDate: coerceString(record.endDate),
        status: coerceString(record.status),
      }
    })
    .filter((item): item is {
      location: string
      role?: string | null
      startDate?: string | null
      endDate?: string | null
      status?: string | null
    } => !!item)

  const mobilizationRecords = detailData?.mobilization ?? []
  const mergedAssignments =
    assignments.length > 0
      ? assignments
      : mobilizationRecords.map((record) => ({
          location: record.location ?? '—',
          role: coerceString(record.metadata?.role),
          startDate: record.mobilizedOn,
          endDate: record.demobilizedOn,
          status: record.status,
        }))

  const trendAttendance = buildTrendSeries('attendance', 'Attendance', trendsAttr?.attendance, true)
  const trendShift = buildTrendSeries('shift', 'Shift adherence', trendsAttr?.shiftAdherence, true)
  const trendReadiness = buildTrendSeries('readiness', 'Readiness score', trendsAttr?.readiness, true)

  const cards = [
    { key: 'onboardingReadiness', label: 'Onboarding readiness', format: formatPercent },
    { key: 'permitReadiness', label: 'Permit readiness', format: formatPercent },
    { key: 'shiftAdherence', label: 'Shift adherence', format: formatPercent },
    { key: 'attendance', label: 'Attendance', format: formatPercent },
    { key: 'toolboxTalkParticipation', label: 'Toolbox talk participation', format: formatPercent },
    { key: 'certificationCurrency', label: 'Certification currency', format: formatPercent },
    { key: 'readinessScore', label: 'Readiness score', format: formatPercent },
    { key: 'trainingCompletion', label: 'Training completion', format: formatPercent },
    {
      key: 'siteAccessApprovals',
      label: 'Site access approvals',
      format: (value: number | null) => (value === null ? '—' : `${value}`),
    },
    {
      key: 'openActions',
      label: 'Open actions',
      format: (value: number | null) => (value === null ? '—' : `${value}`),
    },
  ].map((card) => {
    const raw = kpis ? kpis[card.key] : null
    const numeric =
      card.format === formatPercent ? coercePercent(raw) : typeof raw === 'number' ? raw : coerceNumber(raw)
    return {
      key: card.key,
      label: card.label,
      value: card.format(numeric),
    }
  })

  const travelStatus = coerceString(kpis?.travelStatus) ?? '—'
  const equipmentAccess = coerceString(kpis?.equipmentAccess) ?? '—'
  const travelWindow = coerceString(kpis?.travelWindow)

  return (
    <div className="human-atom-mobilization">
      <section className="human-atom-mobilization__kpis">
        {cards.map((card) => (
          <article key={card.key} className="human-atom-kpi-card">
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </section>

      <section className="human-atom-status">
        <div>
          <h4>Status & access</h4>
          <ul className="human-atom-status-list">
            <li>
              <strong>Travel status</strong>
              <span>{travelStatus}</span>
            </li>
            <li>
              <strong>Equipment access</strong>
              <span>{equipmentAccess}</span>
            </li>
            {travelWindow ? (
              <li>
                <strong>Next travel window</strong>
                <span>{travelWindow}</span>
              </li>
            ) : null}
          </ul>
        </div>
        {contextNotes.length ? (
          <div>
            <h4>Operational notes</h4>
            <ul className="human-atom-status-list">
              {contextNotes.map((note) => (
                <li key={note}>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="human-atom-assignments">
        <h4>Current assignment locations</h4>
        <table>
          <thead>
            <tr>
              <th>Location</th>
              <th>Role</th>
              <th>Window</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {mergedAssignments.length ? (
              mergedAssignments.map((assignment) => (
                <tr key={`${assignment.location}-${assignment.startDate ?? 'present'}`}>
                  <td>{assignment.location}</td>
                  <td>{assignment.role ?? '—'}</td>
                  <td>
                    {assignment.startDate ?? '—'} → {assignment.endDate ?? 'Present'}
                  </td>
                  <td>{assignment.status ?? 'Active'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>No mobilization assignments recorded.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="human-atom-trends">
        {[trendAttendance, trendShift, trendReadiness]
          .filter((series): series is AtomTrendSeries => !!series)
          .map((series) => (
            <article key={series.id} className="human-atom-trend-card">
              <header>
                <h5>{series.label}</h5>
                <span>{series.points.length ? `${series.points[series.points.length - 1].value.toFixed(1)}%` : '—'}</span>
              </header>
              <TrendSparkline series={series} />
            </article>
          ))}
      </section>
    </div>
  )
}

export function HumanExecutionPanel({ detailData, image }: HumanExecutionPanelProps) {
  const executionAttr = useMemo(() => getAttributeRecord(detailData, 'Execution Snapshot'), [detailData])
  const profileAttr = toRecord(executionAttr?.profileCard)
  const hoursAttr = toRecord(executionAttr?.hours)
  const worksiteAttr = toRecord(executionAttr?.worksite)
  const allocationsAttr = Array.isArray(executionAttr?.allocations) ? (executionAttr?.allocations as unknown[]) : []
  const workCompletedAttr = toRecord(executionAttr?.workCompleted)
  const performanceAttr = toRecord(executionAttr?.performance)

  const baseLocationAttr = useMemo(() => getAttributeRecord(detailData, 'Base Location'), [detailData])

  const [mapReady, setMapReady] = useState(false)
  useEffect(() => {
    setMapReady(true)
  }, [])

  const lat =
    coerceNumber(worksiteAttr?.lat) ??
    (typeof baseLocationAttr?.lat === 'number' ? (baseLocationAttr.lat as number) : null) ??
    35.6179
  const lng =
    coerceNumber(worksiteAttr?.lng) ??
    (typeof baseLocationAttr?.lng === 'number' ? (baseLocationAttr.lng as number) : null) ??
    73.1371

  const worksiteName = coerceString(worksiteAttr?.name) ?? coerceString(baseLocationAttr?.site) ?? 'Worksite'
  const lastSeen = coerceString(worksiteAttr?.lastSeen)

  const allocations = allocationsAttr
    .map((entry) => {
      const record = toRecord(entry)
      if (!record) return null
      const project = coerceString(record.project)
      if (!project) return null
      return {
        project,
        role: coerceString(record.role),
        start: coerceString(record.start),
        end: coerceString(record.end),
      }
    })
    .filter(
      (item): item is { project: string; role: string | null; start: string | null; end: string | null } => !!item,
    )

  const hoursCards = [
    { key: 'today', label: 'Hours today', value: formatNumber(coerceNumber(hoursAttr?.today), 'h', 1) },
    { key: 'weekToDate', label: 'Week-to-date', value: formatNumber(coerceNumber(hoursAttr?.weekToDate), 'h', 1) },
    { key: 'overtime', label: 'Overtime', value: formatNumber(coerceNumber(hoursAttr?.overtime), 'h', 1) },
    { key: 'breaks', label: 'Breaks', value: formatNumber(coerceNumber(hoursAttr?.breaks), 'h', 1) },
  ]

  const workCompletedLists = {
    tasks: Array.isArray(workCompletedAttr?.tasks)
      ? (workCompletedAttr?.tasks as unknown[]).map(coerceString).filter(Boolean)
      : [],
    milestones: Array.isArray(workCompletedAttr?.milestones)
      ? (workCompletedAttr?.milestones as unknown[]).map(coerceString).filter(Boolean)
      : [],
    approvals: Array.isArray(workCompletedAttr?.approvals)
      ? (workCompletedAttr?.approvals as unknown[]).map(coerceString).filter(Boolean)
      : [],
  }

  const performanceCards = [
    { key: 'productivity', label: 'Productivity', decimals: 2 },
    { key: 'qualityScore', label: 'Quality score', decimals: 1 },
    { key: 'reworkRate', label: 'Rework rate', decimals: 2 },
    { key: 'collaboration', label: 'Collaboration', decimals: 1 },
    { key: 'utilization', label: 'Utilization', decimals: 1 },
    { key: 'slaAdherence', label: 'SLA adherence', decimals: 1 },
  ].map((definition) => {
    const record = toRecord(performanceAttr?.[definition.key])
    if (!record) {
      return {
        id: definition.key,
        label: definition.label,
        value: '—',
        series: null as AtomTrendSeries | null,
      }
    }
    const rawValue = coerceNumber(record.value)
    const unit = coerceString(record.unit)
    const isPercent = unit ? unit.includes('%') : definition.key !== 'productivity'
    const valueFormatted =
      rawValue === null
        ? '—'
        : isPercent
        ? formatPercent(coercePercent(rawValue), definition.decimals)
        : formatNumber(rawValue, unit, definition.decimals)
    const series = buildTrendSeries(definition.key, definition.label, record.trend, isPercent)
    return {
      id: definition.key,
      label: definition.label,
      value: valueFormatted,
      series,
    }
  })

  const safetyRecord = toRecord(performanceAttr?.safetyIncidents)
  const safetyCount = coerceNumber(safetyRecord?.count)
  const safetySeverity = coerceString(safetyRecord?.severity)

  return (
    <div className="human-atom-execution">
      <section className="human-atom-execution__header">
        <div className="human-atom-execution__profile">
          <div className="human-atom-execution__avatar">
            {image || profileAttr?.avatar ? (
              <img src={(profileAttr?.avatar as string) ?? image ?? ''} alt={profileAttr?.role ? String(profileAttr.role) : 'Civil engineer'} />
            ) : (
              <span>{detailData?.info.name?.slice(0, 1) ?? 'C'}</span>
            )}
          </div>
          <div>
            <h4>{profileAttr?.role ?? detailData?.info.name ?? 'Civil Engineer'}</h4>
            <p>{profileAttr?.phone ? `📞 ${profileAttr.phone}` : null}</p>
            <p>{profileAttr?.email ? `✉️ ${profileAttr.email}` : null}</p>
            {Array.isArray(profileAttr?.skills) ? (
              <ul>
                {(profileAttr.skills as unknown[]).map(coerceString).filter(Boolean).map((skill) => (
                  <li key={skill}>{skill}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <div className="human-atom-execution__map">
          <header>
            <div>
              <strong>{worksiteName}</strong>
              {lastSeen ? <span>Last seen {lastSeen}</span> : null}
            </div>
            <span>
              {lat.toFixed(3)}° N · {lng.toFixed(3)}° E
            </span>
          </header>
          <div className="human-atom-execution__map-viewport">
            {mapReady ? (
              <MapContainer
                center={[lat, lng]}
                zoom={14}
                zoomSnap={0.25}
                scrollWheelZoom={false}
                className="human-atom-execution__leaflet"
                zoomControl={false}
              >
                <ZoomControl position="topright" />
                <TileLayer
                  attribution="© OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <CircleMarker center={[lat, lng]} radius={14} color="rgba(59,130,246,0.4)" fillOpacity={0.9}>
                  <Tooltip direction="top" offset={[0, -8]} opacity={1} permanent>
                    <div>
                      <strong>{worksiteName}</strong>
                    </div>
                  </Tooltip>
                </CircleMarker>
              </MapContainer>
            ) : (
              <div className="human-atom-execution__map-placeholder" />
            )}
          </div>
        </div>
      </section>

      <section className="human-atom-execution__grid">
        <article className="human-atom-execution__card human-atom-hours">
          <h4>Working hours</h4>
          <div className="human-atom-hours__grid">
            {hoursCards.map((card) => (
              <div key={card.key}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="human-atom-execution__card human-atom-allocations">
          <h4>Project allocations</h4>
          {allocations.length ? (
            <ul>
              {allocations.map((allocation) => (
                <li key={`${allocation.project}-${allocation.start ?? 'present'}`}>
                  <strong>{allocation.project}</strong>
                  {allocation.role ? <span>{allocation.role}</span> : null}
                  <span>
                    {allocation.start ?? '—'} → {allocation.end ?? 'Present'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No active allocations captured.</p>
          )}
        </article>

        <article className="human-atom-execution__card human-atom-worklog">
          <h4>Work completed</h4>
          <div className="human-atom-worklog__lists">
            {workCompletedLists.tasks.length ? (
              <div>
                <strong>Tasks</strong>
                <ul>
                  {workCompletedLists.tasks.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {workCompletedLists.milestones.length ? (
              <div>
                <strong>Milestones</strong>
                <ul>
                  {workCompletedLists.milestones.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {workCompletedLists.approvals.length ? (
              <div>
                <strong>Approvals</strong>
                <ul>
                  {workCompletedLists.approvals.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </article>

        <article className="human-atom-execution__card human-atom-performance">
          <h4>Performance KPIs</h4>
          <div className="human-atom-performance__grid">
            {performanceCards.map((card) => (
              <div key={card.id} className="human-atom-performance__metric">
                <header>
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                </header>
                {card.series ? <TrendSparkline series={card.series} /> : null}
              </div>
            ))}
            <div className="human-atom-performance__metric human-atom-performance__metric--safety">
              <header>
                <span>Safety incidents</span>
                <strong>{safetyCount !== null ? `${safetyCount}` : '0'}</strong>
              </header>
              <p>{safetySeverity ?? 'None recorded'}</p>
            </div>
          </div>
        </article>
      </section>
    </div>
  )
}
