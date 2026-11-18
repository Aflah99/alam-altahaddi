import { useCallback, useLayoutEffect, useState } from 'react'
import { DEFAULT_AUDIO, setAudioPrefs } from '../audio/engine'

export interface Settings {
  /** Turns off decorative animation (clouds, hopping, blinking, transitions). */
  reducedMotion: boolean
  /** Master mute for music and sound effects. */
  muted: boolean
  /** 0..1 */
  musicVolume: number
  /** 0..1 */
  sfxVolume: number
}

const STORAGE_KEY = 'alam-altahaddi:settings:v2'
const OLD_KEY = 'alam-altahaddi:settings:v1'

function systemPrefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const clamp01 = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d)

/** Validates settings from storage or from the server (unknown shape). */
export function sanitizeSettings(saved: unknown, defaults: Settings = defaultSettings()): Settings {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<Record<keyof Settings, unknown>>
  return {
    reducedMotion: typeof s.reducedMotion === 'boolean' ? s.reducedMotion : defaults.reducedMotion,
    muted: typeof s.muted === 'boolean' ? s.muted : defaults.muted,
    musicVolume: clamp01(s.musicVolume, defaults.musicVolume),
    sfxVolume: clamp01(s.sfxVolume, defaults.sfxVolume),
  }
}

export function defaultSettings(): Settings {
  return { reducedMotion: systemPrefersReducedMotion(), muted: DEFAULT_AUDIO.muted, musicVolume: DEFAULT_AUDIO.music, sfxVolume: DEFAULT_AUDIO.sfx }
}

function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) return sanitizeSettings(JSON.parse(raw))
    const old = window.localStorage.getItem(OLD_KEY)
    if (old) {
      const o = JSON.parse(old) as { reducedMotion?: boolean }
      return sanitizeSettings({ reducedMotion: o.reducedMotion })
    }
  } catch {
    // fall through
  }
  return defaultSettings()
}

/** Game settings, persisted on this device (and, for signed-in users, in their account). */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings)

  useLayoutEffect(() => {
    document.documentElement.dataset.motion = settings.reducedMotion ? 'reduced' : 'full'
    setAudioPrefs({ muted: settings.muted, music: settings.musicVolume, sfx: settings.sfxVolume })
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // Storage can be unavailable (private mode); settings still work for this visit.
    }
  }, [settings])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return [settings, update] as const
}
