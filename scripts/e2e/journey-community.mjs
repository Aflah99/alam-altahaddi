// Browser journey (LOCAL test stack only): a parent creates a community course through the UI, bulk-pastes questions,
// publishes; a student of another family finds it in اكتشف المواد, enrols, plays it and sees the labelled world.
// Usage: APP=http://localhost:4174/alam-altahaddi/ API=http://localhost:54321 SHOTS=dir node scripts/e2e/journey-community.mjs
import { chromium } from 'playwright'

const APP = process.env.APP ?? 'http://localhost:4174/alam-altahaddi/'
const API = process.env.API ?? 'http://localhost:54321'
const SHOTS = process.env.SHOTS ?? ''
let failures = 0
const ok = (c, m) => (console.log(`${c ? 'PASS' : 'FAIL'} ${m}`), c || failures++)
const keys = await (await fetch(`${API}/__keys`)).json()
const token = async (email, password) =>
  (await (await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: keys.anon, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).access_token
const t2 = await token('parent.two@example.test', 'parent-pass-2')
const username = `cm${Date.now().toString(36).slice(-6)}`
const pw = 'Kid-pass-123!'
const kid = await fetch(`${API}/functions/v1/parent-children`, {
  method: 'POST', headers: { apikey: keys.anon, authorization: `Bearer ${t2}`, 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'create', username, nickname: 'مستكشف', password: pw }),
}).then((r) => r.json())
ok(!!kid.student_id, 'student of another family created')

const browser = await chromium.launch()
const bad = []
async function open(viewport) {
  const ctx = await browser.newContext({ viewport, locale: 'ar', permissions: ['clipboard-read', 'clipboard-write'] })
  const p = await ctx.newPage()
  p.on('requestfailed', (r) => bad.push(`failed ${r.url()}`))
  p.on('response', async (r) => { if (r.status() >= 400 && /rpc/.test(r.url())) console.log('RPC ERROR', r.url().split('/').pop(), (await r.text().catch(() => '')).slice(0, 300)) })
  p.on('pageerror', (e) => bad.push(`pageerror ${e.message}`))
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && bad.push(`console ${m.text()}`))
  return p
}
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
const shot = async (p, n) => SHOTS && (await p.screenshot({ path: `${SHOTS}/${n}.png` }))

