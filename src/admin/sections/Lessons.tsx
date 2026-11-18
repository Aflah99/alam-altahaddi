import { useState } from 'react'
import { ar } from '../../quiz/format'
import type { AdminNav } from '../AdminApp'
import { adminError, db, loadLessons, loadSubjects, loadUnits, rpc, STATUS_AR, statusChip, useLoad, type LessonRow, type UnitRow } from '../data'

interface Coverage {
  lesson_id: string
  published: number
  review: number
  rejected: number
  flagged: number
  missions: number
}

/** الوحدات والدروس — units and lessons of a subject, their status and question coverage. */
export function LessonsSection({ subjectId, navigate }: { subjectId?: string; navigate: AdminNav }) {
  const subjects = useLoad(loadSubjects, [])
  const sid = subjectId ?? subjects.data?.[0]?.id
  const units = useLoad(() => (sid ? loadUnits(sid) : Promise.resolve([] as UnitRow[])), [sid])
  const lessons = useLoad(() => (sid ? loadLessons(sid) : Promise.resolve([] as LessonRow[])), [sid])
  const coverage = useLoad(() => (sid ? rpc<Coverage[]>('admin_coverage', { p_subject: sid }) : Promise.resolve([] as Coverage[])), [sid])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [unitTitle, setUnitTitle] = useState('')
  const [newLesson, setNewLesson] = useState<{ unit: string; title: string; from: string; to: string } | null>(null)

  const reloadAll = () => {
    units.reload()
    lessons.reload()
    coverage.reload()
  }
  const act = async (fn: () => PromiseLike<{ error: unknown }>, ok: string) => {
    setMsg(null)
    const { error } = await fn()
    if (error) setMsg({ ok: false, text: adminError(error) })
    else {
      setMsg({ ok: true, text: ok })
      reloadAll()
    }
  }

  const addUnit = () => {
    if (!sid || !unitTitle.trim()) return
    const number = Math.max(0, ...(units.data ?? []).map((u) => u.number)) + 1
    void act(() => db().from('units').insert({ subject_id: sid, number, title: unitTitle.trim(), sort_order: number, status: 'published' }), 'أُضيفت الوحدة.')
    setUnitTitle('')
  }
  const addLesson = () => {
    if (!sid || !newLesson?.title.trim()) return
    const inUnit = (lessons.data ?? []).filter((l) => l.unit_id === newLesson.unit)
    const number = Math.max(0, ...inUnit.map((l) => l.number)) + 1
    void act(
      () =>
        db().from('lessons').insert({
          subject_id: sid,
          unit_id: newLesson.unit,
          number,
          title: newLesson.title.trim(),
          page_start: newLesson.from ? Number(newLesson.from) : null,
          page_end: newLesson.to ? Number(newLesson.to) : null,
          sort_order: number,
          status: 'draft',
        }),
      'أُضيف الدرس (مسودة). انشره عندما تصبح أسئلته جاهزة.',
    )
    setNewLesson(null)
  }

  const cov = new Map((coverage.data ?? []).map((c) => [c.lesson_id, c]))

  return (
    <>
      <h1 className="area__h1">الوحدات والدروس</h1>
      {msg && <p className={msg.ok ? 'area__ok' : 'area__error'}>{msg.text}</p>}
      {(subjects.error || units.error || lessons.error) && <p className="area__error">{subjects.error || units.error || lessons.error}</p>}
      <label className="area__label" style={{ maxWidth: 360, marginBottom: 12 }}>
        المادة
        <select className="area__input" value={sid ?? ''} onChange={(e) => navigate(['lessons', e.target.value])}>
          {(subjects.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name_ar} ({STATUS_AR[s.status]})
            </option>
          ))}
        </select>
      </label>

      {(units.data ?? []).map((u) => (
        <div key={u.id} className="area__card">
          <div className="area__row" style={{ justifyContent: 'space-between' }}>
            <h2 className="area__h2" style={{ margin: 0 }}>
              {u.title} <span className={statusChip(u.status)}>{STATUS_AR[u.status]}</span>
            </h2>
            <div className="area__row">
              <button
                type="button"
                className="area__btn area__btn--ghost"
                onClick={() => void act(() => db().from('units').update({ status: u.status === 'published' ? 'draft' : 'published' }).eq('id', u.id), 'تم تحديث الوحدة.')}
              >
                {u.status === 'published' ? 'إلغاء نشر الوحدة' : 'نشر الوحدة'}
              </button>
              <button type="button" className="area__btn area__btn--ghost" onClick={() => setNewLesson({ unit: u.id, title: '', from: '', to: '' })}>
                إضافة درس
              </button>
            </div>
          </div>
          {newLesson?.unit === u.id && (
            <div className="area__form" style={{ marginTop: 10 }}>
              <label>
                عنوان الدرس
                <input value={newLesson.title} onChange={(e) => setNewLesson({ ...newLesson, title: e.target.value })} />
              </label>
              <div className="area__row">
                <label>
                  من صفحة
                  <input type="number" min={1} value={newLesson.from} onChange={(e) => setNewLesson({ ...newLesson, from: e.target.value })} />
                </label>
                <label>
                  إلى صفحة
                  <input type="number" min={1} value={newLesson.to} onChange={(e) => setNewLesson({ ...newLesson, to: e.target.value })} />
                </label>
              </div>
              <div className="area__row">
                <button type="button" className="area__btn" onClick={addLesson}>
                  حفظ الدرس
                </button>
                <button type="button" className="area__btn area__btn--ghost" onClick={() => setNewLesson(null)}>
                  إلغاء
                </button>
              </div>
            </div>
          )}
          <div className="area__table-wrap">
            <table className="area__table">
              <thead>
                <tr>
                  <th>الدرس</th>
                  <th>الصفحات</th>
                  <th>منشورة</th>
                  <th>للمراجعة</th>
                  <th>المهمات</th>
                  <th>الحالة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {(lessons.data ?? [])
                  .filter((l) => l.unit_id === u.id)
                  .map((l) => {
                    const c = cov.get(l.id)
                    return (
                      <tr key={l.id}>
                        <td>
                          {ar(l.number)}. {l.title}
                          {!!c?.flagged && <span className="area__chip area__chip--warn"> {ar(c.flagged)} للمراجعة الأكاديمية</span>}
                        </td>
                        <td>{l.page_start ? `${ar(l.page_start)}–${ar(l.page_end ?? l.page_start)}` : '—'}</td>
                        <td>{ar(c?.published ?? 0)}</td>
                        <td>{ar(c?.review ?? 0)}</td>
                        <td>{ar(c?.missions ?? 0)}</td>
                        <td>
                          <span className={statusChip(l.status)}>{STATUS_AR[l.status]}</span>
                        </td>
                        <td>
                          <div className="area__row">
                            <button
                              type="button"
                              className="area__btn area__btn--ghost"
                              onClick={() =>
                                void act(
                                  () => db().from('lessons').update({ status: l.status === 'published' ? 'draft' : 'published' }).eq('id', l.id),
                                  l.status === 'published' ? 'أُلغي نشر الدرس (تبقى سجلات الطلاب محفوظة).' : 'نُشر الدرس.',
                                )
                              }
                            >
                              {l.status === 'published' ? 'إلغاء النشر' : 'نشر'}
                            </button>
                            <button type="button" className="area__btn area__btn--ghost" onClick={() => navigate(['review', `lesson:${l.id}`])}>
                              الأسئلة
                            </button>
                            <button type="button" className="area__btn area__btn--ghost" onClick={() => navigate(['review', `new:${l.id}`])}>
                              سؤال يدوي
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {sid && (
        <div className="area__card area__row">
          <input className="area__input" placeholder="عنوان وحدة جديدة" value={unitTitle} onChange={(e) => setUnitTitle(e.target.value)} />
          <button type="button" className="area__btn" onClick={addUnit}>
            إضافة وحدة
          </button>
        </div>
      )}
      <p className="area__muted">
        تُبنى المهمات تلقائيًّا من الأسئلة المنشورة (١٠ أسئلة على الأكثر لكل مهمة). يظهر الدرس للطلاب عندما تكون المادة والوحدة والدرس منشورة وفيه أسئلة منشورة.
      </p>
    </>
  )
}
