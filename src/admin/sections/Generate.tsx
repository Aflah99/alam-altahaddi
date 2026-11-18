import { useState } from 'react'
import type { AdminNav } from '../AdminApp'
import { adminError, db, loadLessons, loadSubjects, loadUnits, rpc, useLoad, type LessonRow, type UnitRow } from '../data'

interface BookOption {
  id: string
  title: string
  page_count: number | null
  subject_id: string | null
}

/** توليد الأسئلة — choose the source and scope; nothing runs until the estimate is confirmed. */
export function GenerateSection({ navigate }: { navigate: AdminNav }) {
  const subjects = useLoad(loadSubjects, [])
  const [subjectId, setSubjectId] = useState('')
  const sid = subjectId || subjects.data?.[0]?.id || ''
  const units = useLoad(() => (sid ? loadUnits(sid) : Promise.resolve([] as UnitRow[])), [sid])
  const lessons = useLoad(() => (sid ? loadLessons(sid) : Promise.resolve([] as LessonRow[])), [sid])
  const books = useLoad(async () => {
    const { data, error } = await db().from('textbooks').select('id, title, page_count, subject_id').neq('status', 'archived').order('created_at', { ascending: false })
    if (error) throw error
    return data as BookOption[]
  }, [])
  const settings = useLoad(async () => {
    const { data, error } = await db().from('ai_settings').select('*').maybeSingle()
    if (error) throw error
    return data as { enabled: boolean; max_questions_per_job: number; max_pages_per_job: number; model: string }
  }, [])
  const [unitId, setUnitId] = useState('')
  const [lessonId, setLessonId] = useState('')
  const [bookId, setBookId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [count, setCount] = useState(10)
  const [difficulty, setDifficulty] = useState('')
  const [mode, setMode] = useState<'convert' | 'new' | 'concept'>('new')
  const [concept, setConcept] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const lessonList = (lessons.data ?? []).filter((l) => !unitId || l.unit_id === unitId)
  const lesson = lessonList.find((l) => l.id === lessonId)
  const bookList = (books.data ?? []).filter((b) => !b.subject_id || b.subject_id === sid)

  const pickLesson = (id: string) => {
    setLessonId(id)
    const l = lessonList.find((x) => x.id === id)
    if (l?.page_start) {
      setFrom(String(l.page_start))
      setTo(String(l.page_end ?? l.page_start))
    }
  }

  const estimate = async () => {
    setError(null)
    if (!lesson || !bookId || !from || !to) return setError('اختر الدرس والمصدر ونطاق الصفحات.')
    setBusy(true)
    try {
      const r = await rpc<{ job_id: string }>('admin_create_ai_job', {
        p: {
          kind: 'generate', textbook_id: bookId, subject_id: sid, unit_id: lesson.unit_id, lesson_id: lesson.id,
          page_from: Number(from), page_to: Number(to), question_count: count, difficulty: difficulty || null, mode, concept,
        },
      })
      navigate(['jobs', r.job_id])
    } catch (e) {
      setError(adminError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1 className="area__h1">توليد الأسئلة</h1>
      {settings.data && !settings.data.enabled && (
        <p className="area__info">التوليد بالذكاء الاصطناعي معطّل حاليًّا في الإعدادات. يمكنك إعداد المهمة ورؤية التقدير، لكن لن تُنفَّذ قبل تفعيله.</p>
      )}
      <p className="area__muted">
        يستخدم التوليد Claude من خلال دالة خلفية آمنة، ولا يعتمد إلا على صفحات المصدر المختارة. كل سؤال مولَّد يُحفظ بحالة «بحاجة إلى مراجعة» ولا يُنشر قبل موافقة مشرف.
      </p>
      {error && <p className="area__error">{error}</p>}
      <div className="area__card area__form">
        <div className="area__row">
          <label>
            المادة
            <select value={sid} onChange={(e) => (setSubjectId(e.target.value), setUnitId(''), setLessonId(''))}>
              {(subjects.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name_ar}
                </option>
              ))}
            </select>
          </label>
          <label>
            الوحدة
            <select value={unitId} onChange={(e) => (setUnitId(e.target.value), setLessonId(''))}>
              <option value="">كل الوحدات</option>
              {(units.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            الدرس
            <select value={lessonId} onChange={(e) => pickLesson(e.target.value)}>
              <option value="">اختر الدرس</option>
              {lessonList.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="area__row">
          <label>
            المصدر
            <select value={bookId} onChange={(e) => setBookId(e.target.value)}>
              <option value="">اختر الكتاب أو المصدر</option>
              {bookList.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            من صفحة
            <input type="number" min={1} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            إلى صفحة
            <input type="number" min={1} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <div className="area__row">
          <label>
            عدد الأسئلة
            <input type="number" min={1} max={settings.data?.max_questions_per_job ?? 30} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </label>
          <label>
            الصعوبة
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="">متنوعة</option>
              <option value="1">سهلة</option>
              <option value="2">متوسطة</option>
              <option value="3">صعبة</option>
            </select>
          </label>
          <label>
            طريقة التوليد
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="convert">تحويل أسئلة المصدر الموجودة</option>
              <option value="new">أسئلة جديدة مدعومة بالمصدر</option>
              <option value="concept">أسئلة إضافية حول مفهوم محدد</option>
            </select>
          </label>
        </div>
        {mode === 'concept' && (
          <label>
            المفهوم
            <input value={concept} maxLength={300} onChange={(e) => setConcept(e.target.value)} />
          </label>
        )}
        <button type="button" className="area__btn" disabled={busy} onClick={() => void estimate()}>
          عرض تقدير التكلفة
        </button>
        <p className="area__muted">النموذج الحالي: {settings.data?.model ?? '—'} · الحد لكل مهمة: {settings.data?.max_questions_per_job ?? '—'} سؤالًا و{settings.data?.max_pages_per_job ?? '—'} صفحة.</p>
      </div>
    </>
  )
}
