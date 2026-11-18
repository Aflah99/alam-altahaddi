// Browser journey: authentication-first entry, role routing, audio settings.
// Usage: APP=http://localhost:4174/alam-altahaddi/ API=http://localhost:54321 node scripts/e2e/journey-auth.mjs
// Against the local test stack (scripts/e2e/start-local-stack.sh) only: it creates a synthetic child account.
import { chromium } from 'playwright'

const APP = process.env.APP ?? 'http://localhost:4174/alam-altahaddi/'
const API = process.env.API ?? 'http://localhost:54321'
const SHOTS = process.env.SHOTS ?? ''
let failures = 0
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`)
  if (!cond) failures++
}

const keys = await (await fetch(`${API}/__keys`)).json()
async function token(email, password) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: keys.anon, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return (await r.json()).access_token
}
const parentToken = await token('parent.one@example.test', 'parent-pass-1')
const username = `kid${Date.now().toString(36).slice(-6)}`
const childPassword = 'Kid-pass-123!'
const created = await fetch(`${API}/functions/v1/parent-children`, {
  method: 'POST',
  headers: { apikey: keys.anon, authorization: `Bearer ${parentToken}`, 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'create', username, nickname: 'بطل', password: childPassword }),
}).then((r) => r.json())
ok(!!created.student_id, `synthetic child created (${username})`)

const browser = await chromium.launch()
const failed = []
async function page(viewport) {
  const ctx = await browser.newContext({ viewport, locale: 'ar' })
  const p = await ctx.newPage()
  p.on('requestfailed', (r) => failed.push(r.url()))
  p.on('pageerror', (e) => failed.push(`pageerror ${e.message}`))
  return p
}

// 1. First screen is sign-in; no guest option; deep links are gated.
let p = await page({ width: 390, height: 844 })
await p.goto(APP)
await p.getByRole('heading', { name: 'تسجيل الدخول' }).waitFor()
ok(true, 'sign-in is the first screen')
ok((await p.getByText('ضيف').count()) === 0, 'no guest option anywhere')
for (const hash of ['#/lobby', '#/shop', '#/quiz/x/y/1', '#/parent', '#/admin']) {
  await p.goto(`${APP}${hash}`)
  await p.getByRole('heading', { name: 'تسجيل الدخول' }).waitFor()
  ok((await p.locator('.lobby, .shop, .quiz, .parent, .admin').count()) === 0, `direct link ${hash} shows sign-in`)
}
ok((await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), 'no horizontal scroll on sign-in (390px)')
if (SHOTS) await p.screenshot({ path: `${SHOTS}/auth-390.png` })

// 2. Audio settings open from the floating button and persist.
await p.getByRole('button', { name: /إعدادات الصوت/ }).click()
await p.getByRole('switch', { name: 'كتم كل الأصوات' }).click()
ok((await p.getByRole('switch', { name: 'كتم كل الأصوات' }).getAttribute('aria-checked')) === 'true', 'master mute toggles')
await p.getByRole('button', { name: 'رجوع' }).click()
await p.reload()
ok((await p.getByRole('button', { name: /الصوت مكتوم/ }).count()) === 1, 'mute persists after reload')
await p.getByRole('button', { name: /إعدادات الصوت/ }).click()
await p.getByRole('switch', { name: 'كتم كل الأصوات' }).click()
await p.getByRole('button', { name: 'رجوع' }).click()

// 3. Student signs in → lobby (with audio unlocked by the tap), deep link kept.
await p.goto(`${APP}#/shop`)
await p.getByLabel('اسم الدخول').fill(username)
await p.getByLabel('كلمة المرور').fill(childPassword)
await p.getByRole('button', { name: 'دخول' }).click()
await p.waitForFunction(() => location.hash === '#/shop' || location.hash === '#/lobby', null, { timeout: 15000 })
ok(true, `student lands in the game (${await p.evaluate(() => location.hash)})`)
await p.goto(`${APP}#/admin`)
await p.waitForTimeout(800)
ok((await p.locator('.admin').count()) === 0, 'student cannot open the admin area')
const audioState = await p.evaluate(() => (window.AudioContext ? 'available' : 'none'))
ok(audioState === 'available', 'Web Audio available')
await p.reload()
await p.waitForTimeout(1500)
ok(!(await p.getByRole('heading', { name: 'تسجيل الدخول' }).count()), 'session persists after reload')
await p.goto(`${APP}#/account`)
await p.getByRole('button', { name: 'تسجيل الخروج' }).click()
await p.getByRole('heading', { name: 'تسجيل الدخول' }).waitFor()
ok(true, 'logout returns to sign-in')

// 4. Parent and admin are routed to their own areas.
for (const [email, pw, area] of [
  ['parent.one@example.test', 'parent-pass-1', 'parent'],
  ['admin.owner@example.test', 'admin-pass-1', 'admin'],
]) {
  p = await page({ width: 1194, height: 834 })
  await p.goto(`${APP}#/lobby`)
  await p.getByRole('tab', { name: /ولي الأمر/ }).click()
  await p.getByLabel('البريد الإلكتروني').fill(email)
  await p.getByLabel('كلمة المرور').fill(pw)
  await p.getByRole('button', { name: 'دخول' }).click()
  await p.waitForFunction((a) => location.hash.startsWith(`#/${a}`), area, { timeout: 15000 })
  ok(true, `${area} routed to #/${area}`)
  await p.goto(`${APP}#/lobby`)
  await p.waitForFunction((a) => location.hash.startsWith(`#/${a}`), area, { timeout: 15000 })
  ok(true, `${area} cannot enter the student game`)
}
ok(failed.filter((u) => !/favicon/.test(u)).length === 0, `no failed requests or page errors ${failed.join(' ')}`)
await browser.close()
console.log(failures ? `${failures} FAILED` : 'ALL PASSED')
process.exit(failures ? 1 : 0)
