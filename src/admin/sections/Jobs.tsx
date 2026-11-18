import { useEffect, useRef, useState } from 'react'
import { invokeFunction } from '../../cloud/api'
import { ar } from '../../quiz/format'
import type { AdminNav } from '../AdminApp'
import { adminError, db, rpc, useLoad } from '../data'

interface Job {
  id: string
  kind: 'extract' | 'generate'
  status: string
  page_from: number
  page_to: number
  question_count: number
  mode: string | null
  model: string
  estimate: { input_tokens?: number; output_tokens?: number; usd?: number; label?: string }
  input_tokens: number
  output_tokens: number
  cost_usd: number
  questions_created: number
  questions_rejected: number
  error: string | null
  created_at: string
  lesson_id: string | null
}
interface Batch {
  batch_no: number
  page_from: number
  page_to: number
  question_count: number
  status: string
  attempts: number
  error: string | null
  input_tokens: number
  output_tokens: number
  result_count: number
}

const STATUS: Record<string, string> = {
  awaiting_confirmation: 'بانتظار التأكيد',
  queued: 'في الانتظار',
  running: 'قيد التنفيذ',
  completed: 'مكتملة',
  failed: 'فشلت',
  cancelled: 'ملغاة',
  pending: 'لم تبدأ',
  done: 'تمت',
  skipped: 'تُخطّيت (موجودة مسبقًا)',
}

