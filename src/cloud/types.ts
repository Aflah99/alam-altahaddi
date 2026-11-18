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
}

export interface SessionQuestion {
  id: string
  text: string
  source_page: number | null
  source_label: string
  has_hint: boolean
  options: { id: 'a' | 'b' | 'c' | 'd'; text: string }[]
}
export interface QuizSession {
  session_id: string
  mission_id: string
  lesson_id: string
  questions: SessionQuestion[]
}
export interface AnswerResult {
  feedback: 'correct' | 'try-again' | 'revealed'
  result: 'first' | 'assisted' | 'missed' | null
  attempt: number
  correct_option: 'a' | 'b' | 'c' | 'd' | null
  explanation: string | null
  hint: string | null
  reward: { xp: number; coins: number; already_rewarded: boolean } | null
}
export interface SessionSummary {
  total: number
  first_try: number
  assisted: number
  missed: number
  hints_used: number
  first_try_accuracy: number
  repeat?: boolean
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
