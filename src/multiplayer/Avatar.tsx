import { CharacterSprite } from '../characters/CharacterSprite'
import { characterOf } from '../cloud/useCloudGame'
import type { MpMember } from './api'

/** A player's avatar with their own outfit (nickname only; no personal details exist here). */
export function MemberAvatar({ m, mood = 'neutral' }: { m: MpMember | undefined; mood?: 'neutral' | 'happy' }) {
  if (!m) return null
  return <CharacterSprite character={characterOf(m.character_id, m.appearance)} outfit={m.outfit} anim="still" mood={mood} decorative />
}
