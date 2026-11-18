import { audioContext, noise, sfxOut } from './engine'

/**
 * Original synthesised sound effects (Web Audio API, no files). They only play after the
 * player has interacted with the page, and follow the master / effects volume settings.
 * Every sound has a visual counterpart in the UI, so nothing depends on hearing it.
 */

type Note = { f: number; at: number; dur: number; type?: OscillatorType; vol?: number; slide?: number }

function play(notes: Note[], defaults: { type?: OscillatorType; vol?: number } = {}) {
  const ac = audioContext()
  const out = sfxOut()
  if (!ac || !out) return
  const start = ac.currentTime + 0.005
  for (const n of notes) {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    const vol = n.vol ?? defaults.vol ?? 0.12
    osc.type = n.type ?? defaults.type ?? 'square'
    osc.frequency.setValueAtTime(n.f, start + n.at)
    if (n.slide) osc.frequency.exponentialRampToValueAtTime(n.slide, start + n.at + n.dur)
    gain.gain.setValueAtTime(0.0001, start + n.at)
    gain.gain.linearRampToValueAtTime(vol, start + n.at + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + n.at + n.dur)
    osc.connect(gain).connect(out)
    osc.start(start + n.at)
    osc.stop(start + n.at + n.dur + 0.03)
  }
}

function burst(at: number, dur: number, freq: number, vol = 0.15, type: BiquadFilterType = 'bandpass') {
  const ac = audioContext()
  const out = sfxOut()
  const buf = noise()
  if (!ac || !out || !buf) return
  const t = ac.currentTime + 0.005 + at
  const src = ac.createBufferSource()
  const f = ac.createBiquadFilter()
  const g = ac.createGain()
  src.buffer = buf
  f.type = type
  f.frequency.value = freq
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(out)
  src.start(t, Math.random() * 0.5)
  src.stop(t + dur + 0.02)
}

/** Ascending notes (MIDI-free helper): base frequency × semitone steps. */
const up = (base: number, semis: number[], step: number, dur: number, type?: OscillatorType, vol?: number): Note[] =>
  semis.map((s, i) => ({ f: base * 2 ** (s / 12), at: i * step, dur, type, vol }))

