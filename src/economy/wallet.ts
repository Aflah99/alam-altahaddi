import { getCosmetic, SLOT_ORDER, type CosmeticSlot } from '../characters/cosmetics'
import { BASE_CHARACTER_IDS, isCharacterId, type CharacterId } from '../characters/roster'
import type { MissionState, MissionSummary } from '../quiz/engine'
import type { KeyValueStore } from '../quiz/progress'
import { getItem, type CatalogItem } from './legacyCatalog'
import { levelInfo, PASS_ACCURACY, REWARDS, type LevelInfo } from './config'

/**
 * The player's rewards and cosmetics, stored ONLY in this browser.
 *
 * Everything is derived from an append-only ledger of transactions with
 * deterministic ids, so applying the same reward twice (double taps, reloads,
 * navigating back) never changes anything:
 *
 *   q:<questionId>            first correct answer to a question (once per question, ever)
 *   m:<bankId>:<missionId>    first passing completion of a mission
 *   buy:<itemId>              a shop purchase (negative coins)
 *
 * Balances are recomputed from the ledger, so they cannot drift from it.
 * This is a local prototype: the device owner can edit or delete it, so it is
 * NOT cheat-proof and must never feed a competitive leaderboard. The same
 * transaction shape can later be issued and verified by a server.
 */

export type TxKind = 'question' | 'mission' | 'purchase'

export interface Transaction {
  id: string
  kind: TxKind
  xp: number
  coins: number
  /** ISO time. */
  at: string
}

export type Equipped = Partial<Record<CosmeticSlot, string>>

export interface PlayerWallet {
  version: 1
  playerId: string
  ledger: Transaction[]
  equipped: Equipped
  updatedAt: string
}

export const WALLET_VERSION = 1
export const walletKey = (playerId: string) => `alam-altahaddi:wallet:v1:${playerId}`

export function emptyWallet(playerId: string): PlayerWallet {
  return { version: 1, playerId, ledger: [], equipped: {}, updatedAt: new Date(0).toISOString() }
}

/* ---------- ids ---------- */

export const questionRewardId = (questionId: string) => `q:${questionId}`
export const missionRewardId = (bankId: string, missionId: string) => `m:${bankId}:${missionId}`
export const purchaseId = (itemId: string) => `buy:${itemId}`

/* ---------- derived values ---------- */

export interface WalletView {
  xp: number
  coins: number
  level: LevelInfo
  owned: Set<string>
  unlockedCharacters: Set<CharacterId>
}

export function viewOf(w: PlayerWallet): WalletView {
  let xp = 0
  let coins = 0
  const owned = new Set<string>()
  for (const t of w.ledger) {
    xp += t.xp
    coins += t.coins
    if (t.kind === 'purchase') owned.add(t.id.slice(4))
  }
  const unlockedCharacters = new Set<CharacterId>(BASE_CHARACTER_IDS)
  for (const id of owned) {
    const c = getItem(id)?.characterId
    if (c) unlockedCharacters.add(c)
  }
  return { xp, coins, level: levelInfo(xp), owned, unlockedCharacters }
}

/** Equipped cosmetic ids in drawing order. */
export function outfitOf(w: PlayerWallet): string[] {
  return SLOT_ORDER.map((s) => w.equipped[s]).filter((id): id is string => !!id)
}

/* ---------- applying transactions (idempotent) ---------- */

/** Adds transactions whose ids are not in the ledger yet. Returns the new wallet and what was actually applied. */
export function applyTransactions(w: PlayerWallet, txs: readonly Transaction[]): { wallet: PlayerWallet; applied: Transaction[] } {
  const seen = new Set(w.ledger.map((t) => t.id))
  const applied: Transaction[] = []
  for (const t of txs) {
    if (seen.has(t.id)) continue
    seen.add(t.id)
    applied.push(t)
  }
  if (!applied.length) return { wallet: w, applied }
  return { wallet: { ...w, ledger: [...w.ledger, ...applied], updatedAt: applied[applied.length - 1].at }, applied }
}

/* ---------- quiz rewards ---------- */

export interface MissionReward {
  /** Transactions newly added by this mission (empty when everything was rewarded before). */
  applied: Transaction[]
  xp: number
  coins: number
  bonus: boolean
  /** Correct answers in this mission that earned nothing because they were rewarded earlier. */
  alreadyRewarded: number
  /** True when the mission bonus had been earned on an earlier attempt. */
  bonusEarlier: boolean
  /** A community course: rewards are small and capped per day. */
  community?: boolean
  dailyLimitReached?: boolean
  before: WalletView
  after: WalletView
}

/**
 * Turns a finished mission into reward transactions, using the quiz engine's
 * own per-question results (no second scoring system). Unfinished missions earn nothing.
 */
export function missionTransactions(bankId: string, m: MissionState, summary: MissionSummary, at: string): Transaction[] {
  if (!m.finished) return []
  const txs: Transaction[] = []
  for (const q of m.questions) {
    const r = q.result === 'first' ? REWARDS.firstTry : q.result === 'assisted' ? REWARDS.assisted : null
    if (r && (r.xp || r.coins)) txs.push({ id: questionRewardId(q.questionId), kind: 'question', xp: r.xp, coins: r.coins, at })
  }
  if (summary.firstTryAccuracy >= PASS_ACCURACY) {
    const b = REWARDS.missionPass
    txs.push({ id: missionRewardId(bankId, m.missionId), kind: 'mission', xp: b.xp, coins: b.coins, at })
  }
  return txs
}