/** إدارة المهام — confirm, run (one batch per request), cancel, retry; tokens and cost per batch. */
export function JobsSection({ jobId, navigate }: { jobId?: string; navigate: AdminNav }) {
  const list = useLoad(async () => {
    const { data, error } = await db().from('ai_jobs').select('*').order('created_at', { ascending: false }).limit(50)
    if (error) throw error
    return data as Job[]
  }, [])
  if (jobId) return <JobDetail jobId={jobId} navigate={navigate} onChange={list.reload} />
  return (
    <>
      <h1 className="area__h1">إدارة المهام</h1>
      {list.error && <p className="area__error">{list.error}</p>}
      <div className="area__card area__table-wrap">
        <table className="area__table">
          <thead>
            <tr>
              <th>المهمة</th>
              <th>الصفحات</th>
              <th>الحالة</th>
              <th>النتيجة</th>
              <th>التكلفة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((j) => (
              <tr key={j.id}>
                <td>{j.kind === 'extract' ? 'استخراج نص' : `توليد ${ar(j.question_count)} سؤالًا`}</td>
                <td>
                  {ar(j.page_from)}–{ar(j.page_to)}
                </td>
                <td>{STATUS[j.status] ?? j.status}</td>
                <td>{j.kind === 'generate' ? `${ar(j.questions_created)} مسودة، ${ar(j.questions_rejected)} مرفوضة` : `${ar(j.questions_created)} صفحة`}</td>
                <td dir="ltr">${Number(j.cost_usd).toFixed(3)}</td>
                <td>
                  <button type="button" className="area__btn area__btn--ghost" onClick={() => navigate(['jobs', j.id])}>
                    التفاصيل
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data?.length === 0 && <p className="area__muted">لا توجد مهام بعد.</p>}
      </div>
    </>
  )
}

function JobDetail({ jobId, navigate, onChange }: { jobId: string; navigate: AdminNav; onChange: () => void }) {
  const [job, setJob] = useState<Job | null>(null)
  const [batches, setBatches] = useState<Batch[]>([])
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const alive = useRef(true)

  const load = async () => {
    const [j, b] = await Promise.all([
      db().from('ai_jobs').select('*').eq('id', jobId).maybeSingle(),
      db().from('ai_job_batches').select('*').eq('job_id', jobId).order('batch_no'),
    ])
    if (j.error) throw j.error
    setJob(j.data as Job)
    setBatches((b.data ?? []) as Batch[])
  }
  useEffect(() => {
    alive.current = true
    load().catch((e) => setError(adminError(e)))
    return () => {
      alive.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      await load()
      onChange()
    } catch (e) {
      setError(adminError(e))
    }
  }

  /** Runs batches one request at a time while this page is open. Safe to stop and resume. */
  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      for (let i = 0; i < 400 && alive.current; i++) {
        const r = await invokeFunction<{ done: boolean; job: Job; batches: Batch[] }>('ai-worker', { action: 'run', job_id: jobId })
        if (!alive.current) break
        setJob(r.job)
        setBatches(r.batches)
        if (r.done || ['completed', 'failed', 'cancelled'].includes(r.job?.status)) break
      }
    } catch (e) {
      setError(adminError(e))
      await load().catch(() => {})
    } finally {
      if (alive.current) setRunning(false)
      onChange()
    }
  }

  if (!job) return <p className="area__muted">{error ?? 'جارٍ التحميل…'}</p>
  const done = batches.filter((b) => ['done', 'skipped'].includes(b.status)).length
  const pct = batches.length ? Math.round((done / batches.length) * 100) : 0

  return (
    <>
      <button type="button" className="area__btn area__btn--ghost" onClick={() => navigate(['jobs'])}>
        ← كل المهام
      </button>
      <h1 className="area__h1" style={{ marginTop: 10 }}>
        {job.kind === 'extract' ? 'استخراج نص الكتاب' : `توليد ${ar(job.question_count)} سؤالًا`} — {STATUS[job.status] ?? job.status}
      </h1>
      {error && <p className="area__error">{error}</p>}
      {job.error && <p className="area__error">آخر خطأ: {job.error}</p>}

      <div className="area__grid">
        <div className="area__stat">
          <b dir="ltr">${Number(job.estimate.usd ?? 0).toFixed(3)}</b>
          <span>التكلفة المقدّرة (تقدير تقريبي)</span>
        </div>
        <div className="area__stat">
          <b dir="ltr">${Number(job.cost_usd).toFixed(3)}</b>
          <span>التكلفة المسجّلة حتى الآن</span>
        </div>
        <div className="area__stat">
          <b dir="ltr">{ar(job.input_tokens)} / {ar(job.output_tokens)}</b>
          <span>الرموز الفعلية (إدخال / إخراج)</span>
        </div>
        <div className="area__stat">
          <b>{ar(pct)}٪</b>
          <span>
            {ar(done)} من {ar(batches.length)} دفعة
          </span>
        </div>
      </div>
      <p className="area__muted">{job.estimate.label} النموذج: {job.model}.</p>

      <div className="area__row" style={{ margin: '12px 0' }}>
        {job.status === 'awaiting_confirmation' && (
          <button type="button" className="area__btn area__btn--ok" onClick={() => void act(() => rpc('admin_confirm_ai_job', { p_job: job.id }))}>
            تأكيد وبدء المهمة
          </button>
        )}
        {['queued', 'running'].includes(job.status) && (
          <button type="button" className="area__btn" disabled={running} onClick={() => void run()}>
            {running ? 'جارٍ التنفيذ… (أبقِ الصفحة مفتوحة)' : 'تشغيل / متابعة'}
          </button>
        )}
        {['awaiting_confirmation', 'queued', 'running'].includes(job.status) && (
          <button type="button" className="area__btn area__btn--danger" onClick={() => void act(() => rpc('admin_cancel_ai_job', { p_job: job.id }))}>
            إلغاء
          </button>
        )}
        {['failed', 'cancelled'].includes(job.status) && batches.some((b) => ['failed', 'cancelled', 'pending'].includes(b.status)) && (
          <button type="button" className="area__btn" onClick={() => void act(() => rpc('admin_retry_ai_job', { p_job: job.id }))}>
            إعادة المحاولة للدفعات غير المكتملة فقط
          </button>
        )}
        {job.kind === 'generate' && job.questions_created > 0 && (
          <button type="button" className="area__btn area__btn--ghost" onClick={() => navigate(['review', `job:${job.id}`])}>
            مراجعة الأسئلة المولّدة
          </button>
        )}
      </div>

      <div className="area__card area__table-wrap">
        <table className="area__table">
          <thead>
            <tr>
              <th>الدفعة</th>
              <th>الصفحات</th>
              <th>الحالة</th>
              <th>المحاولات</th>
              <th>النتيجة</th>
              <th>الرموز</th>
              <th>الخطأ</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.batch_no}>
                <td>{ar(b.batch_no)}</td>
                <td>
                  {ar(b.page_from)}–{ar(b.page_to)}
                </td>
                <td>{STATUS[b.status] ?? b.status}</td>
                <td>{ar(b.attempts)}</td>
                <td>{ar(b.result_count)}</td>
                <td dir="ltr">
                  {b.input_tokens}/{b.output_tokens}
                </td>
                <td>{b.error ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="area__muted">
        تُنفَّذ المهمة دفعة دفعة؛ إذا توقفت (إغلاق الصفحة أو خطأ في الصفحة ٨٠ مثلًا) فإن «متابعة» تكمل من الدفعة التالية ولا تعيد الصفحات المكتملة.
      </p>
    </>
  )
}
