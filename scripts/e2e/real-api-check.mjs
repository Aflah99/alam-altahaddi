// Integration check against a REAL Supabase project, using synthetic accounts only.
//   SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... CREDS=path/to/creds.json node scripts/e2e/real-api-check.mjs
// creds.json (never commit it): { parentA: {email,password}, parentB: {...}, admin: {...}, kidPass }
// Creates two synthetic children, a synthetic group and a synthetic subject. It never touches
// other accounts' data. Prints a PASS/FAIL line per check; exits 1 on any failure.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY
const creds = JSON.parse(fs.readFileSync(process.env.CREDS, 'utf8'))
const STUDENT_DOMAIN = 'students.alam-altahaddi.invalid'
const tag = Date.now().toString(36).slice(-5)
let failed = 0
const check = (ok, name, extra = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
}
const client = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
async function signIn(email, password) {
  const c = client()
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sign-in ${email}: ${error.message}`)
  return c
}
const rpc = async (c, fn, args) => {
  const { data, error } = await c.rpc(fn, args)
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
  return data
}
const fails = async (p) => p.then(() => false, () => true)
/** Blocked = an error (no privilege) or no visible rows (RLS). */
const none = (r) => !!r.error || !r.data || r.data.length === 0

// ---------- accounts and roles
const anon = client()
const parentA = await signIn(creds.parentA.email, creds.parentA.password)
const parentB = await signIn(creds.parentB.email, creds.parentB.password)
const admin = await signIn(creds.admin.email, creds.admin.password)
check(true, 'synthetic parent A, parent B and admin sign in with email + password')

const createKid = async (parent, username, nickname) => {
  const { data, error } = await parent.functions.invoke('parent-children', { body: { action: 'create', username, nickname, password: creds.kidPass } })
  if (error) throw new Error(`create child: ${error.message} ${JSON.stringify(await error.context?.json?.().catch(() => null))}`)
  return data
}
const kidAName = `syn_a_${tag}`, kidBName = `syn_b_${tag}`
const kA = await createKid(parentA, kidAName, 'نمر تجريبي')
const kB = await createKid(parentB, kidBName, 'صقر تجريبي')
check(!!kA.student_id && !!kB.student_id, 'parent-children Edge Function creates child accounts')
const kidA = await signIn(`${kidAName}@${STUDENT_DOMAIN}`, creds.kidPass)
const kidB = await signIn(`${kidBName}@${STUDENT_DOMAIN}`, creds.kidPass)
check(true, 'children sign in with username (internal address) + password')
{
  const r = await parentA.functions.invoke('parent-children', { body: { action: 'reset_password', student_id: kB.student_id, password: 'Zz9!' + 'z'.repeat(8) } })
  check(!!r.error, 'parent cannot manage another family’s child')
  const r2 = await kidA.functions.invoke('parent-children', { body: { action: 'create', username: `syn_x_${tag}`, nickname: 'س', password: creds.kidPass } })
  check(!!r2.error, 'a student cannot create accounts')
}

// ---------- content and answer-key protection
const cat = await rpc(kidA, 'get_catalog')
const subj = cat[0]
const lessonCount = subj?.units?.reduce((n, u) => n + u.lessons.length, 0) ?? 0
check(lessonCount === 27, 'catalogue: 27 published lessons visible to a student', `got ${lessonCount}`)
check(none(await anon.from('questions').select('id').limit(1)), 'signed-out visitors cannot read questions')
check(none(await kidA.from('question_options').select('is_correct').limit(1)), 'students cannot read the answer key')
const { count: qCount } = await admin.from('questions').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('qtype', 'mcq')
check(qCount === 600, 'admin sees the 600 published multiple-choice questions (unchanged)', `got ${qCount}`)
const { data: flags } = await admin.from('academic_flags').select('key, status')
check(flags?.length === 4 && flags.every((f) => f.status === 'open'), '4 academic review flags present and open')

// ---------- server-validated quiz, rewards, replay
const firstLesson = subj.units[0].lessons[0]
const missionId = firstLesson.missions[0].id
// Test-only peek (as the synthetic admin): this session's opaque option keys '1'..'4' and written answers.
const answerKey = async (sessionId, sessionQuestions) => {
  const ids = sessionQuestions.map((q) => q.id)
  const { data: order } = await admin.from('session_questions').select('question_id, option_order').eq('session_id', sessionId)
  const { data: right } = await admin.from('question_options').select('question_id, option_id').in('question_id', ids).eq('is_correct', true)
  const { data: written } = await admin.from('questions').select('id, accepted_answers').in('id', ids).eq('qtype', 'written')
  const letter = new Map(right.map((r) => [r.question_id, r.option_id]))
  const out = new Map()
  for (const o of order) {
    if (o.option_order) {
      const k = String(o.option_order.indexOf(letter.get(o.question_id)) + 1)
      out.set(o.question_id, { right: k, wrong: ['1', '2', '3', '4'].filter((x) => x !== k) })
    }
  }
  for (const w of written ?? []) out.set(w.id, { written: true, right: w.accepted_answers[0], wrong: ['إجابة خاطئة أولى', 'إجابة خاطئة ثانية'] })
  return out
}
async function playMission(kid, wrongFirst = 0) {
  const s = await rpc(kid, 'start_quiz_session', { p_mission: missionId })
  const leaked = JSON.stringify(s).match(/is_correct|correct_option|explanation|accepted/)
  const key = await answerKey(s.session_id, s.questions)
  for (const [i, q] of s.questions.entries()) {
    const k = key.get(q.id)
    const send = (a) => (k.written ? rpc(kid, 'submit_written', { p_session: s.session_id, p_question: q.id, p_text: a }) : rpc(kid, 'submit_answer', { p_session: s.session_id, p_question: q.id, p_option: a }))
    if (i < wrongFirst) {
      await send(k.wrong[0])
      await send(k.wrong[1])
    } else await send(k.right)
  }
  const done = await rpc(kid, 'complete_quiz_session', { p_session: s.session_id })
  return { s, done, leaked }
}
const run1 = await playMission(kidA)
const n = run1.s.questions.length
check(!run1.leaked, 'quiz session sent to the browser has no answers or explanations')
const st1 = await rpc(kidA, 'get_my_game_state')
const exp = n * 10 + 20
check(st1.xp === exp && st1.coins === exp, 'verified XP and coins credited by the server', `xp ${st1.xp}, coins ${st1.coins}, expected ${exp}`)
await playMission(kidA)
const st2 = await rpc(kidA, 'get_my_game_state')
check(st2.xp === st1.xp && st2.coins === st1.coins, 'replaying a mission pays nothing twice')
await playMission(kidB, 3)
const stB = await rpc(kidB, 'get_my_game_state')
check(stB.xp === (n - 3) * 10, 'missed answers earn nothing; no bonus under 70%', `xp ${stB.xp}`)

// ---------- shop
const cheap = (await kidA.from('shop_items').select('id, price').eq('in_shop', true).neq('category', 'characters').order('price').limit(1)).data[0]
await rpc(kidA, 'purchase_item', { p_item: cheap.id })
const st3 = await rpc(kidA, 'get_my_game_state')
check(st3.coins === st1.coins - cheap.price && st3.xp === st1.xp, 'purchase spends coins, never XP')
check(await fails(rpc(kidA, 'purchase_item', { p_item: cheap.id })), 'duplicate purchase refused')
const pricey = (await kidB.from('shop_items').select('id, price').order('price', { ascending: false }).limit(1)).data[0]
check(await fails(rpc(kidB, 'purchase_item', { p_item: pricey.id })), 'purchase without enough coins refused')
await rpc(kidA, 'equip_item', { p_item: cheap.id })
check(Object.values((await rpc(kidA, 'get_my_game_state')).equipped).includes(cheap.id), 'equipping an owned item works')

// ---------- isolation between roles
check(none(await kidA.from('student_profiles').select('id').eq('id', kB.student_id)), 'a student cannot read another student’s profile')
check(none(await kidA.from('question_attempts').select('id').eq('student_id', kB.student_id)), 'a student cannot read another student’s answers')
check(none(await parentB.from('reward_transactions').select('id').eq('student_id', kA.student_id)), 'a parent cannot read another family’s rewards')
check(await fails(rpc(parentB, 'parent_child_report', { p_student: kA.student_id, p_days: null })), 'a parent cannot open another family’s report')
const rep = await rpc(parentA, 'parent_child_report', { p_student: kA.student_id, p_days: null })
check(rep.summary.answered === n * 2 && rep.summary.xp === exp, 'parent report shows the child’s real results', `answered ${rep.summary.answered}`)
check(await fails(rpc(kidA, 'admin_dashboard')), 'a student cannot call admin functions')
check(await fails(rpc(parentA, 'admin_dashboard')), 'a parent cannot call admin functions')
check((await kidA.from('profiles').update({ role: 'admin' }).eq('id', kA.student_id).select()).data?.length !== 1 &&
  (await rpc(kidA, 'get_my_game_state')).student_id === kA.student_id, 'a student cannot promote themself')
{
  const { error } = await kidA.from('reward_transactions').insert({ student_id: kA.student_id, kind: 'question', ref: 'fake', xp: 999, coins: 999 })
  check(!!error, 'a student cannot write rewards directly')
}

// ---------- private groups
const group = await rpc(parentA, 'create_group', { p_name: `مجموعة تجريبية ${tag}` })
const invite = await rpc(parentA, 'create_group_invite', { p_group: group, p_days: 1 })
check(/^[A-HJ-NP-Z2-9]{10}$/.test(invite.code), 'invite code generated (pgcrypto in extensions schema)')
check((await rpc(kidA, 'join_group_with_code', { p_code: invite.code })).status === 'pending', 'joining with a code creates a pending request')
await rpc(kidB, 'join_group_with_code', { p_code: invite.code })
check(await fails(rpc(kidA, 'group_leaderboard', { p_group: group, p_period: 'week' })), 'no leaderboard before parent approval')
check(await fails(rpc(parentA, 'parent_decide_membership', { p_group: group, p_student: kB.student_id, p_approve: true })), 'group owner cannot approve another family’s child')
await rpc(parentA, 'parent_decide_membership', { p_group: group, p_student: kA.student_id, p_approve: true })
await rpc(parentB, 'parent_decide_membership', { p_group: group, p_student: kB.student_id, p_approve: true })
const board = await rpc(kidA, 'group_leaderboard', { p_group: group, p_period: 'week' })
check(board.rows.length === 2 && board.rows[0].is_me && board.rows[0].xp === exp, 'group leaderboard ranks verified XP', JSON.stringify(board.rows.map((r) => r.xp)))
check(!JSON.stringify(board).includes(kidAName), 'leaderboard shows nicknames only, no usernames')
check(await fails(rpc(anon, 'group_leaderboard', { p_group: group, p_period: 'week' })), 'signed-out visitors cannot read a group')
check((await rpc(kidA, 'join_group_with_code', { p_code: 'ZZZZZZZZZZ' })).status === 'invalid', 'wrong code refused')

// ---------- dynamic publishing (admin) and AI lock
const { data: s } = await admin.from('subjects').insert({ slug: `synthetic-${tag}`, name_ar: 'مادة تجريبية', grade: 8, semester: 1, theme: 'forest', status: 'published' }).select('id').single()
const { data: u } = await admin.from('units').insert({ subject_id: s.id, number: 1, title: 'وحدة تجريبية', status: 'published' }).select('id').single()
const { data: l } = await admin.from('lessons').insert({ subject_id: s.id, unit_id: u.id, number: 1, title: 'درس تجريبي', status: 'published' }).select('id').single()
const qid = await rpc(admin, 'admin_save_question', {
  p_question: { lesson_id: l.id, text: 'سؤال تجريبي للتحقق من النشر؟', options: ['الإجابة الصحيحة', 'خيار ثانٍ', 'خيار ثالث', 'خيار رابع'], correct_option: 'a', hint: 'تلميح', explanation: 'شرح', difficulty: 1, source_page: 1, source_quote: '' },
})
await rpc(admin, 'admin_set_question_status', { p_ids: [qid], p_status: 'published', p_note: 'synthetic integration check' })
const cat2 = await rpc(kidA, 'get_catalog')
check(!!cat2.find((x) => x.id === s.id), 'admin-published subject appears for students without a deploy')
check(await fails(rpc(kidA, 'admin_save_question', { p_question: {} })), 'students cannot save questions')
const { data: ai } = await admin.from('ai_settings').select('enabled').single()
check(ai?.enabled === false, 'AI generation is disabled')
{
  const r = await kidA.functions.invoke('ai-worker', { body: { action: 'inspect', textbook_id: '00000000-0000-0000-0000-000000000000' } })
  check(!!r.error && r.response?.status === 403, 'ai-worker refuses non-admins', String(r.response?.status))
  const r2 = await admin.functions.invoke('ai-worker', { body: { action: 'nothing' } })
  check(r2.response?.status === 400, 'ai-worker reachable for admins (no paid call made)', String(r2.response?.status))
}

console.log(JSON.stringify({ synthetic: { kidA: kA.student_id, kidB: kB.student_id, group, subject: s.id, tag } }))
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED')
process.exit(failed ? 1 : 0)
