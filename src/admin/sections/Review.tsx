import { useEffect, useState } from 'react'
import { ar } from '../../quiz/format'
import type { AdminNav } from '../AdminApp'
import { adminError, db, loadLessons, loadSubjects, rpc, STATUS_AR, statusChip, useLoad, type LessonRow } from '../data'

interface QRow {
  id: string
  legacy_id: string | null
  text: string
  status: string
  origin: string
  needs_academic_review: boolean
  lesson_id: string
  source_page: number | null
}
interface QFull extends QRow {
  subject_id: string
  hint: string
  explanation: string
  difficulty: number
  source_quote: string
  source_label: string
  source_textbook_id: string | null
  academic_note: string
  validation: { warnings?: string[]; model?: string; from_source_question?: boolean }
  options: { id: string; text: string; is_correct: boolean }[]
  qtype?: 'mcq' | 'written'
  accepted_answers?: string[]
  rejected_answers?: string[]
  grading?: { strict?: boolean }
  reviews: { action: string; from: string | null; to: string | null; note: string; at: string }[]
  page_text: string | null
}

const PAGE = 25
const ORIGIN: Record<string, string> = { legacy_import: 'مستورد (Task 05)', ai_generated: 'مولَّد بالذكاء الاصطناعي', manual: 'يدوي' }

const lines = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean)

/** Tries an answer against the server's grader (the same function students are graded by). */
function GradingTester({ id }: { id: string }) {
  const [answer, setAnswer] = useState('')
  const [out, setOut] = useState<string | null>(null)
  const VERDICT: Record<string, string> = { correct: 'مقبولة ✓', wrong: 'مرفوضة ✗', unsure: 'غير مؤكدة — يُطلب إعادة المحاولة' }
  return (
    <div className="area__row" style={{ gap: 8, alignItems: 'end' }}>
      <label style={{ flex: 1 }}>
        جرّب إجابة (يجب حفظ السؤال أولًا)
        <input value={answer} onChange={(e) => setAnswer(e.target.value)} />
      </label>
      <button
        type="button"
        className="area__btn area__btn--ghost"
        onClick={() =>
          void rpc<{ verdict: string; normalized: string }>('admin_test_grading', { p_question: id, p_answer: answer })
            .then((r) => setOut(`${VERDICT[r.verdict] ?? r.verdict} (بعد التطبيع: «${r.normalized}»)`))
            .catch((e) => setOut(adminError(e)))
        }
      >
        اختبار التصحيح
      </button>
      {out && <span role="status">{out}</span>}
    </div>
  )
}

