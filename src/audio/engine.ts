/**
 * Game-wide audio engine (Web Audio API). Everything is synthesised in the browser:
 * no audio files are downloaded. One AudioContext is created on the first user gesture
 * (browsers block audio before that), with separate music and sound-effect buses:
 *
 *   music bus ─┐
 *              ├─ master ─ destination
 *   sfx bus  ──┘
 *
 * Music is paused while the page is hidden and ducked while the game asks it to be.
 */

export interface AudioPrefs {
  muted: boolean
  /** 0..1 */
  music: number
  /** 0..1 */
  sfx: number
}

export const DEFAULT_AUDIO: AudioPrefs = { muted: false, music: 0.45, sfx: 0.7 }

let ctx: AudioContext | null = null
let master: GainNode | null = null
let musicBus: GainNode | null = null
let sfxBus: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null
let prefs: AudioPrefs = { ...DEFAULT_AUDIO }
let duck = 1
let unlocked = false
const unlockListeners = new Set<() => void>()

/** Perceptual curve so the slider feels even. */
const curve = (v: number) => Math.max(0, Math.min(1, v)) ** 2

function applyLevels(smooth = 0.15) {
  if (!ctx || !master || !musicBus || !sfxBus) return
  const t = ctx.currentTime
  master.gain.setTargetAtTime(prefs.muted ? 0 : 1, t, smooth)
  musicBus.gain.setTargetAtTime(curve(prefs.music) * 0.5 * duck, t, smooth)
  sfxBus.gain.setTargetAtTime(curve(prefs.sfx) * 0.9, t, smooth)
}

export function setAudioPrefs(p: AudioPrefs) {
  prefs = { ...p }
  applyLevels()
}

export function getAudioPrefs(): AudioPrefs {
  return prefs
}

/** Lower the music (e.g. while a dialog speaks or a question is read); 1 = normal. */
export function setDuck(level: number) {
  duck = Math.max(0, Math.min(1, level))
  applyLevels(0.3)
}

/** The context, only once the user has interacted with the page. */
export function audioContext(): AudioContext | null {
  if (!unlocked) return null
  return ctx
}

export function musicOut(): GainNode | null {
  return unlocked ? musicBus : null
}
export function sfxOut(): GainNode | null {
  return unlocked ? sfxBus : null
}

export function noise(): AudioBuffer | null {
  if (!ctx) return null
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = noiseBuffer.getChannelData(0)
    let seed = 1234567
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      d[i] = (seed / 0x7fffffff) * 2 - 1
    }
  }
  return noiseBuffer
}

export function isAudioUnlocked() {
  return unlocked
}

/** Called once audio may play (after the first tap / key press). */
export function onAudioUnlocked(fn: () => void): () => void {
  if (unlocked) fn()
  unlockListeners.add(fn)
  return () => unlockListeners.delete(fn)
}

function unlock() {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      ctx = new AC()
      master = ctx.createGain()
      musicBus = ctx.createGain()
      sfxBus = ctx.createGain()
      musicBus.connect(master)
      sfxBus.connect(master)
      master.connect(ctx.destination)
      master.gain.value = 0
      musicBus.gain.value = 0
      applyLevels(0.05)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    if (!unlocked) {
      unlocked = true
      for (const fn of unlockListeners) fn()
    }
  } catch {
    // No audio on this device: the game is fully playable without it.
  }
}

let installed = false
/** Installs the gesture listeners and page-visibility handling (idempotent). */
export function installAudio() {
  if (installed || typeof window === 'undefined') return
  installed = true
  const opts = { capture: true, passive: true } as const
  for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(ev, unlock, opts)
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return
    if (document.visibilityState === 'hidden') void ctx.suspend().catch(() => {})
    else if (unlocked) void ctx.resume().catch(() => {})
  })
}
