// Phase D (Features 1–5 expansion): preferences, avatars and cosmetic economy, written questions, multiplayer.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { as, createParent, createStudent, dbAvailable, pool, root, rpc } from './db'

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

// ---------------------------------------------------------------------------
// Feature 2: avatars, packages, duplicates, upgrades
// ---------------------------------------------------------------------------
type Reward = { kind: string; item?: string; rarity: string; duplicate?: boolean; points?: number; coins?: number }
type Open = { open_id: string; rewards: Reward[]; replay: boolean; coins: number; points: number; price: number }
const uuid = () => crypto.randomUUID()

async function richKid(coins: number) {
  const parent = await createParent()
  const s = await createStudent(parent)
  await root(`insert into public.reward_transactions (student_id, kind, ref, xp, coins) values ($1, 'question', $3, 0, $2)`, [s, coins, `seed-${uuid()}`])
  return { s, parent }
}
const coinsOf = async (s: string) => (await rpc<{ coins: number }>(s, 'get_my_game_state')).coins
const pointsOf = async (s: string) => (await rpc<{ upgrade_points: number }>(s, 'get_my_game_state')).upgrade_points

describe('human avatars and legendary creatures', () => {
  it('new students start as a human avatar; creatures are locked collectibles', async () => {
    const { s } = await richKid(0)
    const st = await rpc<{ character_id: string; appearance: { body: string } }>(s, 'get_my_game_state')
    expect(st.character_id).toBe('human-boy')
    expect(st.appearance.body).toBe('boy')
    for (const c of ['green-slime', 'blue-slime', 'little-robot', 'fox', 'owl', 'turtle'])
      await expect(rpc(s, 'set_character', c)).rejects.toThrow(/character locked/)
    await rpc(s, 'set_character', 'human-girl')
    const items = await root<{ id: string; rarity: string; in_shop: boolean }>(`select id, rarity, in_shop from public.shop_items where category = 'characters'`)
    expect(items.length).toBe(6)
    expect(items.every((i) => i.rarity === 'legendary' && !i.in_shop)).toBe(true)
  })

  it('validates the appearance server-side; hijab only for the female avatar; no direct writes', async () => {
    const { s } = await richKid(0)
    const good = { body: 'girl', skin: 3, hair: 'braid', hairColor: 2, theme: 'chinese', primary: 1, secondary: 4, hijab: true, hijabColor: 5 }
    expect(await rpc(s, 'set_appearance', JSON.stringify(good))).toEqual(good)
    expect((await rpc<{ character_id: string }>(s, 'get_my_game_state')).character_id).toBe('human-girl')
    const boy = await rpc<{ hijab: boolean }>(s, 'set_appearance', JSON.stringify({ ...good, body: 'boy' }))
    expect(boy.hijab).toBe(false)
    for (const bad of [{ ...good, skin: 9 }, { ...good, hair: 'mohawk' }, { ...good, theme: 'swimsuit' }, { ...good, primary: 1.5 }, { ...good, hijab: 'yes' }, { body: 'robot' }])
      await expect(rpc(s, 'set_appearance', JSON.stringify(bad))).rejects.toThrow(/invalid appearance/)
    await expect(as(s, `update public.student_profiles set appearance = '{"body":"girl"}' where id = $1`, [s])).rejects.toThrow()
  })
})

