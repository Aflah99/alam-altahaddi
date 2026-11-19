import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../cloud/client'
import * as api from './api'
import type { MpState } from './api'

/**
 * Live room state. Realtime notifies us when the room changes; polling is the fallback and
 * also keeps our presence fresh. Timers use the server clock (offset measured on every read).
 */
export function useRoom(roomId: string) {
  const [state, setState] = useState<MpState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const offset = useRef(0)
  const inflight = useRef(false)
  const again = useRef(false)
  const self = useRef<() => Promise<void>>(async () => {})

  const refresh = useCallback(async () => {
    if (inflight.current) {
      again.current = true
      return
    }
    inflight.current = true
    try {
      const t0 = Date.now()
      const s = await api.roomState(roomId)
      const t1 = Date.now()
      offset.current = Date.parse(s.server_now) - (t0 + t1) / 2
      setState(s)
      setError(null)
    } catch (e) {
      setError(api.mpError(e))
    } finally {
      inflight.current = false
      if (again.current) {
        again.current = false
        void self.current()
      }
    }
  }, [roomId])

  useEffect(() => {
    self.current = refresh
  }, [refresh])

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0)
    const client = supabase()
    const channel = client
      ?.channel(`mp-room-${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mp_rooms', filter: `id=eq.${roomId}` }, () => void refresh())
      .subscribe()
    return () => {
      window.clearTimeout(first)
      if (channel) void client?.removeChannel(channel)
    }
  }, [roomId, refresh])

  // Fallback polling: faster while a timed match is running.
  const playing = state?.match?.status === 'playing' || state?.match?.status === 'countdown'
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, playing ? 1500 : 3000)
    return () => window.clearInterval(t)
  }, [refresh, playing])

  const now = useCallback(() => Date.now() + offset.current, [])
  return { state, error, refresh, now }
}

/** Re-renders every `ms` (for countdowns). */
export function useTicker(ms = 250) {
  const [, set] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => set((n) => n + 1), ms)
    return () => window.clearInterval(t)
  }, [ms])
}
