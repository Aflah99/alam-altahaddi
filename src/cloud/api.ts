import { supabase } from './client'
import type { AnswerResult, CatalogSubject, GameState, QuizSession, Role, SessionSummary } from './types'

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

/* ---------- account ---------- */

export async function myRole(userId: string): Promise<Role | null> {
  const { data, error } = await db().from('profiles').select('role').eq('id', userId).maybeSingle()
  if (error) throw error
  return (data?.role as Role | undefined) ?? null
}

/* ---------- preferences (audio, motion) ---------- */

export const getMyPreferences = () => call<Record<string, unknown>>('get_my_preferences')
export const saveMyPreferences = (prefs: Record<string, unknown>) => call<void>('save_my_preferences', { p_prefs: prefs })

/* ---------- student game ---------- */

export const getCatalog = () => call<CatalogSubject[]>('get_catalog')
export const getGameState = () => call<GameState>('get_my_game_state')
export const startQuizSession = (missionId: string) => call<QuizSession>('start_quiz_session', { p_mission: missionId })
export const requestHint = (sessionId: string, questionId: string) =>
  call<string>('request_hint', { p_session: sessionId, p_question: questionId })
export const submitAnswer = (sessionId: string, questionId: string, option: string) =>
  call<AnswerResult>('submit_answer', { p_session: sessionId, p_question: questionId, p_option: option })
export const completeQuizSession = (sessionId: string) => call<SessionSummary>('complete_quiz_session', { p_session: sessionId })
export const purchaseItem = (itemId: string) => call<{ item: string; price: number; coins: number }>('purchase_item', { p_item: itemId })
export const equipItem = (itemId: string) => call<void>('equip_item', { p_item: itemId })
export const unequipSlot = (slot: string) => call<void>('unequip_slot', { p_slot: slot })
export const setCharacter = (characterId: string) => call<void>('set_character', { p_character: characterId })
export const setNickname = (nickname: string) => call<void>('set_nickname', { p_nickname: nickname })
export const importLegacyProgress = (payload: unknown) =>
  call<{ missions: number; questions: number; verified: boolean; already_imported?: boolean }>('import_legacy_progress', { p_payload: payload })

/* ---------- backend functions (service-role work such as creating child accounts) ---------- */

export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().functions.invoke(name, { body })
  if (error) {
    // Surface the function's own (Arabic) message when it sent one.
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      const j = await ctx.json().catch(() => null)
      if (j?.error) throw new Error(j.error)
    }
    throw error
  }
  return data as T
}

/* ---------- groups and leaderboards ---------- */

export interface LeaderRow {
  rank: number
  nickname: string
  character_id: string
  outfit: string[]
  xp: number
  is_me: boolean
}
export interface Leaderboard {
  group: { id: string; name: string; active: boolean }
  period: 'week' | 'all'
  since: string | null
  rows: LeaderRow[]
}
export const myGroups = () => call<{ id: string; name: string; status: 'pending' | 'active'; active: boolean }[]>('my_groups')
export const joinGroupWithCode = (code: string) => call<{ group_id?: string; status: 'pending' | 'active' | 'rejected' | 'invalid' }>('join_group_with_code', { p_code: code })
export const leaveGroup = (groupId: string) => call<void>('leave_group', { p_group: groupId })
export const groupLeaderboard = (groupId: string, period: 'week' | 'all') => call<Leaderboard>('group_leaderboard', { p_group: groupId, p_period: period })
