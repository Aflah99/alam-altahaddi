// Live-site check (GitHub Pages + real Supabase) at phone, tablet and desktop sizes, with synthetic accounts only.
//   CREDS=creds.json SHOTS=dir node scripts/e2e/live-check.mjs
import { chromium, devices } from 'playwright'
import fs from 'node:fs'

const APP = process.env.APP ?? 'https://aflah99.github.io/alam-altahaddi/'
const creds = JSON.parse(fs.readFileSync(process.env.CREDS, 'utf8'))
const SHOTS = process.env.SHOTS ?? ''
let failures = 0
const ok = (c, m) => (console.log(`${c ? 'PASS' : 'FAIL'} ${m}`), c || failures++)
const browser = await chromium.launch()
const sizes = [
  ['iPhone SE', { ...devices['iPhone SE'] }],
  ['iPhone 14', { ...devices['iPhone 14'] }],
  ['iPad', { ...devices['iPad (gen 7)'] }],
  ['iPad landscape', { ...devices['iPad (gen 7) landscape'] }],
  ['desktop', { viewport: { width: 1366, height: 800 } }],
]
for (const [i, [name, dev]] of sizes.entries()) {
  const ctx = await browser.newContext({ ...dev, locale: 'ar' })
  const p = await ctx.newPage()
  const bad = []
  p.on('requestfailed', (r) => bad.push(`${r.url()} ${r.failure()?.errorText}`))
  p.on('response', (r) => r.status() >= 400 && !/auth\/v1\/token/.test(r.url()) && bad.push(`${r.status()} ${r.url()}`))
  p.on('pageerror', (e) => bad.push(`pageerror ${e.message}`))
  const noScroll = () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  await p.goto(APP)
  await p.getByRole('heading', { name: 'تسجيل الدخول' }).waitFor({ timeout: 20000 })
  const rtl = await p.evaluate(() => document.documentElement.dir === 'rtl' && document.documentElement.lang.startsWith('ar'))
  const cairo = await p.evaluate(async () => (await document.fonts.ready, [...document.fonts].some((f) => /Cairo/i.test(f.family) && f.status === 'loaded')))
  ok(rtl && cairo && (await noScroll()) && (await p.getByText('ضيف').count()) === 0, `${name}: sign-in first, RTL, Cairo loaded, no guest, no horizontal scroll`)
  if (SHOTS && i % 2 === 0) await p.screenshot({ path: `${SHOTS}/live-auth-${i}.png` })
  // Student journey
  await p.getByLabel('اسم الدخول').fill(creds.kids[10 + i])
  await p.getByLabel('كلمة المرور').fill(creds.password)
  await p.getByRole('button', { name: 'دخول' }).click()
  await p.waitForFunction(() => location.hash === '#/lobby', null, { timeout: 20000 })
  await p.locator('.lobby__hero').waitFor()
  ok(await noScroll(), `${name}: lobby`)
  if (SHOTS && i % 2 === 0) await p.screenshot({ path: `${SHOTS}/live-lobby-${i}.png` })
  for (const [hash, sel, label] of [
    ['#/character', '.avatar__preview', 'avatar editor'],
    ['#/shop/packages', '.pkgs__card', 'surprise packages'],
    ['#/shop/cape', '.shopx__card', 'shop'],
    ['#/locker', '.shopx__preview', 'locker'],
    ['#/rooms', '.mp__modes', 'challenge rooms'],
    ['#/map', '.amap__hero, .amap', 'adventure map'],
  ]) {
    await p.goto(`${APP}${hash}`)
    await p.locator(sel).first().waitFor({ timeout: 20000 })
    ok(await noScroll(), `${name}: ${label}`)
    if (SHOTS && i === 1) await p.screenshot({ path: `${SHOTS}/live-${label.replace(/\s/g, '-')}.png` })
  }
  ok(bad.length === 0, `${name}: no failed requests or page errors ${bad.slice(0, 3).join(' | ')}`)
  await ctx.close()
}
// Parent and admin areas on a tablet
for (const [email, area, sel] of [
  [creds.kidsParent.email, 'parent', '[data-testid="child-controls"], .area__h1'],
  [creds.admin.email, 'admin', '.area__h1'],
]) {
  const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], locale: 'ar' })
  const p = await ctx.newPage()
  await p.goto(APP)
  await p.getByRole('tab', { name: /ولي الأمر/ }).click()
  await p.getByLabel('البريد الإلكتروني').fill(email)
  await p.getByLabel('كلمة المرور').fill(creds.password)
  await p.getByRole('button', { name: 'دخول' }).click()
  await p.waitForFunction((a) => location.hash.startsWith(`#/${a}`), area, { timeout: 20000 })
  if (area === 'admin') {
    await p.goto(`${APP}#/admin/economy`)
    await p.getByRole('heading', { name: 'الاقتصاد والصناديق' }).waitFor({ timeout: 20000 })
  } else {
    await p.goto(`${APP}#/parent/results`)
    await p.locator(sel).first().waitFor({ timeout: 20000 })
  }
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${area} area works on iPad`)
  await ctx.close()
}
await browser.close()
console.log(failures ? `${failures} FAILED` : 'ALL PASSED')
process.exit(failures ? 1 : 0)
