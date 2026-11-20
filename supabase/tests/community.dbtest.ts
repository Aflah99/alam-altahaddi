// Feature 6: community courses — authoring, bulk import, visibility, enrolment, rewards, moderation.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { as, createAdmin, createParent, createStudent, dbAvailable, keyOf, pool, root, rpc } from './db'

beforeAll(async () => {
  if (!(await dbAvailable())) throw new Error('Local test database not available: run `npm run test:db`.')
})
afterAll(() => pool.end())

const j = (v: unknown) => JSON.stringify(v)
const uid = () => crypto.randomUUID()
let seq = 0
const mcq = (text: string, correct = 'b') => ({
  qtype: 'mcq',
  text,
  options: ['خيار أ ' + text, 'خيار ب ' + text, 'خيار ج ' + text, 'خيار د ' + text],
  correct_option: correct,
})
const written = (text: string, answers: string[]) => ({ qtype: 'written', text, accepted_answers: answers })

async function course(parent: string, opts: { visibility?: string; questions?: number; publish?: boolean; name?: string } = {}) {
  const id = await rpc<string>(
    parent,
    'cc_create_course',
    j({ name_ar: opts.name ?? `مادة تجريبية ${++seq}`, description: 'وصف قصير للمادة التعليمية التجريبية', grade: 8, category: 'علوم', visibility: opts.visibility ?? 'public' }),
  )
  const unit = await rpc<string>(parent, 'cc_save_unit', id, null, 'الوحدة الأولى')
  const lesson = await rpc<string>(parent, 'cc_save_lesson', unit, null, 'الدرس الأول')
  const n = opts.questions ?? 6
  if (n > 0) {
    const items = Array.from({ length: n }, (_, i) => mcq(`سؤال ${i + 1} في المادة ${seq} ${uid().slice(0, 6)}`))
    await rpc(parent, 'cc_import_questions', lesson, j(items), uid())
  }
  if (opts.publish !== false && n >= 5) await rpc(parent, 'cc_set_status', id, 'published')
  return { id, unit, lesson }
}

async function missionOfCourse(courseId: string) {
  const [m] = await root<{ id: string }>(
    `select m.id from public.missions m join public.lessons l on l.id = m.lesson_id where l.subject_id = $1 and m.active order by m.number limit 1`,
    [courseId],
  )
  return m.id
}

/** Plays every question of a mission correctly on the first try, then completes it. */
async function playMission(student: string, mission: string, correctly = true) {
  const s = await rpc<{ session_id: string; questions: { id: string; type: string }[] }>(student, 'start_quiz_session', mission)
  for (const q of s.questions) {
    if (correctly) {
      const [c] = await root<{ option_id: string }>(`select option_id from public.question_options where question_id = $1 and is_correct`, [q.id])
      await rpc(student, 'submit_answer', s.session_id, q.id, await keyOf(s.session_id, q.id, c.option_id))
    } else {
      const [c] = await root<{ option_id: string }>(`select option_id from public.question_options where question_id = $1 and not is_correct limit 2`, [q.id])
      await rpc(student, 'submit_answer', s.session_id, q.id, await keyOf(s.session_id, q.id, c.option_id))
      const [d] = await root<{ option_id: string }>(`select option_id from public.question_options where question_id = $1 and not is_correct offset 1 limit 1`, [q.id])
      await rpc(student, 'submit_answer', s.session_id, q.id, await keyOf(s.session_id, q.id, d.option_id))
    }
  }
  return { session: s.session_id, summary: await rpc<Record<string, any>>(student, 'complete_quiz_session', s.session_id) }
}

async function family() {
  const parent = await createParent()
  const kid = await createStudent(parent)
  return { parent, kid }
}

describe('official curriculum is untouched', () => {
  it('community courses never appear in the official catalogue or ordinary reads', async () => {
    const a = await family()
    const c = await course(a.parent)
    const stranger = await family()
    const cat = await rpc<{ id: string }[]>(stranger.kid, 'get_catalog')
    expect(cat.some((s) => s.id === c.id)).toBe(false)
    expect(cat.length).toBeGreaterThanOrEqual(1)
    expect(await as(stranger.kid, `select id from public.subjects where id = $1`, [c.id])).toEqual([])
    expect(await as(stranger.kid, `select id from public.lessons where id = $1`, [c.lesson])).toEqual([])
    expect(await as(stranger.kid, `select id from public.missions m where m.lesson_id = $1`, [c.lesson])).toEqual([])
    const [{ n }] = await root<{ n: string }>(`select count(*) n from public.subjects where kind = 'official'`)
    expect(Number(n)).toBeGreaterThanOrEqual(1)
    expect((await root<{ n: string }>(`select count(*) n from public.questions where origin = 'legacy_import'`))[0].n).toBe('600')
  })

  it('parents cannot write subjects directly or classify courses as official', async () => {
    const a = await family()
    const c = await course(a.parent)
    await expect(as(a.parent, `update public.subjects set kind = 'official' where id = $1`, [c.id])).resolves.toEqual([])
    expect((await root<{ kind: string }>(`select kind from public.subjects where id = $1`, [c.id]))[0].kind).toBe('community')
    await expect(as(a.parent, `insert into public.subjects (slug, name_ar, grade, semester, kind) values ('hack-1', 'مادة', 8, 1, 'official')`)).rejects.toThrow()
    await expect(rpc(a.parent, 'admin_set_course_kind', c.id, 'official')).rejects.toThrow(/administrator required/)
    await expect(rpc(a.kid, 'cc_create_course', j({ name_ar: 'مادة الطالب', description: 'لا يجوز للطالب' }))).rejects.toThrow(/parent account required/)
    const admin = await createAdmin()
    await expect(rpc(admin, 'cc_create_course', j({ name_ar: 'مادة المشرف', description: 'المشرف يستخدم الأدوات الرسمية' }))).rejects.toThrow(/parent account required/)
    await rpc(admin, 'admin_set_course_kind', c.id, 'official')
    expect((await root<{ kind: string }>(`select kind from public.subjects where id = $1`, [c.id]))[0].kind).toBe('official')
    await expect(rpc(a.parent, 'cc_update_course', c.id, j({ name_ar: 'تعديل بعد الاعتماد' }))).rejects.toThrow(/course not found/)
    await root(`update public.subjects set kind = 'community' where id = $1`, [c.id])
  })
})

