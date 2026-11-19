import { CharacterSprite } from '../characters/CharacterSprite'
import { humanCharacter } from '../characters/roster'
import { wornKey } from '../cosmetics/wearables'

/** Decorative heroes on the sign-in page: the two human starters. */
export function EntryHeroes() {
  return (
    <>
      <CharacterSprite character={humanCharacter('human-girl')} outfit={[wornKey('weapon-staff', 3), wornKey('pet-chick')]} anim="idle" decorative />
      <CharacterSprite character={humanCharacter('human-boy')} outfit={[wornKey('weapon-sword', 3), wornKey('cape-red', 3)]} anim="hop" decorative />
    </>
  )
}
