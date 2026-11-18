// Phase B (Task 08): admin-only content management, review/publish workflow, AI job
// controls (estimate → confirm → resumable batches) and publishing without deployment.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { as, createAdmin, createParent, createStudent, dbAvailable, pool, root, rpc } from './db'

beforeAll(async () => {
  if (!(await dbAvailable())) throw new Error('Local test database not available: run `npm run test:db`.')
})
afterAll(() => pool.end())

async function demoSubject(admin: string, slug: string) {
  const [s] = await as<{ id: string }>(admin, `insert into public.subjects (slug, name_ar, grade, semester, theme, status) values ($1, 'مادة العرض', 8, 1, 'forest', 'draft') returning id`, [slug])
  const [u] = await as<{ id: string }>(admin, `insert into public.units (subject_id, number, title, status) values ($1, 1, 'الوحدة الأولى', 'published') returning id`, [s.id])
  const [l] = await as<{ id: string }>(admin, `insert into public.lessons (subject_id, unit_id, number, title, status) values ($1, $2, 1, 'درس العرض', 'published') returning id`, [s.id, u.id])
  return { subject: s.id, unit: u.id, lesson: l.id }
}
const draftQuestion = (lesson: string, text: string) => ({
  lesson_id: lesson,
  text,
  options: ['الإجابة الصحيحة', 'خيار ثانٍ', 'خيار ثالث', 'خيار رابع'],
  correct_option: 'a',
  hint: 'فكّر في الدرس',
  explanation: 'الإجابة الصحيحة هي الأولى.',
  difficulty: 1,
  source_page: 1,
  source_quote: '',
})

describe('admin-only access', () => {
  it('students and parents cannot call admin functions or read AI jobs', async () => {
    const parent = await createParent()
    const student = await createStudent(parent)
    for (const who of [parent, student]) {
      await expect(rpc(who, 'admin_dashboard')).rejects.toThrow(/administrator required/)
      await expect(rpc(who, 'admin_set_question_status', '{}', 'published', '')).rejects.toThrow(/administrator required/)
      await expect(rpc(who, 'admin_save_question', JSON.stringify(draftQuestion('00000000-0000-0000-0000-000000000000', 'x')))).rejects.toThrow(/administrator required/)
      expect(await as(who, 'select * from public.ai_jobs')).toEqual([])
      expect(await as(who, 'select * from public.audit_log')).toEqual([])
    }
    await expect(as(student, `update public.ai_settings set enabled = true`).then((r) => r.length)).resolves.toBe(0)
    expect((await root('select enabled from public.ai_settings'))[0].enabled).toBe(false)
  })

  it('only the backend worker (service role) can claim or finish AI batches', async () => {
    const admin = await createAdmin()
    await expect(as(admin, `select public.ai_claim_batch(gen_random_uuid())`)).rejects.toThrow(/permission denied/)
  })

  it('the 600 imported questions are visible and editable for admins', async () => {
    const admin = await createAdmin()
    const [{ n }] = await as<{ n: number }>(admin, `select count(*)::int as n from public.questions where origin = 'legacy_import'`)
    expect(n).toBe(600)
    const [q] = await as<{ id: string }>(admin, `select id from public.questions where legacy_id = 'rv8.u4.l4.21'`)
    const full = await rpc<{ needs_academic_review: boolean; options: { is_correct: boolean }[] }>(admin, 'admin_get_question', q.id)
    expect(full.needs_academic_review).toBe(true)
    expect(full.options.filter((o) => o.is_correct)).toHaveLength(1)
  })
})

