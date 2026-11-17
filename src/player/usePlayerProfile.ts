import { useCallback, useState } from 'react'
import type { CharacterId } from '../characters/roster'
import { createProfile, loadProfile, saveProfile, type LocalPlayerProfile } from './playerProfile'

/** The device-local guest profile (character + nickname), persisted across reloads. */
export function usePlayerProfile() {
  const [profile, setProfile] = useState<LocalPlayerProfile | null>(loadProfile)

  const save = useCallback((characterId: CharacterId, nickname: string) => {
    // Keep the same id so learning progress stays attached when the character or nickname changes.
    setProfile((prev) => {
      const next = createProfile(characterId, nickname, prev?.id)
      saveProfile(next)
      return next
    })
  }, [])

  return [profile, save] as const
}