export const sfx = {
  // ---- navigation
  move: () => play([{ f: 660, at: 0, dur: 0.05 }], { vol: 0.06 }),
  click: () => play([{ f: 880, at: 0, dur: 0.04, type: 'triangle' }], { vol: 0.12 }),
  confirm: () => play(up(523, [0, 7], 0.06, 0.1), { vol: 0.09 }),
  back: () => play([{ f: 494, at: 0, dur: 0.06 }, { f: 330, at: 0.06, dur: 0.09 }], { vol: 0.08 }),
  toggle: () => play([{ f: 880, at: 0, dur: 0.05, type: 'triangle' }], { vol: 0.12 }),
  menuOpen: () => play([{ f: 400, at: 0, dur: 0.12, slide: 800, type: 'triangle' }], { vol: 0.12 }),
  menuClose: () => play([{ f: 800, at: 0, dur: 0.1, slide: 400, type: 'triangle' }], { vol: 0.1 }),
  // ---- movement & world
  jump: () => play([{ f: 330, at: 0, dur: 0.12, slide: 700 }], { vol: 0.06 }),
  land: () => burst(0, 0.05, 400, 0.08, 'lowpass'),
  step: () => burst(0, 0.03, 900, 0.03),
  portal: () => {
    play([{ f: 300, at: 0, dur: 0.5, slide: 1200, type: 'sine' }, { f: 450, at: 0.05, dur: 0.5, slide: 1600, type: 'triangle', vol: 0.05 }], { vol: 0.1 })
    burst(0.1, 0.4, 3000, 0.05, 'highpass')
  },
  missionStart: () => play(up(392, [0, 4, 7, 12], 0.08, 0.12), { vol: 0.09 }),
  missionComplete: () => play([...up(523, [0, 4, 7, 12], 0.1, 0.14), { f: 1046, at: 0.42, dur: 0.4, type: 'triangle' }], { vol: 0.1 }),
  missionFail: () => play(up(392, [0, -2, -5, -8], 0.14, 0.2, 'triangle'), { vol: 0.1 }),
  sessionComplete: () => play(up(587, [0, 5, 9, 12, 17], 0.08, 0.16, 'triangle'), { vol: 0.11 }),
  // ---- questions
  correct: () => play(up(659, [0, 4, 7], 0.07, 0.12), { vol: 0.1 }),
  wrong: () => play([{ f: 220, at: 0, dur: 0.18, slide: 160, type: 'sawtooth', vol: 0.06 }, { f: 196, at: 0.12, dur: 0.2, slide: 140, type: 'triangle' }], { vol: 0.08 }),
  streak: () => play(up(784, [0, 4, 7, 12, 16], 0.05, 0.08), { vol: 0.08 }),
  submitWritten: () => play([{ f: 600, at: 0, dur: 0.05 }, { f: 900, at: 0.05, dur: 0.07 }], { type: 'triangle', vol: 0.11 }),
  unsure: () => play([{ f: 520, at: 0, dur: 0.1, type: 'triangle' }, { f: 520, at: 0.14, dur: 0.1, type: 'triangle' }], { vol: 0.1 }),
  hint: () => play([{ f: 1200, at: 0, dur: 0.08, type: 'sine' }, { f: 1600, at: 0.08, dur: 0.16, type: 'sine' }], { vol: 0.1 }),
  // ---- rewards
  xp: () => play(up(880, [0, 5, 12], 0.04, 0.07, 'triangle'), { vol: 0.09 }),
  coin: () => play([{ f: 988, at: 0, dur: 0.06 }, { f: 1319, at: 0.06, dur: 0.18 }], { vol: 0.08 }),
  levelUp: () => play([...up(523, [0, 4, 7, 12, 16, 19, 24], 0.07, 0.1)], { vol: 0.09 }),
  // ---- characters & items
  select: () => play(up(660, [0, 7, 12], 0.05, 0.08, 'triangle'), { vol: 0.12 }),
  equip: () => {
    burst(0, 0.06, 2500, 0.06)
    play([{ f: 700, at: 0.03, dur: 0.08, type: 'triangle' }], { vol: 0.12 })
  },
  purchase: () => play([{ f: 1047, at: 0, dur: 0.05 }, { f: 1319, at: 0.05, dur: 0.05 }, { f: 1568, at: 0.1, dur: 0.2, type: 'triangle' }], { vol: 0.09 }),
  packageShake: () => {
    for (let i = 0; i < 4; i++) burst(i * 0.12, 0.06, 600 + i * 150, 0.1)
  },
  packageOpen: () => {
    burst(0, 0.3, 4000, 0.08, 'highpass')
    play([{ f: 300, at: 0, dur: 0.35, slide: 1400, type: 'triangle' }], { vol: 0.12 })
  },
  rewardCommon: () => play(up(660, [0, 4, 7], 0.06, 0.12, 'triangle'), { vol: 0.11 }),
  rewardRare: () => play(up(660, [0, 4, 7, 12], 0.07, 0.14), { vol: 0.09 }),
  rewardEpic: () => play([...up(523, [0, 4, 7, 11, 14], 0.07, 0.14), { f: 1568, at: 0.4, dur: 0.4, type: 'triangle' }], { vol: 0.09 }),
  rewardLegendary: () => {
    play([...up(523, [0, 4, 7, 12, 16, 19, 24], 0.08, 0.16), { f: 2093, at: 0.6, dur: 0.7, type: 'triangle' }], { vol: 0.1 })
    burst(0.55, 0.6, 5000, 0.05, 'highpass')
  },
  duplicate: () => play([{ f: 700, at: 0, dur: 0.08, type: 'triangle' }, { f: 600, at: 0.09, dur: 0.1, type: 'triangle' }], { vol: 0.1 }),
  convert: () => play([{ f: 400, at: 0, dur: 0.3, slide: 1200, type: 'sine' }, ...up(1200, [0, 7], 0.06, 0.1, 'triangle').map((n) => ({ ...n, at: n.at + 0.3 }))], { vol: 0.11 }),
  upgrade: () => {
    burst(0, 0.08, 3000, 0.08)
    play([...up(440, [0, 7, 12, 19, 24], 0.06, 0.12)], { vol: 0.09 })
  },
  upgradeMythic: () => {
    play([...up(392, [0, 4, 7, 12, 16, 19, 24, 28], 0.07, 0.16, 'triangle'), { f: 1976, at: 0.6, dur: 0.9, type: 'sine' }], { vol: 0.12 })
    burst(0.5, 0.9, 6000, 0.05, 'highpass')
  },
  // ---- multiplayer
  countdown: () => play([{ f: 660, at: 0, dur: 0.12, type: 'square' }], { vol: 0.09 }),
  countdownGo: () => play([{ f: 1320, at: 0, dur: 0.3, type: 'square' }], { vol: 0.09 }),
  victory: () => play([...up(523, [0, 4, 7], 0.12, 0.14), { f: 1047, at: 0.36, dur: 0.5 }, { f: 1319, at: 0.36, dur: 0.5, type: 'triangle' }], { vol: 0.08 }),
  defeat: () => play(up(440, [0, -3, -7, -12], 0.16, 0.22, 'triangle'), { vol: 0.1 }),
  attack: () => {
    burst(0, 0.15, 1500, 0.12)
    play([{ f: 300, at: 0, dur: 0.15, slide: 120, type: 'sawtooth' }], { vol: 0.06 })
  },
  defend: () => play([{ f: 500, at: 0, dur: 0.08, type: 'square' }, { f: 500, at: 0.1, dur: 0.12, type: 'triangle' }], { vol: 0.09 }),
  capture: () => play([...up(392, [0, 7, 12], 0.07, 0.12), { f: 1175, at: 0.24, dur: 0.3, type: 'triangle' }], { vol: 0.09 }),
  bossHit: () => {
    burst(0, 0.12, 800, 0.15, 'lowpass')
    play([{ f: 180, at: 0, dur: 0.12, slide: 90, type: 'square' }], { vol: 0.08 })
  },
  bossDefeat: () => {
    burst(0, 0.6, 500, 0.15, 'lowpass')
    play([...up(262, [0, 7, 12, 19, 24], 0.1, 0.2)], { vol: 0.08 })
  },
  heartLost: () => play([{ f: 600, at: 0, dur: 0.2, slide: 200, type: 'triangle' }], { vol: 0.12 }),
  eliminated: () => play(up(330, [0, -5, -12], 0.15, 0.25, 'triangle'), { vol: 0.1 }),
  treasure: () => play(up(784, [0, 4, 7, 12, 16], 0.05, 0.1, 'triangle'), { vol: 0.11 }),
  reaction: () => play([{ f: 1100, at: 0, dur: 0.05, type: 'sine' }], { vol: 0.08 }),
  playerJoin: () => play(up(523, [0, 7], 0.06, 0.08, 'triangle'), { vol: 0.08 }),
  ready: () => play([{ f: 880, at: 0, dur: 0.06 }, { f: 1175, at: 0.06, dur: 0.08 }], { vol: 0.07 }),
}

export type SfxName = keyof typeof sfx

/** Plays a named effect (no-op before the first user gesture or when muted). */
export function playSfx(name: SfxName) {
  try {
    sfx[name]()
  } catch {
    // Audio is never allowed to break the game.
  }
}