describe('surprise packages', () => {
  it('charges the server price once, gives the right number of rewards, replays safely', async () => {
    const { s } = await richKid(1000)
    await expect(rpc(s, 'open_package', 'nope', uuid())).rejects.toThrow(/unknown package/)
    const req = uuid()
    const o = await rpc<Open>(s, 'open_package', 'heroes', req)
    expect(o.replay).toBe(false)
    expect(o.price).toBe(150)
    expect(o.rewards.length).toBe(2)
    expect(o.rewards.some((r) => ['rare', 'epic', 'legendary'].includes(r.rarity))).toBe(true) // guarantee
    const bundleCoins = o.rewards.reduce((n, r) => n + (r.coins ?? 0), 0)
    expect(await coinsOf(s)).toBe(1000 - 150 + bundleCoins)
    const again = await rpc<Open>(s, 'open_package', 'heroes', req)
    expect(again.replay).toBe(true)
    expect(again.rewards).toEqual(o.rewards)
    expect(await coinsOf(s)).toBe(1000 - 150 + bundleCoins)
    const [{ n }] = await root<{ n: number }>(`select count(*)::int n from public.package_opens where student_id = $1`, [s])
    expect(n).toBe(1)
  })

  it('refuses without enough coins and cannot overspend with parallel opens', async () => {
    const { s } = await richKid(100)
    await expect(rpc(s, 'open_package', 'heroes', uuid())).rejects.toThrow(/insufficient coins/)
    const results = await Promise.allSettled([1, 2, 3].map(() => rpc(s, 'open_package', 'adventure', uuid())))
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1)
    expect(await coinsOf(s)).toBeGreaterThanOrEqual(0)
  })

  it('duplicates become upgrade points exactly once', async () => {
    const { s } = await richKid(2000)
    await root(`insert into public.inventory (student_id, item_id, source) select $1, id, 'grant' from public.shop_items on conflict do nothing`, [s])
    const before = await pointsOf(s)
    const o = await rpc<Open>(s, 'open_package', 'legends', uuid())
    const items = o.rewards.filter((r) => r.kind === 'item')
    expect(items.every((r) => r.duplicate && (r.points ?? 0) > 0)).toBe(true)
    const gained = o.rewards.reduce((n, r) => n + (r.points ?? 0), 0)
    expect(await pointsOf(s)).toBe(before + gained)
    const [{ n }] = await root<{ n: number }>(`select count(*)::int n from public.upgrade_point_ledger where student_id = $1 and ref like $2`, [s, `${o.open_id}:%`])
    expect(n).toBe(o.rewards.filter((r) => (r.points ?? 0) > 0).length)
    // Replays never add points again.
    await expect(root(`insert into public.upgrade_point_ledger (student_id, kind, ref, points) select student_id, kind, ref, points from public.upgrade_point_ledger where student_id = $1 limit 1`, [s])).rejects.toThrow(/duplicate key/)
  })

  it('pity guarantees an epic or better after a long unlucky streak', async () => {
    const { s } = await richKid(5000)
    await root(`insert into public.package_types (id, name_ar, price, rolls, weights, pity_epic, pity_legendary, bundle_chance) values ('test-pity', 't', 10, 1, '{"common": 1}', 3, 100, 0) on conflict (id) do nothing`)
    const r1 = await rpc<Open>(s, 'open_package', 'test-pity', uuid())
    const r2 = await rpc<Open>(s, 'open_package', 'test-pity', uuid())
    const r3 = await rpc<Open>(s, 'open_package', 'test-pity', uuid())
    expect([r1.rewards[0].rarity, r2.rewards[0].rarity]).toEqual(['common', 'common'])
    expect(['epic', 'legendary']).toContain(r3.rewards[0].rarity)
    await root(`delete from public.package_opens where package_id = 'test-pity'; delete from public.package_pity where package_id = 'test-pity'; delete from public.package_types where id = 'test-pity'`)
  })

  it('server odds follow the published weights', async () => {
    const rows = await root<{ r: string; n: number }>(
      `select r, count(*)::int n from (select public.roll_rarity('{"common": 70, "rare": 22, "epic": 7, "legendary": 1}', 'common') r from generate_series(1, 20000)) x group by r`)
    const f = Object.fromEntries(rows.map((x) => [x.r, x.n / 20000]))
    expect(f.common).toBeGreaterThan(0.67)
    expect(f.common).toBeLessThan(0.73)
    expect(f.rare).toBeGreaterThan(0.19)
    expect(f.rare).toBeLessThan(0.25)
    expect(f.legendary).toBeGreaterThan(0.004)
    expect(f.legendary).toBeLessThan(0.017)
    const min = await root<{ r: string }>(`select distinct public.roll_rarity('{"common": 70, "rare": 22, "epic": 7, "legendary": 1}', 'epic') r from generate_series(1, 300)`)
    expect(min.every((x) => ['epic', 'legendary'].includes(x.r))).toBe(true)
  })

  it('parents can block packages or limit them per day; only for their own children', async () => {
    const { s, parent } = await richKid(1000)
    const other = await createParent()
    await expect(rpc(other, 'parent_set_controls', s, JSON.stringify({ packages_allowed: false }))).rejects.toThrow(/not your child/)
    await expect(rpc(s, 'parent_set_controls', s, JSON.stringify({ packages_allowed: true }))).rejects.toThrow(/not your child/)
    await rpc(parent, 'parent_set_controls', s, JSON.stringify({ packages_allowed: false }))
    await expect(rpc(s, 'open_package', 'adventure', uuid())).rejects.toThrow(/packages disabled/)
    await rpc(parent, 'parent_set_controls', s, JSON.stringify({ packages_allowed: true, packages_daily_limit: 1 }))
    await rpc(s, 'open_package', 'adventure', uuid())
    await expect(rpc(s, 'open_package', 'adventure', uuid())).rejects.toThrow(/daily package limit/)
    const eco = await rpc<{ packages: unknown[]; spent_on_packages: number }>(parent, 'parent_child_economy', s)
    expect(eco.packages.length).toBe(1)
    expect(eco.spent_on_packages).toBe(60)
  })
})