describe('review and publishing without deployment', () => {
  it('a new subject appears in the student catalogue only after it and its questions are published', async () => {
    const admin = await createAdmin()
    const student = await createStudent(await createParent())
    const demo = await demoSubject(admin, `demo-${Date.now().toString(36)}`)
    const id = await rpc<string>(admin, 'admin_save_question', JSON.stringify(draftQuestion(demo.lesson, 'سؤال العرض الأول؟')))
    const inCatalog = async () => (await rpc<{ id: string; units: { lessons: { missions: unknown[] }[] }[] }[]>(student, 'get_catalog')).find((c) => c.id === demo.subject)

    expect(await inCatalog()).toBeUndefined() // draft subject
    await as(admin, `update public.subjects set status = 'published' where id = $1`, [demo.subject])
    expect((await inCatalog())!.units[0].lessons[0].missions).toEqual([]) // no published question yet
    await rpc(admin, 'admin_set_question_status', `{${id}}`, 'published', 'ok')
    expect((await inCatalog())!.units[0].lessons[0].missions).toHaveLength(1)

    // Unpublishing hides it again but keeps the students' history.
    await as(admin, `update public.subjects set status = 'draft' where id = $1`, [demo.subject])
    expect(await inCatalog()).toBeUndefined()
    expect((await root(`select count(*)::int as n from public.missions m join public.lessons l on l.id = m.lesson_id where l.subject_id = $1`, [demo.subject]))[0].n).toBe(1)
  })

  it('cannot publish a question without four options and exactly one correct answer', async () => {
    const admin = await createAdmin()
    const demo = await demoSubject(admin, `demo-b-${Date.now().toString(36)}`)
    const bad = { ...draftQuestion(demo.lesson, 'سؤال ناقص؟'), options: ['أ', 'ب', 'ج'] }
    await expect(rpc(admin, 'admin_save_question', JSON.stringify(bad))).rejects.toThrow(/four options/)
    const [q] = await root<{ id: string }>(`insert into public.questions (subject_id, lesson_id, text) values ($1, $2, 'بلا خيارات؟') returning id`, [demo.subject, demo.lesson])
    await expect(rpc(admin, 'admin_set_question_status', `{${q.id}}`, 'published', '')).rejects.toThrow(/exactly 4 options/)
  })

  it('records every review action and content change in the audit trail', async () => {
    const admin = await createAdmin()
    const demo = await demoSubject(admin, `demo-c-${Date.now().toString(36)}`)
    const id = await rpc<string>(admin, 'admin_save_question', JSON.stringify(draftQuestion(demo.lesson, 'سؤال للتدقيق؟')))
    await rpc(admin, 'admin_set_question_status', `{${id}}`, 'approved', 'looks good')
    await rpc(admin, 'admin_save_question', JSON.stringify({ ...draftQuestion(demo.lesson, 'سؤال للتدقيق بعد التعديل؟'), id }))
    const actions = (await root<{ action: string }>(`select action from public.content_reviews where question_id = $1 order by id`, [id])).map((r) => r.action)
    expect(actions).toEqual(['create', 'approve', 'edit'])
    const audits = await root<{ n: number }>(`select count(*)::int as n from public.audit_log where entity = 'questions' and entity_id = $1 and actor_id = $2`, [id, admin])
    expect(audits[0].n).toBeGreaterThanOrEqual(3)
  })

  it('students never receive unpublished questions, even with a direct mission id', async () => {
    const admin = await createAdmin()
    const student = await createStudent(await createParent())
    const demo = await demoSubject(admin, `demo-d-${Date.now().toString(36)}`)
    const id = await rpc<string>(admin, 'admin_save_question', JSON.stringify(draftQuestion(demo.lesson, 'سؤال سري؟')))
    await rpc(admin, 'admin_set_question_status', `{${id}}`, 'published', '')
    const [m] = await root<{ id: string }>(`select id from public.missions where lesson_id = $1`, [demo.lesson])
    await expect(rpc(student, 'start_quiz_session', m.id)).rejects.toThrow(/mission not available/) // subject is a draft
  })
})

