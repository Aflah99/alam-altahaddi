import { describe, expect, it } from 'vitest'
import { allowedOrigin, checkChildInput, passwordProblem, studentEmail } from './accounts.ts'

describe('child account input', () => {
  const ok = { username: 'sara_8', nickname: 'نجمة', password: 'Long#pass1' }
  it('accepts a valid child', () => expect(checkChildInput(ok)).toEqual({ ok: true }))
  it('rejects bad usernames, nicknames and short passwords', () => {
    expect(checkChildInput({ ...ok, username: 'Sara Smith' }).ok).toBe(false)
    expect(checkChildInput({ ...ok, username: 'ab' }).ok).toBe(false)
    expect(checkChildInput({ ...ok, nickname: 'x' }).ok).toBe(false)
    expect(checkChildInput({ ...ok, nickname: '<script>' }).ok).toBe(false)
    expect(checkChildInput({ ...ok, password: 'short' }).ok).toBe(false)
    expect(checkChildInput({ ...ok, password: 'sara_8Pass!' }).ok).toBe(false)
    expect(checkChildInput({ ...ok, password: 'longpass1' }).ok).toBe(false)
  })
  it('requires the Supabase password policy: lower, upper, digit and symbol', () => {
    expect(passwordProblem('Abcdef1!')).toBeNull()
    for (const pw of ['abcdef1!', 'ABCDEF1!', 'Abcdefg!', 'Abcdefg1', 'Ab1!']) expect(passwordProblem(pw)).not.toBeNull()
  })
  it('only allows the free base characters at creation', () => {
    expect(checkChildInput({ ...ok, character_id: 'human-girl' }).ok).toBe(true)
    expect(checkChildInput({ ...ok, character_id: 'fox' }).ok).toBe(false)
    expect(checkChildInput({ ...ok, character_id: 'owl' }).ok).toBe(false)
  })
  it('maps usernames to a non-routable internal address', () => {
    expect(studentEmail(' Sara_8 ')).toBe('sara_8@students.alam-altahaddi.invalid')
  })
})

describe('CORS', () => {
  it('allows only the site and local development by default', () => {
    expect(allowedOrigin('https://aflah99.github.io', undefined)).toBe('https://aflah99.github.io')
    expect(allowedOrigin('https://evil.example', undefined)).toBeNull()
    expect(allowedOrigin(null, undefined)).toBeNull()
  })
})
