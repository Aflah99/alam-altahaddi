// Phase D (Features 1–5 expansion): preferences, avatars and cosmetic economy, written questions, multiplayer.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createParent, createStudent, dbAvailable, pool, rpc } from './db'

beforeAll(async () => {
  if (!(await dbAvailable())) throw new Error('Local test database not available: run `npm run test:db`.')
})
afterAll(() => pool.end())

describe('account preferences', () => {
  it('saves only known keys with clamped values, per account', async () => {
    const parent = await createParent()
    const kid = await createStudent(parent)
    await rpc(kid, 'save_my_preferences', JSON.stringify({ muted: true, musicVolume: 3, sfxVolume: 0.333, evil: 'x', reducedMotion: 'yes' }))
    expect(await rpc(kid, 'get_my_preferences')).toEqual({ muted: true, musicVolume: 1, sfxVolume: 0.33 })
    expect(await rpc(parent, 'get_my_preferences')).toEqual({})
    await expect(rpc(null, 'save_my_preferences', '{}')).rejects.toThrow()
  })
})