describe('AI jobs: estimate, confirmation, limits and resumable batches', () => {
  async function book(admin: string, pages = 30) {
    const [b] = await as<{ id: string }>(admin, `insert into public.textbooks (title, page_count, mime_type, size_bytes, storage_path) values ('كتاب', $1, 'application/pdf', 1000, $2) returning id`, [pages, `t/${Date.now()}${Math.random()}.pdf`])
    return b.id
  }

  it('creates a job with an estimate and batches, and refuses to start while AI is disabled', async () => {
    const admin = await createAdmin()
    const b = await book(admin, 30)
    const job = await rpc<{ job_id: string; batches: number; estimate: { usd: number } }>(admin, 'admin_create_ai_job', JSON.stringify({ kind: 'extract', textbook_id: b, page_from: 1, page_to: 30 }))
    expect(job.batches).toBe(5) // 6 pages per batch
    expect(job.estimate.usd).toBeGreaterThan(0)
    await expect(rpc(admin, 'admin_confirm_ai_job', job.job_id)).rejects.toThrow(/disabled/)
  })

  it('enforces page and question limits per job and the monthly budget', async () => {
    const admin = await createAdmin()
    const b = await book(admin, 600)
    await expect(rpc(admin, 'admin_create_ai_job', JSON.stringify({ kind: 'extract', textbook_id: b, page_from: 1, page_to: 200 }))).rejects.toThrow(/too many pages/)
    await expect(rpc(admin, 'admin_create_ai_job', JSON.stringify({ kind: 'generate', textbook_id: b, page_from: 1, page_to: 5, question_count: 500, lesson_id: '00000000-0000-0000-0000-000000000000' }))).rejects.toThrow(/question count/)
    await root(`update public.ai_settings set enabled = true, monthly_budget_usd = 0.001`)
    try {
      const job = await rpc<{ job_id: string }>(admin, 'admin_create_ai_job', JSON.stringify({ kind: 'extract', textbook_id: b, page_from: 1, page_to: 12 }))
      await expect(rpc(admin, 'admin_confirm_ai_job', job.job_id)).rejects.toThrow(/budget/)
    } finally {
      await root(`update public.ai_settings set enabled = false, monthly_budget_usd = 10`)
    }
  })

  it('a failed batch is retried without redoing completed batches (resumable checkpoints)', async () => {
    const admin = await createAdmin()
    const b = await book(admin, 18)
    await root(`update public.ai_settings set enabled = true`)
    try {
      const { job_id } = await rpc<{ job_id: string }>(admin, 'admin_create_ai_job', JSON.stringify({ kind: 'extract', textbook_id: b, page_from: 1, page_to: 18 }))
      await rpc(admin, 'admin_confirm_ai_job', job_id)
      const claim = async () => (await root<{ v: { batch: { batch_no: number } } | null }>(`select public.ai_claim_batch($1) as v`, [job_id]))[0].v
      const finish = (n: number, status: string) => root(`select public.ai_finish_batch($1, $2, $3, $4, 1000, 500, 6, 0)`, [job_id, n, status, status === 'failed' ? 'boom' : null])
      const b1 = await claim()
      await finish(b1!.batch.batch_no, 'done')
      const b2 = await claim()
      // Batch 2 fails three times (e.g. a bad page 80): the job ends as failed, batch 1 stays done.
      await finish(b2!.batch.batch_no, 'failed')
      for (let i = 0; i < 2; i++) await finish((await claim())!.batch.batch_no, 'failed')
      const b3 = await claim()
      await finish(b3!.batch.batch_no, 'done')
      expect(await claim()).toBeNull()
      const statuses = (await root<{ status: string }>(`select status from public.ai_job_batches where job_id = $1 order by batch_no`, [job_id])).map((r) => r.status)
      expect(statuses).toEqual(['done', 'failed', 'done'])
      expect((await root(`select status from public.ai_jobs where id = $1`, [job_id]))[0].status).toBe('failed')
      // Retry: only the failed batch is pending again.
      await rpc(admin, 'admin_retry_ai_job', job_id)
      expect((await root<{ status: string }>(`select status from public.ai_job_batches where job_id = $1 order by batch_no`, [job_id])).map((r) => r.status)).toEqual(['done', 'pending', 'done'])
      expect((await claim())!.batch.batch_no).toBe(2)
      const [{ cost_usd, input_tokens }] = await root<{ cost_usd: string; input_tokens: string }>(`select cost_usd, input_tokens from public.ai_jobs where id = $1`, [job_id])
      expect(Number(input_tokens)).toBe(5000)
      expect(Number(cost_usd)).toBeGreaterThan(0)
    } finally {
      await root(`update public.ai_settings set enabled = false`)
    }
  })

  it('cancelled jobs cannot be claimed', async () => {
    const admin = await createAdmin()
    const b = await book(admin, 6)
    await root(`update public.ai_settings set enabled = true`)
    try {
      const { job_id } = await rpc<{ job_id: string }>(admin, 'admin_create_ai_job', JSON.stringify({ kind: 'extract', textbook_id: b, page_from: 1, page_to: 6 }))
      await rpc(admin, 'admin_confirm_ai_job', job_id)
      await rpc(admin, 'admin_cancel_ai_job', job_id)
      expect((await root(`select public.ai_claim_batch($1) as v`, [job_id]))[0].v).toBeNull()
    } finally {
      await root(`update public.ai_settings set enabled = false`)
    }
  })
})