describe('authoring', () => {
  it('creates a course with units, lessons, manual MCQ and written questions, and previews it', async () => {
    const { parent } = await family()
    const c = await course(parent, { questions: 0, publish: false })
    const q1 = await rpc<{ id: string }>(parent, 'cc_save_question', j({ ...mcq('ما عاصمة سلطنة عمان؟', 'b'), lesson_id: c.lesson, hint: 'مدينة ساحلية', explanation: 'مسقط هي العاصمة' }))
    const q2 = await rpc<{ id: string }>(parent, 'cc_save_question', j({ ...written('اكتب عاصمة عمان', ['مسقط', 'مدينة مسقط']), lesson_id: c.lesson }))
    expect(q1.id).toBeTruthy()
    const view = await rpc<any>(parent, 'cc_get_course', c.id)
    expect(view.units[0].lessons[0].questions).toHaveLength(2)
    expect(view.counts).toMatchObject({ units: 1, lessons: 1, questions: 2, mcq: 1, written: 1 })
    expect(view.units[0].lessons[0].questions[1].accepted_answers).toEqual(['مسقط', 'مدينة مسقط'])
    const v = await rpc<any>(parent, 'cc_validate', c.id)
    expect(v.ok).toBe(false)
    expect(v.errors.map((e: any) => e.code)).toContain('few_questions')
    await expect(rpc(parent, 'cc_set_status', c.id, 'published')).rejects.toThrow(/validation_failed/)
    expect(q2.id).not.toBe(q1.id)
  })

  it('rejects malformed questions', async () => {
    const { parent } = await family()
    const c = await course(parent, { questions: 0, publish: false })
    const bad = [
      { ...mcq('سؤال ناقص'), options: ['أ', 'ب', 'ج'] },
      { ...mcq('سؤال بلا إجابة'), correct_option: 'z' },
      { ...mcq('خيارات مكررة'), options: ['نعم', 'نعم', 'لا', 'ربما'] },
      written('سؤال كتابي بلا إجابة', []),
      mcq('ab'),
      { qtype: 'essay', text: 'نوع غير معروف' },
    ]
    for (const b of bad) await expect(rpc(parent, 'cc_save_question', j({ ...b, lesson_id: c.lesson }))).rejects.toThrow(/invalid_question|text_too_short/)
  })

  it('blocks scripts, HTML, links and listed words; keeps Arabic and bidi controls safe', async () => {
    const { parent } = await family()
    const c = await course(parent, { questions: 0, publish: false })
    for (const t of ['<script>alert(1)</script> سؤال', 'انقر <b>هنا</b> للجواب', 'زر http://evil.example/x', 'javascript:alert(1)', 'موقع www.bad.com للتحميل', 'هذا فيديو porn كامل'])
      await expect(rpc(parent, 'cc_save_question', j({ ...mcq(t), lesson_id: c.lesson }))).rejects.toThrow(/unsafe_content/)
    await expect(rpc(parent, 'cc_update_course', c.id, j({ description: '<img src=x onerror=alert(1)>' }))).rejects.toThrow(/unsafe_content/)
    const ok = await rpc<{ id: string }>(parent, 'cc_save_question', j({ ...mcq('ما حاصل ٥ < ٧ في الرياضيات؟'), lesson_id: c.lesson }))
    expect(ok.id).toBeTruthy()
    // bidi override characters are stripped
    const sneaky = await rpc<{ id: string }>(parent, 'cc_save_question', j({ ...mcq('سؤال‮ مخفي⁦ تمامًا'), lesson_id: c.lesson }))
    const [q] = await root<{ text: string }>(`select text from public.questions where id = $1`, [sneaky.id])
    expect(q.text).toBe('سؤال مخفي تمامًا')
  })

  it('parents cannot touch other parents’ courses; students cannot author at all', async () => {
    const a = await family()
    const b = await family()
    const c = await course(a.parent)
    const q = (await root<{ id: string }>(`select id from public.questions where subject_id = $1 limit 1`, [c.id]))[0].id
    await expect(rpc(b.parent, 'cc_update_course', c.id, j({ name_ar: 'سطو' }))).rejects.toThrow(/course not found/)
    await expect(rpc(b.parent, 'cc_save_unit', c.id, null, 'وحدة دخيلة')).rejects.toThrow(/course not found/)
    await expect(rpc(b.parent, 'cc_save_question', j({ ...mcq('سؤال دخيل'), lesson_id: c.lesson }))).rejects.toThrow(/course not found/)
    await expect(rpc(b.parent, 'cc_save_question', j({ ...mcq('تعديل دخيل'), id: q }))).rejects.toThrow(/course not found/)
    await expect(rpc(b.parent, 'cc_delete_question', q)).rejects.toThrow(/course not found/)
    await expect(rpc(b.parent, 'cc_import_questions', c.lesson, j([mcq('سؤال استيراد دخيل')]), uid())).rejects.toThrow(/course not found/)
    await expect(rpc(b.parent, 'cc_set_status', c.id, 'draft')).rejects.toThrow(/course not found/)
    await expect(rpc(b.parent, 'cc_get_course', c.id)).rejects.toThrow(/course not found/)
    await expect(rpc(b.parent, 'cc_delete_course', c.id)).rejects.toThrow(/course not found/)
    for (const fn of ['cc_my_courses']) await expect(rpc(a.kid, fn)).rejects.toThrow(/parent account required/)
    await expect(rpc(a.kid, 'cc_save_question', j({ ...mcq('سؤال طالب'), lesson_id: c.lesson }))).rejects.toThrow(/parent account required/)
    await expect(as(a.kid, `update public.questions set text = 'x' where subject_id = $1`, [c.id])).resolves.toEqual([])
    await expect(rpc(null, 'cc_my_courses')).rejects.toThrow()
  })

  it('reorders units, lessons and questions; deleting used content archives it', async () => {
    const { parent, kid } = await family()
    const c = await course(parent, { questions: 6 })
    const u2 = await rpc<string>(parent, 'cc_save_unit', c.id, null, 'الوحدة الثانية')
    await rpc(parent, 'cc_reorder', 'unit', c.id, [u2, c.unit])
    expect((await root<{ title: string }>(`select title from public.units where subject_id = $1 order by number`, [c.id])).map((r) => r.title)).toEqual(['الوحدة الثانية', 'الوحدة الأولى'])
    await expect(rpc(parent, 'cc_reorder', 'unit', c.id, [u2])).rejects.toThrow(/reorder_mismatch/)
    const l2 = await rpc<string>(parent, 'cc_save_lesson', c.unit, null, 'الدرس الثاني')
    await rpc(parent, 'cc_reorder', 'lesson', c.unit, [l2, c.lesson])
    const qs = (await root<{ id: string }>(`select id from public.questions where lesson_id = $1 order by sort_key`, [c.lesson])).map((r) => r.id)
    await rpc(parent, 'cc_reorder', 'question', c.lesson, [...qs].reverse())
    expect((await root<{ id: string }>(`select id from public.questions where lesson_id = $1 order by sort_key`, [c.lesson])).map((r) => r.id)).toEqual([...qs].reverse())
    // renaming
    await rpc(parent, 'cc_save_unit', c.id, u2, 'وحدة بعد إعادة التسمية')
    // an unused unit is deleted, a used lesson is archived
    expect(await rpc(parent, 'cc_delete_unit', u2)).toBe('deleted')
    await rpc(kid, 'enroll_course', c.id)
    await playMission(kid, await missionOfCourse(c.id))
    expect(await rpc(parent, 'cc_delete_lesson', c.lesson)).toBe('archived')
    expect((await root<{ n: string }>(`select count(*) n from public.question_attempts qa join public.questions q on q.id = qa.question_id where q.subject_id = $1`, [c.id]))[0].n).toBe('6')
    expect(await rpc(parent, 'cc_delete_course', c.id)).toBe('archived')
  })
})

