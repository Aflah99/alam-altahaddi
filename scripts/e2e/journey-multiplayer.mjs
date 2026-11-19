// Browser journey: غرف التحدّي with real browser players on the local test stack.
// 1) Two students: create a room in the UI, join by invite link, ready, start, play a full duel, see results.
// 2) Every mode: start a match through the API and render it for a player (screens + one UI answer).
import { chromium } from 'playwright'
import pg from 'pg'

const APP = process.env.APP ?? 'http://localhost:4174/alam-altahaddi/'
const API = process.env.API ?? 'http://localhost:54321'
const SHOTS = process.env.SHOTS ?? ''
const db = new pg.Pool({ connectionString: process.env.EMU_DB_URL ?? 'postgres://postgres@localhost:54329/alam_e2e' })
let failures = 0
const ok = (c, m) => (console.log(`${c ? 'PASS' : 'FAIL'} ${m}`), c || failures++)
const keys = await (await fetch(`${API}/__keys`)).json()
const token = async (email, password) =>
  (await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: keys.anon, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) }).then((r) => r.json())).access_token
const parentToken = await token('parent.one@example.test', 'parent-pass-1')
const PW = 'Kid-pass-123!'
async function kid(i) {
  const username = `mp${Date.now().toString(36).slice(-5)}${i}`
  const r = await fetch(`${API}/functions/v1/parent-children`, {
    method: 'POST', headers: { apikey: keys.anon, authorization: `Bearer ${parentToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create', username, nickname: `بطل${i}`, password: PW, character_id: i % 2 ? 'human-girl' : 'human-boy' }),
  }).then((x) => x.json())
  return { username, id: r.student_id, token: await token(`${username}@students.alam-altahaddi.invalid`, PW) }
}
const rpc = async (who, fn, args) => {
  const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: keys.anon, authorization: `Bearer ${who.token}`, 'content-type': 'application/json' }, body: JSON.stringify(args) })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`${fn}: ${JSON.stringify(j)}`)
  return j
}
const browser = await chromium.launch()
const errors = []
async function signIn(k, viewport = { width: 390, height: 844 }) {
  const p = await (await browser.newContext({ viewport, locale: 'ar' })).newPage()
  p.on('pageerror', (e) => errors.push(e.message))
  await p.goto(APP)
  await p.getByLabel('اسم الدخول').fill(k.username)
  await p.getByLabel('كلمة المرور').fill(PW)
  await p.getByRole('button', { name: 'دخول' }).click()
  await p.waitForFunction(() => location.hash === '#/lobby', null, { timeout: 15000 })
  return p
}
/** Clicks the correct option (test-only peek at this player's personal option order). */
async function clickAnswer(p, k, right) {
  const text = (await p.locator('.mpq__text').innerText()).trim()
  const { rows: [r] } = await db.query(`
    select s.option_order, q.qtype, q.accepted_answers[1] acc, (select option_id from question_options o where o.question_id = q.id and o.is_correct) letter
    from mp_serves s join mp_match_questions mq on mq.match_id = s.match_id and mq.idx = s.question_idx join questions q on q.id = mq.question_id
    where s.student_id = $1 and q.text = $2 order by s.served_at desc limit 1`, [k.id, text])
  if (r.qtype === 'written') {
    await p.getByLabel('اكتب إجابتك').fill(right ? r.acc : 'لا أعرف الإجابة')
    await p.getByRole('button', { name: 'إرسال' }).click()
  } else {
    const key = r.option_order.indexOf(r.letter) + 1
    const pick = right ? key : (key % 4) + 1
    await p.locator('.mpq__options .qopt').nth(pick - 1).click()
  }
}

// ---------- 1. Full duel through the UI ----------
const [A, B] = [await kid(1), await kid(2)]
const pa = await signIn(A)
const pb = await signIn(B, { width: 820, height: 1180 })
await pa.getByRole('button', { name: /غرف التحدّي/ }).click()
await pa.getByRole('heading', { name: 'غرف التحدّي' }).waitFor()
await pa.getByRole('radio', { name: /منافسة سريعة/ }).click()
await pa.getByRole('button', { name: 'إنشاء الغرفة' }).click()
await pa.locator('.mp__code').waitFor({ timeout: 15000 })
const code = (await pa.locator('.mp__code').innerText()).trim()
ok(/^[A-HJ-NP-Z2-9]{8}$/.test(code), `room created with code ${code}`)
ok(await pa.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'room lobby: no horizontal scroll (390px)')
await pb.goto(`${APP}#/join/${code}`)
await pb.locator('.mp__code-input').waitFor()
await pb.getByRole('button', { name: 'انضمام' }).click()
await pb.getByRole('button', { name: 'أنا جاهز!' }).waitFor({ timeout: 15000 })
await pb.getByRole('button', { name: 'أنا جاهز!' }).click()
await pa.getByText('الجميع جاهز!').waitFor({ timeout: 15000 })
ok(true, 'second player joined by invite link and is ready (seen live by the host)')
await pb.getByRole('button', { name: /رسائل سريعة/ }).click()
await pb.getByRole('button', { name: 'بالتوفيق!' }).click()
await pa.locator('.mp__bubble', { hasText: 'بالتوفيق!' }).waitFor({ timeout: 10000 })
ok(true, 'preset reaction delivered to the other player')
if (SHOTS) await pa.screenshot({ path: `${SHOTS}/mp-lobby-390.png` })
await pa.getByRole('button', { name: 'ابدأ المباراة' }).click()
let rounds = 0
for (let i = 0; i < 60 && rounds < 7; i++) {
  const qa = await pa.locator('.mpq__text').count()
  const qb = await pb.locator('.mpq__text').count()
  if (qa && qb) {
    if (rounds === 1 && SHOTS) await pb.screenshot({ path: `${SHOTS}/mp-duel-820.png` })
    await clickAnswer(pa, A, true)
    await clickAnswer(pb, B, rounds < 2)
    rounds++
    await pa.waitForTimeout(800)
  } else await pa.waitForTimeout(700)
}
ok(rounds === 7, `seven duel rounds played in the browser (${rounds})`)
await pa.getByText('فزت! 🏆').waitFor({ timeout: 20000 })
await pb.getByText(/الفائز:/).waitFor({ timeout: 20000 })
ok(true, 'results: host wins, the other player sees the winner')
if (SHOTS) await pa.screenshot({ path: `${SHOTS}/mp-results-390.png` })
const { rows: [rw] } = await db.query(`select count(*)::int n from reward_transactions where kind = 'multiplayer' and student_id = $1`, [A.id])
ok(rw.n === 1, 'multiplayer reward recorded once on the server')
await pa.getByRole('button', { name: /العودة إلى الغرفة/ }).click()
await pa.getByRole('button', { name: 'ابدأ المباراة' }).waitFor()
ok(true, 'rematch: back in the room')

// ---------- 2. Every mode renders and accepts a UI answer ----------
const extra = [await kid(3), await kid(4)]
const four = [A, B, ...extra]
for (const [mode, players] of [['speed', [A, B]], ['teams', four], ['survival', [A, B]], ['treasure', [A, B]], ['boss', [A, B]], ['tournament', four], ['conquest', [A, B]]]) {
  for (const k of four) await rpc(k, 'mp_my_room', {}).then((r) => r && rpc(k, 'mp_leave', { p_room: r.room_id })).catch(() => {})
  const room = await rpc(players[0], 'mp_create_room', { p_mode: mode, p_subjects: [], p_lessons: [], p_settings: { duration: 60 } })
  for (const k of players.slice(1)) {
    await rpc(k, 'mp_join', { p_code: room.code })
    await rpc(k, 'mp_set_ready', { p_room: room.room_id, p_ready: true })
  }
  await rpc(players[0], 'mp_start', { p_room: room.room_id })
  await pa.goto(`${APP}#/room/${room.room_id}`)
  await pa.waitForTimeout(6500)
  if (mode === 'treasure') {
    await pa.locator('.mpchest:not([disabled])').first().click()
    await pa.waitForTimeout(1500)
  }
  if (mode === 'conquest') {
    const st = await rpc(A, 'mp_state', { p_room: room.room_id })
    const s = st.match.state
    if (s.turn_order[s.turn] !== A.id) {
      // B attacks so that A has a duel question to answer.
      const owners = s.owners
      let from = owners.findIndex((o, i) => o === B.id && [i - 1, i + 1, i - 4, i + 4].some((j) => j >= 0 && j < 12 && owners[j] === A.id && !(Math.abs(i - j) === 1 && Math.floor(i / 4) !== Math.floor(j / 4))))
      const to = [from - 1, from + 1, from - 4, from + 4].find((j) => j >= 0 && j < 12 && owners[j] === A.id && !(Math.abs(from - j) === 1 && Math.floor(from / 4) !== Math.floor(j / 4)))
      await rpc(B, 'mp_conquest_attack', { p_match: st.match.id, p_from: from, p_to: to })
    } else {
      const tile = pa.locator('.mpmap__tile:not([disabled])').first()
      await tile.click()
      await pa.locator('.mpmap__tile:not([disabled])').first().click()
    }
    await pa.waitForTimeout(3500)
  }
  await pa.locator('.mpq__text').waitFor({ timeout: 12000 }).catch(() => {})
  const hasQ = await pa.locator('.mpq__text').count()
  if (hasQ) await clickAnswer(pa, A, true)
  await pa.waitForTimeout(1200)
  const fine = await pa.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  ok(hasQ > 0 && fine, `${mode}: match screen renders, a question was answered in the UI, no horizontal scroll`)
  if (SHOTS) await pa.screenshot({ path: `${SHOTS}/mp-${mode}-390.png` })
  for (const k of players) await rpc(k, 'mp_leave', { p_room: room.room_id }).catch(() => {})
}
ok(errors.length === 0, `no page errors ${errors.join(' | ')}`)
await browser.close()
await db.end()
console.log(failures ? `${failures} FAILED` : 'ALL PASSED')
process.exit(failures ? 1 : 0)