describe('wearable upgrades', () => {
  it('six tiers with increasing costs, verified server-side, never double-charged', async () => {
    const { s } = await richKid(500)
    await rpc(s, 'purchase_item', 'cape-red')
    await expect(rpc(s, 'upgrade_item', 'cape-red', 1)).rejects.toThrow(/insufficient points/)
    await expect(rpc(s, 'upgrade_item', 'cape-blue', 1)).rejects.toThrow(/not owned/)
    await root(`insert into public.upgrade_point_ledger (student_id, kind, ref, points) values ($1, 'package', 'seed', 1000)`, [s])
    const costs: number[] = []
    for (let t = 1; t < 6; t++) costs.push((await rpc<{ cost: number }>(s, 'upgrade_item', 'cape-red', t)).cost)
    expect(costs).toEqual([20, 45, 90, 160, 280])
    expect(await pointsOf(s)).toBe(1000 - 595)
    await expect(rpc(s, 'upgrade_item', 'cape-red', 6)).rejects.toThrow(/max tier/)
    await expect(rpc(s, 'upgrade_item', 'cape-red', 3)).rejects.toThrow(/tier changed/)
    await rpc(s, 'equip_item', 'cape-red')
    const st = await rpc<{ tiers: Record<string, number>; equipped: Record<string, string> }>(s, 'get_my_game_state')
    expect(st.tiers['cape-red']).toBe(6)
    expect(st.equipped.cape).toBe('cape-red')
  })
})

describe('catalogue parity', () => {
  it('the game and the database list the same items, slots, rarities and prices', async () => {
    const { WEARABLES, CREATURE_ITEMS } = await import('../../src/cosmetics/wearables')
    const db = await root<{ id: string; category: string; rarity: string; price: number; in_shop: boolean }>(`select id, category, rarity, price, in_shop from public.shop_items where active`)
    const byId = new Map(db.map((r) => [r.id, r]))
    for (const w of WEARABLES) {
      const r = byId.get(w.id)
      expect(r, w.id).toBeTruthy()
      expect([r!.category, r!.rarity, r!.in_shop, r!.in_shop ? r!.price : null]).toEqual([w.slot, w.rarity, w.price !== null, w.price])
    }
    expect(db.length).toBe(WEARABLES.length + CREATURE_ITEMS.length)
  })
})
