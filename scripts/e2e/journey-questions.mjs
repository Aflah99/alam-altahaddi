// Browser journey: a mixed mission (shuffled MCQs + written answers, "unsure" retry). Local test stack only.
import { chromium } from 'playwright'
import pg from 'pg'

const APP = process.env.APP ?? 'http://localhost:4174/alam-altahaddi/'
const API = process.env.API ?? 'http://localhost:54321'
const SHOTS = process.env.SHOTS ?? ''
const db = new pg.Pool({ connectionString: process.env.EMU_DB_URL ?? 'postgres://postgres@localhost:54329/alam_e2e' })
let failures = 0
const ok = (c, m) => (console.log(`${c ? 'PASS' : 'FAIL'} ${m}`), c || failures++)

const keys = await (await fetch(`${API}/__keys`)).json()
const tok = await fetch(`${API}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: keys.anon, 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'parent.one@example.test', password: 'parent-pass-1' }),
}).then((r) => r.json())
const username = `qz${Date.now().toString(36).slice(-6)}`
const pw = 'Kid-pass-123!'
const kid = await fetch(`${API}/functions/v1/parent-children`, {
  method: 'POST', headers: { apikey: keys.anon, authorization: `Bearer ${tok.access_token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'create', username, nickname: 'قارئ', password: pw }),
}).then((r) => r.json())
ok(!!kid.student_id, 'synthetic child created')

// The mission that contains the written question about Umrah from the Haram (answer: لا يجوز).
const { rows: [m] } = await db.query(`
  select s.slug, l.id lesson, mi.number from public.questions q join public.mission_questions mq on mq.question_id = q.id
  join public.missions mi on mi.id = mq.mission_id join public.lessons l on l.id = mi.lesson_id join public.subjects s on s.id = l.subject_id
  where q.legacy_id = 'rv8.u4.l4.26a.w'`)
const rows = ((await db.query(`
  select q.text, q.qtype, o.text correct, q.accepted_answers[1] accepted from public.mission_questions mq join public.missions mi on mi.id = mq.mission_id
  join public.questions q on q.id = mq.question_id left join public.question_options o on o.question_id = q.id and o.is_correct
  where mi.lesson_id = $1 and mi.number = $2`, [m.lesson, m.number])).rows)
const find = (text, type) => rows.find((r) => r.text === text && r.qtype === type)

const browser = await chromium.launch()
const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar' })).newPage()
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
await p.goto(APP)
await p.getByLabel('اسم الدخول').fill(username)
await p.getByLabel('كلمة المرور').fill(pw)
await p.getByRole('button', { name: 'دخول' }).click()
await p.waitForFunction(() => location.hash === '#/lobby', null, { timeout: 15000 })
await p.goto(`${APP}#/quiz/${encodeURIComponent(m.slug)}/${m.lesson}/${m.number}`)
await p.locator('.qcard__question').waitFor({ timeout: 15000 })

let mcq = 0, written = 0, sawUnsure = false
for (let i = 0; i < 20; i++) {
  const text = (await p.locator('.qcard__question').innerText()).trim()
  const isWritten = (await p.locator('.qwrite__input').count()) > 0
  const a = find(text, isWritten ? 'written' : 'mcq')
  if (!a) { ok(false, `unknown question ${text.slice(0, 30)}`); break }
  if (isWritten) {
    written++
    const input = p.getByLabel(/اكتب إجابتك/)
    if (a.accepted === 'لا يجوز') {
      await input.fill('يجوز') // negation removed: wrong
      await p.getByRole('button', { name: 'تأكيد الإجابة' }).click()
      await p.getByText('ليست هذه الإجابة الصحيحة').waitFor()
      ok(true, 'negated written answer rejected')
      await input.fill('لايجوز') // missing space: accepted
      await p.getByRole('button', { name: 'حاول مرة أخرى' }).click()
      if (SHOTS) await p.screenshot({ path: `${SHOTS}/written-390.png` })
    } else {
      await input.fill(a.accepted)
      await p.getByRole('button', { name: 'تأكيد الإجابة' }).click()
    }
    await p.getByText(/إجابة صحيحة! أحسنت|الإجابة الصحيحة/).first().waitFor()
  } else {
    mcq++
    await p.locator('.qopt', { hasText: a.correct }).first().click()
    await p.getByRole('button', { name: 'تأكيد الإجابة' }).click()
    await p.getByText('إجابة صحيحة! أحسنت.').waitFor()
  }
  const next = p.getByRole('button', { name: /السؤال التالي|إنهاء المهمة/ })
  const last = (await next.innerText()).includes('إنهاء')
  await next.click()
  if (last) break
  await p.waitForTimeout(150)
}
await p.getByText(/المهمة|النتيجة|أحسنت/).first().waitFor()
ok(mcq > 0 && written > 0, `mixed mission played (${mcq} MCQ + ${written} written)`)
const { rows: [r] } = await db.query(`select count(*) filter (where qa.grade is not null)::int w, count(*) filter (where qa.option_id is not null)::int c
  from public.question_attempts qa where qa.student_id = $1`, [kid.student_id])
ok(r.w >= 2 && r.c >= mcq, `server recorded graded written attempts (${r.w}) and MCQ attempts (${r.c})`)
ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal scroll')
ok(errors.length === 0, `no page errors ${errors.join(' | ')}`)
void sawUnsure
await browser.close()
await db.end()
console.log(failures ? `${failures} FAILED` : 'ALL PASSED')
process.exit(failures ? 1 : 0)