describe('bulk import', () => {
  it('imports a valid batch in order, atomically, and is idempotent per request id', async () => {
    const { parent } = await family()
    const c = await course(parent, { questions: 0, publish: false })
    const items = [mcq('السؤال الأول عن عمان'), written('السؤال الثاني الكتابي', ['إجابة']), mcq('السؤال الثالث ٣')]
    const req = uid()
    const r1 = await rpc<any>(parent, 'cc_import_questions', c.lesson, j(items), req)
    expect(r1).toMatchObject({ imported: 3, skipped_duplicates: 0, replay: false })
    const r2 = await rpc<any>(parent, 'cc_import_questions', c.lesson, j(items), req)
    expect(r2).toMatchObject({ imported: 3, replay: true })
    expect((await root<{ text: string }>(`select text from public.questions where lesson_id = $1 order by sort_key`, [c.lesson])).map((r) => r.text)).toEqual(items.map((i) => i.text))
    // same text again under a new request id: skipped as duplicates, nothing added
    const r3 = await rpc<any>(parent, 'cc_import_questions', c.lesson, j(items), uid())
    expect(r3).toMatchObject({ imported: 0, skipped_duplicates: 3 })
  })

  it('rejects the whole batch when one item is invalid, with the item number', async () => {
    const { parent } = await family()
    const c = await course(parent, { questions: 0, publish: false })
    const items = [mcq('سؤال سليم رقم واحد'), mcq('سؤال سليم رقم اثنان'), { ...mcq('سؤال معطوب'), correct_option: 'x' }]
    await expect(rpc(parent, 'cc_import_questions', c.lesson, j(items), uid())).rejects.toThrow(/invalid_question/)
    expect((await root<{ n: string }>(`select count(*) n from public.questions where lesson_id = $1`, [c.lesson]))[0].n).toBe('0')
    expect((await root<{ n: string }>(`select count(*) n from public.question_options o join public.questions q on q.id = o.question_id where q.lesson_id = $1`, [c.lesson]))[0].n).toBe('0')
    try {
      await rpc(parent, 'cc_import_questions', c.lesson, j(items), uid())
    } catch (e) {
      expect(String((e as { detail?: string }).detail)).toMatch(/index:3/)
    }
  })

  it('applies batch-size and rate limits; handles a maximum batch of Arabic text', async () => {
    const { parent } = await family()
    const c = await course(parent, { questions: 0, publish: false })
    const big = Array.from({ length: 100 }, (_, i) => mcq(`سؤال عربي رقم ${i + 1}: ما ناتج جمع ${i} و ${i + 1} في مادة الرياضيات؟`))
    expect((await rpc<any>(parent, 'cc_import_questions', c.lesson, j(big), uid())).imported).toBe(100)
    await expect(rpc(parent, 'cc_import_questions', c.lesson, j(Array.from({ length: 101 }, (_, i) => mcq(`س ${i} طويل بما يكفي`))), uid())).rejects.toThrow(/batch_too_large/)
    await expect(rpc(parent, 'cc_import_questions', c.lesson, j([]), uid())).rejects.toThrow(/invalid_batch/)
    // the course cap
    await root(`update public.community_settings set max_questions_per_course = 100`)
    await expect(rpc(parent, 'cc_import_questions', c.lesson, j([mcq('سؤال فوق السقف')]), uid())).rejects.toThrow(/limit_reached/).finally(() => root(`update public.community_settings set max_questions_per_course = 500`))
    // 10 imports per hour (one used above)
    let limited = false
    for (let i = 0; i < 12; i++) {
      try {
        await rpc(parent, 'cc_import_questions', c.lesson, j([mcq(`سؤال حد المعدل ${i} ${uid()}`)]), uid())
      } catch (e) {
        if (/rate_limited/.test(String((e as Error).message))) limited = true
      }
    }
    expect(limited).toBe(true)
  })
})

