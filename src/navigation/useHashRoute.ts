import { useCallback, useEffect, useState } from 'react'

/**
 * Minimal hash router. Hash URLs work on GitHub Pages without server rewrites,
 * survive reloads and keep the browser back button working.
 */
export type Route = 'start' | 'select' | 'lobby'

const HASHES: Record<Exclude<Route, 'start'>, string> = {
  select: '#/character',
  lobby: '#/lobby',
}

function parse(hash: string): Route {
  if (hash === HASHES.select) return 'select'
  if (hash === HASHES.lobby) return 'lobby'
  return 'start'
}

export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash))

  useEffect(() => {
    const sync = () => setRoute(parse(window.location.hash))
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  const navigate = useCallback((to: Route, { replace = false } = {}) => {
    const url = to === 'start' ? window.location.pathname + window.location.search : HASHES[to]
    if (replace) window.history.replaceState(null, '', url)
    else window.history.pushState(null, '', url)
    setRoute(to)
  }, [])

  return [route, navigate] as const
}
