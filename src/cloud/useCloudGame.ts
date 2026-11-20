import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BASE_CHARACTER_IDS, getCharacter, isCharacterId, type CharacterDef, type CharacterId } from '../characters/roster'
import { getWearable, SLOT_ORDER, wornKey, type Slot } from '../cosmetics/wearables'
import { getItem } from '../economy/catalog'
import { levelInfo } from '../economy/config'
import type { WalletView } from '../economy/wallet'
import * as api from './api'
import { arabicError } from './client'
import type { CatalogSubject, Controls, GameState } from './types'

/** Published content is re-fetched when older than this, so new subjects appear without a deploy. */
export const CATALOG_MAX_AGE_MS = 60_000

export interface GameView extends WalletView {
  /** نقاط التطوير */
  points: number
  tiers: Record<string, number>
  controls: Controls
}

export type ShopPurchaseResult = { ok: true } | { ok: false; reason: 'unknown-item' | 'owned' | 'insufficient'; missing?: number }

const DEFAULT_CONTROLS: Controls = { packages_allowed: true, packages_daily_limit: 5, multiplayer_allowed: true, reactions_allowed: true }

export function viewFromState(s: GameState): GameView {
  const owned = new Set(s.owned)
  const unlockedCharacters = new Set<CharacterId>(BASE_CHARACTER_IDS)
  for (const id of owned) {
    const c = getItem(id)?.characterId
    if (c) unlockedCharacters.add(c)
  }
  return {
    xp: s.xp,
    coins: s.coins,
    level: levelInfo(s.xp),
    owned,
    unlockedCharacters,
    points: s.upgrade_points ?? 0,
    tiers: s.tiers ?? {},
    controls: s.controls ?? DEFAULT_CONTROLS,
  }
}

/** Equipped items as sprite keys ("id@tier"), in drawing order. */
export function outfitKeys(equipped: Partial<Record<string, string>>, tiers: Record<string, number>): string[] {
  return SLOT_ORDER.map((s) => equipped[s])
    .filter((id): id is string => !!id && !!getWearable(id))
    .map((id) => wornKey(id, tiers[id] ?? 1))
}

/** The sprite for a player: human avatars use their saved appearance. */
export function characterOf(characterId: string, appearance: unknown): CharacterDef {
  return getCharacter(isCharacterId(characterId) ? characterId : 'human-boy', appearance)
}

/**
 * Signed-in student: the published catalogue and the server-side game state
 * (verified XP, coins, upgrade points, inventory and tiers, equipment, avatar).
 */
export function useCloudGame(active: boolean) {
  const [catalog, setCatalog] = useState<CatalogSubject[] | null>(null)
  const [community, setCommunity] = useState<CatalogSubject[]>([])
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [state, setState] = useState<GameState | null>(null)
  const [stateError, setStateError] = useState<string | null>(null)
  const fetchedAt = useRef(0)

  const reloadCatalog = useCallback(async (force = false) => {
    if (!force && Date.now() - fetchedAt.current < CATALOG_MAX_AGE_MS) return
    try {
      const c = await api.getCatalog()
      fetchedAt.current = Date.now()
      setCatalog(c)
      setCatalogError(null)
    } catch (e) {
      setCatalogError(arabicError(e))
    }
  }, [])

  /** The student's enrolled community courses (they never replace the official catalogue). */
  const reloadCommunity = useCallback(async () => {
    try {
      setCommunity(await api.getMyCourseCatalog())
    } catch {
      setCommunity([])
    }
  }, [])

  const reloadState = useCallback(async () => {
    try {
      setState(await api.getGameState())
      setStateError(null)
    } catch (e) {
      setStateError(arabicError(e))
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const t = window.setTimeout(() => {
      void reloadCatalog(true)
      void reloadState()
      void reloadCommunity()
    }, 0)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void reloadCatalog()
        void reloadState()
        void reloadCommunity()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [active, reloadCatalog, reloadState, reloadCommunity])

  const view = useMemo(() => (state ? viewFromState(state) : null), [state])
  const equipped = useMemo(() => (state?.equipped ?? {}) as Partial<Record<Slot, string>>, [state])
  const outfit = useMemo(() => outfitKeys(equipped, state?.tiers ?? {}), [equipped, state])
  const character = useMemo(() => (state ? characterOf(state.character_id, state.appearance) : null), [state])

  const purchase = useCallback(
    async (itemId: string): Promise<ShopPurchaseResult> => {
      try {
        await api.purchaseItem(itemId)
        await reloadState()
        return { ok: true }
      } catch (e) {
        const msg = String((e as { message?: string }).message ?? e)
        const detail = Number((e as { details?: string }).details)
        if (/already owned/.test(msg)) return { ok: false, reason: 'owned' }
        if (/insufficient/.test(msg)) return { ok: false, reason: 'insufficient', missing: Number.isFinite(detail) ? detail : undefined }
        if (/unknown item/.test(msg)) return { ok: false, reason: 'unknown-item' }
        throw e
      }
    },
    [reloadState],
  )

  const optimistic = useCallback((patch: (s: GameState) => GameState) => setState((s) => (s ? patch(s) : s)), [])

  const equip = useCallback(
    async (itemId: string) => {
      const slot = getWearable(itemId)?.slot
      if (slot) optimistic((s) => ({ ...s, equipped: { ...s.equipped, [slot]: itemId } }))
      try {
        await api.equipItem(itemId)
      } finally {
        await reloadState()
      }
    },
    [optimistic, reloadState],
  )

  const unequip = useCallback(
    async (slot: Slot) => {
      optimistic((s) => {
        const eq = { ...s.equipped }
        delete eq[slot]
        return { ...s, equipped: eq }
      })
      try {
        await api.unequipSlot(slot)
      } finally {
        await reloadState()
      }
    },
    [optimistic, reloadState],
  )

  const setCharacter = useCallback(
    async (id: string) => {
      if (!isCharacterId(id)) return
      optimistic((s) => ({ ...s, character_id: id }))
      try {
        await api.setCharacter(id)
      } finally {
        await reloadState()
      }
    },
    [optimistic, reloadState],
  )

  const setAppearance = useCallback(
    async (appearance: Record<string, unknown>) => {
      optimistic((s) => ({ ...s, appearance, character_id: appearance.body === 'girl' ? 'human-girl' : 'human-boy' }))
      try {
        await api.setAppearance(appearance)
      } finally {
        await reloadState()
      }
    },
    [optimistic, reloadState],
  )

  const setNickname = useCallback(
    async (nickname: string) => {
      await api.setNickname(nickname)
      await reloadState()
    },
    [reloadState],
  )

  const upgrade = useCallback(
    async (itemId: string, fromTier: number) => {
      try {
        return await api.upgradeItem(itemId, fromTier)
      } finally {
        await reloadState()
      }
    },
    [reloadState],
  )

  return {
    catalog,
    community,
    reloadCommunity,
    catalogError,
    reloadCatalog,
    state,
    stateError,
    reloadState,
    view,
    equipped,
    outfit,
    character,
    purchase,
    equip,
    unequip,
    setCharacter,
    setAppearance,
    setNickname,
    upgrade,
  }
}

export type CloudGame = ReturnType<typeof useCloudGame>
