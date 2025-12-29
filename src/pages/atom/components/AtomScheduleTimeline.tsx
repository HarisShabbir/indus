import React, { useEffect, useMemo, useState } from 'react'

import type { AtomScheduleDailyResponse, AtomScheduleSensorSlot, AtomScheduleTimeSlot, AtomScheduleVolumeSlot } from '../../../api'
import { formatNumber, formatPercent } from '../utils'

type AtomScheduleTimelineProps = {
  data: AtomScheduleDailyResponse | null
  loading: boolean
  error: string | null
  onRefresh?: () => void
}

const TIMELINE_TOTAL_MINUTES = 1440

const STATUS_CLASS_MAP: Record<string, string> = {
  busy: 'atom-daily-slot--busy',
  monitoring: 'atom-daily-slot--monitoring',
  idle: 'atom-daily-slot--idle',
  completed: 'atom-daily-slot--completed',
  extended: 'atom-daily-slot--extended',
}

const STATUS_LABEL_MAP: Record<string, string> = {
  busy: 'Busy',
  monitoring: 'Monitoring',
  idle: 'Idle / Standby',
  completed: 'Completed',
  extended: 'Extended',
}

const minutesToHours = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—'
  return `${(value / 60).toFixed(1)}h`
}

const buildSegmentKey = (slot: AtomScheduleTimeSlot, index: number) =>
  `${slot.start}-${slot.end}-${slot.status}-${index}`

const toPercent = (minutes: number) => {
  if (minutes <= 0) return 0
  return Math.max(0.5, (minutes / TIMELINE_TOTAL_MINUTES) * 100)
}

const uniqueValues = (records: AtomScheduleTimeSlot[], key: 'process' | 'location') => {
  const seen = new Set<string>()
  records.forEach((slot) => {
    const value = (slot[key] ?? '').trim()
    if (value) seen.add(value)
  })
  return Array.from(seen)
}

const normaliseStatus = (status?: string | null) => {
  const value = (status ?? '').toLowerCase()
  if (value in STATUS_CLASS_MAP) return value
  if (value.includes('monitor')) return 'monitoring'
  if (value.includes('idle') || value.includes('standby')) return 'idle'
  if (value.includes('complete')) return 'completed'
  if (value.includes('extend')) return 'extended'
  return 'busy'
}

const formatDateLabel = (isoDate: string) => {
  try {
    const date = new Date(isoDate)
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
    })
  } catch (error) {
    return isoDate
  }
}

