import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCosmetic, SLOT_ORDER, type CosmeticSlot } from '../characters/cosmetics'
import { BASE_CHARACTER_IDS, isCharacterId, type CharacterId } from '../characters/roster'
import { getItem } from '../economy/catalog'
import { levelInfo } from '../economy/config'
import type { WalletView } from '../economy/wallet'
import type { ShopPurchaseResult } from '../shop/ShopScreen'
import * as api from './api'
import { arabicError } from './client'
import type { CatalogSubject, GameState } from './types'

/** Published content is re-fetched when older than this, so new subjects appear without a deploy. */
export const CATALOG_MAX_AGE_MS = 60_000

export function viewFromState(s: GameState): WalletView {
  const owned = new Set(s.owned)
  const unlockedCharacters = new Set<CharacterId>(BASE_CHARACTER_IDS)
  for (const id of owned) {
    const c = getItem(id)?.characterId
    if (c) unlockedCharacters.add(c)
  }
  return { xp: s.xp, coins: s.coins, level: levelInfo(s.xp), owned, unlockedCharacters }
}

/**
 * Signed-in student: the published catalogue and the server-side game state
 * (verified XP, coins, inventory, equipment, character).
 */
export function useCloudGame(active: boolean) {
  const [catalog, setCatalog] = useState<CatalogSubject[] | null>(null)
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
    }, 0)
    // Coming back to the tab: pick up newly published content and progress from other devices.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void reloadCatalog()
        void reloadState()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [active, reloadCatalog, reloadState])

  const view = useMemo(() => (state ? viewFromState(state) : null), [state])
  const equipped = useMemo(() => (state?.equipped ?? {}) as Partial<Record<CosmeticSlot, string>>, [state])
  const outfit = useMemo(
    () => SLOT_ORDER.map((s) => equipped[s]).filter((id): id is string => !!id && !!getCosmetic(id)),
    [equipped],
  )

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
      const slot = getCosmetic(itemId)?.slot
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
    async (slot: CosmeticSlot) => {
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

  const setNickname = useCallback(
    async (nickname: string) => {
      await api.setNickname(nickname)
      await reloadState()
    },
    [reloadState],
  )

  return { catalog, catalogError, reloadCatalog, state, stateError, reloadState, view, equipped, outfit, purchase, equip, unequip, setCharacter, setNickname }
}

export type CloudGame = ReturnType<typeof useCloudGame>
