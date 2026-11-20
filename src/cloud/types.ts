import type { WorldTheme } from '../world/config/themes'

export type Role = 'student' | 'parent' | 'admin'

export interface CatalogMission {
  id: string
  number: number
  question_count: number
}
export interface CatalogLesson {
  id: string
  legacy_id: string | null
  number: number
  title: string
  page_start: number | null
  page_end: number | null
  missions: CatalogMission[]
}
export interface CatalogUnit {
  id: string
  number: number
  title: string
  lessons: CatalogLesson[]
}
export interface CatalogSubject {
  id: string
  slug: string
  name_ar: string
  name_en: string | null
  grade: number
  semester: number
  description: string
  icon: string
  theme: WorldTheme
  sort_order: number
  source_label: string
  updated_at: string
  units: CatalogUnit[]
  /** Present for community courses (the official catalogue omits it). */
  kind?: 'official' | 'community'
  creator_name?: string
  category?: string
}

export interface GameState {
  student_id: string
  username: string
  nickname: string
  character_id: string
  xp: number
  coins: number
  owned: string[]
  equipped: Record<string, string>
  legacy_imported: boolean
  mission_best: Record<string, number>
  appearance: Record<string, unknown>
  upgrade_points: number
  tiers: Record<string, number>
  controls: Controls
}

export interface Controls {
  packages_allowed: boolean
  packages_daily_limit: number
  multiplayer_allowed: boolean
  reactions_allowed: boolean
}

export type RarityName = 'common' | 'rare' | 'epic' | 'legendary'
export interface PackageType {
  id: string
  name: string
  description: string
  price: number
  rolls: number
  guarantee: RarityName
  weights: Record<RarityName, number>
  pity_epic: number
  pity_legendary: number
  bundle_chance: number
}
export interface PackageReward {
  kind: 'item' | 'coins' | 'points'
  rarity: RarityName
  item?: string
  category?: string
  duplicate?: boolean
  points?: number
  coins?: number
}
export interface PackagesInfo {
  packages: PackageType[]
  allowed: boolean
  daily_limit: number
  opened_today: number
  pools: Partial<Record<RarityName, number>>
  history: { at: string; package: string; price: number; rewards: PackageReward[] }[]
}
export interface PackageOpen {
  open_id: string
  package: string
  price: number
  rewards: PackageReward[]
  replay: boolean
  coins: number
  points: number
}

export interface SessionQuestion {
  id: string
  text: string
  source_page: number | null
  source_label: string
  type?: 'mcq' | 'written'
  has_hint: boolean
  options: { id: string; text: string }[]
}
export interface QuizSession {
  session_id: string
  mission_id: string
  lesson_id: string
  questions: SessionQuestion[]
}
export interface AnswerResult {
  feedback: 'correct' | 'try-again' | 'revealed' | 'unsure'
  result: 'first' | 'assisted' | 'missed' | null
  attempt: number
  correct_option: string | null
  correct_answer?: string | null
  explanation: string | null
  hint: string | null
  reward: { xp: number; coins: number; already_rewarded: boolean; capped?: boolean; reason?: string } | null
}
export interface SessionSummary {
  total: number
  first_try: number
  assisted: number
  missed: number
  hints_used: number
  first_try_accuracy: number
  repeat?: boolean
  community?: boolean
  daily_limit_reached?: boolean
  reward: {
    xp: number
    coins: number
    bonus: boolean
    bonus_earlier: boolean
    already_rewarded: number
    before: { xp: number; coins: number }
    after: { xp: number; coins: number }
  }
}