const AtomScheduleTimeline: React.FC<AtomScheduleTimelineProps> = ({ data, loading, error, onRefresh }) => {
  const availableDates = data?.availableDates ?? []
  const [selectedDate, setSelectedDate] = useState<string | null>(availableDates[0] ?? null)
  const [processFilter, setProcessFilter] = useState<string>('all')
  const [locationFilter, setLocationFilter] = useState<string>('all')

  useEffect(() => {
    if (!availableDates.length) {
      setSelectedDate(null)
      return
    }
    if (!selectedDate || !availableDates.includes(selectedDate)) {
      setSelectedDate(availableDates[0])
    }
  }, [availableDates, selectedDate])

  const records = data?.records ?? []
  const activeRecord = useMemo(() => {
    if (!selectedDate) return null
    return records.find((record) => record.scheduleDate === selectedDate) ?? null
  }, [records, selectedDate])

  const allSlots = useMemo(() => activeRecord?.timeSlots ?? [], [activeRecord])
  const processOptions = useMemo(() => uniqueValues(allSlots, 'process'), [allSlots])
  const locationOptions = useMemo(() => uniqueValues(allSlots, 'location'), [allSlots])

  const filteredSlots = useMemo(() => {
    if (!allSlots.length) return []
    return allSlots.filter((slot) => {
      const matchesProcess = processFilter === 'all' || (slot.process ?? '').trim() === processFilter
      const matchesLocation = locationFilter === 'all' || (slot.location ?? '').trim() === locationFilter
      return matchesProcess && matchesLocation
    })
  }, [allSlots, processFilter, locationFilter])

  const timelineSegments = useMemo(() => {
    if (!filteredSlots.length) return [] as Array<{ key: string; width: number; slot: AtomScheduleTimeSlot; gap?: boolean }>
    const segments: Array<{ key: string; width: number; slot: AtomScheduleTimeSlot; gap?: boolean }> = []
    let cursor = 0
    const slots = [...filteredSlots].sort((a, b) => (a.startMinutes ?? 0) - (b.startMinutes ?? 0))
    slots.forEach((slot, index) => {
      const startMinutes = slot.startMinutes ?? 0
      if (startMinutes > cursor) {
        const gapMinutes = startMinutes - cursor
        segments.push({
          key: `gap-${cursor}-${index}`,
          width: toPercent(gapMinutes),
          slot: {
            ...slot,
            status: 'idle',
            process: undefined,
            location: undefined,
            start: '--',
            end: '--',
            durationMinutes: gapMinutes,
          },
          gap: true,
        })
      }
      const width = toPercent(slot.durationMinutes)
      segments.push({ key: buildSegmentKey(slot, index), width, slot })
      cursor = slot.endMinutes ?? startMinutes + slot.durationMinutes
    })
    if (cursor < TIMELINE_TOTAL_MINUTES) {
      const gapMinutes = TIMELINE_TOTAL_MINUTES - cursor
      segments.push({
        key: `gap-tail-${cursor}`,
        width: toPercent(gapMinutes),
        slot: {
          start: '--',
          end: '--',
          process: undefined,
          location: undefined,
          status: 'idle',
          durationMinutes: gapMinutes,
          startMinutes: cursor,
          endMinutes: TIMELINE_TOTAL_MINUTES,
          notes: undefined,
        },
        gap: true,
      })
    }
    return segments
  }, [filteredSlots])

  const summary = activeRecord
    ? {
        busy: activeRecord.totalBusyMinutes,
        idle: activeRecord.totalIdleMinutes,
        allocations: activeRecord.totalAllocations,
        volume: activeRecord.volumeCommitted,
        unit: activeRecord.volumeUnit,
      }
    : null

  const volumeSlots = activeRecord?.volumeSlots ?? []
  const sensorSlots = activeRecord?.sensorSlots ?? []

  if (!data && !loading && !error) {
    return null
  }

  return (
    <section className="atom-daily-schedule">
      <header className="atom-daily-schedule__header">
        <div>
          <h3>Daily scheduling · {data?.atomName ?? 'Selected atom'}</h3>
          {summary ? <span>{formatDateLabel(activeRecord?.scheduleDate ?? '')}</span> : null}
        </div>
        <div className="atom-daily-schedule__actions">
          {error ? <span className="atom-error">{error}</span> : null}
          {onRefresh ? (
            <button type="button" className="atom-refresh" onClick={onRefresh} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          ) : null}
        </div>
      </header>

      {loading ? (
        <div className="atom-loading">Loading daily allocations…</div>
      ) : !data ? (
        <div className="atom-empty-state">
          <h4>Select an atom</h4>
          <p>Choose an atom from the catalog to view daily scheduling allocations.</p>
        </div>
      ) : !records.length ? (
        <div className="atom-empty-state">
          <h4>No allocations recorded</h4>
          <p>This atom does not have daily scheduling data yet.</p>
        </div>
      ) : (
        <>
          <div className="atom-daily-schedule__filters">
            <label>
              Date
              <select value={selectedDate ?? ''} onChange={(event) => setSelectedDate(event.target.value || null)}>
                {availableDates.map((date) => (
                  <option key={date} value={date}>
                    {formatDateLabel(date)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Process
              <select value={processFilter} onChange={(event) => setProcessFilter(event.target.value)}>
                <option value="all">All</option>
                {processOptions.map((process) => (
                  <option key={process} value={process}>
                    {process}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Location
              <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
                <option value="all">All</option>
                {locationOptions.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {summary ? (
            <div className="atom-daily-schedule__summary">
              <article className="atom-metric-card">
                <span>Busy time</span>
                <strong>{minutesToHours(summary.busy)}</strong>
              </article>
              <article className="atom-metric-card">
                <span>Idle / standby</span>
                <strong>{minutesToHours(summary.idle)}</strong>
              </article>
              <article className="atom-metric-card">
                <span>Allocations</span>
                <strong>{formatNumber(summary.allocations)}</strong>
              </article>
              <article className="atom-metric-card">
                <span>Volume committed</span>
                <strong>
                  {summary.volume !== null && summary.volume !== undefined
                    ? `${summary.volume}${summary.unit ? ` ${summary.unit}` : ''}`
                    : '—'}
                </strong>
              </article>
              <article className="atom-metric-card">
                <span>Utilisation</span>
                <strong>
                  {summary.busy + summary.idle > 0
                    ? formatPercent(summary.busy / (summary.busy + summary.idle))
                    : '--'}
                </strong>
              </article>
            </div>
          ) : null}

          <div className="atom-daily-timeline">
            <div className="atom-daily-timeline__scale">
              {[0, 4, 8, 12, 16, 20, 24].map((hour) => (
                <span key={hour}>{hour.toString().padStart(2, '0')}:00</span>
              ))}
            </div>
            <div className="atom-daily-timeline__track" role="list">
              {timelineSegments.length ? (
                timelineSegments.map((segment) => {
                  const slotStatus = normaliseStatus(segment.slot.status)
                  const className = `atom-daily-slot ${STATUS_CLASS_MAP[slotStatus] ?? STATUS_CLASS_MAP.busy} ${
                    segment.gap ? 'atom-daily-slot--gap' : ''
                  }`
                  const label = segment.slot.process ?? STATUS_LABEL_MAP[slotStatus]
                  const timeframe =
                    segment.slot.start !== '--' && segment.slot.end !== '--'
                      ? `${segment.slot.start} → ${segment.slot.end}`
                      : '—'
                  return (
                    <div
                      key={segment.key}
                      className={className}
                      style={{ flexBasis: `${segment.width}%` }}
                      role="listitem"
                    >
                      <span className="atom-daily-slot__label">{label}</span>
                      <span className="atom-daily-slot__time">{timeframe}</span>
                    </div>
                  )
                })
              ) : (
                <div className="atom-daily-slot atom-daily-slot--empty">No time slots match the current filters.</div>
              )}
            </div>
            <div className="atom-daily-timeline__legend">
              {Object.entries(STATUS_LABEL_MAP).map(([key, label]) => (
                <span key={key} className={STATUS_CLASS_MAP[key] ?? STATUS_CLASS_MAP.busy}>
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="atom-daily-schedule__grid">
            <section className="atom-daily-panel">
              <header>
                <h4>Volume allocations</h4>
              </header>
              {volumeSlots.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Quantity</th>
                      <th>Process</th>
                      <th>Window</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {volumeSlots.map((slot: AtomScheduleVolumeSlot, index: number) => (
                      <tr key={`${slot.material ?? 'material'}-${index}`}>
                        <td>{slot.material ?? '—'}</td>
                        <td>
                          {slot.quantity != null
                            ? `${slot.quantity}${slot.unit ? ` ${slot.unit}` : ''}`
                            : '—'}
                        </td>
                        <td>{slot.process ?? '—'}</td>
                        <td>{slot.window ?? '—'}</td>
                        <td>{slot.status ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="atom-daily-empty">No volume allocations logged.</p>
              )}
            </section>

            <section className="atom-daily-panel">
              <header>
                <h4>Sensor-dependent allocations</h4>
              </header>
              {sensorSlots.length ? (
                <ul className="atom-daily-sensors">
                  {sensorSlots.map((sensor: AtomScheduleSensorSlot, index: number) => (
                    <li key={`${sensor.label}-${index}`}>
                      <strong>{sensor.label}</strong>
                      {sensor.state ? <span>{sensor.state}</span> : null}
                      <small>
                        {sensor.elapsedHours != null ? `${sensor.elapsedHours.toFixed(1)}h` : '—'} /
                        {sensor.targetHours != null ? `${sensor.targetHours.toFixed(1)}h` : '—'}
                      </small>
                      <span className="atom-daily-sensor-status">{sensor.status ?? 'Monitoring'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="atom-daily-empty">No sensor allocations logged.</p>
              )}
            </section>
          </div>

          {activeRecord?.notes ? <p className="atom-daily-notes">{activeRecord.notes}</p> : null}
        </>
      )}
    </section>
  )
}

export default AtomScheduleTimeline
