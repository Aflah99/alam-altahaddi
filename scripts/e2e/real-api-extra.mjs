// Additional checks against a REAL Supabase project, using synthetic accounts only (same
// environment and creds file as real-api-check.mjs). Covers: password policy, several children,
// nickname/character persistence, legacy import without rewards, private textbook storage,
// invite revocation, join rate limit, hidden children, group isolation, deletion requests,
// direct-write protection and Edge Function CORS / unauthenticated access.
//   SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... CREDS=creds.json node scripts/e2e/real-api-extra.mjs
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
const none = (r) => !!r.error || !r.data || r.data.length === 0
const fnUrl = (name) => `${URL}/functions/v1/${name}`

const anon = client()
const parentA = await signIn(creds.parentA.email, creds.parentA.password)
const parentB = await signIn(creds.parentB.email, creds.parentB.password)
const admin = await signIn(creds.admin.email, creds.admin.password)

// ---------- password policy and several children
{
  const r = await parentA.functions.invoke('parent-children', { body: { action: 'create', username: `syn_w_${tag}`, nickname: 'ضعيف', password: 'weakpass1' } })
  const body = await r.error?.context?.json?.().catch(() => null)
  check(r.response?.status === 400 && /حرف/.test(body?.error ?? ''), 'weak child password refused with an Arabic reason', String(r.response?.status))
}
const mk = async (parent, name, nick) => {
  const { data, error } = await parent.functions.invoke('parent-children', { body: { action: 'create', username: name, nickname: nick, password: creds.kidPass } })
  if (error) throw new Error(`create child: ${error.message}`)
  return data
}
const c1Name = `syn_c_${tag}`, c2Name = `syn_d_${tag}`, c3Name = `syn_e_${tag}`
const c1 = await mk(parentA, c1Name, 'غيمة تجريبية')
const c2 = await mk(parentA, c2Name, 'قمر تجريبي')
const c3 = await mk(parentB, c3Name, 'نجم تجريبي')
{
  const { data } = await parentA.from('student_profiles').select('id').in('id', [c1.student_id, c2.student_id])
  check(data?.length === 2, 'a parent can manage several children')
}
let kid1 = await signIn(`${c1Name}@${STUDENT_DOMAIN}`, creds.kidPass)
const kid2 = await signIn(`${c2Name}@${STUDENT_DOMAIN}`, creds.kidPass)
const kid3 = await signIn(`${c3Name}@${STUDENT_DOMAIN}`, creds.kidPass)

// ---------- persistence across sessions
await rpc(kid1, 'set_nickname', { p_nickname: 'برق تجريبي' })
await rpc(kid1, 'set_character', { p_character: 'human-girl' })
await kid1.auth.signOut()
kid1 = await signIn(`${c1Name}@${STUDENT_DOMAIN}`, creds.kidPass)
{
  const st = await rpc(kid1, 'get_my_game_state')
  check(st.nickname === 'برق تجريبي' && st.character_id === 'human-girl', 'nickname and character persist after sign-out and sign-in', `${st.nickname}/${st.character_id}`)
}
check(await fails(rpc(kid1, 'set_character', { p_character: 'owl' })), 'a legendary creature cannot be selected without owning it')

// ---------- legacy device progress: imported once, never credited
{
  const payload = { progress: { missions: { m1: {}, m2: {} }, questions: { q1: {}, q2: {}, q3: {} } }, rewards: { xp: 99999, coins: 99999 } }
  const r1 = await rpc(kid1, 'import_legacy_progress', { p_payload: payload })
  const r2 = await rpc(kid1, 'import_legacy_progress', { p_payload: payload })
  const st = await rpc(kid1, 'get_my_game_state')
  check(r1.verified === false && r1.missions === 2 && r1.questions === 3, 'legacy progress imported as unverified history')
  check(r2.already_imported === true, 'legacy progress can be imported only once')
  check(st.xp === 0 && st.coins === 0, 'imported history credits no XP or coins', `xp ${st.xp}, coins ${st.coins}`)
}

// ---------- direct writes the client must never make
{
  const u = await kid1.from('student_profiles').update({ leaderboard_excluded: false, username: 'hacker' }).eq('id', c1.student_id).select()
  const st = await rpc(kid1, 'get_my_game_state')
  check(!!u.error || st.username !== 'hacker', 'a student cannot rename their own login', u.error?.code)
  const q = await kid1.from('questions').update({ text: 'x' }).neq('id', '00000000-0000-0000-0000-000000000000').select('id')
  check(none(q), 'a student cannot modify published questions')
  const i = await kid1.from('inventory').insert({ student_id: c1.student_id, item_id: 'x' })
  check(!!i.error, 'a student cannot add items to their inventory directly')
  const s = await kid1.from('ai_settings').update({ enabled: true }).neq('enabled', true).select()
  check(none(s), 'a student cannot enable AI generation')
  const a = await parentA.from('ai_settings').update({ enabled: true }).neq('enabled', true).select()
  check(none(a), 'a parent cannot enable AI generation')
}

// ---------- private textbook storage
{
  const path = `synthetic/${tag}.txt`
  const up = await admin.storage.from('textbooks').upload(path, new Blob(['synthetic'], { type: 'text/plain' }))
  check(!up.error, 'admin can upload to the private textbooks bucket', up.error?.message)
  check(!!(await anon.storage.from('textbooks').download(path)).error, 'signed-out visitors cannot download textbooks')
  check(!!(await kid1.storage.from('textbooks').download(path)).error, 'students cannot download textbooks')
  check(!!(await parentA.storage.from('textbooks').download(path)).error, 'parents cannot download textbooks')
  check(!!(await kid1.storage.from('textbooks').upload(`synthetic/${tag}-kid.txt`, new Blob(['x']))).error, 'students cannot upload textbooks')
  const pub = await fetch(`${URL}/storage/v1/object/public/textbooks/${path}`)
  check(pub.status >= 400, 'textbooks have no public URL', String(pub.status))
  check(!(await admin.storage.from('textbooks').download(path)).error, 'admin can read the uploaded file')
  check(!(await admin.storage.from('textbooks').remove([path])).error, 'admin can delete the uploaded file')
}

