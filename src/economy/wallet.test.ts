import { describe, expect, it } from 'vitest'
import { COSMETICS, composeOutfit, getCosmetic } from '../characters/cosmetics'
import { BASE_CHARACTER_IDS, getCharacter, ROSTER } from '../characters/roster'
import type { MissionState, QuestionResult } from '../quiz/engine'
import { summarize } from '../quiz/engine'
import { CATALOG, getItem } from './catalog'
import { levelInfo, PASS_ACCURACY, REWARDS, xpToNext } from './config'
import {
  applyTransactions,
  awardMission,
  emptyWallet,
  equip,
  loadWallet,
  missionRewardId,
  outfitOf,
  purchase,
  questionRewardId,
  sanitizeWallet,
  saveWallet,
  unequip,
  viewOf,
  walletKey,
  type PlayerWallet,
} from './wallet'

const BANK = 'religion-values-g8'

function mission(results: (QuestionResult | null)[], { id = 'u1-l1#1', hints = [] as number[], finished = true } = {}): MissionState {
  return {
    missionId: id,
    lessonId: id.split('#')[0],
    missionNumber: 1,
    index: results.length,
    finished,
    questions: results.map((result, i) => ({
      questionId: `rv8.u1.l1.${id}.${i}`,
      order: ['a', 'b', 'c', 'd'],
      selected: 'a',
      attempts: result === 'first' ? ['a'] : ['b', 'a'],
      hintUsed: hints.includes(i),
      phase: 'final',
      result,
    })),
  }
}

