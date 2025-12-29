import React, { useEffect, useMemo, useState } from 'react'

type StageSummary = {
  name: string
  count: number
  average: number
}

type ContractDial = {
  id: string
  name: string
  percent: number
  color?: string
  stage: string
}

type Props = {
  projectLabel: string
  projectPercent: number | null
  stages: StageSummary[]
  contractItems: ContractDial[]
}

const STAGE_ORDER = ['Construction', 'Bidding', 'Pre-PQ', 'PQ']

const clampPercent = (value: number) => Math.max(0, Math.min(100, value))

function StageDial({ label, percent, color, hint }: { label: string; percent: number; color?: string; hint?: string }) {
  const safePercent = clampPercent(percent)
  const style = {
    '--dial-color': color ?? 'var(--accent)',
    '--dial-progress': `${safePercent}%`,
  } as React.CSSProperties

  return (
    <div className="wip-stage-dial" style={style} aria-label={`${label} ${Math.round(safePercent)} percent`}>
      <div className="wip-stage-dial__gauge">
        <span className="wip-stage-dial__value">{Math.round(safePercent)}%</span>
      </div>
      <div className="wip-stage-dial__meta">
        <strong title={label}>{label}</strong>
        {hint ? <span>{hint}</span> : null}
      </div>
    </div>
  )
}

export default function HierarchyWipBoard({ projectLabel, projectPercent, stages, contractItems }: Props) {
  const orderedStages = useMemo(() => {
    const dictionary = new Map(stages.map((stage) => [stage.name.toLowerCase(), stage]))
    return STAGE_ORDER.map((name) => {
      const match = dictionary.get(name.toLowerCase())
      return match ?? { name, count: 0, average: 0 }
    })
  }, [stages])

  const defaultStage = useMemo(() => {
    const available = orderedStages.find((stage) => stage.count > 0)
    return available?.name ?? orderedStages[0]?.name ?? STAGE_ORDER[0]
  }, [orderedStages])

  const [activeStage, setActiveStage] = useState<string>(defaultStage)

  useEffect(() => {
    setActiveStage(defaultStage)
  }, [defaultStage])

  const filteredContracts = useMemo(() => {
    const current = activeStage.toLowerCase()
    return contractItems.filter((item) => (item.stage ?? '').toLowerCase() === current)
  }, [contractItems, activeStage])

  const activeStageSummary = orderedStages.find((stage) => stage.name === activeStage)

  return (
    <div className="wip-stage-board">
      <header className="wip-stage-board__header">
        <div>
          <h3>Work in Progress</h3>
          <p>Monitor contract progress by delivery stage</p>
        </div>
        <div className="wip-stage-board__project">
          <StageDial
            label={projectLabel}
            percent={projectPercent ?? 0}
            color="var(--accent)"
            hint={projectPercent !== null ? 'Project average' : 'No data yet'}
          />
        </div>
      </header>

      <nav className="wip-stage-tabs" role="tablist" aria-label="Work in progress stages">
        {orderedStages.map((stage) => {
          const isActive = stage.name === activeStage
          const averageText = stage.count ? `${Math.round(stage.average)}% avg` : 'No contracts'
          return (
            <button
              key={stage.name}
              type="button"
              role="tab"
              className={`wip-stage-tab ${isActive ? 'active' : ''}`}
              onClick={() => setActiveStage(stage.name)}
              aria-selected={isActive}
            >
              <span>{stage.name}</span>
              <strong>{stage.count}</strong>
              <small>{averageText}</small>
            </button>
          )
        })}
      </nav>

      {filteredContracts.length ? (
        <div className="wip-stage-dials">
          {filteredContracts.map((contract) => (
            <StageDial
              key={contract.id}
              label={contract.name}
              percent={contract.percent}
              color={contract.color}
              hint={activeStageSummary?.average ? `${Math.round(activeStageSummary.average)}% stage avg` : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="wip-stage-empty">No contracts currently in {activeStage}.</div>
      )}
    </div>
  )
}
