import { describe, expect, it } from 'vitest'
import { parseHash, routeToHash, type Route } from './useHashRoute'

describe('hash routes', () => {
  const routes: Route[] = [
    { name: 'start' },
    { name: 'select' },
    { name: 'lobby' },
    { name: 'map' },
    { name: 'shop' },
    { name: 'shop', category: 'hat' },
    { name: 'locker' },
    { name: 'account' },
    { name: 'groups' },
    { name: 'import' },
    { name: 'parent', path: [] },
    { name: 'parent', path: ['child', 'abc'] },
    { name: 'admin', path: ['review'] },
    { name: 'world', subject: 'religion-values' },
    { name: 'chapters', subject: 'religion-values' },
    { name: 'quiz', subject: 'religion-values', lesson: 'u1-l6', mission: 2 },
  ]

  it.each(routes)('round-trips %o', (route) => {
    expect(parseHash(routeToHash(route))).toEqual(route)
  })

  it('rejects malformed quiz routes', () => {
    expect(parseHash('#/quiz/religion-values/u1-l1/0').name).toBe('start')
    expect(parseHash('#/quiz/religion-values').name).toBe('start')
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
