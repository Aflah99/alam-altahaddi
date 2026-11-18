import type { CharacterDef } from '../characters/roster'
import { fitsCreature } from '../cosmetics/look'
import { getWearable, parseWorn, SLOT_ORDER, wornKey } from '../cosmetics/wearables'

/** The current outfit with `itemId` tried on (at `tier`) in its slot. */
export function tryOn(outfit: readonly string[], itemId: string, tier = 1): string[] {
  const slot = getWearable(itemId)?.slot
  if (!slot) return [...outfit]
  const others = outfit.filter((k) => getWearable(parseWorn(k).id)?.slot !== slot)
  return [...others, wornKey(itemId, tier)].sort(
    (a, b) => SLOT_ORDER.indexOf(getWearable(parseWorn(a).id)!.slot) - SLOT_ORDER.indexOf(getWearable(parseWorn(b).id)!.slot),
  )
}

/** Whether `character` can show `itemId` (humans: every wearable; creatures: the compatible set). */
export const itemFits = (character: CharacterDef, itemId: string) => !!character.human || fitsCreature(itemId)