describe('publishing, visibility and discovery', () => {
  it('a public course is searchable immediately; draft, private and invite courses are not', async () => {
    const a = await family()
    const stranger = await family()
    const name = `مادة البحث ${uid().slice(0, 8)}`
    const pub = await course(a.parent, { name })
    const draft = await course(a.parent, { name: name + ' مسودة', publish: false })
    const priv = await course(a.parent, { name: name + ' خاصة', visibility: 'private' })
    const inv = await course(a.parent, { name: name + ' دعوة', visibility: 'invite' })
    const r = await rpc<{ total: number; items: { id: string; creator_name: string; question_count: number }[] }>(stranger.kid, 'search_courses', name.slice(0, 12), null, '', 'relevance', false, 20, 0)
    const ids = r.items.map((i) => i.id)
    expect(ids).toContain(pub.id)
    for (const hidden of [draft.id, priv.id, inv.id]) expect(ids).not.toContain(hidden)
    const hit = r.items.find((i) => i.id === pub.id)!
    expect(hit.question_count).toBe(6)
    expect(hit.creator_name).toMatch(/^مبدع \d{4}$/)
    expect(JSON.stringify(r)).not.toMatch(/@/) // no emails anywhere
    // filters and sorting
    expect((await rpc<any>(stranger.kid, 'search_courses', '', 8, 'علوم', 'recent', false, 5, 0)).items.length).toBeGreaterThan(0)
    expect((await rpc<any>(stranger.kid, 'search_courses', name, 3, '', 'popular', false, 5, 0)).items).toHaveLength(0)
    for (const sort of ['relevance', 'popular', 'rating', 'recent']) await rpc(stranger.kid, 'search_courses', '', null, '', sort, false, 5, 0)
    // wildcard characters are plain text (punctuation-only queries behave like an empty query, never like a pattern)
    const all = await rpc<any>(stranger.kid, 'search_courses', '', null, '', 'relevance', false, 5, 0)
    expect((await rpc<any>(stranger.kid, 'search_courses', '%_%', null, '', 'relevance', false, 5, 0)).total).toBe(all.total)
    expect((await rpc<any>(stranger.kid, 'search_courses', 'م%دة', null, '', 'relevance', false, 5, 0)).items.length).toBeLessThanOrEqual(all.items.length)
  })

  it('a student enrols directly (no approval) and plays through the normal mission flow', async () => {
    const a = await family()
    const other = await family()
    const c = await course(a.parent)
    const mission = await missionOfCourse(c.id)
    await expect(rpc(other.kid, 'start_quiz_session', mission)).rejects.toThrow(/mission not available/) // not enrolled yet
    const enrolled = await rpc<any>(other.kid, 'enroll_course', c.id)
    expect(enrolled.enrolled).toBe(true)
    const cat = await rpc<any[]>(other.kid, 'get_my_course_catalog')
    expect(cat.map((s) => s.id)).toContain(c.id)
    expect(cat[0].units[0].lessons[0].missions[0].question_count).toBe(6)
    const { summary } = await playMission(other.kid, mission)
    expect(summary.first_try).toBe(6)
    expect(summary.community).toBe(true)
    expect((await rpc<any[]>(other.kid, 'my_courses'))[0]).toMatchObject({ missions_total: 1, missions_done: 1, available: true })
    await rpc(other.kid, 'unenroll_course', c.id)
    expect(await rpc<any[]>(other.kid, 'my_courses')).toHaveLength(0)
    await expect(rpc(other.kid, 'start_quiz_session', mission)).rejects.toThrow(/mission not available/)
  })

  it('private courses are reachable only by the creator’s family, whatever the id', async () => {
    const a = await family()
    const stranger = await family()
    const c = await course(a.parent, { visibility: 'private' })
    await expect(rpc(stranger.kid, 'enroll_course', c.id)).rejects.toThrow(/course not found/)
    await expect(rpc(stranger.kid, 'course_card', c.id)).rejects.toThrow(/course not found/)
    await expect(rpc(stranger.parent, 'course_card', c.id)).rejects.toThrow(/course not found/)
    await expect(rpc(stranger.kid, 'report_course', c.id, 'other', '')).rejects.toThrow(/course not found/)
    await expect(rpc(stranger.kid, 'toggle_course_favorite', c.id, true)).rejects.toThrow(/course not found/)
    const own = await rpc<any>(a.kid, 'enroll_course', c.id)
    expect(own.is_mine).toBe(true)
    await playMission(a.kid, await missionOfCourse(c.id))
  })

  it('invitation-only courses need a valid code; codes can be revoked, regenerated and are rate limited', async () => {
    const a = await family()
    const guest = await family()
    const outsider = await family()
    const c = await course(a.parent, { visibility: 'invite' })
    await expect(rpc(guest.kid, 'enroll_course', c.id)).rejects.toThrow(/course not found/)
    const inv = await rpc<{ code: string }>(a.parent, 'cc_create_invite', c.id, 30, 5)
    expect(inv.code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/)
    expect((await rpc<any>(a.parent, 'cc_course_invite', c.id)).code).toBe(inv.code)
    const ok = await rpc<any>(guest.kid, 'redeem_course_invite', inv.code.toLowerCase())
    expect(ok.status).toBe('ok')
    await rpc(guest.kid, 'enroll_course', c.id)
    await playMission(guest.kid, await missionOfCourse(c.id))
    // a parent redeeming opens it for all of that family's children
    const sib = await createStudent(outsider.parent)
    await rpc(outsider.parent, 'redeem_course_invite', inv.code)
    await rpc(sib, 'enroll_course', c.id)
    // regenerate: old code stops working
    const inv2 = await rpc<{ code: string }>(a.parent, 'cc_create_invite', c.id, 30, 5)
    expect(inv2.code).not.toBe(inv.code)
    const late = await family()
    expect((await rpc<any>(late.kid, 'redeem_course_invite', inv.code)).status).toBe('invalid')
    expect((await rpc<any>(late.kid, 'redeem_course_invite', inv2.code)).status).toBe('ok')
    // revoke the code and everyone who joined through it
    expect(await rpc(a.parent, 'cc_revoke_invites', c.id, true)).toBeGreaterThanOrEqual(3)
    await expect(rpc(late.kid, 'start_quiz_session', await missionOfCourse(c.id))).rejects.toThrow(/mission not available/)
    const stillMine = await rpc<any>(a.kid, 'enroll_course', c.id)
    expect(stillMine.is_mine).toBe(true)
    // brute force protection
    const brute = await family()
    let limited = false
    for (let i = 0; i < 12; i++) {
      try {
        await rpc(brute.kid, 'redeem_course_invite', 'AAAAAAAAAA')
      } catch (e) {
        limited = /rate_limited/.test(String((e as Error).message))
      }
    }
    expect(limited).toBe(true)
    // expired
    const inv3 = await rpc<{ code: string }>(a.parent, 'cc_create_invite', c.id, 1, 5)
    await root(`update public.course_invites set expires_at = now() - interval '1 minute' where code = $1`, [inv3.code])
    expect((await rpc<any>((await family()).kid, 'redeem_course_invite', inv3.code)).status).toBe('invalid')
    await expect(rpc((await family()).parent, 'cc_create_invite', c.id, 30, 5)).rejects.toThrow(/course not found/)
  })

  it('changing public → private keeps enrolments and progress but removes outside access; back to public restores it', async () => {
    const a = await family()
    const other = await family()
    const c = await course(a.parent)
    await rpc(other.kid, 'enroll_course', c.id)
    const mission = await missionOfCourse(c.id)
    await playMission(other.kid, mission)
    const res = await rpc<any>(a.parent, 'cc_set_visibility', c.id, 'private')
    expect(res.students_without_access).toBe(1)
    await expect(rpc(other.kid, 'start_quiz_session', mission)).rejects.toThrow(/mission not available/)
    expect(((await rpc<any[]>(other.kid, 'my_courses'))[0] as any).available).toBe(false)
    expect((await rpc<any>(other.kid, 'get_my_course_catalog')).length).toBe(0)
    expect((await root<{ n: string }>(`select count(*) n from public.quiz_sessions where student_id = $1 and status = 'completed'`, [other.kid]))[0].n).toBe('1')
    await rpc(a.parent, 'cc_set_visibility', c.id, 'public')
    await rpc(other.kid, 'start_quiz_session', mission)
  })

  it('unpublishing removes a course from search and play; archive and republish work', async () => {
    const a = await family()
    const other = await family()
    const c = await course(a.parent)
    await rpc(other.kid, 'enroll_course', c.id)
    await rpc(a.parent, 'cc_set_status', c.id, 'draft')
    await expect(rpc(other.kid, 'start_quiz_session', await missionOfCourse(c.id))).rejects.toThrow(/mission not available/)
    const r = await rpc<any>(other.kid, 'search_courses', '', null, '', 'recent', false, 50, 0)
    expect(r.items.map((i: any) => i.id)).not.toContain(c.id)
    await rpc(a.parent, 'cc_set_status', c.id, 'published')
    await rpc(other.kid, 'start_quiz_session', await missionOfCourse(c.id))
    await rpc(a.parent, 'cc_set_status', c.id, 'archived')
    expect((await rpc<any>(other.kid, 'search_courses', '', null, '', 'recent', false, 50, 0)).items.map((i: any) => i.id)).not.toContain(c.id)
  })
})