/** مراجعة الأسئلة — filter, batch-review and edit every question (imported, generated, manual). */
export function ReviewSection({ questionId, navigate }: { questionId?: string; navigate: AdminNav }) {
  const scope = questionId?.includes(':') ? questionId : undefined
  const selectedId = questionId && !questionId.includes(':') ? questionId : undefined
  const subjects = useLoad(loadSubjects, [])
  const [subjectId, setSubjectId] = useState('')
  const sid = subjectId || subjects.data?.[0]?.id || ''
  const lessons = useLoad(() => (sid ? loadLessons(sid) : Promise.resolve([] as LessonRow[])), [sid])
  const [lessonId, setLessonId] = useState(scope?.startsWith('lesson:') ? scope.slice(7) : '')
  const [status, setStatus] = useState(scope?.startsWith('job:') ? 'needs_review' : '')
  const [origin, setOrigin] = useState('')
  const [flagged, setFlagged] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const jobId = scope?.startsWith('job:') ? scope.slice(4) : ''
  const newFor = scope?.startsWith('new:') ? scope.slice(4) : ''

  const list = useLoad(async () => {
    let q = db().from('questions').select('id, legacy_id, text, status, origin, needs_academic_review, lesson_id, source_page')
    if (jobId) q = q.eq('generation_job_id', jobId)
    else if (sid) q = q.eq('subject_id', sid)
    if (lessonId) q = q.eq('lesson_id', lessonId)
    if (status) q = q.eq('status', status)
    if (origin) q = q.eq('origin', origin)
    if (flagged) q = q.eq('needs_academic_review', true)
    if (search.trim()) q = q.ilike('text', `%${search.trim()}%`)
    const { data, error } = await q.order('sort_key').order('created_at').range(page * PAGE, page * PAGE + PAGE)
    if (error) throw error
    return data as QRow[]
  }, [sid, lessonId, status, origin, flagged, search, page, jobId])

  const lessonTitle = (id: string) => lessons.data?.find((l) => l.id === id)?.title ?? ''
  const rows = (list.data ?? []).slice(0, PAGE)

  const batch = async (to: string) => {
    if (!checked.size) return
    setMsg(null)
    try {
      const n = await rpc<number>('admin_set_question_status', { p_ids: [...checked], p_status: to, p_note: 'batch review' })
      setMsg({ ok: true, text: `تم تحديث ${ar(n)} سؤالًا.` })
      setChecked(new Set())
      list.reload()
    } catch (e) {
      setMsg({ ok: false, text: adminError(e) })
    }
  }

  return (
    <>
      <h1 className="area__h1">مراجعة الأسئلة</h1>
      {msg && <p className={msg.ok ? 'area__ok' : 'area__error'}>{msg.text}</p>}
      {(selectedId || newFor) && (
        <QuestionEditor
          key={selectedId ?? newFor}
          id={selectedId}
          lessonId={newFor}
          lessons={lessons.data ?? []}
          onClose={() => navigate(['review'])}
          onSaved={(id) => {
            list.reload()
            if (id !== selectedId) navigate(['review', id])
          }}
          navigate={navigate}
        />
      )}

      <div className="area__card area__form">
        <div className="area__row">
          <label>
            المادة
            <select value={sid} onChange={(e) => (setSubjectId(e.target.value), setLessonId(''), setPage(0))}>
              {(subjects.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name_ar}
                </option>
              ))}
            </select>
          </label>
          <label>
            الدرس
            <select value={lessonId} onChange={(e) => (setLessonId(e.target.value), setPage(0))}>
              <option value="">كل الدروس</option>
              {(lessons.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            الحالة
            <select value={status} onChange={(e) => (setStatus(e.target.value), setPage(0))}>
              <option value="">الكل</option>
              {Object.entries(STATUS_AR).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            المصدر
            <select value={origin} onChange={(e) => (setOrigin(e.target.value), setPage(0))}>
              <option value="">الكل</option>
              {Object.entries(ORIGIN).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="area__row">
          <input className="area__input" placeholder="بحث في نص السؤال" value={search} onChange={(e) => (setSearch(e.target.value), setPage(0))} />
          <label style={{ flexDirection: 'row', alignItems: 'center' }}>
            <input type="checkbox" checked={flagged} onChange={(e) => (setFlagged(e.target.checked), setPage(0))} /> للمراجعة الأكاديمية فقط
          </label>
          {jobId && <span className="area__chip">أسئلة المهمة {jobId.slice(0, 8)}</span>}
        </div>
      </div>

      <div className="area__row" style={{ marginBottom: 8 }}>
        <span className="area__muted">المحدّد: {ar(checked.size)}</span>
        <button type="button" className="area__btn area__btn--ghost" disabled={!checked.size} onClick={() => void batch('approved')}>
          اعتماد
        </button>
        <button type="button" className="area__btn area__btn--ok" disabled={!checked.size} onClick={() => void batch('published')}>
          نشر
        </button>
        <button type="button" className="area__btn area__btn--ghost" disabled={!checked.size} onClick={() => void batch('needs_review')}>
          إلغاء النشر
        </button>
        <button type="button" className="area__btn area__btn--danger" disabled={!checked.size} onClick={() => void batch('rejected')}>
          رفض
        </button>
      </div>

      {list.error && <p className="area__error">{list.error}</p>}
      <div className="area__card area__table-wrap">
        <table className="area__table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="تحديد الكل"
                  checked={rows.length > 0 && rows.every((r) => checked.has(r.id))}
                  onChange={(e) => setChecked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                />
              </th>
              <th>السؤال</th>
              <th>الدرس</th>
              <th>صفحة</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.id} data-testid="review-row">
                <td>
                  <input
                    type="checkbox"
                    aria-label="تحديد"
                    checked={checked.has(q.id)}
                    onChange={(e) => {
                      const n = new Set(checked)
                      if (e.target.checked) n.add(q.id)
                      else n.delete(q.id)
                      setChecked(n)
                    }}
                  />
                </td>
                <td>
                  <button type="button" className="area__link-btn" onClick={() => navigate(['review', q.id])}>
                    {q.text}
                  </button>
                  <div className="area__muted">
                    {ORIGIN[q.origin]} {q.legacy_id ? `· ${q.legacy_id}` : ''} {q.needs_academic_review && <span className="area__chip area__chip--warn">مراجعة أكاديمية</span>}
                  </div>
                </td>
                <td>{lessonTitle(q.lesson_id)}</td>
                <td>{q.source_page ? ar(q.source_page) : '—'}</td>
                <td>
                  <span className={statusChip(q.status)}>{STATUS_AR[q.status]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !list.error && <p className="area__muted">لا توجد أسئلة تطابق المرشّحات.</p>}
      </div>
      <div className="area__row">
        <button type="button" className="area__btn area__btn--ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
          السابق
        </button>
        <span className="area__muted">صفحة {ar(page + 1)}</span>
        <button type="button" className="area__btn area__btn--ghost" disabled={(list.data?.length ?? 0) <= PAGE} onClick={() => setPage(page + 1)}>
          التالي
        </button>
      </div>
    </>
  )
}

function QuestionEditor({
  id,
  lessonId,
  lessons,
  onClose,
  onSaved,
  navigate,
}: {
  id?: string
  lessonId?: string
  lessons: LessonRow[]
  onClose: () => void
  onSaved: (id: string) => void
  navigate: AdminNav
}) {
  const [q, setQ] = useState<QFull | null>(null)
  const [form, setForm] = useState({ qtype: 'mcq' as 'mcq' | 'written', accepted: '', rejected: '', strict: false, text: '', options: ['', '', '', ''], correct: 'a', hint: '', explanation: '', difficulty: 2, source_page: '', source_quote: '', lesson_id: lessonId ?? '', note: '' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    let alive = true
    rpc<QFull>('admin_get_question', { p_id: id })
      .then((d) => {
        if (!alive || !d) return
        setQ(d)
        setForm({
          qtype: d.qtype ?? 'mcq',
          accepted: (d.accepted_answers ?? []).join('\n'),
          rejected: (d.rejected_answers ?? []).join('\n'),
          strict: !!d.grading?.strict,
          text: d.text,
          options: d.options.length === 4 ? d.options.map((o) => o.text) : ['', '', '', ''],
          correct: d.options.find((o) => o.is_correct)?.id ?? 'a',
          hint: d.hint,
          explanation: d.explanation,
          difficulty: d.difficulty,
          source_page: d.source_page ? String(d.source_page) : '',
          source_quote: d.source_quote,
          lesson_id: d.lesson_id,
          note: '',
        })
      })
      .catch((e) => setMsg({ ok: false, text: adminError(e) }))
    return () => {
      alive = false
    }
  }, [id])

  const save = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const saved = await rpc<string>('admin_save_question', {
        p_question: {
          id: id ?? '',
          ...form,
          correct_option: form.correct,
          source_page: form.source_page || '',
          source_label: q?.source_label ?? '',
          accepted_answers: lines(form.accepted),
          rejected_answers: lines(form.rejected),
          grading: { strict: form.strict },
        },
      })
      setMsg({ ok: true, text: 'حُفظ السؤال.' })
      onSaved(saved)
    } catch (e) {
      setMsg({ ok: false, text: adminError(e) })
    } finally {
      setBusy(false)
    }
  }
  const status = async (to: string) => {
    if (!id) return
    setMsg(null)
    try {
      await rpc('admin_set_question_status', { p_ids: [id], p_status: to, p_note: form.note })
      setQ(await rpc<QFull>('admin_get_question', { p_id: id }))
      setMsg({ ok: true, text: `الحالة الآن: ${STATUS_AR[to]}.` })
      onSaved(id)
    } catch (e) {
      setMsg({ ok: false, text: adminError(e) })
    }
  }
  const flag = async (on: boolean) => {
    if (!id) return
    try {
      await rpc('admin_flag_question', { p_id: id, p_flag: on, p_note: form.note })
      setQ(await rpc<QFull>('admin_get_question', { p_id: id }))
    } catch (e) {
      setMsg({ ok: false, text: adminError(e) })
    }
  }
  const regenerate = async () => {
    if (!q?.source_textbook_id || !q.source_page) return setMsg({ ok: false, text: 'لا يوجد مصدر مرفوع لهذا السؤال لإعادة التوليد منه.' })
    try {
      const r = await rpc<{ job_id: string }>('admin_create_ai_job', {
        p: { kind: 'generate', textbook_id: q.source_textbook_id, lesson_id: q.lesson_id, page_from: q.source_page, page_to: q.source_page, question_count: 1, mode: 'new', regenerate_question_id: q.id },
      })
      navigate(['jobs', r.job_id])
    } catch (e) {
      setMsg({ ok: false, text: adminError(e) })
    }
  }

  return (
    <div className="area__card area__form" data-testid="question-editor">
      <div className="area__row" style={{ justifyContent: 'space-between' }}>
        <h2 className="area__h2" style={{ margin: 0 }}>
          {id ? 'تعديل السؤال' : 'سؤال جديد'} {q && <span className={statusChip(q.status)}>{STATUS_AR[q.status]}</span>}
        </h2>
        <button type="button" className="area__btn area__btn--ghost" onClick={onClose}>
          إغلاق
        </button>
      </div>
      {msg && <p className={msg.ok ? 'area__ok' : 'area__error'}>{msg.text}</p>}
      {q?.needs_academic_review && <p className="area__info">بحاجة إلى مراجعة أكاديمية: {q.academic_note || '—'}</p>}
      {!!q?.validation?.warnings?.length && <p className="area__info">ملاحظات التحقق الآلي: {q.validation.warnings.join('؛ ')}</p>}
      <label>
        الدرس
        <select value={form.lesson_id} onChange={(e) => setForm({ ...form, lesson_id: e.target.value })}>
          <option value="">اختر</option>
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        نص السؤال
        <textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
      </label>
      <label>
        نوع السؤال
        <select value={form.qtype} onChange={(e) => setForm({ ...form, qtype: e.target.value as 'mcq' | 'written' })}>
          <option value="mcq">اختيار من متعدد</option>
          <option value="written">إجابة مكتوبة</option>
        </select>
      </label>
      {form.qtype === 'written' && (
        <>
          <label>
            الإجابات المقبولة (سطر لكل إجابة؛ الأولى تُعرض للطالب بعد الحل)
            <textarea value={form.accepted} onChange={(e) => setForm({ ...form, accepted: e.target.value })} />
          </label>
          <label>
            إجابات خاطئة معروفة (تُرفض دائمًا حتى لو كانت قريبة في الكتابة)
            <textarea value={form.rejected} onChange={(e) => setForm({ ...form, rejected: e.target.value })} />
          </label>
          <label className="area__check">
            <input type="checkbox" checked={form.strict} onChange={(e) => setForm({ ...form, strict: e.target.checked })} /> تصحيح صارم (للأسماء
            والمصطلحات الشرعية): لا يُقبل خطأ إملائي، ويُطلب من الطالب إعادة المحاولة
          </label>
          {id && <GradingTester id={id} />}
          <p className="area__muted">
            يطبّع الخادم الإجابة (التشكيل، الهمزات، التاء المربوطة، الأرقام، «ال»، المسافات والترقيم)، ثم يقبل المطابقة أو خطأً إملائيًّا صغيرًا لكل كلمة،
            ويرفض أي اختلاف في النفي أو الأرقام. الإجابات المشكوك فيها تُعاد للطالب دون احتساب محاولة.
          </p>
        </>
      )}
      {form.qtype === 'mcq' && form.options.map((o, i) => {
        const oid = 'abcd'[i]
        return (
          <label key={oid} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="radio" name="correct" checked={form.correct === oid} onChange={() => setForm({ ...form, correct: oid })} aria-label={`الخيار ${'أبجد'[i]} هو الصحيح`} />
            <span style={{ minWidth: 24 }}>{['أ', 'ب', 'ج', 'د'][i]}</span>
            <input
              style={{ flex: 1 }}
              value={o}
              onChange={(e) => {
                const options = [...form.options]
                options[i] = e.target.value
                setForm({ ...form, options })
              }}
            />
            {form.correct === oid && <span className="area__chip area__chip--ok">الإجابة الصحيحة</span>}
          </label>
        )
      })}
      <label>
        التلميح
        <input value={form.hint} onChange={(e) => setForm({ ...form, hint: e.target.value })} />
      </label>
      <label>
        الشرح
        <textarea value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} />
      </label>
      <div className="area__row">
        <label>
          الصعوبة
          <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: Number(e.target.value) })}>
            <option value={1}>سهلة</option>
            <option value={2}>متوسطة</option>
            <option value={3}>صعبة</option>
          </select>
        </label>
        <label>
          صفحة المصدر
          <input type="number" min={1} value={form.source_page} onChange={(e) => setForm({ ...form, source_page: e.target.value })} />
        </label>
      </div>
      <label>
        المقتطف الداعم من المصدر
        <textarea value={form.source_quote} onChange={(e) => setForm({ ...form, source_quote: e.target.value })} />
      </label>
      {q?.page_text && (
        <details>
          <summary>نص صفحة المصدر ({ar(q.source_page ?? 0)})</summary>
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.9 }}>{q.page_text}</p>
        </details>
      )}
      <label>
        ملاحظة المراجعة (تُحفظ في السجل)
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </label>
      <div className="area__row">
        <button type="button" className="area__btn" disabled={busy || !form.lesson_id} onClick={() => void save()}>
          {id ? 'حفظ التعديلات' : 'حفظ كمسودة'}
        </button>
        {id && (
          <>
            <button type="button" className="area__btn area__btn--ghost" onClick={() => void status('approved')}>
              اعتماد
            </button>
            {q?.status !== 'published' ? (
              <button type="button" className="area__btn area__btn--ok" onClick={() => void status('published')}>
                نشر
              </button>
            ) : (
              <button type="button" className="area__btn area__btn--ghost" onClick={() => void status('approved')}>
                إلغاء النشر
              </button>
            )}
            <button type="button" className="area__btn area__btn--ghost" onClick={() => void status('draft')}>
              مسودة
            </button>
            <button type="button" className="area__btn area__btn--danger" onClick={() => void status('rejected')}>
              رفض
            </button>
            <button type="button" className="area__btn area__btn--ghost" onClick={() => void status('archived')}>
              أرشفة
            </button>
            <button type="button" className="area__btn area__btn--ghost" onClick={() => void flag(!q?.needs_academic_review)}>
              {q?.needs_academic_review ? 'إزالة علامة المراجعة الأكاديمية' : 'وضع علامة مراجعة أكاديمية'}
            </button>
            <button type="button" className="area__btn area__btn--ghost" onClick={() => void regenerate()}>
              إعادة توليد
            </button>
          </>
        )}
      </div>
      {!!q?.reviews?.length && (
        <details>
          <summary>سجل المراجعة ({ar(q.reviews.length)})</summary>
          <ul>
            {q.reviews.map((r, i) => (
              <li key={i}>
                {new Date(r.at).toLocaleString('ar')} — {r.action} {r.from ? `${STATUS_AR[r.from] ?? r.from} ← ` : ''}
                {r.to ? STATUS_AR[r.to] ?? r.to : ''} {r.note}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
