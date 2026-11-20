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
  | { name: 'shop'; category?: string }
  | { name: 'locker' }
  | { name: 'account' }
  | { name: 'groups' }
  | { name: 'rooms' }
  | { name: 'discover' }
  | { name: 'joincourse'; code: string }
  | { name: 'room'; id: string }
  | { name: 'join'; code: string }
  | { name: 'import' }
  | { name: 'parent'; path: string[] }
  | { name: 'admin'; path: string[] }
  | { name: 'world'; subject: string }
  | { name: 'chapters'; subject: string }
  | { name: 'quiz'; subject: string; lesson: string; mission: number }

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
    case 'shop':
      return route.category ? `#/shop/${encodeURIComponent(route.category)}` : '#/shop'
    case 'locker':
      return '#/locker'
    case 'account':
      return '#/account'
    case 'groups':
      return '#/groups'
    case 'rooms':
      return '#/rooms'
    case 'discover':
      return '#/discover'
    case 'joincourse':
      return `#/join-course/${encodeURIComponent(route.code)}`
    case 'room':
      return `#/room/${encodeURIComponent(route.id)}`
    case 'join':
      return `#/join/${encodeURIComponent(route.code)}`
    case 'import':
      return '#/account/import'
    case 'parent':
    case 'admin':
      return `#/${route.name}${route.path.map((p) => `/${encodeURIComponent(p)}`).join('')}`
    case 'world':
      return `#/world/${encodeURIComponent(route.subject)}`
    case 'chapters':
      return `#/world/${encodeURIComponent(route.subject)}/chapters`
    case 'quiz':
      return `#/quiz/${encodeURIComponent(route.subject)}/${encodeURIComponent(route.lesson)}/${route.mission}`
  }
}

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  if (parts[0] === 'character') return { name: 'select' }
  if (parts[0] === 'lobby') return { name: 'lobby' }
  if (parts[0] === 'map') return { name: 'map' }
  if (parts[0] === 'shop') return parts[1] ? { name: 'shop', category: parts[1] } : { name: 'shop' }
  if (parts[0] === 'locker') return { name: 'locker' }
  if (parts[0] === 'groups') return { name: 'groups' }
  if (parts[0] === 'rooms') return { name: 'rooms' }
  if (parts[0] === 'discover') return { name: 'discover' }
  if (parts[0] === 'join-course' && parts[1]) return { name: 'joincourse', code: parts[1] }
  if (parts[0] === 'room' && parts[1]) return { name: 'room', id: parts[1] }
  if (parts[0] === 'join' && parts[1]) return { name: 'join', code: parts[1] }
  if (parts[0] === 'account') return parts[1] === 'import' ? { name: 'import' } : { name: 'account' }
  if (parts[0] === 'parent' || parts[0] === 'admin') return { name: parts[0], path: parts.slice(1) }
  if (parts[0] === 'quiz' && parts[1] && parts[2] && Number(parts[3]) >= 1) {
    return { name: 'quiz', subject: parts[1], lesson: parts[2], mission: Math.floor(Number(parts[3])) }
  }
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