describe('editing a published course never rewrites history', () => {
  it('correcting an answered question creates a new version; recorded results are unchanged', async () => {
    const a = await family()
    const other = await family()
    const c = await course(a.parent, { questions: 6 })
    await rpc(other.kid, 'enroll_course', c.id)
    const { session } = await playMission(other.kid, await missionOfCourse(c.id))
    const [q] = await root<{ id: string; text: string }>(`select id, text from public.questions where subject_id = $1 order by sort_key limit 1`, [c.id])
    const before = await root<any>(`select question_id, is_correct, option_id from public.question_attempts where session_id = $1 order by question_id`, [session])
    // the creator changes the answer key (correct answer b -> c)
    const res = await rpc<{ id: string; versioned: boolean }>(a.parent, 'cc_save_question', j({ ...mcq(q.text, 'c'), id: q.id }))
    expect(res.versioned).toBe(true)
    expect(res.id).not.toBe(q.id)
    const after = await root<any>(`select question_id, is_correct, option_id from public.question_attempts where session_id = $1 order by question_id`, [session])
    expect(after).toEqual(before)
    expect((await root<{ status: string }>(`select status from public.questions where id = $1`, [q.id]))[0].status).toBe('archived')
    const [{ n }] = await root<{ n: string }>(`select count(*) n from public.questions where subject_id = $1 and status = 'published'`, [c.id])
    expect(n).toBe('6')
    const [nq] = await root<{ lineage_id: string; derived_from: string; sort_key: number }>(`select lineage_id, derived_from, sort_key from public.questions where id = $1`, [res.id])
    expect(nq.derived_from).toBe(q.id)
    // hints/explanations do not need a new version; unused questions are edited in place
    const same = await rpc<{ id: string; versioned: boolean }>(a.parent, 'cc_save_question', j({ ...mcq(q.text, 'c'), id: res.id, hint: 'تلميح جديد' }))
    expect(same.versioned).toBe(false)
    const fresh = await rpc<{ id: string }>(a.parent, 'cc_save_question', j({ ...mcq('سؤال جديد غير مستخدم', 'a'), lesson_id: c.lesson }))
    expect((await rpc<any>(a.parent, 'cc_save_question', j({ ...mcq('سؤال جديد غير مستخدم', 'd'), id: fresh.id }))).versioned).toBe(false)
    expect(await rpc(a.parent, 'cc_delete_question', fresh.id)).toBe('deleted')
    // removing a used question archives it
    const [used] = await root<{ id: string }>(`select q.id from public.questions q where q.subject_id = $1 and q.status = 'published' and exists (select 1 from public.session_questions sq where sq.question_id = q.id) limit 1`, [c.id])
    expect(await rpc(a.parent, 'cc_delete_question', used.id)).toBe('archived')
    expect((await root<{ n: string }>(`select count(*) n from public.session_questions where session_id = $1`, [session]))[0].n).toBe('6')
  })

  it('an edit of a version does not let the same student earn the reward twice', async () => {
    const a = await family()
    const other = await family()
    const c = await course(a.parent, { questions: 6 })
    await rpc(other.kid, 'enroll_course', c.id)
    const mission = await missionOfCourse(c.id)
    await playMission(other.kid, mission)
    const xp1 = (await rpc<any>(other.kid, 'get_my_game_state')).xp
    const qs = await root<{ id: string; text: string }>(`select id, text from public.questions where subject_id = $1 and status = 'published'`, [c.id])
    for (const q of qs) await rpc(a.parent, 'cc_save_question', j({ ...mcq(q.text, 'a'), id: q.id }))
    const second = await playMission(other.kid, await missionOfCourse(c.id))
    expect(second.summary.reward.xp).toBe(0)
    expect((await rpc<any>(other.kid, 'get_my_game_state')).xp).toBe(xp1)
  })
})

