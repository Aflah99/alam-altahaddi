import { fitsCharacter, getCosmetic, SLOT_ORDER } from '../characters/cosmetics'
import { ROSTER, type CharacterDef } from '../characters/roster'
import type { CatalogItem } from '../economy/catalog'

/** The current outfit with `item` tried on in its slot (characters keep the outfit). */
export function previewOutfit(outfit: readonly string[], item: CatalogItem): string[] {
  const cosmetic = getCosmetic(item.id)
  if (!cosmetic) return [...outfit]
  const others = outfit.filter((id) => getCosmetic(id)?.slot !== cosmetic.slot)
  return [...others, item.id].sort(
    (a, b) => SLOT_ORDER.indexOf(getCosmetic(a)!.slot) - SLOT_ORDER.indexOf(getCosmetic(b)!.slot),
  )
}

/** What a shop card shows: the item on the player's character, or on one it fits. */
export function thumbFor(item: CatalogItem, current: CharacterDef): { character: CharacterDef; outfit: string[] } {
  if (item.characterId) return { character: ROSTER.find((c) => c.id === item.characterId) ?? current, outfit: [] }
  const cosmetic = getCosmetic(item.id)
  if (!cosmetic || fitsCharacter(cosmetic, current.id)) return { character: current, outfit: [item.id] }
  return { character: ROSTER.find((c) => fitsCharacter(cosmetic, c.id)) ?? current, outfit: [item.id] }
}
