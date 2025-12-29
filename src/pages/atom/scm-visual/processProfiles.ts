import { ProcessProfile } from './types'

export const PROCESS_PROFILES: Record<string, ProcessProfile> = {
  'mw-01-dam-pit': {
    id: 'mw-01-dam-pit',
    label: 'Dam Pit Excavation',
    description: 'Concrete pours, pit dewatering, and reinforcement logistics for MW-01 main dam.',
    atoms: [
      { name: 'CAT 395 Excavator', type: 'Equipment', status: 'Available' },
      { name: 'Dumpers Fleet 12', type: 'Equipment', status: 'In rotation' },
      { name: 'Fuel Bowser 40KL', type: 'Consumable', status: 'Critical' },
      { name: 'Rebar Sensor Grid', type: 'Instrumentation', status: 'Healthy' },
    ],
    baseline: {
      demandTotal: 1500,
      demandCommitted: 1280,
      procurement: { openPOs: 6, latePOs: 0, etaDays: 7.5 },
      logistics: { shipmentsInFlight: 4, onTimePct: 0.9, avgETA: 6.2 },
      inventory: { valueUSD: 720_000 },
    },
  },
}

export const DEFAULT_PROCESS_PROFILE: ProcessProfile = {
  id: 'default-process',
  label: 'Synthetic Process',
  description: 'Autonomous simulation scope.',
  atoms: [],
}

export const resolveProcessProfile = (processId?: string | null) => {
  if (processId && PROCESS_PROFILES[processId]) {
    return PROCESS_PROFILES[processId]
  }
  return DEFAULT_PROCESS_PROFILE
}
