import { describe, expect, it } from 'vitest'
import { parseHash, routeToHash, type Route } from './useHashRoute'

describe('hash routes', () => {
  const routes: Route[] = [
    { name: 'start' },
    { name: 'select' },
    { name: 'lobby' },
    { name: 'map' },
    { name: 'world', subject: 'religion-values' },
    { name: 'chapters', subject: 'religion-values' },
  ]

  it.each(routes)('round-trips %o', (route) => {
    expect(parseHash(routeToHash(route))).toEqual(route)
  })

  it('treats unknown hashes as the start screen', () => {
    expect(parseHash('#/nowhere')).toEqual({ name: 'start' })
    expect(parseHash('')).toEqual({ name: 'start' })
  })

  it('keeps the existing Task 03 URLs working', () => {
    expect(parseHash('#/character')).toEqual({ name: 'select' })
    expect(parseHash('#/lobby')).toEqual({ name: 'lobby' })
  })
})
