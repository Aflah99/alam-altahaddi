import { audioContext, musicOut, noise, onAudioUnlocked } from './engine'

/**
 * Original chiptune background music, sequenced live with oscillators (no files).
 *
 * Each track is a short loop: a melody written in scale degrees, a chord progression
 * (one chord per bar), a bass style, an optional arpeggio and optional soft drums.
 * Melody tokens are eighth notes: 1–7 = scale degree, ^ = octave up, _ = octave down,
 * '-' holds the previous note, '.' is a rest.
 */
export type TrackId = 'login' | 'avatar' | 'lobby' | 'adventure' | 'quiz' | 'shop' | 'room' | 'match' | 'victory'

interface Track {
  bpm: number
  root: number
  scale: readonly number[]
  chords: readonly number[]
  melody: readonly string[]
  lead: OscillatorType
  bass: 'root' | 'pulse' | 'walk' | 'octave'
  arp?: boolean
  drums?: 'soft' | 'drive'
  /** Relative loudness (quiz music is quieter). */
  level: number
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const MINOR = [0, 2, 3, 5, 7, 8, 10]
const DORIAN = [0, 2, 3, 5, 7, 9, 10]
const MIXO = [0, 2, 4, 5, 7, 9, 10]

export const TRACKS: Record<TrackId, Track> = {
  // Gentle, welcoming waltz-like loop for the sign-in page.
  login: {
    bpm: 92, root: 60, scale: MAJOR, chords: [0, 5, 3, 4], lead: 'triangle', bass: 'root', level: 0.8,
    melody: ['3 - 5 - ^1 - 7 6', '5 - - - 3 - 4 5', '6 - 5 4 3 - 2 1', '2 - 3 4 5 - - .'],
  },
  // Playful dressing-room tune.
  avatar: {
    bpm: 108, root: 62, scale: MAJOR, chords: [0, 3, 4, 0], lead: 'square', bass: 'pulse', level: 0.65,
    melody: ['1 3 5 3 6 5 3 .', '4 6 ^1 6 5 - 3 .', '5 4 3 2 3 5 2 .', '1 3 2 _7 1 - - .'],
  },
  // Bright town square.
  lobby: {
    bpm: 112, root: 65, scale: MAJOR, chords: [0, 4, 5, 3], lead: 'square', bass: 'octave', level: 0.6,
    melody: ['5 - 3 5 6 5 3 1', '2 - 2 3 4 - 5 .', '6 - ^1 6 5 3 2 1', '3 4 3 2 1 - - .'],
    drums: 'soft',
  },
  // Heroic exploration with an arpeggio.
  adventure: {
    bpm: 120, root: 62, scale: MIXO, chords: [0, 6, 3, 0], lead: 'square', bass: 'walk', arp: true, level: 0.55,
    melody: ['1 - 5 - ^1 - 7 5', '7 - 6 - 4 - 5 .', '6 - 4 6 ^1 - 7 6', '5 - 4 3 1 - - .'],
    drums: 'soft',
  },
  // Calm, sparse and low so it never competes with reading.
  quiz: {
    bpm: 72, root: 57, scale: MAJOR, chords: [0, 3, 5, 4], lead: 'sine', bass: 'root', level: 0.42,
    melody: ['3 - - - 5 - - -', '4 - - - 6 - - -', '5 - - - 3 - - -', '2 - - - - - . .'],
  },
  // Bouncy market tune.
  shop: {
    bpm: 118, root: 67, scale: MAJOR, chords: [0, 5, 1, 4], lead: 'square', bass: 'pulse', level: 0.55,
    melody: ['1 . 3 . 5 6 5 .', '6 . ^1 . 6 5 3 .', '2 . 4 . 6 5 4 .', '5 4 3 2 1 . . .'],
    drums: 'soft',
  },
  // Waiting room before a match: anticipation.
  room: {
    bpm: 104, root: 62, scale: DORIAN, chords: [0, 3, 0, 4], lead: 'triangle', bass: 'octave', arp: true, level: 0.55,
    melody: ['1 - 3 - 5 - 4 3', '4 - 6 - 5 - . .', '1 - 3 - 5 - 7 ^1', '7 - 6 - 5 - . .'],
  },
  // Energetic competition.
  match: {
    bpm: 140, root: 57, scale: MINOR, chords: [0, 5, 2, 6], lead: 'square', bass: 'pulse', arp: true, level: 0.5,
    melody: ['1 1 3 1 5 1 3 5', '6 - 5 - 3 - 5 .', '3 3 5 3 ^1 - 7 5', '7 - 5 - 6 - 7 .'],
    drums: 'drive',
  },
  // Fanfare for results and victories.
  victory: {
    bpm: 100, root: 60, scale: MAJOR, chords: [0, 3, 4, 0], lead: 'square', bass: 'root', level: 0.6,
    melody: ['1 3 5 ^1 - - 5 -', '6 - 4 - ^1 - - .', '7 - 5 - ^2 - ^1 7', '^1 - - - - - . .'],
  },
}

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12)