function memoryStore() {
  const data = new Map<string, string>()
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

function rich(coins: number): PlayerWallet {
  // Grant coins through ordinary question rewards.
  const n = Math.ceil(coins / REWARDS.firstTry.coins)
  const ledger = Array.from({ length: n }, (_, i) => ({ id: `q:test.${i}`, kind: 'question' as const, xp: 10, coins: 10, at: 't' }))
  return { ...emptyWallet('p1'), ledger }
}

describe('rewards: question results', () => {
  it('pays 10/10 for first-try, 5/5 for hint or retry, 0 for missed', () => {
    const m = mission(['first', 'assisted', 'missed'])
    const { reward } = awardMission(emptyWallet('p1'), BANK, m, summarize(m))
    expect(reward.xp).toBe(15)
    expect(reward.coins).toBe(15)
    expect(reward.applied.map((t) => t.xp)).toEqual([10, 5])
  })

  it('a correct answer after a hint counts as assisted (engine result), not first-try', () => {
    const m = mission(['assisted'], { hints: [0] })
    expect(awardMission(emptyWallet('p1'), BANK, m, summarize(m)).reward.coins).toBe(REWARDS.assisted.coins)
  })

  it('a correct answer on the retry pays the assisted amount', () => {
    const m = mission(['assisted'])
    expect(m.questions[0].attempts).toHaveLength(2)
    expect(awardMission(emptyWallet('p1'), BANK, m, summarize(m)).reward.xp).toBe(REWARDS.assisted.xp)
  })

  it('unfinished missions earn nothing', () => {
    const m = mission(['first', 'first'], { finished: false })
    const { wallet, reward } = awardMission(emptyWallet('p1'), BANK, m, summarize(m))
    expect(reward.applied).toEqual([])
    expect(wallet.ledger).toEqual([])
  })
})

describe('rewards: anti-farming', () => {
  it('rewards each question once, however often the mission is replayed', () => {
    const m = mission(['first', 'first', 'first'])
    const s = summarize(m)
    const a = awardMission(emptyWallet('p1'), BANK, m, s)
    const b = awardMission(a.wallet, BANK, m, s)
    const c = awardMission(b.wallet, BANK, m, s)
    expect(a.reward.coins).toBe(30 + REWARDS.missionPass.coins)
    expect(b.reward.coins).toBe(0)
    expect(b.reward.alreadyRewarded).toBe(3)
    expect(b.reward.bonusEarlier).toBe(true)
    expect(c.wallet).toBe(b.wallet)
    expect(viewOf(c.wallet).coins).toBe(50)
  })

  it('a question first answered as assisted is not upgraded later', () => {
    const first = mission(['assisted'])
    const again = mission(['first'])
    const a = awardMission(emptyWallet('p1'), BANK, first, summarize(first))
    const b = awardMission(a.wallet, BANK, again, summarize(again))
    expect(b.reward.xp).toBe(REWARDS.missionPass.xp) // only the (new) mission bonus
  })

  it('a missed question can still earn its reward when later answered correctly', () => {
    const miss = mission(['missed'])
    const hit = mission(['first'])
    const a = awardMission(emptyWallet('p1'), BANK, miss, summarize(miss))
    expect(a.reward.coins).toBe(0)
    const b = awardMission(a.wallet, BANK, hit, summarize(hit))
    expect(b.reward.applied.some((t) => t.id === questionRewardId(hit.questions[0].questionId))).toBe(true)
  })

  it('applyTransactions is idempotent for repeated ids in one batch', () => {
    const tx = { id: 'q:x', kind: 'question' as const, xp: 10, coins: 10, at: 't' }
    const { wallet, applied } = applyTransactions(emptyWallet('p1'), [tx, tx, { ...tx }])
    expect(applied).toHaveLength(1)
    expect(viewOf(wallet).coins).toBe(10)
  })
})

describe('rewards: mission bonus', () => {
  it(`needs ${PASS_ACCURACY}% first-attempt accuracy`, () => {
    const pass = mission(['first', 'first', 'first', 'missed'], { id: 'u1-l1#2' }) // 75%
    const fail = mission(['first', 'first', 'missed', 'missed'], { id: 'u1-l1#3' }) // 50%
    expect(awardMission(emptyWallet('p1'), BANK, pass, summarize(pass)).reward.bonus).toBe(true)
    expect(awardMission(emptyWallet('p1'), BANK, fail, summarize(fail)).reward.bonus).toBe(false)
  })

  it('is awarded at most once per mission and uses a deterministic id', () => {
    const m = mission(['first'])
    const a = awardMission(emptyWallet('p1'), BANK, m, summarize(m))
    expect(a.wallet.ledger.some((t) => t.id === missionRewardId(BANK, 'u1-l1#1'))).toBe(true)
    const b = awardMission(a.wallet, BANK, m, summarize(m))
    expect(b.reward.bonus).toBe(false)
  })

  it('can be earned on a later attempt after failing first', () => {
    const fail = mission(['missed', 'missed'])
    const pass = mission(['first', 'first'])
    const a = awardMission(emptyWallet('p1'), BANK, fail, summarize(fail))
    const b = awardMission(a.wallet, BANK, pass, summarize(pass))
    expect(a.reward.bonus).toBe(false)
    expect(b.reward.bonus).toBe(true)
  })
})

describe('levels', () => {
  it('uses predictable steps: 50, 75, 100, …', () => {
    expect([1, 2, 3].map(xpToNext)).toEqual([50, 75, 100])
    expect(levelInfo(0)).toMatchObject({ level: 1, into: 0, needed: 50 })
    expect(levelInfo(49).level).toBe(1)
    expect(levelInfo(50)).toMatchObject({ level: 2, into: 0, needed: 75 })
    expect(levelInfo(125)).toMatchObject({ level: 3, into: 0 })
    expect(levelInfo(130).ratio).toBeCloseTo(5 / 100)
  })

  it('XP is never spent by purchases', () => {
    const w = rich(200)
    const xp = viewOf(w).xp
    const r = purchase(w, 'hat-grad')
    expect(r.ok && viewOf(r.wallet).xp).toBe(xp)
  })
})

describe('shop', () => {
  it('buys an item with enough coins and deducts the price', () => {
    const r = purchase(rich(150), 'hat-grad')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const v = viewOf(r.wallet)
    expect(v.coins).toBe(150 - getItem('hat-grad')!.price)
    expect(v.owned.has('hat-grad')).toBe(true)
  })

  it('rejects purchases without enough coins and never goes negative', () => {
    const r = purchase(rich(50), 'hat-crown')
    expect(r).toEqual({ ok: false, reason: 'insufficient', missing: 150 })
  })

  it('prevents buying the same item twice', () => {
    const a = purchase(rich(400), 'hat-grad')
    if (!a.ok) throw new Error('first purchase failed')
    const b = purchase(a.wallet, 'hat-grad')
    expect(b).toEqual({ ok: false, reason: 'owned' })
    expect(viewOf(a.wallet).coins).toBe(400 - 120)
  })

  it('rejects unknown items', () => {
    expect(purchase(rich(400), 'free-money')).toEqual({ ok: false, reason: 'unknown-item' })
  })

  it('unlocks a new character permanently; base characters are always unlocked', () => {
    expect([...viewOf(emptyWallet('p1')).unlockedCharacters]).toEqual([...BASE_CHARACTER_IDS])
    const r = purchase(rich(200), 'char-owl')
    expect(r.ok && viewOf(r.wallet).unlockedCharacters.has('owl')).toBe(true)
  })

  it('catalogue prices are accessible and every cosmetic has art', () => {
    for (const item of CATALOG) {
      expect(item.price).toBeGreaterThanOrEqual(50)
      expect(item.price).toBeLessThanOrEqual(200)
      if (item.category === 'characters') expect(ROSTER.some((c) => c.id === item.characterId)).toBe(true)
      else expect(getCosmetic(item.id)?.slot).toBe(item.category)
    }
    for (const c of COSMETICS) expect(getItem(c.id)).toBeDefined()
  })
})

describe('locker', () => {
  const owning = (...ids: string[]) => {
    let w = rich(2000)
    for (const id of ids) {
      const r = purchase(w, id)
      if (!r.ok) throw new Error(id)
      w = r.wallet
    }
    return w
  }

  it('equips owned items, one per slot, and unequips', () => {
    let w = owning('hat-grad', 'hat-straw', 'bag-school')
    w = equip(w, 'hat-grad')
    w = equip(w, 'bag-school')
    w = equip(w, 'hat-straw')
    expect(outfitOf(w)).toEqual(['hat-straw', 'bag-school'])
    w = unequip(w, 'hat')
    expect(outfitOf(w)).toEqual(['bag-school'])
  })

  it('ignores equipping items that are not owned', () => {
    const w = equip(rich(0), 'hat-crown')
    expect(w.equipped).toEqual({})
  })
})

describe('persistence', () => {
  it('saves and reloads inventory and equipment', () => {
    const store = memoryStore()
    let w = rich(300)
    const r = purchase(w, 'acc-star')
    if (!r.ok) throw new Error('purchase failed')
    w = equip(r.wallet, 'acc-star')
    saveWallet(w, store)
    const back = loadWallet('p1', store)
    expect(viewOf(back).owned.has('acc-star')).toBe(true)
    expect(outfitOf(back)).toEqual(['acc-star'])
    expect(viewOf(back).coins).toBe(viewOf(w).coins)
  })

  it('starts empty for a new profile and keeps profiles apart', () => {
    const store = memoryStore()
    saveWallet(rich(100), store)
    expect(loadWallet('p2', store).ledger).toEqual([])
  })

  it('backs up unreadable data instead of silently discarding it', () => {
    const store = memoryStore()
    store.setItem(walletKey('p1'), '{not json')
    const w = loadWallet('p1', store)
    expect(w.ledger).toEqual([])
    expect(store.getItem(`${walletKey('p1')}:backup`)).toBe('{not json')
  })

  it('drops malformed, duplicate or tampered entries and invalid equipment', () => {
    const clean = sanitizeWallet(
      {
        version: 1,
        playerId: 'p1',
        ledger: [
          { id: 'q:a', kind: 'question', xp: 10, coins: 10, at: 't' },
          { id: 'q:a', kind: 'question', xp: 10, coins: 10, at: 't' },
          { id: 'q:b', kind: 'question', xp: -5, coins: 10, at: 't' },
          { id: 'buy:not-an-item', kind: 'purchase', xp: 0, coins: -1, at: 't' },
          { id: 'buy:hat-grad', kind: 'purchase', xp: 0, coins: 500, at: 't' },
          'junk',
        ],
        equipped: { hat: 'hat-grad', bag: 'bag-school', outfit: 42 },
      },
      'p1',
    )
    expect(clean?.ledger.map((t) => t.id)).toEqual(['q:a'])
    expect(clean?.equipped).toEqual({})
  })

  it('rejects data from another version or profile', () => {
    expect(sanitizeWallet({ version: 2, playerId: 'p1', ledger: [] }, 'p1')).toBeNull()
    expect(sanitizeWallet({ version: 1, playerId: 'other', ledger: [] }, 'p1')).toBeNull()
  })

  it('does not touch Task 05 learning progress keys', () => {
    expect(walletKey('p1')).not.toContain('progress')
  })
})

describe('cosmetic rendering', () => {
  it('draws nothing for characters an item does not fit', () => {
    const robot = getCharacter('little-robot')
    const l = composeOutfit(robot, ['acc-glasses'])
    expect(l.face).toEqual([])
  })

  it('hats sit on top of the head for every character and keep the fox ears in front', () => {
    for (const ch of ROSTER) {
      const l = composeOutfit(ch, ['hat-grad'])
      expect(l.front.length, ch.id).toBeGreaterThan(0)
      const bottom = Math.max(...l.front.map((c) => c.y))
      expect(bottom, ch.id).toBeLessThanOrEqual(4)
    }
    expect(composeOutfit(getCharacter('fox'), ['hat-straw']).over.length).toBeGreaterThan(0)
  })

  it('bags are only drawn where the body is transparent (behind the character)', () => {
    for (const ch of ROSTER) {
      for (const c of composeOutfit(ch, ['bag-school']).behind) {
        expect(ch.rows[c.y]?.[c.x] ?? '.', `${ch.id} ${c.x},${c.y}`).toBe('.')
      }
    }
  })

  it('scarves and belts stay inside the silhouette', () => {
    for (const ch of ROSTER) {
      for (const id of ['outfit-scarf', 'outfit-belt']) {
        for (const c of composeOutfit(ch, [id]).front) {
          const px = ch.rows[c.y]?.[c.x] ?? '.'
          expect(px === '.' || px === 'O', `${ch.id} ${id} ${c.x},${c.y}`).toBe(false)
        }
      }
    }
  })

  it('ignores unknown item ids', () => {
    const l = composeOutfit(getCharacter('fox'), ['nope'])
    expect(l.front.length + l.behind.length + l.face.length).toBe(0)
  })
})
