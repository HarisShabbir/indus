import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, PackageSearch, ShieldCheck, Star } from 'lucide-react'
import { shallow } from 'zustand/shallow'
import { useSimulatorStore } from '../../store/simulatorStore'
import { getVendors } from '../../simulator/data'
import './rccRoutes.css'

export default function RCCScmPage() {
  const navigate = useNavigate()
  const { impacts, trace } = useSimulatorStore(
    (state) => ({
      impacts: state.impacts,
      trace: state.activeTrace,
    }),
    shallow,
  )

  const vendors = useMemo(() => {
    const seen = new Set<string>()
    const pool = trace ? [trace.vendor, ...getVendors()] : getVendors()
    return pool
      .filter((vendor) => {
        if (seen.has(vendor.id)) return false
        seen.add(vendor.id)
        return vendor.category.toLowerCase().includes('cement') || vendor.category.toLowerCase().includes('aggregate')
      })
      .slice(0, 5)
      .map((vendor) => {
        const flagged = impacts.scm.length > 0 && trace?.vendor?.id === vendor.id
        const score = Math.max(0, vendor.rating * 20 - (flagged ? 15 : 0))
        return { ...vendor, score, flagged }
      })
  }, [impacts.scm, trace])

  return (
    <div className="rcc-route-shell">
      <header>
        <div>
          <h1>SCM Command</h1>
          <p>Vendor scorecard + inbound lot exceptions tied back to RCC pipeline.</p>
        </div>
        <button type="button" onClick={() => navigate('/rcc/process')}>
          <ArrowLeft size={16} /> Back to Control Center
        </button>
      </header>
      <section className="route-card">
        <header>
          <PackageSearch size={18} />
          <div>
            <strong>Vendor performance</strong>
            <small>Live linkage to batches + alarms</small>
          </div>
        </header>
        <div className="vendor-grid">
          {vendors.map((vendor) => (
            <article key={vendor.id} className={`vendor-card ${vendor.flagged ? 'flagged' : ''}`}>
              <div className="vendor-head">
                <strong>{vendor.name}</strong>
                {vendor.flagged ? (
                  <span className="flag">
                    <ShieldCheck size={14} /> Escalate
                  </span>
                ) : (
                  <span className="flag ok">
                    <Star size={14} /> Stable
                  </span>
                )}
              </div>
              <p>{vendor.region}</p>
              <div className="score">
                <span>Quality</span>
                <div>
                  <div style={{ width: `${vendor.score}%` }} />
                </div>
                <small>{vendor.score.toFixed(0)} / 100</small>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="route-card">
        <header>
          <ShieldCheck size={18} />
          <div>
            <strong>Open SCM alarms</strong>
            <small>{impacts.scm.length ? `${impacts.scm.length} escalations` : 'All suppliers green'}</small>
          </div>
        </header>
        <ul className="impact-feed">
          {impacts.scm.length === 0
            ? (
              <li className="empty">No inbound issues detected.</li>
              )
            : impacts.scm.map((impact) => (
                <li key={impact.id}>
                  <strong>{impact.block}</strong>
                  <p>{impact.description}</p>
                  <small>{new Date(impact.timestamp).toLocaleString()}</small>
                </li>
              ))}
        </ul>
      </section>
    </div>
  )
}
