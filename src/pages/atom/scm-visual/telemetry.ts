type TelemetryEvent = 'tick' | 'alarm_created' | 'node_opened' | 'map_opened'

type TelemetryPayload = Record<string, unknown> | undefined

export const logTelemetry = (event: TelemetryEvent, payload?: TelemetryPayload) => {
  const timestamp = new Date().toISOString()
  if (payload) {
    // eslint-disable-next-line no-console
    console.info(`[scm-visual][${event}]`, { timestamp, ...payload })
  } else {
    // eslint-disable-next-line no-console
    console.info(`[scm-visual][${event}]`, { timestamp })
  }
}
