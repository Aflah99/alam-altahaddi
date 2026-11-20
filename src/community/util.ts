import { useCallback, useEffect, useRef, useState } from 'react'
import { arabicError } from '../cloud/client'
import { communityError } from './api'

export const errText = (e: unknown) => communityError(e) || arabicError(e)

export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** localStorage may be unavailable (private mode): every access is guarded and the app works without it. */
export const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, v: string) {
    try {
      localStorage.setItem(key, v)
    } catch {
      /* ignore */
    }
  },
  del(key: string) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}

/** A value that is saved to the device while being edited, so a closed tab or a reload does not lose it. */
export function useDraft(key: string, initial: string): [string, (v: string) => void, () => void, boolean] {
  const [state, setState] = useState(() => ({ value: store.get(key) ?? initial, restored: store.get(key) !== null && store.get(key) !== initial }))
  const timer = useRef<number | undefined>(undefined)
  const set = useCallback(
    (v: string) => {
      setState((s) => ({ ...s, value: v }))
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => (v ? store.set(key, v) : store.del(key)), 400)
    },
    [key],
  )
  const clear = useCallback(() => {
    window.clearTimeout(timer.current)
    store.del(key)
    setState({ value: initial, restored: false })
  }, [key, initial])
  return [state.value, set, clear, state.restored]
}

/** Warns before the tab is closed or reloaded while there is unsaved work. */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])
}

export const CONFIRM_LEAVE = 'لديك تعديلات غير محفوظة. هل تريد المغادرة وتجاهلها؟'

export function useAsyncMsg() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const run = useCallback(async <T,>(fn: () => Promise<T>, okText?: string | ((r: T) => string)): Promise<T | undefined> => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await fn()
      if (okText) setMsg({ ok: true, text: typeof okText === 'function' ? okText(r) : okText })
      return r
    } catch (e) {
      setMsg({ ok: false, text: errText(e) })
      return undefined
    } finally {
      setBusy(false)
    }
  }, [])
  return { msg, setMsg, busy, run }
}
