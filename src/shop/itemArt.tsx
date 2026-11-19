import { CharacterSprite } from '../characters/CharacterSprite'
import { getCharacter, ROSTER, type CharacterDef } from '../characters/roster'
import { RARITIES, wornKey, type Rarity } from '../cosmetics/wearables'
import { getItem } from '../economy/catalog'
import { itemFits } from './outfit'

/** A small picture of an item: on the player's character when it fits, otherwise on a default avatar. */
export function ItemThumb({ itemId, character, tier = 1 }: { itemId: string; character: CharacterDef; tier?: number }) {
  const item = getItem(itemId)
  if (item?.characterId) {
    const c = ROSTER.find((r) => r.id === item.characterId) ?? character
    return <CharacterSprite character={c} anim="still" decorative />
  }
  const who = itemFits(character, itemId) ? character : getCharacter('human-boy')
  return <CharacterSprite character={who} outfit={[wornKey(itemId, tier)]} anim="still" decorative />
}

export function RarityTag({ rarity }: { rarity: Rarity }) {
  return (
    <span className="rarity-tag" data-rarity={rarity} style={{ '--rarity': RARITIES[rarity].color } as React.CSSProperties}>
      {RARITIES[rarity].label}
    </span>
  )
}
