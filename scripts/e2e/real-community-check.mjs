// REAL Supabase project check for Feature 6 (community courses), synthetic accounts only.
//   SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... CREDS=creds.json \
//   node --experimental-strip-types scripts/e2e/real-community-check.mjs
// creds.json (never commit): { parentA, parentB, admin: {email,password}, kidPass }
// Creates synthetic children and courses through the public API only. Clean up afterwards with the SQL in docs/backend/COMMUNITY.md.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { parseQuestions, toItem, hasErrors } from '../../src/community/parser.ts'

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY
const creds = JSON.parse(fs.readFileSync(process.env.CREDS, 'utf8'))
const DOMAIN = 'students.alam-altahaddi.invalid'
const tag = Date.now().toString(36).slice(-5)
let failed = 0
const check = (ok, name, extra = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`) }
const client = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
async function signIn(email, password) { const c = client(); const { error } = await c.auth.signInWithPassword({ email, password }); if (error) throw new Error(`sign-in ${email}: ${error.message}`); return c }
const rpc = async (c, fn, args) => { const { data, error } = await c.rpc(fn, args); if (error) throw Object.assign(new Error(error.message), { code: error.code, details: error.details }); return data }
const rejects = async (p, re) => p.then(() => false, (e) => (re ? re.test(String(e.message)) : true))
const uid = () => crypto.randomUUID()

const A = await signIn(creds.parentA.email, creds.parentA.password)
const B = await signIn(creds.parentB.email, creds.parentB.password)
const ADM = await signIn(creds.admin.email, creds.admin.password)
const mkKid = async (parent, name) => {
  const { data, error } = await parent.functions.invoke('parent-children', { body: { action: 'create', username: name, nickname: 'تجريبي', password: creds.kidPass } })
  if (error) throw new Error(`child ${name}: ${error.message}`)
  return { id: data.student_id, c: await signIn(`${name}@${DOMAIN}`, creds.kidPass) }
}
const kA = await mkKid(A, `f6a_${tag}`)
const kB = await mkKid(B, `f6b_${tag}`)
const kC = await mkKid(B, `f6c_${tag}`)
check(true, 'synthetic parents, admin and children sign in')

// ---------- baseline of the official curriculum ----------
const baseline = async () => ({
  catalog: (await rpc(kB.c, 'get_catalog')).map((s) => `${s.slug}:${s.units.length}`).join('|'),
  flags: (await ADM.from('academic_flags').select('id', { count: 'exact', head: true }).eq('status', 'open')).count,
  published: (await ADM.from('questions').select('id', { count: 'exact', head: true }).eq('status', 'published').neq('origin', 'community')).count,
})
const before = await baseline()

// ---------- authoring ----------
const courseName = `مادة اختبار ${tag}`
const cid = await rpc(A, 'cc_create_course', { p: { name_ar: courseName, description: 'مادة تجريبية للتحقق من النظام', grade: 8, category: 'علوم', visibility: 'public' } })
const unit = await rpc(A, 'cc_save_unit', { p_subject: cid, p_unit: null, p_title: 'الوحدة الأولى' })
const lesson = await rpc(A, 'cc_save_lesson', { p_unit: unit, p_lesson: null, p_title: 'الدرس الأول' })
check(!!cid && !!unit && !!lesson, 'parent creates a community course with a unit and a lesson')
await rpc(A, 'cc_save_question', { p: { lesson_id: lesson, qtype: 'mcq', text: 'ما عاصمة سلطنة عمان؟', options: ['صحار', 'مسقط', 'نزوى', 'صلالة'], correct_option: 'b', explanation: 'مسقط' } })
await rpc(A, 'cc_save_question', { p: { lesson_id: lesson, qtype: 'written', text: 'اكتب اسم عاصمة سلطنة عُمان.', accepted_answers: ['مسقط', 'مدينة مسقط'] } })
check(true, 'manual MCQ and written questions saved')

const pasted = `الوحدة: الوحدة الأولى
الدرس: الدرس الأول
السؤال 1: ما عدد أيام الأسبوع؟
أ: خمسة
ب: ستة
ج: سبعة
د: ثمانية
الإجابة الصحيحة: ج
السؤال 2: ما ناتج ٢+٢؟
أ: ٣
ب: ٤
ج: ٥
د: ٦
الإجابة الصحيحة: ب
السؤال 3: ما أكبر المحيطات؟
أ: الهندي
ب: الأطلسي
ج: الهادئ
د: المتجمد
الإجابة الصحيحة: ج
السؤال 4: اكتب لون العشب.
النوع: كتابي
الإجابة النموذجية: أخضر
إجابات مقبولة: اخضر | الأخضر`
const parsed = parseQuestions(pasted).questions
check(parsed.length === 4 && parsed.every((q) => !hasErrors(q)), 'external-style text parsed by plain code (no AI call)')
const req = uid()
const imp = await rpc(A, 'cc_import_questions', { p_lesson: lesson, p_items: parsed.map(toItem), p_request: req })
check(imp.imported === 4 && !imp.replay, 'bulk import of the parsed batch')
check((await rpc(A, 'cc_import_questions', { p_lesson: lesson, p_items: parsed.map(toItem), p_request: req })).replay === true, 'duplicate submission (same request id) imports nothing twice')
check((await rpc(A, 'cc_import_questions', { p_lesson: lesson, p_items: parsed.map(toItem), p_request: uid() })).skipped_duplicates === 4, 'duplicate questions skipped')
check(await rejects(rpc(A, 'cc_import_questions', { p_lesson: lesson, p_items: [...parsed.slice(0, 1).map(toItem), { qtype: 'mcq', text: 'سؤال معطوب', options: ['أ', 'ب', 'ج'], correct_option: 'a' }], p_request: uid() }), /invalid_question/), 'malformed batch rejected as a whole')
check(await rejects(rpc(A, 'cc_import_questions', { p_lesson: lesson, p_items: Array.from({ length: 101 }, (_, i) => ({ qtype: 'mcq', text: `سؤال طويل رقم ${i}`, options: ['١', '٢', '٣', '٤'], correct_option: 'a' })), p_request: uid() }), /batch_too_large/), 'oversized batch rejected')
check(await rejects(rpc(A, 'cc_save_question', { p: { lesson_id: lesson, qtype: 'mcq', text: '<script>alert(1)</script> سؤال', options: ['١', '٢', '٣', '٤'], correct_option: 'a' } }), /unsafe_content/), 'script injection rejected')
check(await rejects(rpc(A, 'cc_create_course', { p: { name_ar: 'مادة رسمية معتمدة', description: 'وصف طويل بما يكفي' } }), /official_claim/), 'courses cannot claim to be official')
const sneaky = await rpc(A, 'cc_save_question', { p: { lesson_id: lesson, qtype: 'mcq', text: 'سؤال‮ مخفي⁦ اختبار', options: ['١', '٢', '٣', '٤'], correct_option: 'a' } })
const full0 = await rpc(A, 'cc_get_course', { p_id: cid })
const all = full0.units.flatMap((u) => u.lessons.flatMap((l) => l.questions))
check(all.find((q) => q.id === sneaky.id).text === 'سؤال مخفي اختبار', 'bidi-override characters stripped on the server')
await rpc(A, 'cc_delete_question', { p_id: sneaky.id })

// ---------- publish, search, enrol ----------
check((await rpc(A, 'cc_validate', { p_id: cid })).ok === true, 'validation passes')
await rpc(A, 'cc_set_status', { p_id: cid, p_status: 'published' })
const found = await rpc(kB.c, 'search_courses', { p_q: courseName, p_grade: null, p_category: '', p_sort: 'relevance', p_favorites: false, p_limit: 5, p_offset: 0 })
check(found.items.some((i) => i.id === cid) && found.items[0].question_count === 6, 'public course is searchable immediately', `questions=${found.items[0]?.question_count}`)
check(!JSON.stringify(found).includes('@'), 'search results contain no email addresses')
check((await rpc(kB.c, 'enroll_course', { p_subject: cid })).enrolled === true, 'student enrols directly without parental approval')

// ---------- play, rewards, grading ----------
const answersOf = (detail) => new Map(detail.units.flatMap((u) => u.lessons.flatMap((l) => l.questions)).map((q) => [q.text, q]))
const playMission = async (kid, mission, key) => {
  const s = await rpc(kid.c, 'start_quiz_session', { p_mission: mission })
  const ans = answersOf(await rpc(A, 'cc_get_course', { p_id: cid }))
  for (const q of s.questions) {
    const a = ans.get(q.text)
    const r = q.type === 'written'
      ? await rpc(kid.c, 'submit_written', { p_session: s.session_id, p_question: q.id, p_text: a.accepted_answers[1] ?? a.accepted_answers[0] })
      : await rpc(kid.c, 'submit_answer', { p_session: s.session_id, p_question: q.id, p_option: q.options.find((o) => o.text === a.options['abcd'.indexOf(a.correct_option)]).id })
    if (r.feedback !== 'correct') throw new Error(`answer not accepted for "${q.text}": ${r.feedback}`)
  }
  void key
  return rpc(kid.c, 'complete_quiz_session', { p_session: s.session_id })
}
const cat = await rpc(kB.c, 'get_my_course_catalog')
const mission = cat.find((c) => c.id === cid).units[0].lessons[0].missions[0].id
const r1 = await playMission(kB, mission)
check(r1.community === true && r1.first_try === 6 && r1.reward.xp === 6 * 2 + 5, 'community mission played; written answers graded (alternative + diacritics); capped reward', `xp=${r1.reward.xp}`)
const r2 = await playMission(kB, mission)
check(r2.reward.xp === 0 && r2.reward.coins === 0, 'replay pays nothing (no repeat farming)')
const rOwn = await (async () => { await rpc(kA.c, 'enroll_course', { p_subject: cid }); return playMission(kA, mission) })()
check(rOwn.reward.xp === 0, 'creator’s own family earns no rewards in their own course')
const st0 = await rpc(kB.c, 'get_my_game_state')
check(st0.xp === 17 && st0.coins === 9, 'wallet reflects only the capped reward', `xp=${st0.xp} coins=${st0.coins}`)

// daily cap across courses (temporarily lowered by the administrator, then restored)
const cid2 = await rpc(A, 'cc_create_course', { p: { name_ar: `مادة ثانية ${tag}`, description: 'مادة ثانية للتحقق من السقف اليومي' } })
const u2 = await rpc(A, 'cc_save_unit', { p_subject: cid2, p_unit: null, p_title: 'وحدة' })
const l2 = await rpc(A, 'cc_save_lesson', { p_unit: u2, p_lesson: null, p_title: 'درس' })
await rpc(A, 'cc_import_questions', { p_lesson: l2, p_items: Array.from({ length: 6 }, (_, i) => ({ qtype: 'mcq', text: `سؤال السقف رقم ${i + 1} ${tag}`, options: ['خطأ ١', 'صحيح', 'خطأ ٢', 'خطأ ٣'], correct_option: 'b' })), p_request: uid() })
await rpc(A, 'cc_set_status', { p_id: cid2, p_status: 'published' })
await rpc(kC.c, 'enroll_course', { p_subject: cid })
await rpc(kC.c, 'enroll_course', { p_subject: cid2 })
await rpc(ADM, 'admin_set_community_settings', { p: { daily_xp_cap: 10, daily_coin_cap: 6 } })
try {
  const m2 = (await rpc(kC.c, 'get_my_course_catalog')).find((c) => c.id === cid2).units[0].lessons[0].missions[0].id
  const c1 = await playMission(kC, mission)
  const s = await rpc(kC.c, 'start_quiz_session', { p_mission: m2 })
  for (const q of s.questions) await rpc(kC.c, 'submit_answer', { p_session: s.session_id, p_question: q.id, p_option: q.options.find((o) => o.text === 'صحيح').id })
  const c2 = await rpc(kC.c, 'complete_quiz_session', { p_session: s.session_id })
  const stC = await rpc(kC.c, 'get_my_game_state')
  check(c1.reward.xp + c2.reward.xp <= 10 && stC.xp <= 10 && stC.coins <= 6, 'daily cap holds across courses', `xp=${stC.xp}/10 coins=${stC.coins}/6`)
  check(c2.daily_limit_reached === true, 'student is told the daily limit was reached')
} finally {
  await rpc(ADM, 'admin_set_community_settings', { p: { daily_xp_cap: 40, daily_coin_cap: 25 } })
}

// ---------- official content unaffected ----------
const off = (await rpc(kB.c, 'get_catalog'))[0]
const offMission = off.units[0].lessons[0].missions[0]
const sO = await rpc(kB.c, 'start_quiz_session', { p_mission: offMission.id })
check(sO.questions.length === offMission.question_count && !JSON.stringify(sO).includes('is_correct'), 'official mission still starts normally, without answers')
check(JSON.stringify(await baseline()) === JSON.stringify(before), 'official catalogue, published official questions and the 4 open academic flags unchanged', `flags=${before.flags}`)
check(before.flags === 4, 'the 4 academic review flags remain open')

// ---------- ratings, favourites ----------
check(await rejects(rpc(kC.c, 'rate_course', { p_subject: cid, p_stars: 6 }), /invalid rating/), 'rating out of range rejected')
check((await rpc(kB.c, 'rate_course', { p_subject: cid, p_stars: 5 })).count === 1, 'rating saved after playing')
await rpc(kB.c, 'rate_course', { p_subject: cid, p_stars: 4 })
check((await rpc(kB.c, 'course_card', { p_subject: cid })).my_rating === 4 && (await rpc(kB.c, 'course_card', { p_subject: cid })).rating_count === 1, 'one rating per user, updatable')
check(await rejects(rpc(kA.c, 'rate_course', { p_subject: cid, p_stars: 5 }), /own_course/) && await rejects(rpc(A, 'rate_course', { p_subject: cid, p_stars: 5 }), /own_course/), 'creator and their family cannot rate')
await rpc(kB.c, 'toggle_course_favorite', { p_subject: cid, p_on: true })
check((await rpc(kB.c, 'search_courses', { p_q: '', p_grade: null, p_category: '', p_sort: 'recent', p_favorites: true, p_limit: 5, p_offset: 0 })).total === 1, 'favourite persists and lists')

// ---------- access control ----------
check(await rejects(rpc(kB.c, 'cc_create_course', { p: { name_ar: 'مادة طالب', description: 'لا يجوز للطالب' } }), /parent account required/), 'students cannot create courses')
check(await rejects(rpc(B, 'cc_update_course', { p_id: cid, p: { name_ar: 'سطو' } }), /course not found/), 'another parent cannot modify the course')
check(await rejects(rpc(B, 'cc_save_question', { p: { lesson_id: lesson, qtype: 'mcq', text: 'سؤال دخيل', options: ['١', '٢', '٣', '٤'], correct_option: 'a' } }), /course not found/), 'another parent cannot add questions')
check(await rejects(rpc(A, 'admin_set_course_kind', { p_subject: cid, p_kind: 'official' }), /administrator required/), 'parents cannot mark a course as official')
{
  const r = await A.from('subjects').update({ kind: 'official' }).eq('id', cid).select()
  check(!r.data?.length, 'direct table update of subjects is blocked for parents')
  const r2 = await kC.c.from('questions').select('id').eq('subject_id', cid)
  check(!r2.data?.length, 'students cannot read question tables directly (answer keys protected)')
  const r3 = await kC.c.from('subjects').select('id').eq('id', cid)
  check(!r3.data?.length, 'community subjects are not readable through ordinary table reads')
  const an = await client().rpc('search_courses', {})
  check(!!an.error, 'anonymous users cannot call the discovery API')
}

// private and invitation-only
const priv = await rpc(A, 'cc_create_course', { p: { name_ar: `مادة خاصة ${tag}`, description: 'مادة خاصة للعائلة فقط', visibility: 'private' } })
const pu = await rpc(A, 'cc_save_unit', { p_subject: priv, p_unit: null, p_title: 'وحدة' })
const pl = await rpc(A, 'cc_save_lesson', { p_unit: pu, p_lesson: null, p_title: 'درس' })
await rpc(A, 'cc_import_questions', { p_lesson: pl, p_items: Array.from({ length: 5 }, (_, i) => ({ qtype: 'mcq', text: `سؤال خاص ${i + 1} ${tag}`, options: ['١', '٢', '٣', '٤'], correct_option: 'a' })), p_request: uid() })
await rpc(A, 'cc_set_status', { p_id: priv, p_status: 'published' })
check(await rejects(rpc(kB.c, 'enroll_course', { p_subject: priv }), /course not found/) && await rejects(rpc(B, 'course_card', { p_subject: priv }), /course not found/), 'private course is inaccessible outside the family (guessed id)')
check(!(await rpc(kB.c, 'search_courses', { p_q: 'خاصة', p_grade: null, p_category: '', p_sort: 'recent', p_favorites: false, p_limit: 20, p_offset: 0 })).items.some((i) => i.id === priv), 'private course is not searchable')
check((await rpc(kA.c, 'enroll_course', { p_subject: priv })).is_mine === true, 'the creator’s family can use their private course')
await rpc(A, 'cc_set_visibility', { p_id: priv, p_visibility: 'invite' })
const inv = await rpc(A, 'cc_create_invite', { p_id: priv, p_days: 7, p_max_uses: 3 })
check(await rejects(rpc(kB.c, 'enroll_course', { p_subject: priv }), /course not found/), 'invitation-only course requires authorisation')
check((await rpc(kB.c, 'redeem_course_invite', { p_code: 'AAAAAAAAAA' })).status === 'invalid', 'wrong invitation code is rejected')
check((await rpc(kB.c, 'redeem_course_invite', { p_code: inv.code })).status === 'ok' && (await rpc(kB.c, 'enroll_course', { p_subject: priv })).enrolled, 'valid invitation grants access and enrolment')
await rpc(A, 'cc_revoke_invites', { p_id: priv, p_remove_access: true })
check(await rejects(rpc(kB.c, 'start_quiz_session', { p_mission: (await ADM.from('missions').select('id, lessons!inner(subject_id)').eq('lessons.subject_id', priv).limit(1)).data[0].id }), /mission not available/), 'revoking invitations removes access')
// public -> private keeps progress
await rpc(A, 'cc_set_visibility', { p_id: cid, p_visibility: 'private' })
check(await rejects(rpc(kB.c, 'start_quiz_session', { p_mission: mission }), /mission not available/), 'public → private blocks outside access immediately')
check((await ADM.from('quiz_sessions').select('id', { count: 'exact', head: true }).eq('student_id', kB.id).eq('status', 'completed')).count >= 2, 'existing results and progress are preserved')
await rpc(A, 'cc_set_visibility', { p_id: cid, p_visibility: 'public' })

// ---------- editing never rewrites history ----------
const sessionsBefore = (await ADM.from('question_attempts').select('question_id,is_correct,option_id').eq('student_id', kB.id).order('id')).data
const mcqQ = all.find((q) => q.qtype === 'mcq' && q.text.startsWith('ما عاصمة'))
const edited = await rpc(A, 'cc_save_question', { p: { id: mcqQ.id, lesson_id: lesson, qtype: 'mcq', text: mcqQ.text, options: ['صحار', 'مسقط', 'نزوى', 'صلالة'], correct_option: 'c' } })
const sessionsAfter = (await ADM.from('question_attempts').select('question_id,is_correct,option_id').eq('student_id', kB.id).order('id')).data
check(edited.versioned === true && JSON.stringify(sessionsBefore) === JSON.stringify(sessionsAfter), 'correcting an answered question creates a new version; recorded results unchanged')
const r3 = await playMission(kB, mission).catch(() => null)
check(r3 === null || r3.reward.xp === 0, 'a re-keyed question cannot be re-farmed')

// ---------- reports and moderation ----------
check((await rpc(kC.c, 'report_course', { p_subject: cid, p_category: 'inappropriate', p_details: 'اختبار بلاغ' })).status === 'reported', 'student reports content')
check((await rpc(kC.c, 'report_course', { p_subject: cid, p_category: 'other', p_details: '' })).status === 'already_reported', 'duplicate report prevented')
check(await rejects(rpc(B, 'admin_course_reports', { p_status: 'open' }), /administrator required/) && (await A.from('course_reports').select('id')).data?.length === 0, 'reports are invisible to non-admins')
const queue = await rpc(ADM, 'admin_course_reports', { p_status: 'open' })
const rep = queue.find((r) => r.subject_id === cid)
check(!!rep && rep.reporter.length === 8 && !JSON.stringify(rep).includes(kC.id), 'report appears in the admin queue (reporter id never full)')
await rpc(ADM, 'admin_moderate_course', { p_subject: cid, p_action: 'suspend', p_note: 'اختبار الإيقاف' })
check(!(await rpc(kB.c, 'search_courses', { p_q: courseName, p_grade: null, p_category: '', p_sort: 'recent', p_favorites: false, p_limit: 5, p_offset: 0 })).items.some((i) => i.id === cid), 'suspended course leaves discovery')
check(await rejects(rpc(kC.c, 'start_quiz_session', { p_mission: mission }), /mission not available/) && await rejects(rpc(kB.c, 'enroll_course', { p_subject: cid }), /course not found/), 'suspension blocks play and enrolment')
check(await rejects(rpc(A, 'cc_set_status', { p_id: cid, p_status: 'published' }), /course_suspended/), 'creator cannot republish a suspended course')
await rpc(ADM, 'admin_resolve_course_reports', { p_subject: cid, p_status: 'resolved', p_note: 'تم' })
await rpc(ADM, 'admin_moderate_course', { p_subject: cid, p_action: 'restore', p_note: '' })
check((await rpc(kC.c, 'start_quiz_session', { p_mission: mission })).questions.length > 0, 'restoring a course re-enables it')
check((await rpc(ADM, 'admin_community_courses', { p_q: courseName, p_filter: '', p_limit: 10, p_offset: 0 }))[0].owner_email.endsWith('@example.test'), 'admin sees ownership and status')
check(Object.keys(await rpc(ADM, 'admin_community_insights')).includes('top_earners_7d'), 'admin insights available')

// ---------- parent oversight ----------
const oversight = await rpc(B, 'parent_child_courses', { p_student: kB.id })
check(oversight.courses.some((c) => c.id === cid), 'parent sees which community courses their child uses')
await rpc(B, 'parent_set_course_block', { p_student: kB.id, p_subject: cid, p_blocked: true })
check(await rejects(rpc(kB.c, 'enroll_course', { p_subject: cid }), /blocked_by_parent/), 'parent can block a course for a child')
check(await rejects(rpc(A, 'parent_child_courses', { p_student: kB.id }), /not your child/), 'parents cannot inspect other families’ children')
await rpc(B, 'parent_set_community_allowed', { p_student: kC.id, p_allowed: false })
check(await rejects(rpc(kC.c, 'search_courses', { p_q: '', p_grade: null, p_category: '', p_sort: 'recent', p_favorites: false, p_limit: 5, p_offset: 0 }), /community_disabled/), 'parent can switch community courses off for a child')

// ---------- multiplayer integration ----------
const room = await rpc(kA.c, 'mp_create_room', { p_mode: 'speed', p_subjects: [], p_lessons: [], p_settings: {} })
check(!!room.room_id, 'multiplayer room creation still works (official pool)')
check(await rejects(rpc(kA.c, 'mp_create_room', { p_mode: 'speed', p_subjects: [priv], p_lessons: [], p_settings: {} }), /no questions for this selection/), 'a non-public community course cannot be used in rooms')

check(true, `finished: ${failed} failures`)
console.log(failed ? `${failed} FAILED` : 'ALL PASSED')
process.exit(failed ? 1 : 0)
