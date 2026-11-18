// Browser journey: human avatar editor, shop, surprise packages, duplicates, upgrades (local test stack only).
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
const username = `eco${Date.now().toString(36).slice(-6)}`
const pw = 'Kid-pass-123!'
const kid = await fetch(`${API}/functions/v1/parent-children`, {
  method: 'POST', headers: { apikey: keys.anon, authorization: `Bearer ${tok.access_token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'create', username, nickname: 'نجمة', password: pw, character_id: 'human-girl' }),
}).then((r) => r.json())
ok(!!kid.student_id, 'synthetic child created')
// Test-only funding (simulates coins earned from questions) and points.
await db.query(`insert into public.reward_transactions (student_id, kind, ref, xp, coins) values ($1, 'question', 'e2e-seed', 50, 900)`, [kid.student_id])
await db.query(`insert into public.upgrade_point_ledger (student_id, kind, ref, points) values ($1, 'package', 'e2e-seed', 100)`, [kid.student_id])

const browser = await chromium.launch()
const errors = []
for (const vp of [{ width: 390, height: 844 }, { width: 1194, height: 834 }]) {
  const p = await (await browser.newContext({ viewport: vp, locale: 'ar' })).newPage()
  p.on('pageerror', (e) => errors.push(e.message))
  const tag = vp.width
  await p.goto(APP)
  await p.getByLabel('اسم الدخول').fill(username)
  await p.getByLabel('كلمة المرور').fill(pw)
  await p.getByRole('button', { name: 'دخول' }).click()
  await p.waitForFunction(() => location.hash === '#/lobby', null, { timeout: 15000 })
  const noScroll = () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  ok(await noScroll(), `${tag}: lobby without horizontal scroll`)
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/lobby-${tag}.png` })

  // Avatar editor
  await p.goto(`${APP}#/character`)
  await p.getByRole('heading', { name: 'تصميم شخصيتك' }).waitFor()
  await p.getByRole('tab', { name: 'الملابس' }).click()
  await p.getByRole('button', { name: /صيني خيالي/ }).click()
  await p.getByRole('tab', { name: /الشعر/ }).click()
  ok((await p.getByRole('button', { name: 'بحجاب' }).getAttribute('aria-pressed')) === 'true', `${tag}: female avatar defaults to hijab`)
  await p.getByRole('button', { name: 'بنفسجي' }).click()
  ok(await noScroll(), `${tag}: editor without horizontal scroll`)
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/avatar-${tag}.png` })
  await p.getByRole('button', { name: 'حفظ والعودة إلى الساحة' }).click()
  await p.waitForFunction(() => location.hash === '#/lobby')
  await p.waitForTimeout(800)
  const { rows: [st] } = await db.query(`select character_id, appearance from public.student_profiles where id = $1`, [kid.student_id])
  ok(st.character_id === 'human-girl' && st.appearance.theme === 'chinese' && st.appearance.hijab === true && st.appearance.hijabColor === 4, `${tag}: appearance saved on the server`)

  if (tag === 390) {
    // Shop purchase
    await p.goto(`${APP}#/shop/cape`)
    await p.getByRole('button', { name: /عباءة حمراء/ }).click()
    await p.getByRole('button', { name: 'شراء' }).click()
    await p.getByRole('button', { name: 'تأكيد الشراء' }).click()
    await p.getByRole('heading', { name: 'تم الشراء!' }).waitFor()
    ok(true, 'bought a cape in the shop')
    await p.getByRole('button', { name: 'الذهاب إلى الخزانة' }).click()
    // Packages
    await p.goto(`${APP}#/shop/packages`)
    await p.getByRole('heading', { name: 'علبة الأبطال' }).waitFor()
    ok((await p.getByText('٪').count()) === 0, 'odds hidden by default')
    await p.getByRole('button', { name: 'ماذا يوجد داخل الصناديق؟' }).click()
    await p.getByRole('button', { name: 'عرض الاحتمالات بالتفصيل' }).click()
    ok((await p.getByText('٪').count()) > 0, 'odds shown on request')
    await p.locator('.pkgs__card[data-package="heroes"] button').click()
    await p.getByRole('button', { name: 'افتح!' }).click()
    await p.getByRole('heading', { name: 'مكافآتك!' }).waitFor({ timeout: 15000 })
    await p.waitForTimeout(2500)
    ok((await p.locator('.reveal__item').count()) === 2, 'heroes package revealed two rewards')
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/package-${tag}.png` })
    const { rows: [o] } = await db.query(`select count(*)::int n from public.package_opens where student_id = $1`, [kid.student_id])
    ok(o.n === 1, 'one package open recorded on the server')
    await p.getByRole('button', { name: 'متابعة' }).click()
    // Locker: equip + upgrade
    await p.goto(`${APP}#/locker`)
    await p.getByRole('tab', { name: 'العباءات' }).click()
    await p.getByRole('button', { name: /عباءة حمراء/ }).first().click()
    await p.getByRole('button', { name: 'ارتداؤه' }).click()
    await p.getByRole('button', { name: 'ترقية إلى فضي' }).click()
    await p.getByText('أصبح «عباءة حمراء» فضي!').waitFor({ timeout: 10000 })
    const { rows: [t] } = await db.query(`select tier from public.inventory where student_id = $1 and item_id = 'cape-red'`, [kid.student_id])
    ok(t.tier === 2, 'upgrade to Silver committed on the server')
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/locker-${tag}.png` })
  }
}
ok(errors.length === 0, `no page errors ${errors.join(' | ')}`)
await browser.close()
await db.end()
console.log(failures ? `${failures} FAILED` : 'ALL PASSED')
process.exit(failures ? 1 : 0)