export function awardMission(
  w: PlayerWallet,
  bankId: string,
  m: MissionState,
  summary: MissionSummary,
  at = new Date().toISOString(),
): { wallet: PlayerWallet; reward: MissionReward } {
  const candidates = missionTransactions(bankId, m, summary, at)
  const before = viewOf(w)
  const { wallet, applied } = applyTransactions(w, candidates)
  const bonusId = missionRewardId(bankId, m.missionId)
  const reward: MissionReward = {
    applied,
    xp: applied.reduce((s, t) => s + t.xp, 0),
    coins: applied.reduce((s, t) => s + t.coins, 0),
    bonus: applied.some((t) => t.id === bonusId),
    alreadyRewarded: candidates.filter((t) => t.kind === 'question' && !applied.includes(t)).length,
    bonusEarlier: w.ledger.some((t) => t.id === bonusId),
    before,
    after: viewOf(wallet),
  }
  return { wallet, reward }
}

/* ---------- shop ---------- */

export type PurchaseResult =
  | { ok: true; wallet: PlayerWallet; item: CatalogItem }
  | { ok: false; reason: 'unknown-item' | 'owned' | 'insufficient'; missing?: number }

export function purchase(w: PlayerWallet, itemId: string, at = new Date().toISOString()): PurchaseResult {
  const item = getItem(itemId)
  if (!item) return { ok: false, reason: 'unknown-item' }
  const v = viewOf(w)
  if (v.owned.has(itemId)) return { ok: false, reason: 'owned' }
  if (v.coins < item.price) return { ok: false, reason: 'insufficient', missing: item.price - v.coins }
  const { wallet } = applyTransactions(w, [{ id: purchaseId(itemId), kind: 'purchase', xp: 0, coins: -item.price, at }])
  return { ok: true, wallet, item }
}

/* ---------- locker ---------- */

/** Equips an owned cosmetic in its slot (replacing what was there). Unknown or unowned items are ignored. */
export function equip(w: PlayerWallet, itemId: string): PlayerWallet {
  const cosmetic = getCosmetic(itemId)
  if (!cosmetic || !viewOf(w).owned.has(itemId)) return w
  return { ...w, equipped: { ...w.equipped, [cosmetic.slot]: itemId }, updatedAt: new Date().toISOString() }
}

export function unequip(w: PlayerWallet, slot: CosmeticSlot): PlayerWallet {
  if (!w.equipped[slot]) return w
  const equipped = { ...w.equipped }
  delete equipped[slot]
  return { ...w, equipped, updatedAt: new Date().toISOString() }
}

/* ---------- persistence ---------- */

const TX_KINDS: readonly TxKind[] = ['question', 'mission', 'purchase']
const PREFIX: Record<TxKind, string> = { question: 'q:', mission: 'm:', purchase: 'buy:' }

function validTx(t: unknown): t is Transaction {
  if (!t || typeof t !== 'object') return false
  const x = t as Record<string, unknown>
  return (
    typeof x.id === 'string' &&
    TX_KINDS.includes(x.kind as TxKind) &&
    x.id.startsWith(PREFIX[x.kind as TxKind]) &&
    Number.isInteger(x.xp) &&
    Number.isInteger(x.coins) &&
    (x.xp as number) >= 0 &&
    typeof x.at === 'string' &&
    // Purchases must reference a real catalogue item and cost coins.
    (x.kind !== 'purchase' || (!!getItem(x.id.slice(4)) && (x.coins as number) <= 0))
  )
}

/**
 * Defensive normalisation of stored data: drops malformed or duplicate
 * transactions and equipped items that are unknown or not owned.
 */
export function sanitizeWallet(data: unknown, playerId: string): PlayerWallet | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.version !== WALLET_VERSION || d.playerId !== playerId) return null
  const seen = new Set<string>()
  const ledger = (Array.isArray(d.ledger) ? d.ledger : []).filter((t): t is Transaction => {
    if (!validTx(t) || seen.has(t.id)) return false
    seen.add(t.id)
    return true
  })
  const base: PlayerWallet = { ...emptyWallet(playerId), ledger, updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : new Date(0).toISOString() }
  const owned = viewOf(base).owned
  const equipped: Equipped = {}
  const raw = d.equipped && typeof d.equipped === 'object' ? (d.equipped as Record<string, unknown>) : {}
  for (const slot of SLOT_ORDER) {
    const id = raw[slot]
    if (typeof id === 'string' && owned.has(id) && getCosmetic(id)?.slot === slot) equipped[slot] = id
  }
  return { ...base, equipped }
}

function defaultStore(): KeyValueStore | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * Loads the wallet for a profile. Unreadable data is never thrown away: it is
 * copied to a backup key before starting fresh, so an app update cannot
 * silently destroy it.
 */
export function loadWallet(playerId: string, store: KeyValueStore | null = defaultStore()): PlayerWallet {
  let raw: string | null = null
  try {
    raw = store?.getItem(walletKey(playerId)) ?? null
  } catch {
    return emptyWallet(playerId)
  }
  if (!raw) return emptyWallet(playerId)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = undefined
  }
  const wallet = parsed === undefined ? null : sanitizeWallet(parsed, playerId)
  if (wallet) return wallet
  try {
    store?.setItem(`${walletKey(playerId)}:backup`, raw)
  } catch {
    // Nothing more we can do.
  }
  return emptyWallet(playerId)
}

export function saveWallet(w: PlayerWallet, store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.setItem(walletKey(w.playerId), JSON.stringify(w))
  } catch {
    // Storage full or unavailable: the wallet still works for this visit.
  }
}

/** Whether the profile may pick this character (base characters are always available). */
export function canUseCharacter(view: WalletView, id: string): boolean {
  return isCharacterId(id) && view.unlockedCharacters.has(id)
}