// ---------- parent: create, paste, publish ----------
let p = await open({ width: 390, height: 844 })
await p.goto(APP)
await p.getByRole('tab', { name: /ولي الأمر/ }).click()
await p.getByLabel('البريد الإلكتروني').fill('parent.one@example.test')
await p.getByLabel('كلمة المرور').fill('parent-pass-1')
await p.getByRole('button', { name: 'دخول' }).click()
await p.waitForURL(/#\/parent/)
await p.goto(`${APP}#/parent/courses`)
await p.getByRole('heading', { name: 'إنشاء مادة تعليمية' }).waitFor()
await p.getByTestId('new-course').click()
const courseName = `علوم الفضاء ${Date.now().toString(36).slice(-4)}`
await p.getByLabel('اسم المادة').fill(courseName)
await p.getByLabel('وصف قصير').fill('أسئلة عن الكواكب والنجوم للصف الثامن')
await p.getByLabel('التصنيف').selectOption('علوم')
await p.getByRole('button', { name: 'إنشاء المادة' }).click()
await p.getByRole('tab', { name: 'المحتوى' }).waitFor()
ok(true, 'course created in the UI')
await p.getByTestId('new-unit').fill('المجموعة الشمسية')
await p.getByRole('button', { name: '+ إضافة وحدة' }).click()
await p.getByPlaceholder('عنوان درس جديد').fill('الكواكب')
await p.getByRole('button', { name: '+ إضافة درس' }).click()
await p.getByRole('button', { name: /الدرس 1: الكواكب/ }).waitFor()
ok(true, 'unit and lesson added')

// manual MCQ
await p.getByTestId('add-question').click()
await p.getByLabel('نص السؤال').fill('ما أكبر كواكب المجموعة الشمسية؟')
const opts = ['عطارد', 'المشتري', 'الأرض', 'المريخ']
for (const [i, l] of ['أ', 'ب', 'ج', 'د'].entries()) await p.getByLabel(`الخيار ${l}`).fill(opts[i])
await p.getByLabel('الإجابة الصحيحة ب').check()
await p.getByRole('button', { name: 'حفظ السؤال' }).click()
await p.getByText('ما أكبر كواكب المجموعة الشمسية؟').waitFor()
ok(true, 'manual MCQ saved')

// bulk paste with one malformed question and one duplicate
await p.getByTestId('open-bulk').click()
await p.getByTestId('copy-prompt').click()
await p.getByText('نُسخت التعليمات').waitFor()
const clip = await p.evaluate(() => navigator.clipboard.readText())
ok(clip.includes('الإجابة الصحيحة') && clip.includes('لا تضف معلومات') && clip.includes('للمراجعة:'), 'external-AI prompt copied to the clipboard')
await p.getByText(/راجع الأسئلة التي ينتجها أي أداة/).waitFor()
const paste = `بالتأكيد! هذه الأسئلة:

الوحدة: المجموعة الشمسية
الدرس: الكواكب

السؤال 1: ما أقرب كوكب إلى الشمس؟
أ: عطارد
ب: الزهرة
ج: الأرض
د: المريخ
الإجابة الصحيحة: أ

السؤال 2: كم عدد كواكب المجموعة الشمسية؟
أ: سبعة
ب: ثمانية
ج: تسعة
د: عشرة
الإجابة الصحيحة: ب

السؤال 3: ما اسم الكوكب الأحمر؟
أ: الزهرة
ب: زحل
ج: المريخ
د: نبتون

السؤال 4: ما أكبر كواكب المجموعة الشمسية؟
أ: عطارد
ب: المشتري
ج: الأرض
د: المريخ
الإجابة الصحيحة: ب

السؤال 5: اكتب اسم الكوكب الذي له حلقات واضحة.
النوع: كتابي
الإجابة النموذجية: زحل

السؤال 6: ما الكوكب الأقرب إلينا؟
أ: الزهرة
ب: المشتري
ج: نبتون
د: أورانوس
الإجابة الصحيحة: أ

السؤال 7: أي الكواكب غازي؟
أ: المشتري
ب: الأرض
ج: المريخ
د: عطارد
الإجابة الصحيحة: أ`
await p.getByTestId('paste-box').fill(paste)
await p.getByTestId('analyse').click()
await p.getByTestId('parse-summary').waitFor()
const summary = await p.getByTestId('parse-summary').innerText()
ok(/7 سؤالًا/.test(summary) && /6 صالح/.test(summary) && /1 فيه أخطاء/.test(summary), `parse summary shows counts (${summary.replace(/\s+/g, ' ')})`)
ok((await p.getByText('الإجابة الصحيحة غير مذكورة.').count()) === 1, 'missing correct answer highlighted (not guessed)')
ok((await p.getByText('يوجد سؤال بالنص نفسه في هذه المادة').count()) === 1, 'duplicate of an existing question flagged')
await shot(p, 'bulk-390')
ok(await noScroll(p), 'no horizontal scroll in the bulk preview (390px)')
// fix the malformed question in the editable preview
const row3 = p.getByTestId('preview-row').nth(2)
await row3.getByRole('button', { name: 'تعديل' }).click()
await row3.getByLabel('الإجابة الصحيحة ج').check()
ok((await row3.getByText('الإجابة الصحيحة غير مذكورة.').count()) === 0, 'error clears after the parent fixes it')
await p.getByTestId('do-import').click()
await p.getByTestId('import-result').waitFor({ timeout: 8000 }).catch(async () => { console.log('IMPORT MESSAGES:', await p.locator('.area__error, .area__ok').allInnerTexts()); throw new Error('import failed') })
const result = await p.getByTestId('import-result').innerText()
ok(/استيراد 6 سؤالًا/.test(result), `import result: ${result}`)
await p.getByRole('button', { name: 'تم' }).click()

// publish
await p.getByRole('tab', { name: 'النشر والمشاركة' }).click()
await p.getByText('✓ المادة جاهزة للنشر.').waitFor()
await shot(p, 'publish-390')
await p.getByTestId('publish').click()
await p.getByText(/تم النشر! تظهر المادة الآن/).waitFor()
ok(true, 'published immediately, no approval step')
await p.getByRole('tab', { name: 'معاينة' }).click()
await p.getByText('مادة مجتمعية · أنشأها ولي أمر').waitFor()
await shot(p, 'preview-390')
// unsaved-work protection on the info tab
await p.getByRole('tab', { name: 'معلومات المادة' }).click()
await p.getByLabel('اسم المادة').fill(courseName + ' تعديل')
let dialog = null
p.once('dialog', (d) => { dialog = d.message(); void d.dismiss() })
await p.getByRole('tab', { name: 'المحتوى' }).click()
await p.waitForTimeout(200)
ok(!!dialog && /غير محفوظة/.test(dialog), 'leaving with unsaved changes asks for confirmation')
await p.close()

// ---------- student of another family ----------
for (const [vp, name] of [[{ width: 390, height: 844 }, 'iphone'], [{ width: 768, height: 1024 }, 'ipad']]) {
  p = await open(vp)
  await p.goto(APP)
  await p.getByLabel('اسم الدخول').fill(username)
  await p.getByLabel('كلمة المرور').fill(pw)
  await p.getByRole('button', { name: 'دخول' }).click()
  await p.waitForFunction(() => location.hash === '#/lobby', null, { timeout: 15000 })
  await p.getByRole('button', { name: /المواد المجتمعية/ }).click()
  await p.getByRole('heading', { name: 'اكتشف المواد' }).waitFor()
  await p.getByTestId('search').fill('الفضاء')
  await p.getByTestId('course-card').filter({ hasText: courseName }).first().waitFor()
  ok(true, `[${name}] the new public course is searchable immediately`)
  ok((await p.getByText('مادة مجتمعية · أنشأها').count()) > 0 && (await p.getByText(/لم تُراجع رسميًا/).count()) > 0, `[${name}] labelled as parent-created and unverified`)
  ok(!(await p.content()).includes('@'), `[${name}] no email addresses on the page`)
  await shot(p, `discover-${name}`)
  ok(await noScroll(p), `[${name}] no horizontal scroll in اكتشف المواد`)
  if (name === 'iphone') {
    const card = p.getByTestId('course-card').filter({ hasText: courseName }).first()
    ok(/7 سؤالًا/.test(await card.innerText()), 'card shows question count (7: one manual + six imported)')
    await card.getByTestId('enroll').click()
    await card.getByTestId('play').waitFor()
    ok(true, 'enrolled directly (no approval)')
    await card.getByRole('button', { name: 'إضافة إلى المفضّلة' }).click()
    await card.getByRole('button', { name: 'إزالة من المفضّلة' }).waitFor()
    ok(true, 'favourite saved')
    await card.getByRole('button', { name: 'الإبلاغ عن المحتوى' }).click()
    await p.getByRole('dialog').getByText('محتوى غير مناسب').click()
    await p.getByRole('button', { name: 'إرسال البلاغ' }).click()
    await p.getByText('وصل بلاغك إلى الإدارة').waitFor()
    ok(true, 'content report sent')
    await card.getByTestId('play').click()
    await p.waitForURL(/#\/world\/c-/)
    await shot(p, 'world-community-iphone')
    // chapters → mission
    await p.goto(`${APP}#/map`)
    await p.getByRole('button', { name: new RegExp(`${courseName}.*مجتمعية`) }).click()
    await p.getByText(/مادة مجتمعية · أنشأها/).waitFor()
    ok(true, 'community course appears on the adventure map, labelled, and official portals stay')
    await shot(p, 'map-iphone')
  }
  await p.close()
}

// play through the normal chapters → mission flow
p = await open({ width: 390, height: 844 })
await p.goto(APP)
await p.getByLabel('اسم الدخول').fill(username)
await p.getByLabel('كلمة المرور').fill(pw)
await p.getByRole('button', { name: 'دخول' }).click()
await p.waitForFunction(() => location.hash === '#/lobby', null, { timeout: 15000 })
await p.goto(`${APP}#/discover`)
await p.getByRole('tab', { name: 'موادي' }).click()
await p.getByTestId('course-card').filter({ hasText: courseName }).getByTestId('play').click()
await p.waitForURL(/#\/world\/c-/)
const slugUrl = p.url().split('#/world/')[1]
await p.goto(`${APP}#/world/${slugUrl}/chapters`)
await p.getByText(/مادة مجتمعية أنشأها/).waitFor()
ok(true, 'lesson screen explains the course is community-made and unverified')
await shot(p, 'chapters-390')
await browser.close()
console.log(bad.length ? `NOTE page issues: ${[...new Set(bad)].join(' | ')}` : 'no page errors or failed requests')
ok(bad.length === 0, 'no failed requests or page errors')
console.log(failures ? `${failures} FAILED` : 'ALL PASSED')
process.exit(failures ? 1 : 0)
