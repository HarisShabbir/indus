import type { ImpactEvent } from '../types/simulator'
import type { SimulatorSnapshot } from '../store/simulatorStore'

const stageLabels: Record<string, string> = {
  RAW_MATERIAL: 'Raw Material',
  BATCHING: 'Batching',
  TRANSPORT: 'Transport',
  POUR_PLACEMENT: 'Placement',
  CURING: 'Curing',
}

const suggestionMatrix: Record<string, string[]> = {
  RAW_MATERIAL: ['Dry aggregate stockpile cover immediately.', 'Switch water feed to Punjab Water Lab standby source.', 'Deploy extra QA tech for lot sampling.'],
  BATCHING: ['Reduce batch temp by 2°C using chilled water.', 'Extend mixing time to 120s for homogenization.', 'Inject Sika admixture (low-temp) in next batch.'],
  TRANSPORT: ['Throttle conveyor to 3.2 m/s to avoid segregation.', 'Trigger misting on conveyor hood for dust control.'],
  POUR_PLACEMENT: ['Switch to night pour window for thermal control.', 'Mobilize 2nd tower placer to recover schedule.', 'Pre-cool aggregate bins to 12°C.'],
  CURING: ['Deploy thermal blankets on lifts 3–4.', 'Raise water spray intervals to 30 min.', 'Arrange curing audit with QC lead.'],
}

export function generateStageInsight(stageId: string, snapshot: SimulatorSnapshot) {
  const stageLabel = stageLabels[stageId] ?? stageId
  const activeAlarm = snapshot.ruleResults.find((result) => !result.passed && result.rule.process_stage === stageId)
  const block = snapshot.currentPour ? `Block ${snapshot.currentPour.block}, Lift ${snapshot.currentPour.lift}` : 'Active pour'
  const trace = snapshot.activeTrace
  const base = activeAlarm
    ? `Detected ${activeAlarm.rule.rule_id} (${activeAlarm.rule.rule_description}). Current reading ${activeAlarm.value}.`
    : `All telemetry within spec for ${stageLabel}.`
  const impact = snapshot.impacts.schedule[0]
  const impactLine = impact ? describeImpact(impact) : 'No schedule slip at the moment.'
  const traceLine = trace ? `Lineage: Batch ${trace.batch.id} → Lot ${trace.lot.id} (${trace.lot.material}) from ${trace.vendor.name}.` : 'Trace info pending.'
  const suggestions = suggestionMatrix[stageId] ?? suggestionMatrix.POUR_PLACEMENT
  const suggestion = suggestions[Math.floor(Math.random() * suggestions.length)]
  return {
    headline: `${stageLabel} intelligence for ${block}`,
    reasoning: `${base} ${traceLine}`,
    impact: impactLine,
    recommendation: suggestion,
  }
}

function describeImpact(event: ImpactEvent) {
  if (event.type === 'financial') {
    return `Finance holding ${event.description}.`
  }
  if (event.type === 'schedule') {
    return `Schedule slip flagged: ${event.description}.`
  }
  if (event.type === 'scm') {
    return `SCM escalation active: ${event.description}.`
  }
  return event.description
}
