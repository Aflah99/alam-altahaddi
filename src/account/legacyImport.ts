import { loadWallet } from '../economy/wallet'
import type { LocalPlayerProfile } from '../player/playerProfile'
import { loadProgress } from '../quiz/progress'

const flagKey = (studentId: string) => `alam-altahaddi:legacy-import:${studentId}`

/** Whether to offer the import: local data exists and this student has not decided yet. */
export function shouldOfferLegacyImport(local: LocalPlayerProfile | null, studentId: string, alreadyImported: boolean): boolean {
  if (!local || alreadyImported) return false
  try {
    if (localStorage.getItem(flagKey(studentId))) return false
  } catch {
    return false
  }
  const p = loadProgress(local.id)
  return Object.keys(p.missions).length > 0 || Object.keys(p.questions).length > 0 || loadWallet(local.id).ledger.length > 0
}

export function rememberLegacyChoice(studentId: string, value: 'imported' | 'skipped') {
  try {
    localStorage.setItem(flagKey(studentId), value)
  } catch {
    // Not critical: the server also refuses a second import.
  }
}

