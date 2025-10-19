import React from 'react'

type DialItem = {
  id: string
  label: string
  percent: number
  status?: string | null
  color?: string
  isActive?: boolean
}

type Props = {
  projectLabel: string
  projectPercent: number | null
  contractItems: DialItem[]
  sowItems: DialItem[]
  processItems: DialItem[]
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value))

function HierarchyDial({ label, percent, status, color, isActive }: DialItem & { percent: number }) {
  const safePercent = clampPercent(percent)
  const style = {
    '--dial-color': color ?? 'var(--accent)',
    '--dial-progress': `${safePercent}%`,
  } as React.CSSProperties

  return (
    <div className={`wip-hierarchy-dial ${isActive ? 'active' : ''}`} style={style} aria-label={`${label} ${Math.round(safePercent)} percent`}>
      <div className="wip-hierarchy-dial__gauge">
        <div className="wip-hierarchy-dial__value">{Math.round(safePercent)}%</div>
      </div>
      <div className="wip-hierarchy-dial__meta">
        <strong title={label}>{label}</strong>
        {status ? <span>{status}</span> : null}
      </div>
    </div>
  )
}

export function HierarchyWipBoard({ projectLabel, projectPercent, contractItems, sowItems, processItems }: Props) {
  return (
    <div className="wip-hierarchy">
      <section className="wip-hierarchy__section">
        <header className="wip-hierarchy__header">
          <span className="wip-hierarchy__title">Project</span>
        </header>
        <div className="wip-hierarchy__grid single">
          <HierarchyDial
            id="project-summary"
            label={projectLabel}
            percent={projectPercent ?? 0}
            status={projectPercent !== null ? 'Portfolio average' : 'No data'}
            color="var(--accent)"
            isActive
          />
        </div>
      </section>

      <section className="wip-hierarchy__section">
        <header className="wip-hierarchy__header">
          <span className="wip-hierarchy__title">Contracts</span>
        </header>
        {contractItems.length ? (
          <div className="wip-hierarchy__grid">
            {contractItems.map((item) => (
              <HierarchyDial key={item.id} {...item} />
            ))}
          </div>
        ) : (
          <p className="wip-hierarchy__empty">No contract progress available.</p>
        )}
      </section>

      <section className="wip-hierarchy__section">
        <header className="wip-hierarchy__header">
          <span className="wip-hierarchy__title">Scopes of Work</span>
        </header>
        {sowItems.length ? (
          <div className="wip-hierarchy__grid">
            {sowItems.map((item) => (
              <HierarchyDial key={item.id} {...item} />
            ))}
          </div>
        ) : (
          <p className="wip-hierarchy__empty">Select a contract with defined SOWs to inspect detailed progress.</p>
        )}
      </section>

      <section className="wip-hierarchy__section">
        <header className="wip-hierarchy__header">
          <span className="wip-hierarchy__title">Processes</span>
        </header>
        {processItems.length ? (
          <div className="wip-hierarchy__grid">
            {processItems.map((item) => (
              <HierarchyDial key={item.id} {...item} />
            ))}
          </div>
        ) : (
          <p className="wip-hierarchy__empty">Select a scope of work to review process-level status.</p>
        )}
      </section>
    </div>
  )
}

export default HierarchyWipBoard
