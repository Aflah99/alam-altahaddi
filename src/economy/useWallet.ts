import { useCallback, useMemo, useRef, useState } from 'react'
import type { CosmeticSlot } from '../characters/cosmetics'
import type { MissionState, MissionSummary } from '../quiz/engine'
import {
  awardMission,
  equip as equipItem,
  loadWallet,
  outfitOf,
  purchase as buy,
  saveWallet,
  unequip as unequipSlot,
  viewOf,
  type MissionReward,
  type PlayerWallet,
  type PurchaseResult,
} from './wallet'

/** Device-local rewards, purchases and equipped cosmetics for one guest profile. */
export function useWallet(playerId: string) {
  const [stored, setStored] = useState<PlayerWallet>(() => loadWallet(playerId))
  // The newest wallet, so several actions in one tick build on each other.
  const latest = useRef(stored)

  let wallet = stored
  if (stored.playerId !== playerId) {
    // A different (or newly created) profile: switch to its own wallet.
    wallet = loadWallet(playerId)
    setStored(wallet)
  }

  /** The wallet to build on: the newest committed one for this profile. */
  const base = useCallback((): PlayerWallet => {
    if (latest.current.playerId !== playerId) latest.current = loadWallet(playerId)
    return latest.current
  }, [playerId])

  const commit = useCallback((prev: PlayerWallet, next: PlayerWallet) => {
    if (next === prev) return
    latest.current = next
    saveWallet(next)
    setStored(next)
  }, [])

  /** Applies a finished mission's rewards once; safe to call repeatedly. */
  const awardMissionRewards = useCallback(
    (bankId: string, mission: MissionState, summary: MissionSummary): MissionReward => {
      const prev = base()
      const { wallet: next, reward } = awardMission(prev, bankId, mission, summary)
      commit(prev, next)
      return reward
    },
    [base, commit],
  )

  const purchase = useCallback(
    (itemId: string): PurchaseResult => {
      const prev = base()
      const r = buy(prev, itemId)
      if (r.ok) commit(prev, r.wallet)
      return r
    },
    [base, commit],
  )

  const equip = useCallback(
    (itemId: string) => {
      const prev = base()
      commit(prev, equipItem(prev, itemId))
    },
    [base, commit],
  )
  const unequip = useCallback(
    (slot: CosmeticSlot) => {
      const prev = base()
      commit(prev, unequipSlot(prev, slot))
    },
    [base, commit],
  )

  const view = useMemo(() => viewOf(wallet), [wallet])
  const outfit = useMemo(() => outfitOf(wallet), [wallet])

  return { wallet, view, outfit, awardMissionRewards, purchase, equip, unequip }
}

export type WalletApi = ReturnType<typeof useWallet>
