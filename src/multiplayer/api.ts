import { supabase } from '../cloud/client'

/** Server calls for غرف التحدّي. Every rule (scores, timers, turns, results) is enforced in the database. */
export type ModeId = 'conquest' | 'speed' | 'teams' | 'survival' | 'treasure' | 'boss' | 'tournament' | 'duel'

export interface MpQuestion {
  idx: number
  round: number
  type: 'mcq' | 'written'
  text: string
  options: { id: string; text: string }[]
}
export interface MpPlayer {
  student: string
  score: number
  correct: number
  answered: number
  hearts: number
  alive: boolean
  team: number | null
  target: number | null
  progress: number
}
export interface MpRankRow {
  student: string
  rank: number
  score: number
  correct: number
  answered: number
  hearts: number
  alive: boolean
  team: number | null
  xp?: number
  coins?: number
  capped?: boolean
}
export interface MpMatch {
  id: string
  mode: ModeId
  status: 'countdown' | 'playing' | 'finished'
  starts_at: string
  ends_at: string | null
  round_no: number
  question_count: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: Record<string, any>
  result: { ranking: MpRankRow[]; winners: string[]; team_scores?: Record<string, number>; boss_defeated?: boolean } | null
  players: MpPlayer[]
  round: { round: number; starts_at: string; ends_at: string; participants: string[]; resolved: boolean; answered: number; me_answered: boolean } | null
  last_round: { round: number; meta: { correct: string[]; failed: string[] }; answer: string; question: string } | null
  question: MpQuestion | null
  review: { question: string; answer: string; correct: boolean }[] | null
}
export interface MpMember {
  id: string
  nickname: string
  character_id: string
  appearance: Record<string, unknown>
  outfit: string[]
  ready: boolean
  online: boolean
}
export interface MpState {
  server_now: string
  me: string
  room: {
    id: string
    code: string | null
    mode: ModeId
    subjects: string[]
    lessons: string[]
    settings: { duration?: number }
    status: 'lobby' | 'playing' | 'finished' | 'closed'
    host: string
    version: number
    code_expires_at: string
  }
  members: MpMember[]
  reactions: { id: number; student: string; reaction: string; at: string }[]
  reactions_allowed: boolean
  match: MpMatch | null
}

function db() {
  const c = supabase()
  if (!c) throw new Error('cloud not configured')
  return c
}
async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args)
  if (error) throw error
  return data as T
}

export const createRoom = (mode: ModeId, subjects: string[], duration: number) =>
  call<{ room_id: string; code: string }>('mp_create_room', { p_mode: mode, p_subjects: subjects, p_lessons: [], p_settings: { duration } })
export const joinRoom = (code: string) => call<{ status: 'joined' | 'invalid' | 'full' | 'in_progress'; room_id?: string }>('mp_join', { p_code: code })
export const myRoom = () => call<{ room_id: string; status: string } | null>('mp_my_room')
export const roomState = (room: string) => call<MpState>('mp_state', { p_room: room })
export const leaveRoom = (room: string) => call<void>('mp_leave', { p_room: room })
export const setReady = (room: string, ready: boolean) => call<void>('mp_set_ready', { p_room: room, p_ready: ready })
export const updateRoom = (room: string, mode: ModeId, subjects: string[], duration: number) =>
  call<void>('mp_update_room', { p_room: room, p_mode: mode, p_subjects: subjects, p_lessons: [], p_settings: { duration } })
export const newInvite = (room: string) => call<string>('mp_new_invite', { p_room: room })
export const closeInvite = (room: string) => call<void>('mp_close_invite', { p_room: room })
export const react = (room: string, reaction: string) => call<void>('mp_react', { p_room: room, p_reaction: reaction })
export const startMatch = (room: string) => call<string>('mp_start', { p_room: room })
export const backToLobby = (room: string) => call<void>('mp_back_to_lobby', { p_room: room })
export const answer = (match: string, idx: number, round: number, ans: string) =>
  call<{ feedback: 'correct' | 'wrong' | 'unsure'; gain?: number; damage?: number; duplicate?: boolean }>('mp_answer', {
    p_match: match,
    p_idx: idx,
    p_round: round,
    p_answer: ans,
  })
export const pickChest = (match: string, chest: number) => call<void>('mp_treasure_pick', { p_match: match, p_chest: chest })
export const attack = (match: string, from: number, to: number) => call<void>('mp_conquest_attack', { p_match: match, p_from: from, p_to: to })

/** Arabic message for multiplayer errors (never shows raw server text). */
export function mpError(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e)
  if (/multiplayer disabled/.test(m)) return 'غرف التحدّي متوقفة حاليًّا بقرار من ولي الأمر.'
  if (/reactions disabled/.test(m)) return 'الرسائل الجاهزة متوقفة بقرار من ولي الأمر.'
  if (/rate_limited/.test(m)) return 'محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.'
  if (/not enough players/.test(m)) return 'عدد اللاعبين أقل من المطلوب لهذا النمط.'
  if (/too many players/.test(m)) return 'عدد اللاعبين أكبر من الحد المسموح لهذا النمط.'
  if (/not ready/.test(m)) return 'ينتظر بعض اللاعبين الضغط على «جاهز».'
  if (/no questions/.test(m)) return 'لا توجد أسئلة منشورة لهذا الاختيار.'
  if (/host only/.test(m)) return 'هذا الإجراء لمضيف الغرفة فقط.'
  if (/not your turn/.test(m)) return 'ليس دورك الآن.'
  if (/cannot attack/.test(m)) return 'اختر أرضًا مجاورة يملكها منافس.'
  if (/time is up/.test(m)) return 'انتهى الوقت.'
  if (/not in this room/.test(m)) return 'لست في هذه الغرفة.'
  if (/failed to fetch|network|load failed/i.test(m)) return 'تعذّر الاتصال. نحاول مجددًا…'
  return 'حدث خطأ. حاول مرة أخرى.'
}