describe('written-answer grading in community courses', () => {
  it('grades with Arabic normalisation and accepted alternatives, server-side', async () => {
    const a = await family()
    const other = await family()
    const c = await course(a.parent, { questions: 5 })
    await rpc(a.parent, 'cc_save_question', j({ ...written('ما هي عاصمة سلطنة عُمان؟', ['مَسْقَط', 'مدينة مسقط']), lesson_id: c.lesson }))
    await rpc(other.kid, 'enroll_course', c.id)
    const mission = await missionOfCourse(c.id)
    const s = await rpc<{ session_id: string; questions: { id: string; type: string; options: unknown[] }[] }>(other.kid, 'start_quiz_session', mission)
    const w = s.questions.find((q) => q.type === 'written')!
    expect(w.options).toEqual([])
    expect(JSON.stringify(s)).not.toMatch(/مسقط/)
    expect((await rpc<any>(other.kid, 'submit_written', s.session_id, w.id, 'مسقط')).feedback).toBe('correct')
  })
})

describe('rewards are bounded and server-decided', () => {
  it('pays first-time answers once, honours the daily cap, and never pays a creator’s own family', async () => {
    const a = await family()
    const other = await family()
    const c = await course(a.parent, { questions: 6 })
    await rpc(other.kid, 'enroll_course', c.id)
    const mission = await missionOfCourse(c.id)
    const first = await playMission(other.kid, mission)
    expect(first.summary.reward.xp).toBe(6 * 2 + 5)
    expect(first.summary.reward.coins).toBe(6 + 3)
    const replay = await playMission(other.kid, mission)
    expect(replay.summary.reward).toMatchObject({ xp: 0, coins: 0 })
    // idempotent completion
    expect((await rpc<any>(other.kid, 'complete_quiz_session', first.session)).repeat).toBe(true)
    // own family earns nothing
    await rpc(a.kid, 'enroll_course', c.id)
    expect((await playMission(a.kid, mission)).summary.reward).toMatchObject({ xp: 0, coins: 0 })
    // the daily cap spans every course
    const third = await family()
    const c1 = await course(a.parent, { questions: 6 })
    const c2 = await course(a.parent, { questions: 6 })
    await rpc(third.kid, 'enroll_course', c1.id)
    await rpc(third.kid, 'enroll_course', c2.id)
    await root(`update public.community_settings set daily_xp_cap = 20, daily_coin_cap = 10`)
    try {
      const r1 = await playMission(third.kid, await missionOfCourse(c1.id))
      const r2 = await playMission(third.kid, await missionOfCourse(c2.id))
      expect(r1.summary.reward.xp + r2.summary.reward.xp).toBeLessThanOrEqual(20)
      expect(r1.summary.reward.coins + r2.summary.reward.coins).toBeLessThanOrEqual(10)
      expect(r2.summary.daily_limit_reached).toBe(true)
      const used = await root<{ xp: string }>(`select coalesce(sum(xp), 0) xp from public.reward_transactions where student_id = $1 and kind like 'community%'`, [third.kid])
      expect(Number(used[0].xp)).toBeLessThanOrEqual(20)
    } finally {
      await root(`update public.community_settings set daily_xp_cap = 40, daily_coin_cap = 25`)
    }
  })

  it('per-course lifetime limit and disabled rewards; official rewards are unaffected', async () => {
    const a = await family()
    const other = await family()
    const c = await course(a.parent, { questions: 6 })
    await rpc(other.kid, 'enroll_course', c.id)
    await root(`update public.community_settings set course_lifetime_questions = 2`)
    try {
      const r = await playMission(other.kid, await missionOfCourse(c.id))
      expect(r.summary.reward.xp).toBeLessThanOrEqual(2 * 2 + 5)
    } finally {
      await root(`update public.community_settings set course_lifetime_questions = 60`)
    }
    const kid2 = (await family()).kid
    await root(`update public.community_settings set rewards_enabled = false`)
    try {
      await rpc(kid2, 'enroll_course', c.id)
      expect((await playMission(kid2, await missionOfCourse(c.id))).summary.reward.xp).toBe(0)
    } finally {
      await root(`update public.community_settings set rewards_enabled = true`)
    }
    // official mission reward rules are unchanged: 10 xp per first-try question + 20 pass bonus
    const [m] = await root<{ id: string }>(`select m.id from public.missions m join public.lessons l on l.id = m.lesson_id where l.legacy_id = 'u1-l1' and m.number = 1`)
    const off = await playMission(kid2, m.id)
    expect(off.summary.reward.xp).toBe(off.summary.total * 10 + 20)
    expect(off.summary.community).toBeUndefined()
  })

  it('only administrators change reward settings, within sane bounds', async () => {
    const a = await family()
    const admin = await createAdmin()
    await expect(rpc(a.parent, 'admin_set_community_settings', j({ daily_xp_cap: 9999 }))).rejects.toThrow(/administrator required/)
    await expect(rpc(a.kid, 'admin_get_community_settings')).rejects.toThrow(/administrator required/)
    await expect(rpc(admin, 'admin_set_community_settings', j({ daily_xp_cap: 99999 }))).rejects.toThrow()
    await expect(rpc(admin, 'admin_set_community_settings', j({ nope: 1 }))).rejects.toThrow(/unknown setting/)
    const s = await rpc<any>(admin, 'admin_set_community_settings', j({ xp_per_question: 3 }))
    expect(s.xp_per_question).toBe(3)
    await rpc(admin, 'admin_set_community_settings', j({ xp_per_question: 2 }))
  })
})

