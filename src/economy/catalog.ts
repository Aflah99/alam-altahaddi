import type { CharacterId } from '../characters/roster'
import { CREATURE_ITEMS, getWearable, RARITIES, SLOTS, WEARABLES, type Rarity, type Slot } from '../cosmetics/wearables'

/**
 * Item catalogue shown in the shop, locker and package screens. Prices and rarities
 * are identical to the database (checked by the catalogue-parity database test);
 * the server always decides what is charged.
 */
export type ShopCategory = 'packages' | Slot
export type ItemCategory = Slot | 'characters'

export const CATEGORIES: readonly { id: ShopCategory; label: string }[] = [{ id: 'packages', label: 'صناديق المفاجآت' }, ...SLOTS]

export interface CatalogItem {
  id: string
  category: ItemCategory
  name: string
  description: string
  /** Normal-shop price; null = from surprise packages only. */
  price: number | null
  rarity: Rarity
  characterId?: CharacterId
}

export const CATALOG: readonly CatalogItem[] = [
  ...WEARABLES.map((w) => ({ id: w.id, category: w.slot, name: w.name, description: w.description, price: w.price, rarity: w.rarity })),
  ...CREATURE_ITEMS.map((c) => ({
    id: c.id,
    category: 'characters' as const,
    name: c.name,
    description: c.description,
    price: null,
    rarity: 'legendary' as const,
    characterId: c.characterId as CharacterId,
  })),
]

const byId = new Map(CATALOG.map((i) => [i.id, i]))
export const getItem = (id: string): CatalogItem | undefined => byId.get(id)

export function itemForCharacter(characterId: CharacterId): CatalogItem | undefined {
  return CATALOG.find((i) => i.characterId === characterId)
}

export const rarityOf = (id: string): Rarity => getItem(id)?.rarity ?? 'common'
export const rarityLabel = (r: Rarity) => RARITIES[r].label
export const slotOf = (id: string): Slot | undefined => getWearable(id)?.slot
