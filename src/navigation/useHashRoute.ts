import { useCallback, useEffect, useState } from 'react'

/**
 * Minimal hash router. Hash URLs work on GitHub Pages without server rewrites,
 * survive reloads and keep the browser back button working.
 */
export type Route =
  | { name: 'start' }
  | { name: 'select' }
  | { name: 'lobby' }
  | { name: 'map' }
  | { name: 'world'; subject: string }
  | { name: 'chapters'; subject: string }

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'start':
      return ''
    case 'select':
      return '#/character'
    case 'lobby':
      return '#/lobby'
    case 'map':
      return '#/map'
    case 'world':
      return `#/world/${encodeURIComponent(route.subject)}`
    case 'chapters':
      return `#/world/${encodeURIComponent(route.subject)}/chapters`
  }
}

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  if (parts[0] === 'character') return { name: 'select' }
  if (parts[0] === 'lobby') return { name: 'lobby' }
  if (parts[0] === 'map') return { name: 'map' }
  if (parts[0] === 'world' && parts[1]) {
    return parts[2] === 'chapters' ? { name: 'chapters', subject: parts[1] } : { name: 'world', subject: parts[1] }
  }
  return { name: 'start' }
}

const urlFor = (route: Route) => routeToHash(route) || window.location.pathname + window.location.search

export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))

  useEffect(() => {
    const sync = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  const navigate = useCallback((to: Route, { replace = false } = {}) => {
    const state = { from: window.location.hash }
    if (replace) window.history.replaceState(window.history.state, '', urlFor(to))
    else window.history.pushState(state, '', urlFor(to))
    setRoute(to)
  }, [])

  /**
   * Go "up" to `to`. If we got here from `to`, step back in history (so the
   * browser back button stays in sync); otherwise navigate to it.
   */
  const back = useCallback(
    (to: Route) => {
      const from = (window.history.state as { from?: string } | null)?.from
      if (from !== undefined && from === routeToHash(to)) window.history.back()
      else navigate(to)
    },
    [navigate],
  )

  return { route, navigate, back }
}