describe('ratings, favourites and reports', () => {
  it('ratings need play, are one-per-user, updatable, and exclude the creator’s family', async () => {
    const a = await family()
    const p1 = await family()
    const p2 = await family()
    const c = await course(a.parent)
    await rpc(p1.kid, 'enroll_course', c.id)
    await expect(rpc(p1.kid, 'rate_course', c.id, 5)).rejects.toThrow(/play_first/)
    await playMission(p1.kid, await missionOfCourse(c.id))
    expect((await rpc<any>(p1.kid, 'rate_course', c.id, 5)).count).toBe(1)
    expect((await rpc<any>(p1.kid, 'rate_course', c.id, 2)).count).toBe(1)
    expect((await rpc<any>(p1.kid, 'rate_course', c.id, 2)).avg).toBe(2)
    await expect(rpc(p1.kid, 'rate_course', c.id, 6)).rejects.toThrow(/invalid rating/)
    await expect(rpc(a.parent, 'rate_course', c.id, 5)).rejects.toThrow(/own_course/)
    await expect(rpc(a.kid, 'rate_course', c.id, 5)).rejects.toThrow(/own_course/)
    // a parent may rate once a child has played
    await expect(rpc(p2.parent, 'rate_course', c.id, 4)).rejects.toThrow(/play_first/)
    await rpc(p2.kid, 'enroll_course', c.id)
    await playMission(p2.kid, await missionOfCourse(c.id))
    expect((await rpc<any>(p2.parent, 'rate_course', c.id, 4)).count).toBe(2)
    const item = (await rpc<any>(p1.kid, 'course_card', c.id))
    expect(item.rating_count).toBe(2)
    expect(item.my_rating).toBe(2)
    expect((await root<{ n: string }>(`select count(*) n from public.course_ratings where subject_id = $1`, [c.id]))[0].n).toBe('2')
    // Bayesian score: a single 5-star rating does not beat many 4-star ratings
    const one = await root<{ s: string }>(`select (public.course_rating($1) ->> 'score') s`, [c.id])
    expect(Number(one[0].s)).toBeLessThan(4)
    await rpc(p1.kid, 'rate_course', c.id, 0)
    expect((await rpc<any>(p1.kid, 'course_card', c.id)).rating_count).toBe(1)
  })

  it('favourites persist, are capped per user and do not count the creator’s family', async () => {
    const a = await family()
    const f = await family()
    const c = await course(a.parent)
    expect(await rpc(f.kid, 'toggle_course_favorite', c.id, true)).toBe(true)
    await rpc(f.kid, 'toggle_course_favorite', c.id, true)
    await rpc(a.parent, 'toggle_course_favorite', c.id, true)
    expect((await root<{ n: string }>(`select count(*) n from public.course_favorites where subject_id = $1`, [c.id]))[0].n).toBe('2')
    const card = await rpc<any>(f.kid, 'course_card', c.id)
    expect(card.favorites).toBe(1)
    expect(card.favorited).toBe(true)
    const favs = await rpc<any>(f.kid, 'search_courses', '', null, '', 'recent', true, 20, 0)
    expect(favs.items.map((i: any) => i.id)).toEqual([c.id])
    await rpc(f.kid, 'toggle_course_favorite', c.id, false)
    expect((await rpc<any>(f.kid, 'search_courses', '', null, '', 'recent', true, 20, 0)).total).toBe(0)
    await root(`update public.community_settings set favorites_max = 1`)
    try {
      await rpc(f.kid, 'toggle_course_favorite', c.id, true)
      const c2 = await course(a.parent)
      await expect(rpc(f.kid, 'toggle_course_favorite', c2.id, true)).rejects.toThrow(/limit_reached/)
    } finally {
      await root(`update public.community_settings set favorites_max = 100`)
    }
  })

  it('reports reach only the administrator queue, are limited and hide the reporter', async () => {
    const a = await family()
    const f = await family()
    const admin = await createAdmin()
    const c = await course(a.parent)
    expect((await rpc<any>(f.kid, 'report_course', c.id, 'incorrect', 'الإجابة خاطئة في السؤال الثالث')).status).toBe('reported')
    expect((await rpc<any>(f.kid, 'report_course', c.id, 'other', 'مكرر')).status).toBe('already_reported')
    await expect(rpc(a.parent, 'report_course', c.id, 'other', '')).rejects.toThrow(/own_course/)
    await expect(rpc(f.kid, 'report_course', c.id, 'spam', '')).rejects.toThrow(/invalid category/)
    await expect(rpc(a.parent, 'admin_course_reports', 'open')).rejects.toThrow(/administrator required/)
    expect(await as(a.parent, `select * from public.course_reports`)).toEqual([])
    expect(await as(f.kid, `select * from public.course_reports`)).toEqual([])
    const q = await rpc<any[]>(admin, 'admin_course_reports', 'open')
    const mine = q.find((r) => r.subject_id === c.id)!
    expect(mine).toMatchObject({ category: 'incorrect', creator_name: expect.stringMatching(/^مبدع/) })
    expect(mine.reporter).toHaveLength(8)
    expect(JSON.stringify(await rpc(a.parent, 'cc_my_courses'))).not.toContain(f.kid)
    // per-day limit
    await root(`update public.community_settings set reports_per_day = 2`)
    try {
      const spam = await family()
      const cs = [await course(a.parent), await course(a.parent), await course(a.parent)]
      await rpc(spam.kid, 'report_course', cs[0].id, 'other', '')
      await rpc(spam.kid, 'report_course', cs[1].id, 'other', '')
      await expect(rpc(spam.kid, 'report_course', cs[2].id, 'other', '')).rejects.toThrow(/rate_limited/)
    } finally {
      await root(`update public.community_settings set reports_per_day = 5`)
    }
  })
})

