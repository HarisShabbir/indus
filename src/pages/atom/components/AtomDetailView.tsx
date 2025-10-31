import React, { useEffect, useMemo, useState } from 'react'

import {
  fetchAtomManifestation,
  fetchAtomExperience,
  fetchAtomDetail,
  type AtomManifestationResponse,
  type AtomExperienceResponse,
  type AtomDetailResponse,
} from '../../../api'
import { ATOM_DETAIL_LIBRARY, type AtomDetailKey } from '../data/atomDetailLibrary'
import { getFallbackManifestation } from '../data/manifestationFallback'
import { resolveAtomExperienceConfig } from '../data/atomExperienceMap'
import { MobilizationNodesBoard, ExecutionDashboard } from './ExperienceLayouts'
import { HumanProfilePanel, HumanMobilizationPanel, HumanExecutionPanel } from './HumanAtomPanels'

const MANIFEST_PAGE_SIZE = 20
type DetailTab = 'info' | 'manifest' | 'mobilization' | 'execution' | 'profile'
type AtomDetailViewProps = {
  detailKey: string | null
}

export function AtomDetailView({ detailKey }: AtomDetailViewProps) {
  const detail = detailKey ? ATOM_DETAIL_LIBRARY[detailKey] : null
  const experienceConfig = useMemo(() => resolveAtomExperienceConfig(detailKey ?? undefined), [detailKey])
  const [activeTab, setActiveTab] = useState<DetailTab>('info')
  const [manifestation, setManifestation] = useState<AtomManifestationResponse | null>(null)
  const [manifestLoading, setManifestLoading] = useState(false)
  const [manifestError, setManifestError] = useState<string | null>(null)
  const [manifestPage, setManifestPage] = useState(1)
  const [experience, setExperience] = useState<AtomExperienceResponse | null>(null)
  const [experienceLoading, setExperienceLoading] = useState(false)
  const [experienceError, setExperienceError] = useState<string | null>(null)
  const [detailData, setDetailData] = useState<AtomDetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    setManifestPage(1)
    setExperience(null)
    setExperienceError(null)
  }, [detailKey])

  useEffect(() => {
    if (!detail?.manifestationSource) {
      setManifestation(null)
      setManifestError(null)
      setManifestLoading(false)
      return
    }

    const { vendor, machineType, model } = detail.manifestationSource
    let cancelled = false
    setManifestation(null)
    setManifestLoading(true)
    setManifestError(null)

    fetchAtomManifestation({ vendor, machineType, model })
      .then((response) => {
        if (cancelled) return
        if (response.attributes.length) {
          setManifestation(response)
          return
        }
        const fallback = getFallbackManifestation(vendor, machineType, model)
        if (fallback) {
          setManifestation(fallback)
        } else {
          setManifestation(response)
        }
      })
      .catch((error) => {
        console.error('Failed to load manifestation layer', error)
        if (cancelled) return
        const fallback = getFallbackManifestation(vendor, machineType, model)
        if (fallback) {
          setManifestation(fallback)
        } else {
          setManifestation(null)
          setManifestError('Unable to load manifestation data right now.')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setManifestLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [detail?.manifestationSource])

  useEffect(() => {
    if (!experienceConfig.atomUuid) {
      setDetailData(null)
      setDetailError(null)
      setDetailLoading(false)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)
    fetchAtomDetail(experienceConfig.atomUuid)
      .then((response) => {
        if (cancelled) return
        setDetailData(response)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('Failed to load atom detail from API', error)
        setDetailError('Unable to load live profile data right now.')
        setDetailData(null)
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [experienceConfig.atomUuid])

  useEffect(() => {
    if (!experienceConfig.atomUuid) {
      setExperience(null)
      setExperienceError(null)
      setExperienceLoading(false)
      return
    }
    let cancelled = false
    setExperienceLoading(true)
    setExperienceError(null)
    fetchAtomExperience(experienceConfig.atomUuid)
      .then((data) => {
        if (cancelled) return
        setExperience(data)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('Failed to load atom experience', error)
        setExperienceError('Live telemetry could not be loaded right now.')
        setExperience(null)
      })
      .finally(() => {
        if (!cancelled) {
          setExperienceLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [experienceConfig.atomUuid])

  const isHumanAtom = useMemo(() => {
    const libraryClass = detail?.info.mainClass?.toLowerCase() ?? ''
    const librarySubClass = detail?.info.subClass2?.toLowerCase() ?? ''
    const dataCategory = (detailData?.info.category ?? experience?.info.category ?? '').toString().toLowerCase()
    const dataType = (detailData?.info.typeName ?? experience?.info.typeName ?? '').toString().toLowerCase()
    return (
      libraryClass === 'people' ||
      libraryClass === 'actors' ||
      librarySubClass === 'professional' ||
      dataCategory === 'actors' ||
      dataType === 'person'
    )
  }, [detail?.info.mainClass, detail?.info.subClass2, detailData?.info.category, detailData?.info.typeName, experience?.info.category, experience?.info.typeName])

  useEffect(() => {
    setActiveTab(isHumanAtom ? 'profile' : 'info')
  }, [detailKey, isHumanAtom])

  if (!detail) {
    return (
      <section className="atom-detail atom-detail--empty">
        <p>Select an atom vendor or model from the navigation to explore detailed information.</p>
      </section>
    )
  }

  const headerName = detailData?.info.name ?? detail.info.atomName
  const headerAtomId = detailData?.info.atomId ?? detail.info.atomId
  const headerOwner = detailData?.info.contractor ?? detail.info.owner
  const headerCategory = detailData?.info.typeName ?? detail.info.subClass2

  const infoRows = [
    { label: 'Atom ID', value: headerAtomId },
    { label: 'Atom Name', value: headerName },
    { label: 'Atom Creator (OEM)', value: detail.info.provider },
    { label: 'Atom Owner', value: headerOwner },
    { label: 'Main Class', value: detail.info.mainClass },
    { label: 'SubClass 1', value: detail.info.subClass1 },
    { label: 'SubClass 2', value: detail.info.subClass2 },
  ]

  const tabs = isHumanAtom
    ? [
        { key: 'profile', label: 'Human characteristics' },
        { key: 'manifest', label: 'Manifestation Layer' },
        { key: 'mobilization', label: 'Mobilization' },
        { key: 'execution', label: 'Execution' },
      ]
    : [
        { key: 'info', label: 'Info' },
        { key: 'manifest', label: 'Manifestation Layer' },
        { key: 'mobilization', label: 'Mobilization Nodes' },
        { key: 'execution', label: 'Execution Layer' },
      ]

  return (
    <section className="atom-detail">
      <header className="atom-detail__header">
        <div>
          <h3>{headerName}</h3>
          <span>
            {detail.info.mainClass} · {headerCategory}
          </span>
        </div>
        <div className="atom-detail__meta">
          <span>Atom ID · {headerAtomId}</span>
          <span>Provider · {detail.info.provider}</span>
          <span>Owner · {headerOwner}</span>
        </div>
      </header>
      <div className="atom-detail__tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`atom-detail__tab ${activeTab === tab.key ? 'is-active' : ''}`}
            onClick={() => setActiveTab(tab.key as DetailTab)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === 'info' && !isHumanAtom ? (
        <div className="atom-detail__panel atom-detail__panel--info">
          <div className="atom-detail__info">
            {detail.info.image ? (
              <figure>
                <img src={detail.info.image} alt={detail.info.atomName} />
              </figure>
            ) : null}
            <div className="atom-detail__info-body">
              <table className="atom-info-table">
                <tbody>
                  {infoRows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      <td>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="atom-detail__description">{detail.info.description}</p>
            </div>
          </div>
        </div>
      ) : null}
      {activeTab === 'manifest' ? (
        <div className="atom-detail__panel">
          {!detail.manifestationSource ? (
            <p className="atom-detail__placeholder">Select a specific vendor model to view the manifestation layer.</p>
          ) : manifestLoading ? (
            <p className="atom-detail__placeholder">Loading manifestation data…</p>
          ) : manifestError ? (
            <div className="atom-error">{manifestError}</div>
          ) : manifestation && manifestation.attributes.length ? (
            <ManifestationTable
              response={manifestation}
              page={manifestPage}
              pageSize={MANIFEST_PAGE_SIZE}
              onPageChange={setManifestPage}
            />
          ) : (
            <p className="atom-detail__placeholder">No manifestation attributes captured for this model yet.</p>
          )}
        </div>
      ) : null}
      {activeTab === 'profile' && isHumanAtom ? (
        <div className="atom-detail__panel">
          {detailLoading ? (
            <p className="atom-detail__placeholder">Refreshing human profile…</p>
          ) : detailError ? (
            <p className="atom-detail__placeholder">{detailError}</p>
          ) : (
            <HumanProfilePanel
              detail={detail}
              detailData={detailData}
              experience={experience}
              image={experienceConfig.image ?? detail.info.image}
            />
          )}
        </div>
      ) : null}
      {activeTab === 'mobilization' ? (
        <div className="atom-detail__panel">
          {isHumanAtom ? (
            detailLoading ? (
              <p className="atom-detail__placeholder">Syncing mobilization insights…</p>
            ) : detailError ? (
              <p className="atom-detail__placeholder">{detailError}</p>
            ) : (
              <HumanMobilizationPanel detailData={detailData} />
            )
          ) : experienceLoading ? (
            <p className="atom-detail__placeholder">Syncing mobilization insights…</p>
          ) : experienceError ? (
            <p className="atom-detail__placeholder">{experienceError}</p>
          ) : experience ? (
            <MobilizationNodesBoard experience={experience} />
          ) : detail.mobilization && detail.mobilization.length ? (
            <div className="atom-detail__panel atom-detail__panel--table">
              <table className="atom-detail__table">
                <thead>
                  <tr>
                    <th>Location</th>
                    <th>Window</th>
                  <th>Status</th>
                  <th>Node Data</th>
                </tr>
              </thead>
              <tbody>
                {detail.mobilization.map((row, index) => (
                  <tr key={`${row.location}-${index}`}>
                    <td>{row.location}</td>
                    <td>{row.window}</td>
                    <td>{row.status}</td>
                    <td>
                      {row.metadata && Object.keys(row.metadata).length
                        ? Object.entries(row.metadata)
                            .map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1')}: ${value}`)
                            .join(' • ')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <p className="atom-detail__placeholder">Mobilization timeline not captured for this item yet.</p>
          )}
        </div>
      ) : null}
      {activeTab === 'execution' ? (
        <div className="atom-detail__panel atom-detail__adaptive">
          {isHumanAtom ? (
            detailLoading ? (
              <p className="atom-detail__placeholder">Loading execution telemetry…</p>
            ) : detailError ? (
              <p className="atom-detail__placeholder">{detailError}</p>
            ) : (
              <HumanExecutionPanel detailData={detailData} image={experienceConfig.image ?? detail.info.image} />
            )
          ) : experienceLoading ? (
            <p className="atom-detail__placeholder">Loading execution telemetry…</p>
          ) : experienceError ? (
            <p className="atom-detail__placeholder">{experienceError}</p>
          ) : experience ? (
            <ExecutionDashboard experience={experience} image={detail.info.image} library={detail} />
          ) : detail.adaptiveLayer ? (
            <div className="atom-detail__adaptive-grid">
              <div>
                <h5>Sensors & instrumentation</h5>
                <ul>
                  {detail.adaptiveLayer.sensors.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h5>Telemetry & analytics</h5>
                <ul>
                  {detail.adaptiveLayer.telemetry.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h5>Maintenance notes</h5>
                <ul>
                  {detail.adaptiveLayer.maintenance.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="atom-detail__placeholder">Execution layer configuration not yet documented for this atom.</p>
          )}
        </div>
      ) : null}
    </section>
  )
}

export const getAtomDetail = (key: string | null) => (key ? ATOM_DETAIL_LIBRARY[key] ?? null : null)

export const getAtomDetailKeyFromParams = (slug?: string | null): AtomDetailKey | null =>
  slug && ATOM_DETAIL_LIBRARY[slug] ? (slug as AtomDetailKey) : null

export default AtomDetailView

function ManifestationTable({
  response,
  page,
  pageSize,
  onPageChange,
}: {
  response: AtomManifestationResponse
  page: number
  pageSize: number
  onPageChange: (page: number) => void
}) {
  const total = response.attributes.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const start = (safePage - 1) * pageSize
  const rows = useMemo(() => response.attributes.slice(start, start + pageSize), [response.attributes, start, pageSize])

  useEffect(() => {
    if (safePage !== page) {
      onPageChange(safePage)
    }
  }, [safePage, page, onPageChange])

  return (
    <div className="atom-detail__manifest">
      <table>
        <thead>
          <tr>
            <th>Attribute</th>
            <th>Value</th>
            <th>Units</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((attribute) => (
            <tr key={attribute.id}>
              <td>{attribute.name}</td>
              <td>{attribute.value ?? '—'}</td>
              <td>{attribute.units ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 ? (
        <div className="atom-manifest__pagination" role="navigation" aria-label="Manifestation pagination">
          <button type="button" onClick={() => onPageChange(Math.max(1, safePage - 1))} disabled={safePage === 1}>
            Previous
          </button>
          <span>
            Page {safePage} of {totalPages}
          </span>
          <button type="button" onClick={() => onPageChange(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages}>
            Next
          </button>
        </div>
      ) : null}
    </div>
  )
}
