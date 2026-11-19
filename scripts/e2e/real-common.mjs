// Shared helpers for checks against a REAL Supabase project (synthetic accounts only).
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

export const URL = process.env.SUPABASE_URL
export const KEY = process.env.SUPABASE_PUBLISHABLE_KEY
export const creds = JSON.parse(fs.readFileSync(process.env.CREDS, 'utf8'))
export const STUDENT_DOMAIN = 'students.alam-altahaddi.invalid'
let failed = 0
export const check = (ok, name, extra = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
}
export const failures = () => failed
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const client = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

/** Signs in, waiting politely when the Auth rate limit answers 429. */
export async function signIn(email, password) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const c = client()
    const { error } = await c.auth.signInWithPassword({ email, password })
    if (!error) return c
    if (!/rate|too many|429/i.test(error.message)) throw new Error(`sign-in ${email}: ${error.message}`)
    await sleep(30000)
  }
  throw new Error(`sign-in ${email}: still rate limited`)
}
export const kidEmail = (username) => `${username}@${STUDENT_DOMAIN}`
export const rpc = async (c, fn, args) => {
  const { data, error } = await c.rpc(fn, args)
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
  return data
}
export const fails = async (p) => p.then(() => false, () => true)

/** Test-only peek (synthetic admin): the right display key / text for a player's current multiplayer question. */
export async function mpAnswerFor(admin, matchId, studentId, q, right) {
  const { data: serve } = await admin.from('mp_serves').select('option_order').eq('match_id', matchId).eq('student_id', studentId).eq('question_idx', q.idx).eq('round_no', q.round).maybeSingle()
  const { data: mq } = await admin.from('mp_match_questions').select('question_id').eq('match_id', matchId).eq('idx', q.idx).single()
  if (q.type === 'written') {
    const { data: qq } = await admin.from('questions').select('accepted_answers').eq('id', mq.question_id).single()
    return right ? qq.accepted_answers[0] : 'إجابة خاطئة تماما'
  }
  const { data: o } = await admin.from('question_options').select('option_id').eq('question_id', mq.question_id).eq('is_correct', true).single()
  const k = serve.option_order.indexOf(o.option_id) + 1
  return String(right ? k : (k % 4) + 1)
}
