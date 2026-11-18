import { useState, type FormEvent } from 'react'
import { THEMES } from '../../world/config/themes'
import type { AdminNav } from '../AdminApp'
import { adminError, db, loadSubjects, STATUS_AR, statusChip, useLoad, type SubjectRow } from '../data'

const ICONS: [string, string][] = [
  ['book', 'كتاب'],
  ['star', 'نجمة'],
  ['flask', 'مختبر'],
  ['globe', 'كرة أرضية'],
  ['calc', 'حاسبة'],
  ['quill', 'قلم'],
  ['leaf', 'ورقة شجر'],
  ['gear', 'ترس'],
]

const EMPTY: Omit<SubjectRow, 'id'> = {
  slug: '',
  name_ar: '',
  name_en: '',
  grade: 8,
  semester: 1,
  description: '',
  icon: 'book',
  theme: 'forest',
  sort_order: 10,
  status: 'draft',
  source_label: '',
}

/** المواد الدراسية — create, edit, publish, unpublish, archive and reorder subjects. No code changes needed. */
export function SubjectsSection({ navigate }: { navigate: AdminNav }) {
  const { data, error, reload } = useLoad(loadSubjects, [])
  const [editing, setEditing] = useState<(Omit<SubjectRow, 'id'> & { id?: string }) | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setBusy(true)
    setMsg(null)
    try {
      const row = { ...editing, slug: editing.slug.trim().toLowerCase(), name_en: editing.name_en || null }
      if (editing.id) {
        const { id, ...rest } = row
        const { error: err } = await db().from('subjects').update(rest).eq('id', id!)
        if (err) throw err
      } else {
        const { id: _omit, ...rest } = row
        void _omit
        const { error: err } = await db().from('subjects').insert(rest)
        if (err) throw err
      }
      setMsg({ ok: true, text: 'تم حفظ المادة.' })
      setEditing(null)
      reload()
    } catch (err) {
      setMsg({ ok: false, text: adminError(err) })
    } finally {
      setBusy(false)
    }
  }

  const setStatus = async (s: SubjectRow, status: SubjectRow['status']) => {
    setMsg(null)
    const { error: err } = await db().from('subjects').update({ status }).eq('id', s.id)
    if (err) setMsg({ ok: false, text: adminError(err) })
    else {
      setMsg({
        ok: true,
        text: status === 'published' ? `نُشرت «${s.name_ar}»؛ تظهر للطلاب على الخريطة خلال دقيقة دون أي نشر للموقع.` : `تغيّرت حالة «${s.name_ar}». سجلّات تعلّم الطلاب محفوظة.`,
      })
      reload()
    }
  }

  return (
    <>
      <h1 className="area__h1">المواد الدراسية</h1>
      {msg && <p className={msg.ok ? 'area__ok' : 'area__error'}>{msg.text}</p>}
      {error && <p className="area__error">{error}</p>}
      <div className="area__row" style={{ marginBottom: 12 }}>
        <button type="button" className="area__btn" onClick={() => setEditing({ ...EMPTY })}>
          إضافة مادة
        </button>
      </div>

      {editing && (
        <form className="area__card area__form" onSubmit={(e) => void save(e)} data-testid="subject-form">
          <h2 className="area__h2" style={{ marginTop: 0 }}>{editing.id ? 'تعديل مادة' : 'مادة جديدة'}</h2>
          <label>
            الاسم بالعربية
            <input value={editing.name_ar} onChange={(e) => setEditing({ ...editing, name_ar: e.target.value })} required />
          </label>
          <label>
            الاسم بالإنجليزية (اختياري)
            <input value={editing.name_en ?? ''} onChange={(e) => setEditing({ ...editing, name_en: e.target.value })} dir="ltr" />
          </label>
          <label>
            المعرّف في الرابط (حروف إنجليزية صغيرة وشرطة)
            <input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} dir="ltr" required pattern="[a-z0-9\-]{2,40}" />
          </label>
          <div className="area__row">
            <label>
              الصف
              <input type="number" min={1} max={12} value={editing.grade} onChange={(e) => setEditing({ ...editing, grade: Number(e.target.value) })} />
            </label>
            <label>
              الفصل الدراسي
              <input type="number" min={1} max={3} value={editing.semester} onChange={(e) => setEditing({ ...editing, semester: Number(e.target.value) })} />
            </label>
            <label>
              الترتيب
              <input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
            </label>
          </div>
          <label>
            الوصف (يظهر على الخريطة)
            <textarea value={editing.description} maxLength={400} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          </label>
          <label>
            اسم المصدر (يظهر تحت كل شرح)
            <input value={editing.source_label} maxLength={80} onChange={(e) => setEditing({ ...editing, source_label: e.target.value })} />
          </label>
          <div className="area__row">
            <label>
              الأيقونة
              <select value={editing.icon} onChange={(e) => setEditing({ ...editing, icon: e.target.value })}>
                {ICONS.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              شكل العالم
              <select value={editing.theme} onChange={(e) => setEditing({ ...editing, theme: e.target.value })}>
                {THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              الحالة
              <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as SubjectRow['status'] })}>
                <option value="draft">مسودة (لا يراها الطلاب)</option>
                <option value="published">منشورة</option>
                <option value="archived">مؤرشفة</option>
              </select>
            </label>
          </div>
          <div className="area__row">
            <button type="submit" className="area__btn" disabled={busy}>
              حفظ
            </button>
            <button type="button" className="area__btn area__btn--ghost" onClick={() => setEditing(null)}>
              إلغاء
            </button>
          </div>
        </form>
      )}

      {data && (
        <div className="area__card area__table-wrap">
          <table className="area__table">
            <thead>
              <tr>
                <th>المادة</th>
                <th>الصف / الفصل</th>
                <th>العالم</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name_ar}</strong>
                    <div className="area__muted" dir="ltr">
                      {s.slug}
                    </div>
                  </td>
                  <td>
                    {s.grade} / {s.semester}
                  </td>
                  <td>{THEMES.find((t) => t.id === s.theme)?.label ?? s.theme}</td>
                  <td>
                    <span className={statusChip(s.status)}>{STATUS_AR[s.status] ?? s.status}</span>
                  </td>
                  <td>
                    <div className="area__row">
                      <button type="button" className="area__btn area__btn--ghost" onClick={() => setEditing({ ...s })}>
                        تعديل
                      </button>
                      <button type="button" className="area__btn area__btn--ghost" onClick={() => navigate(['lessons', s.id])}>
                        الوحدات والدروس
                      </button>
                      {s.status !== 'published' ? (
                        <button type="button" className="area__btn area__btn--ok" onClick={() => void setStatus(s, 'published')}>
                          نشر
                        </button>
                      ) : (
                        <button type="button" className="area__btn area__btn--ghost" onClick={() => void setStatus(s, 'draft')}>
                          إلغاء النشر
                        </button>
                      )}
                      {s.status !== 'archived' && (
                        <button type="button" className="area__btn area__btn--ghost" onClick={() => void setStatus(s, 'archived')}>
                          أرشفة
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