// ---------- groups: revocation, rate limit, hidden children, isolation
const gA = await rpc(parentA, 'create_group', { p_name: `مجموعة أ ${tag}` })
const gB = await rpc(parentB, 'create_group', { p_name: `مجموعة ب ${tag}` })
{
  const inv = await rpc(parentA, 'create_group_invite', { p_group: gA, p_days: 1 })
  const view = await rpc(parentA, 'group_manager_view', { p_group: gA })
  const invId = view.invites.find((i) => i.code === inv.code)?.id
  check(await fails(rpc(parentB, 'revoke_group_invite', { p_invite: invId })), 'another parent cannot revoke an invite')
  await rpc(parentA, 'revoke_group_invite', { p_invite: invId })
  check((await rpc(kid3, 'join_group_with_code', { p_code: inv.code })).status === 'invalid', 'a revoked code no longer works')
  check(await fails(rpc(parentB, 'group_manager_view', { p_group: gA })), 'a parent cannot manage another family’s group')
}
const invA = await rpc(parentA, 'create_group_invite', { p_group: gA, p_days: 7 })
for (const k of [kid1, kid2]) await rpc(k, 'join_group_with_code', { p_code: invA.code })
await rpc(parentA, 'parent_decide_membership', { p_group: gA, p_student: c1.student_id, p_approve: true })
await rpc(parentA, 'parent_decide_membership', { p_group: gA, p_student: c2.student_id, p_approve: true })
{
  const b1 = await rpc(kid1, 'group_leaderboard', { p_group: gA, p_period: 'all' })
  check(b1.rows.length === 2, 'all-time group leaderboard lists approved members', String(b1.rows.length))
  await parentA.from('student_profiles').update({ show_in_leaderboards: false }).eq('id', c2.student_id)
  const b2 = await rpc(kid1, 'group_leaderboard', { p_group: gA, p_period: 'week' })
  check(!JSON.stringify(b2).includes('قمر تجريبي') && b2.rows.length === 1, 'a child hidden by the parent is not shown to group members')
  const other = await parentB.from('student_profiles').update({ show_in_leaderboards: false }).eq('id', c1.student_id).select()
  check(none(other), 'a parent cannot change another family’s privacy settings')
  check(await fails(rpc(kid1, 'group_leaderboard', { p_group: gB, p_period: 'week' })), 'members cannot see unrelated groups')
  check(none(await kid1.from('groups').select('id').eq('id', gB)), 'unrelated group rows are not readable')
}
{
  let limited = false
  for (let i = 0; i < 10 && !limited; i++) {
    const r = await kid3.rpc('join_group_with_code', { p_code: `BAD${tag}${i}`.toUpperCase().slice(0, 10) })
    if (r.error && /rate_limited/.test(r.error.message)) limited = true
  }
  check(limited, 'repeated invalid codes are rate limited')
}

// ---------- deletion requests
{
  const r = await parentA.from('deletion_requests').insert({ requested_by: (await parentA.auth.getUser()).data.user.id, scope: 'family', reason: 'synthetic check' })
  check(!r.error, 'a parent can request family account deletion', r.error?.message)
  const forged = await parentB.from('deletion_requests').insert({ requested_by: (await parentA.auth.getUser()).data.user.id, scope: 'family', reason: 'forged' })
  check(!!forged.error, 'a parent cannot file a request in another parent’s name')
  check(none(await parentB.from('deletion_requests').select('id').eq('reason', 'synthetic check')), 'a parent cannot see another family’s requests')
  const list = await rpc(admin, 'admin_deletion_requests')
  check(JSON.stringify(list).includes('synthetic check'), 'admin sees deletion requests')
  check(await fails(rpc(parentA, 'admin_deletion_requests')), 'parents cannot list deletion requests')
}

// ---------- Edge Functions: CORS, unauthenticated, validation
for (const fn of ['parent-children', 'ai-worker']) {
  const ok = await fetch(fnUrl(fn), { method: 'OPTIONS', headers: { Origin: 'https://aflah99.github.io', 'Access-Control-Request-Method': 'POST' } })
  const bad = await fetch(fnUrl(fn), { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } })
  check(ok.headers.get('access-control-allow-origin') === 'https://aflah99.github.io' && !bad.headers.get('access-control-allow-origin'),
    `${fn}: CORS allows only the site origin`)
  const unauth = await fetch(fnUrl(fn), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  check(unauth.status === 401, `${fn}: unauthenticated calls refused`, String(unauth.status))
  const anonKey = await fetch(fnUrl(fn), { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` }, body: '{}' })
  check(anonKey.status === 401 || anonKey.status === 403, `${fn}: publishable key alone is not enough`, String(anonKey.status))
}
{
  const r = await parentA.functions.invoke('parent-children', { body: { action: 'nope' } })
  check(r.response?.status === 400, 'parent-children rejects unknown actions', String(r.response?.status))
  const r2 = await parentA.functions.invoke('parent-children', { body: { action: 'delete', student_id: c3.student_id, confirm_username: c3Name } })
  check(r2.response?.status === 403, 'a parent cannot delete another family’s child', String(r2.response?.status))
}

console.log(JSON.stringify({ synthetic: { children: [c1.student_id, c2.student_id, c3.student_id], groups: [gA, gB], tag } }))
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED')
process.exit(failed ? 1 : 0)
