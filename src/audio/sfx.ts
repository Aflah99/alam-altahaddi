/**
 * Tiny original chiptune blips synthesised with the Web Audio API — no audio files.
 * Only ever called in response to a user action, and only when sound is enabled.
 */

type Note = { freq: number; at: number; dur: number }

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function play(notes: Note[], type: OscillatorType = 'square', volume = 0.05) {
  const ac = audio()
  if (!ac) return
  const start = ac.currentTime + 0.01
  for (const n of notes) {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(n.freq, start + n.at)
    gain.gain.setValueAtTime(volume, start + n.at)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + n.at + n.dur)
    osc.connect(gain).connect(ac.destination)
    osc.start(start + n.at)
    osc.stop(start + n.at + n.dur + 0.02)
  }
}

export const sfx = {
  move: () => play([{ freq: 660, at: 0, dur: 0.06 }]),
  confirm: () =>
    play([
      { freq: 523, at: 0, dur: 0.07 },
      { freq: 784, at: 0.07, dur: 0.12 },
    ]),
  back: () =>
    play([
      { freq: 494, at: 0, dur: 0.06 },
      { freq: 330, at: 0.06, dur: 0.1 },
    ]),
  jump: () =>
    play([
      { freq: 392, at: 0, dur: 0.05 },
      { freq: 587, at: 0.04, dur: 0.07 },
    ], 'square', 0.035),
  toggle: () => play([{ freq: 880, at: 0, dur: 0.05 }], 'triangle', 0.08),
}

export type SfxName = keyof typeof sfx
