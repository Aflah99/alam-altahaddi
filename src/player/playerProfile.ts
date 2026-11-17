import { isCharacterId, type CharacterId } from '../characters/roster'

/**
 * Prototype player profile, stored only in this browser.
 *
 * This is NOT a student account: there is no login, nothing is synced, and
 * clearing the browser removes it. When real student authentication arrives,
 * an authenticated record can take over these same fields (characterId,
 * nickname) and this local copy can be offered as an import.
 */
export interface LocalPlayerProfile {
  /** Schema version, for future migrations. */
  version: 1
  /** Marks the profile as a device-local guest, never a real account. */
  kind: 'local-guest'
  /** Random id that ties local learning progress to this profile. Stable across edits. */
  id: string
  characterId: CharacterId
  nickname: string
  updatedAt: string
}

const STORAGE_KEY = 'alam-altahaddi:player:v1'

export const NICKNAME_MIN = 2
export const NICKNAME_MAX = 12

/** Collapses repeated spaces and trims. */
export function normalizeNickname(raw: string): string {
  return raw.replace(/\s+/gu, ' ').trim()
}

/** Returns an Arabic error message, or null when the nickname is acceptable. */
export function validateNickname(raw: string): string | null {
  const nick = normalizeNickname(raw)
  if ([...nick].length < NICKNAME_MIN) return 'اكتب لقبًا من حرفين على الأقل.'
  if ([...nick].length > NICKNAME_MAX) return `اللقب طويل؛ الحد الأقصى ${NICKNAME_MAX} حرفًا.`
  if (!/^[\p{L}\p{N}_ ]+$/u.test(nick)) return 'استخدم الحروف والأرقام والشرطة السفلية فقط.'
  return null
}

const NICK_WORDS = ['نجم', 'صقر', 'برق', 'قمر', 'شهاب', 'نسر', 'فهد', 'موج', 'غيم', 'نور', 'سهم', 'رعد']
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

/** A playful, anonymous nickname such as «صقر_٤٧». */
export function suggestNickname(): string {
  const word = NICK_WORDS[Math.floor(Math.random() * NICK_WORDS.length)]
  const n = 10 + Math.floor(Math.random() * 90)
  const digits = [...String(n)].map((d) => ARABIC_DIGITS[Number(d)]).join('')
  return `${word}_${digits}`
}

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

export function createProfile(characterId: CharacterId, nickname: string, id: string = newId()): LocalPlayerProfile {
  return {
    version: 1,
    kind: 'local-guest',
    id,
    characterId,
    nickname: normalizeNickname(nickname),
    updatedAt: new Date().toISOString(),
  }
}

export function loadProfile(): LocalPlayerProfile | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<LocalPlayerProfile>
    if (data.version !== 1 || !isCharacterId(data.characterId) || typeof data.nickname !== 'string') return null
    if (validateNickname(data.nickname)) return null
    const profile = {
      // Task 03 profiles had no id: give them one (and keep it from now on).
      ...createProfile(data.characterId, data.nickname, typeof data.id === 'string' && data.id ? data.id : undefined),
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    }
    if (profile.id !== data.id) saveProfile(profile)
    return profile
  } catch {
    return null
  }
}

export function saveProfile(profile: LocalPlayerProfile): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // Storage may be unavailable (private browsing); the profile still works for this visit.
  }
}
