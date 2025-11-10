import { useEffect, useMemo, useRef, useState } from 'react'

import SyntheticDataService from './SyntheticDataService'
import { ProcessProfile, SimulatedEvent, SyntheticDrivers, SyntheticScmSnapshot, VolatilityLevel } from './types'

export type UseSyntheticScmControls = {
  play: () => void
  pause: () => void
  toggle: () => void
  reset: () => void
  setSeed: (seed: number) => void
  setVolatility: (volatility: VolatilityLevel) => void
  updateDrivers: (drivers: Partial<SyntheticDrivers>) => void
  simulateEvent: (event: SimulatedEvent) => void
  acknowledgeAlarm: (id: string) => void
}

export const useSyntheticScm = (
  initialSeed: number,
  initialVolatility: VolatilityLevel = 'medium',
  profile?: ProcessProfile | null,
): { snapshot: SyntheticScmSnapshot | null; controls: UseSyntheticScmControls } => {
  const serviceRef = useRef<SyntheticDataService | null>(null)
  const [snapshot, setSnapshot] = useState<SyntheticScmSnapshot | null>(null)

  useEffect(() => {
    const service = new SyntheticDataService(initialSeed, initialVolatility, profile ?? undefined)
    serviceRef.current = service
    const unsubscribe = service.subscribe((next) => {
      setSnapshot(next)
    })
    return () => {
      unsubscribe()
      service.dispose()
      serviceRef.current = null
    }
  }, [initialSeed, initialVolatility, profile?.id])

  const controls = useMemo<UseSyntheticScmControls>(
    () => ({
      play: () => serviceRef.current?.play(),
      pause: () => serviceRef.current?.pause(),
      toggle: () => serviceRef.current?.toggle(),
      reset: () => serviceRef.current?.reset(),
      setSeed: (seed: number) => serviceRef.current?.setSeed(seed),
      setVolatility: (volatility: VolatilityLevel) => serviceRef.current?.setVolatility(volatility),
      updateDrivers: (drivers: Partial<SyntheticDrivers>) => serviceRef.current?.updateDrivers(drivers),
      simulateEvent: (event: SimulatedEvent) => serviceRef.current?.simulateEvent(event),
      acknowledgeAlarm: (id: string) => serviceRef.current?.acknowledgeAlarm(id),
    }),
    [],
  )

  return { snapshot, controls }
}

export default useSyntheticScm
