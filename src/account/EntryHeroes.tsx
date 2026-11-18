import { CharacterSprite } from '../characters/CharacterSprite'
import { getCharacter } from '../characters/roster'

/** Decorative heroes on the sign-in page. */
export function EntryHeroes() {
  return (
    <>
      <CharacterSprite character={getCharacter('fox')} anim="hop" decorative />
      <CharacterSprite character={getCharacter('green-slime')} anim="idle" decorative />
    </>
  )
}
