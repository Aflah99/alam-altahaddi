import { useCallback, useState } from 'react'
import type { CharacterId } from '../characters/roster'
import { createProfile, loadProfile, saveProfile, type LocalPlayerProfile } from './playerProfile'

/** The device-local guest profile (character + nickname), persisted across reloads. */
export function usePlayerProfile() {
  const [profile, setProfile] = useState<LocalPlayerProfile | null>(loadProfile)

  const save = useCallback((characterId: CharacterId, nickname: string) => {
    const next = createProfile(characterId, nickname)
    saveProfile(next)
    setProfile(next)
  }, [])

  return [profile, save] as const
}
