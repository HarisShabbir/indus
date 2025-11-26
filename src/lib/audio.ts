let sharedAudioContext: AudioContext | null = null

const resolveAudioContext = () => {
  if (sharedAudioContext || typeof window === 'undefined') return sharedAudioContext
  const extendedWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext }
  const Ctor = window.AudioContext ?? extendedWindow.webkitAudioContext
  if (!Ctor) return null
  sharedAudioContext = new Ctor()
  return sharedAudioContext
}

export function playFeedbackTone(token: string) {
  const ctx = resolveAudioContext()
  if (!ctx) return
  const reject = token.startsWith('reject')
  const totalDuration = reject ? 1.4 : 0.6
  const now = ctx.currentTime

  const bus = ctx.createGain()
  bus.connect(ctx.destination)
  bus.gain.setValueAtTime(0.0001, now)

  const voiceA = ctx.createOscillator()
  const voiceB = ctx.createOscillator()

  voiceA.type = reject ? 'square' : 'sine'
  voiceB.type = reject ? 'triangle' : 'sine'

  if (reject) {
    voiceA.frequency.setValueAtTime(520, now)
    voiceA.frequency.linearRampToValueAtTime(320, now + 0.5)
    voiceA.frequency.linearRampToValueAtTime(480, now + 1.1)
    voiceB.frequency.setValueAtTime(240, now)
    voiceB.frequency.linearRampToValueAtTime(180, now + 0.6)
  } else {
    voiceA.frequency.setValueAtTime(640, now)
    voiceA.frequency.linearRampToValueAtTime(820, now + 0.2)
    voiceB.frequency.setValueAtTime(860, now)
    voiceB.frequency.linearRampToValueAtTime(970, now + 0.2)
  }

  voiceA.connect(bus)
  voiceB.connect(bus)

  bus.gain.exponentialRampToValueAtTime(reject ? 0.16 : 0.1, now + 0.06)
  bus.gain.exponentialRampToValueAtTime(0.0001, now + totalDuration)

  voiceA.start(now)
  voiceB.start(now)
  voiceA.stop(now + totalDuration)
  voiceB.stop(now + totalDuration)
}