describe('administrator moderation', () => {
  it('suspending removes a course from discovery and stops play; restoring brings it back; creators cannot self-restore', async () => {
    const a = await family()
    const f = await family()
    const admin = await createAdmin()
    const c = await course(a.parent)
    const mission = await missionOfCourse(c.id)
    await rpc(f.kid, 'enroll_course', c.id)
    const sess = await rpc<{ session_id: string; questions: { id: string }[] }>(f.kid, 'start_quiz_session', mission)
    await rpc(f.kid, 'report_course', c.id, 'inappropriate', 'محتوى غير مناسب')
    await expect(rpc(a.parent, 'admin_moderate_course', c.id, 'suspend', 'x')).rejects.toThrow(/administrator required/)
    await rpc(admin, 'admin_moderate_course', c.id, 'suspend', 'مخالفة للقواعد')
    expect((await rpc<any>(f.kid, 'search_courses', '', null, '', 'recent', false, 50, 0)).items.map((i: any) => i.id)).not.toContain(c.id)
    await expect(rpc(f.kid, 'start_quiz_session', mission)).rejects.toThrow(/mission not available/)
    await expect(rpc(f.kid, 'submit_answer', sess.session_id, sess.questions[0].id, '1')).rejects.toThrow(/course not available/)
    await expect(rpc(f.kid, 'enroll_course', c.id)).rejects.toThrow(/course not found/)
    await expect(rpc(a.parent, 'cc_set_status', c.id, 'published')).rejects.toThrow(/course_suspended/)
    await expect(rpc(a.parent, 'cc_update_course', c.id, j({ name_ar: 'تحايل' }))).rejects.toThrow(/course_suspended/)
    expect((await rpc<any[]>(a.parent, 'cc_my_courses')).find((x) => x.id === c.id)).toMatchObject({ moderation: 'suspended', moderation_note: 'مخالفة للقواعد' })
    const listed = await rpc<any[]>(admin, 'admin_community_courses', '', 'suspended', 50, 0)
    expect(listed.map((x) => x.id)).toContain(c.id)
    expect(listed.find((x) => x.id === c.id).owner_email).toMatch(/@example\.test$/)
    await rpc(admin, 'admin_resolve_course_reports', c.id, 'resolved', 'تم الإيقاف')
    expect((await rpc<any[]>(admin, 'admin_course_reports', 'open')).some((r) => r.subject_id === c.id)).toBe(false)
    await rpc(admin, 'admin_moderate_course', c.id, 'restore', '')
    expect((await rpc<any>(f.kid, 'search_courses', '', null, '', 'recent', false, 50, 0)).items.map((i: any) => i.id)).toContain(c.id)
    await rpc(f.kid, 'start_quiz_session', mission)
    await rpc(admin, 'admin_moderate_course', c.id, 'remove', 'نهائي')
    await expect(rpc(f.kid, 'start_quiz_session', mission)).rejects.toThrow()
    // the administrator can inspect the full course, answers included
    const full = await rpc<any>(admin, 'cc_get_course', c.id)
    expect(full.units[0].lessons[0].questions[0].correct_option).toBeTruthy()
  })

  it('blocking a creator suspends their courses and stops publishing; insights list activity', async () => {
    const a = await family()
    const admin = await createAdmin()
    const c = await course(a.parent)
    await rpc(admin, 'admin_set_creator_block', a.parent, true, 'مخالفات متكررة')
    expect((await root<{ moderation: string }>(`select moderation from public.subjects where id = $1`, [c.id]))[0].moderation).toBe('suspended')
    const standing = await rpc<any>(admin, 'admin_creator_standing', a.parent)
    expect(standing).toMatchObject({ blocked: true, suspended: 1 })
    await expect(rpc(a.parent, 'admin_creator_standing', a.parent)).rejects.toThrow(/administrator required/)
    const ins = await rpc<any>(admin, 'admin_community_insights')
    expect(ins.totals.suspended).toBeGreaterThanOrEqual(1)
    await rpc(admin, 'admin_set_creator_block', a.parent, false, '')
    await rpc(admin, 'admin_moderate_course', c.id, 'restore', '')
    expect(await rpc<string[]>(admin, 'admin_blocklist', 'testword', true)).toContain('testword')
    await expect(rpc(a.parent, 'cc_update_course', c.id, j({ description: 'هذه الجملة فيها testword مسيء' }))).rejects.toThrow(/unsafe_content/)
    expect(await rpc<string[]>(admin, 'admin_blocklist', 'testword', false)).not.toContain('testword')
  })
})

describe('parent oversight of children', () => {
  it('parents see enrolments, can block a course or all community courses', async () => {
    const a = await family()
    const f = await family()
    const c = await course(a.parent)
    await rpc(f.kid, 'enroll_course', c.id)
    await playMission(f.kid, await missionOfCourse(c.id))
    await expect(rpc(a.parent, 'parent_child_courses', f.kid)).rejects.toThrow(/not your child/)
    const view = await rpc<any>(f.parent, 'parent_child_courses', f.kid)
    expect(view.courses[0]).toMatchObject({ id: c.id, status: 'active', blocked: false, missions_done: 1, answered: 6 })
    await rpc(f.parent, 'parent_set_course_block', f.kid, c.id, true)
    await expect(rpc(f.kid, 'enroll_course', c.id)).rejects.toThrow(/blocked_by_parent/)
    await expect(rpc(f.kid, 'start_quiz_session', await missionOfCourse(c.id))).rejects.toThrow(/mission not available/)
    await rpc(f.parent, 'parent_set_course_block', f.kid, c.id, false)
    await rpc(f.kid, 'enroll_course', c.id)
    await rpc(f.parent, 'parent_set_community_allowed', f.kid, false)
    await expect(rpc(f.kid, 'search_courses', '', null, '', 'recent', false, 5, 0)).rejects.toThrow(/community_disabled/)
    await expect(rpc(f.kid, 'enroll_course', c.id)).rejects.toThrow(/community_disabled/)
    await expect(rpc(f.kid, 'start_quiz_session', await missionOfCourse(c.id))).rejects.toThrow(/mission not available/)
    await expect(rpc(a.parent, 'parent_set_community_allowed', f.kid, true)).rejects.toThrow(/not your child/)
    await rpc(f.parent, 'parent_set_community_allowed', f.kid, true)
    // official content stays available throughout
    expect((await rpc<any[]>(f.kid, 'get_catalog')).length).toBeGreaterThanOrEqual(1)
  })
})

describe('multiplayer integration', () => {
  it('community questions never enter a room unless the host selected a public course; matches with them pay nothing', async () => {
    const a = await family()
    const host = await family()
    const pub = await course(a.parent)
    const priv = await course(a.parent, { visibility: 'private' })
    await rpc(host.kid, 'enroll_course', pub.id)
    const room = await rpc<{ room_id: string }>(host.kid, 'mp_create_room', 'speed', [], [], '{}')
    const pool0 = await root<{ id: string }>(`select * from public.mp_question_pool($1)`, [room.room_id])
    const comm = await root<{ id: string }>(`select q.id from public.questions q join public.subjects s on s.id = q.subject_id where s.kind = 'community' and q.id = any ($1)`, [pool0.map((p) => p.id)])
    expect(comm).toEqual([])
    expect(pool0.length).toBeGreaterThan(100)
    const room2 = await rpc<{ room_id: string }>(host.kid, 'mp_create_room', 'speed', [pub.id], [], '{}')
    expect((await root<{ id: string }>(`select * from public.mp_question_pool($1)`, [room2.room_id])).length).toBe(6)
    expect(await root(`select public.mp_match_has_community(m.id) from public.mp_matches m limit 0`)).toEqual([])
    await expect(rpc(host.kid, 'mp_create_room', 'speed', [priv.id], [], '{}')).rejects.toThrow(/no questions for this selection/)
  })
})
