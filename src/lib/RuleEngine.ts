import type { Batch, Pour, RuleDescriptor, RuleResult } from '../types/simulator'

export type RuleContext = {
  metrics: Record<string, number>
  pour: Pour
  batch: Batch
  clock: Date
}

const MONTH_MAX: Record<number, number> = { 5: 19, 6: 16, 7: 15, 8: 15, 9: 18 }
const MONTH_CURING: Record<number, number> = { 1: 14, 2: 14, 3: 14, 4: 14, 5: 21, 6: 21, 7: 21, 8: 21, 9: 21, 10: 21, 11: 14, 12: 14 }

export class RuleEngine {
  private rules: RuleDescriptor[] = []
  private ready = false
  private manifestUrl: string

  constructor(manifestUrl = new URL('../data/rules.json', import.meta.url).href) {
    this.manifestUrl = manifestUrl
  }

  async loadRules() {
    if (this.ready) return this.rules
    const response = await fetch(this.manifestUrl)
    if (!response.ok) {
      throw new Error('Unable to load RCC rules table')
    }
    this.rules = (await response.json()) as RuleDescriptor[]
    this.ready = true
    return this.rules
  }

  evaluate(context: RuleContext): RuleResult[] {
    if (!this.ready) throw new Error('Rule engine not initialized')
    return this.rules.map((rule) => this.evaluateRule(rule, context))
  }

  getRules() {
    return this.rules
  }

  updateRule(ruleId: string, patch: Partial<RuleDescriptor>) {
    this.rules = this.rules.map((rule) => (rule.rule_id === ruleId ? { ...rule, ...patch } : rule))
  }

  private evaluateRule(rule: RuleDescriptor, context: RuleContext): RuleResult {
    const value = this.resolveMetric(rule.metric, context)
    const passed = this.applyComparison(rule, value, context)
    return { rule, value, passed, message: passed ? 'Within spec' : `Out of spec · ${rule.allowed_range}` }
  }

  private resolveMetric(metric: string, context: RuleContext): number {
    const direct = context.metrics[metric]
    if (typeof direct === 'number') return direct
    switch (metric) {
      case 'batch_temp_diff_c':
        return Number((context.batch.batch_temp_c - context.metrics.pour_temp_c).toFixed(1))
      case 'mixing_time_sec':
        return context.batch.mixing_time_sec
      case 'fine_agg_moisture_pct':
        return context.batch.fine_agg_moisture_pct
      case 'lift_depth_m':
        return context.pour.lift_depth_m
      case 'air_content_pct':
        return context.pour.air_content_pct
      case 'pour_temp_monthly_max_c':
        return context.metrics.pour_temp_c
      case 'curing_days_required':
        return context.metrics.curing_days_allocated
      case 'compressive_strength_28d_mpa':
        return Number((context.metrics.wet_density_kg_m3 / 82).toFixed(1))
      default:
        return 0
    }
  }

  private applyComparison(rule: RuleDescriptor, value: number, context: RuleContext): boolean {
    const month = context.clock.getMonth() + 1
    switch (rule.condition_operator) {
      case '>=':
        return value >= (rule.threshold_low ?? 0)
      case '<=':
        return value <= (rule.threshold_high ?? Number.POSITIVE_INFINITY)
      case '<':
        return value < (rule.threshold_high ?? Number.POSITIVE_INFINITY)
      case 'BETWEEN':
        return value >= (rule.threshold_low ?? Number.NEGATIVE_INFINITY) && value <= (rule.threshold_high ?? Number.POSITIVE_INFINITY)
      case 'MONTH_MAX':
        return value <= (MONTH_MAX[month] ?? 18)
      case 'MONTH_CYCLE':
        return value >= (MONTH_CURING[month] ?? 14)
      default:
        return true
    }
  }
}