function degreeToMidi(t: Track, degree: number, octave: number) {
  const d = degree - 1
  const oct = Math.floor(d / 7)
  return t.root + 12 * (octave + oct) + t.scale[((d % 7) + 7) % 7]
}

interface Parsed {
  /** Per eighth-note step: midi note, -1 = rest, -2 = hold */
  steps: number[]
}

function parseMelody(t: Track): Parsed {
  const steps: number[] = []
  for (const bar of t.melody) {
    for (const tok of bar.trim().split(/\s+/)) {
      if (tok === '-') steps.push(-2)
      else if (tok === '.') steps.push(-1)
      else {
        let oct = 1
        let s = tok
        while (s.startsWith('^')) {
          oct++
          s = s.slice(1)
        }
        while (s.startsWith('_')) {
          oct--
          s = s.slice(1)
        }
        steps.push(degreeToMidi(t, Number(s), oct))
      }
    }
  }
  return { steps }
}

function tone(ac: AudioContext, out: AudioNode, type: OscillatorType, freq: number, at: number, dur: number, vol: number) {
  const o = ac.createOscillator()
  const g = ac.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, at)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.linearRampToValueAtTime(vol, at + 0.01)
  g.gain.setTargetAtTime(vol * 0.6, at + 0.03, 0.08)
  g.gain.setTargetAtTime(0.0001, at + Math.max(0.03, dur - 0.04), 0.03)
  o.connect(g).connect(out)
  o.start(at)
  o.stop(at + dur + 0.15)
}

function hit(ac: AudioContext, out: AudioNode, kind: 'kick' | 'hat' | 'snare', at: number, vol: number) {
  if (kind === 'kick') {
    const o = ac.createOscillator()
    const g = ac.createGain()
    o.frequency.setValueAtTime(140, at)
    o.frequency.exponentialRampToValueAtTime(45, at + 0.12)
    g.gain.setValueAtTime(vol, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.15)
    o.connect(g).connect(out)
    o.start(at)
    o.stop(at + 0.2)
    return
  }
  const buf = noise()
  if (!buf) return
  const src = ac.createBufferSource()
  const f = ac.createBiquadFilter()
  const g = ac.createGain()
  src.buffer = buf
  f.type = kind === 'hat' ? 'highpass' : 'bandpass'
  f.frequency.value = kind === 'hat' ? 7000 : 1800
  const len = kind === 'hat' ? 0.04 : 0.1
  g.gain.setValueAtTime(vol, at)
  g.gain.exponentialRampToValueAtTime(0.0001, at + len)
  src.connect(f).connect(g).connect(out)
  src.start(at, Math.random() * 0.5)
  src.stop(at + len + 0.02)
}

class Player {
  private gain: GainNode
  private step = 0
  private nextTime: number
  private timer: number | null = null
  private parsed: Parsed
  private stopped = false
  private ac: AudioContext
  readonly id: TrackId
  private t: Track

  constructor(ac: AudioContext, out: AudioNode, id: TrackId, t: Track) {
    this.ac = ac
    this.id = id
    this.t = t
    this.gain = ac.createGain()
    this.gain.gain.value = 0
    this.gain.connect(out)
    this.gain.gain.setTargetAtTime(t.level, ac.currentTime, 0.4)
    this.parsed = parseMelody(t)
    this.nextTime = ac.currentTime + 0.08
    this.timer = window.setInterval(() => this.schedule(), 40)
    this.schedule()
  }

