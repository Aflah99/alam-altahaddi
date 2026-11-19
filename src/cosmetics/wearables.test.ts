import { describe, expect, it } from 'vitest'
import { composeHuman, DEFAULT_APPEARANCE, HAIR_IDS, HUMAN_H, HUMAN_W, sanitizeAppearance, THEME_IDS } from '../characters/human'
import { getCharacter, humanCharacter } from '../characters/roster'
import { composeLook } from './look'
import { MAX_TIER, parseWorn, SLOTS, TIERS, upgradeCost, WEARABLES, wornKey } from './wearables'

describe('human avatars', () => {
  it('every theme and hairstyle composes a full 20×30 sprite for both bodies, with and without hijab', () => {
    for (const body of ['boy', 'girl'] as const)
      for (const theme of THEME_IDS)
        for (const hair of HAIR_IDS)
          for (const hijab of [false, true]) {
            const s = composeHuman({ ...DEFAULT_APPEARANCE[body], theme, hair, hijab })
            expect(s.rows.length).toBe(HUMAN_H)
            expect(s.rows.every((r) => r.length === HUMAN_W)).toBe(true)
            expect(s.rows.join('').split('').every((c) => c === '.' || s.palette[c])).toBe(true)
          }
  })
  it('the hijab hides all hair and covers the neck', () => {
    const s = composeHuman({ ...DEFAULT_APPEARANCE.girl, hijab: true, hair: 'long' })
    expect(s.rows.join('')).not.toMatch(/[Hh]/)
    expect(s.rows[16].includes('s')).toBe(false)
  })
  it('clothing never shows skin below the neck except the hands', () => {
    for (const body of ['boy', 'girl'] as const)
      for (const theme of THEME_IDS) {
        const s = composeHuman({ ...DEFAULT_APPEARANCE[body], theme, hijab: false })
        s.rows.slice(17).forEach((row, i) => {
          const y = i + 17
          ;[...row].forEach((c, x) => {
            if (c === 'S') expect(y === 23 && [4, 5, 14, 15].includes(x), `${theme} ${body} skin at ${x},${y}`).toBe(true)
          })
        })
      }
  })
  it('appearance input is sanitised (hijab only for the female avatar)', () => {
    expect(sanitizeAppearance({ body: 'boy', hijab: true }).hijab).toBe(false)
    expect(sanitizeAppearance({ body: 'girl', skin: 99, hair: 'x' })).toMatchObject({ skin: DEFAULT_APPEARANCE.girl.skin, hair: DEFAULT_APPEARANCE.girl.hair })
  })
})

describe('wearables', () => {
  it('covers all 11 slots with unique ids and art inside the canvas', () => {
    expect(new Set(WEARABLES.map((w) => w.id)).size).toBe(WEARABLES.length)
    for (const s of SLOTS) expect(WEARABLES.some((w) => w.slot === s.id), s.id).toBe(true)
    expect(WEARABLES.length).toBeGreaterThanOrEqual(60)
    for (const w of WEARABLES) for (const a of [w.front, w.behind, w.extra]) if (a) expect(a.y + a.rows.length, w.id).toBeLessThanOrEqual(30)
    expect(WEARABLES.filter((w) => w.price !== null).every((w) => w.rarity === 'common' || w.rarity === 'rare')).toBe(true)
  })
  it('every item is drawn on a human and its tier changes its colours', () => {
    const boy = humanCharacter('human-boy')
    for (const w of WEARABLES) {
      const l1 = composeLook(boy, [wornKey(w.id, 1)])
      const l6 = composeLook(boy, [wornKey(w.id, 6)])
      const cells = (l: typeof l1) => [...l.front, ...l.behind].flatMap((x) => [...x.cells, ...x.trim])
      expect(cells(l1).length > 0 || Object.keys(l1.palette).length > 0, w.id).toBe(true)
      if (!w.boots) expect(JSON.stringify(cells(l1)) === JSON.stringify(cells(l6)), w.id).toBe(false)
    }
  })
  it('creatures show only compatible items', () => {
    const fox = getCharacter('fox')
    expect(composeLook(fox, [wornKey('cape-dragon', 1)]).behind.length + composeLook(fox, [wornKey('cape-dragon', 1)]).front.length).toBe(0)
    expect(composeLook(fox, [wornKey('pet-cat', 1)]).front.length).toBe(1)
  })
  it('six tiers with increasing costs', () => {
    expect(TIERS.map((t) => t.label)).toEqual(['برونزي', 'فضي', 'ذهبي', 'بلاتيني', 'ألماسي', 'أسطوري'])
    expect([1, 2, 3, 4, 5].map((t) => upgradeCost(t))).toEqual([20, 45, 90, 160, 280])
    expect(upgradeCost(MAX_TIER)).toBeNull()
    expect(parseWorn('cape-red@4')).toEqual({ id: 'cape-red', tier: 4 })
    expect(parseWorn('cape-red@99').tier).toBe(1)
  })
})
