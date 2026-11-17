import { useCallback, useLayoutEffect, useState } from 'react'

export interface Settings {
  /** Turns off decorative animation (clouds, hopping, blinking, transitions). */
  reducedMotion: boolean
  /** Short menu sound effects. Off by default; never autoplays. */
  sound: boolean
}

const STORAGE_KEY = 'alam-altahaddi:settings:v1'

function systemPrefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function loadSettings(): Settings {
  const defaults: Settings = { reducedMotion: systemPrefersReducedMotion(), sound: false }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const saved = JSON.parse(raw) as Partial<Settings>
    return {
      reducedMotion: typeof saved.reducedMotion === 'boolean' ? saved.reducedMotion : defaults.reducedMotion,
      sound: typeof saved.sound === 'boolean' ? saved.sound : defaults.sound,
    }
  } catch {
    return defaults
  }
}

/** Start-menu settings, persisted per device and applied to <html data-motion>. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings)

  useLayoutEffect(() => {
    document.documentElement.dataset.motion = settings.reducedMotion ? 'reduced' : 'full'
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
