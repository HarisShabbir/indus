
function groupMetrics(metrics: RccEnvironmentMetric[]) {
  const grouped = new Map<string, RccEnvironmentMetric[]>()
  metrics.forEach((metric) => {
    const group = (metric.metadata?.group as string) || 'General'
    grouped.set(group, [...(grouped.get(group) ?? []), metric])
  })
  return Array.from(grouped.entries())
}

function displayValue(metric: RccEnvironmentMetric) {
  if (metric.value_text) return metric.value_text
  if (metric.value_numeric !== null && metric.value_numeric !== undefined) {
    return `${metric.value_numeric.toLocaleString()}${metric.unit ? ` ${metric.unit}` : ''}`
  }
  return '—'
}

function RccMetricDeck({ metrics }: { metrics: RccEnvironmentMetric[] }) {
  if (!metrics.length) return null
  const grouped = groupMetrics(metrics)
  const quick = ['daily_pour_volume', 'cumulative_volume', 'core_temperature', 'moisture']
    .map((id) => metrics.find((metric) => metric.metric === id))
    .filter(Boolean) as RccEnvironmentMetric[]
  return (
    <>
      {quick.length ? (
        <div className="rcc-metric-quick-row">
          {quick.map((metric) => (
            <article key={metric.id} className={`rcc-metric-chip is-${metric.status}`}>
              <span>{metric.label}</span>
              <strong>{displayValue(metric)}</strong>
              {metric.metadata?.rule ? <small>{String(metric.metadata.rule)}</small> : null}
            </article>
          ))}
        </div>
      ) : null}
      <div className="rcc-metric-groups">
        {grouped.map(([group, items]) => (
          <section key={group}>
            <header>{group}</header>
            <div className="rcc-metric-grid">
              {items.map((metric) => (
                <div key={metric.id} className={`rcc-metric-card is-${metric.status}`}>
                  <div>
                    <span>{metric.label}</span>
                    <strong>{displayValue(metric)}</strong>
                  </div>
                  {metric.metadata?.storage ? <p className="metric-meta">Storage: {String(metric.metadata.storage)}</p> : null}
                  {metric.metadata?.value && !metric.value_text ? <p className="metric-meta">{String(metric.metadata.value)}</p> : null}
                  {metric.metadata?.rule ? <p className="metric-meta">{String(metric.metadata.rule)}</p> : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