  private schedule() {
    if (this.stopped) return
    const sixteenth = 60 / this.t.bpm / 4
    const horizon = this.ac.currentTime + 0.2
    // After the tab was suspended, skip ahead instead of firing a burst of notes.
    if (this.nextTime < this.ac.currentTime - 0.5) this.nextTime = this.ac.currentTime + 0.05
    while (this.nextTime < horizon) {
      this.playStep(this.step, this.nextTime, sixteenth)
      this.step++
      this.nextTime += sixteenth
    }
  }

  private playStep(step: number, at: number, s16: number) {
    const t = this.t
    const out = this.gain
    const ac = this.ac
    const totalEighths = this.parsed.steps.length
    const loop16 = totalEighths * 2
    const pos = step % loop16
    const bar = Math.floor(pos / 16)
    const inBar = pos % 16
    const chordDeg = t.chords[bar % t.chords.length] + 1
    const chordRoot = degreeToMidi(t, chordDeg, -1)

    // Melody on eighths: length = 1 + following holds.
    if (pos % 2 === 0) {
      const i = pos / 2
      const n = this.parsed.steps[i]
      if (n >= 0) {
        let len = 1
        while (this.parsed.steps[(i + len) % totalEighths] === -2 && len < 8) len++
        tone(ac, out, t.lead, midiHz(n), at, len * 2 * s16 * 0.95, 0.09)
      }
    }
    // Bass
    const bassVol = 0.11
    if (t.bass === 'root' && inBar % 8 === 0) tone(ac, out, 'triangle', midiHz(chordRoot), at, 7 * s16, bassVol)
    if (t.bass === 'pulse' && inBar % 4 === 0) tone(ac, out, 'triangle', midiHz(chordRoot), at, 3 * s16, bassVol)
    if (t.bass === 'octave' && inBar % 4 === 0) tone(ac, out, 'triangle', midiHz(chordRoot + (inBar % 8 === 4 ? 12 : 0)), at, 3 * s16, bassVol)
    if (t.bass === 'walk' && inBar % 4 === 0) {
      const walk = [1, 3, 5, 6][inBar / 4]
      tone(ac, out, 'triangle', midiHz(degreeToMidi(t, chordDeg + walk - 1, -1)), at, 3 * s16, bassVol)
    }
    // Arpeggio of the chord (root, third, fifth, octave) on sixteenths.
    if (t.arp && inBar % 2 === 0) {
      const tones = [0, 2, 4, 7]
      const d = tones[(inBar / 2) % 4]
      tone(ac, out, 'square', midiHz(degreeToMidi(t, chordDeg + d, 1)), at, s16 * 1.4, 0.025)
    }
    // Drums
    if (t.drums === 'soft') {
      if (inBar % 8 === 0) hit(ac, out, 'kick', at, 0.18)
      if (inBar % 4 === 2) hit(ac, out, 'hat', at, 0.05)
    } else if (t.drums === 'drive') {
      if (inBar % 4 === 0) hit(ac, out, 'kick', at, 0.22)
      if (inBar % 8 === 4) hit(ac, out, 'snare', at, 0.12)
      if (inBar % 2 === 1) hit(ac, out, 'hat', at, 0.04)
    }
  }

  stop(fade = 0.8) {
    this.stopped = true
    if (this.timer !== null) window.clearInterval(this.timer)
    const now = this.ac.currentTime
    this.gain.gain.cancelScheduledValues(now)
    this.gain.gain.setTargetAtTime(0, now, fade / 4)
    const g = this.gain
    window.setTimeout(() => g.disconnect(), fade * 1000 + 600)
  }
}

let current: Player | null = null
let wanted: TrackId | null = null

function start() {
  const ac = audioContext()
  const out = musicOut()
  if (!ac || !out || !wanted) return
  if (current?.id === wanted) return
  current?.stop()
  current = new Player(ac, out, wanted, TRACKS[wanted])
}

onAudioUnlocked(() => start())

/** Selects the background music. Crossfades from the previous track; null fades out. */
export function playMusic(id: TrackId | null) {
  if (wanted === id) return
  wanted = id
  if (id === null) {
    current?.stop()
    current = null
    return
  }
  start()
}

export function currentMusic(): TrackId | null {
  return wanted
}
