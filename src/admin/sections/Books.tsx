import { useState, type FormEvent } from 'react'
import { invokeFunction } from '../../cloud/api'
import { ar } from '../../quiz/format'
import type { AdminNav } from '../AdminApp'
import { adminError, db, loadSubjects, rpc, useLoad } from '../data'

interface BookRow {
  id: string
  title: string
  subject_id: string | null
  grade: number | null
  semester: number | null
  mime_type: string
  size_bytes: number
  page_count: number | null
  status: string
  storage_path: string
  created_at: string
}
interface PageRow {
  page_number: number
  content: string
  status: string
  extracted_by: string
  lesson_hint: string | null
}

const MAX_BYTES = 50 * 1024 * 1024
const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}
const STATUS: Record<string, string> = { uploaded: 'مرفوع', processing: 'قيد المعالجة', processed: 'جاهز', failed: 'فشل', archived: 'مؤرشف' }

/** الكتب والمصادر — private uploads; nothing here is ever public. */
export function BooksSection({ navigate }: { navigate: AdminNav }) {
  const subjects = useLoad(loadSubjects, [])
  const books = useLoad(async () => {
    const { data, error } = await db().from('textbooks').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data as BookRow[]
  }, [])
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [grade, setGrade] = useState(8)
  const [semester, setSemester] = useState(1)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const pages = useLoad(async () => {
    if (!viewing) return [] as PageRow[]
    const { data, error } = await db().from('textbook_pages').select('page_number, content, status, extracted_by, lesson_hint').eq('textbook_id', viewing).order('page_number').limit(400)
    if (error) throw error
    return data as PageRow[]
  }, [viewing])

  const upload = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const mime = TYPES[ext]
    if (!mime) return setMsg({ ok: false, text: 'نوع الملف غير مدعوم. المسموح: PDF أو Markdown أو نص أو DOCX.' })
    if (file.size > MAX_BYTES) return setMsg({ ok: false, text: 'حجم الملف أكبر من ٥٠ ميغابايت.' })
    setBusy(true)
    setMsg(null)
    try {
      const id = crypto.randomUUID()
      const path = `${id}/source.${ext}`
      const up = await db().storage.from('textbooks').upload(path, file, { contentType: mime, upsert: false })
      if (up.error) throw up.error
      const { error } = await db().from('textbooks').insert({
        id, title: title.trim() || file.name, subject_id: subjectId || null, grade, semester, storage_path: path, mime_type: mime, size_bytes: file.size,
      })
      if (error) throw error
      const info = await invokeFunction<{ page_count: number; needs_extraction: boolean }>('ai-worker', { action: 'inspect', textbook_id: id })
      setMsg({
        ok: true,
        text: info.needs_extraction
          ? `رُفع الكتاب (${ar(info.page_count)} صفحة). لم يبدأ أي استخراج تلقائيًّا؛ اختر «استخراج النص» عندما تريد ذلك.`
          : `رُفع الملف وقُسّم إلى ${ar(info.page_count)} صفحة دون استخدام الذكاء الاصطناعي.`,
      })
      setFile(null)
      setTitle('')
      books.reload()
    } catch (err) {
      setMsg({ ok: false, text: adminError(err) })
    } finally {
      setBusy(false)
    }
  }

  const extract = async (b: BookRow) => {
    setMsg(null)
    try {
      const r = await rpc<{ job_id: string }>('admin_create_ai_job', {
        p: { kind: 'extract', textbook_id: b.id, page_from: 1, page_to: Math.min(b.page_count ?? 1, 600) },
      })
      navigate(['jobs', r.job_id])
    } catch (err) {
      setMsg({ ok: false, text: adminError(err) })
    }
  }

  const setStatus = async (b: BookRow, status: string) => {
    const { error } = await db().from('textbooks').update({ status }).eq('id', b.id)
    if (error) setMsg({ ok: false, text: adminError(error) })
    else books.reload()
  }
  const removeFile = async (b: BookRow) => {
    if (!window.confirm('حذف الملف الأصلي من التخزين؟ تبقى الصفحات المستخرجة والأسئلة.')) return
    const { error } = await db().storage.from('textbooks').remove([b.storage_path])
    if (error) setMsg({ ok: false, text: adminError(error) })
    else await setStatus(b, 'archived')
  }

  return (
    <>
      <h1 className="area__h1">الكتب والمصادر</h1>
      <p className="area__info">تُحفظ الملفات في تخزين خاص لا يصل إليه إلا المشرفون، ولا تُنشر الكتب للطلاب ولا تُرفع إلى GitHub.</p>
      {msg && <p className={msg.ok ? 'area__ok' : 'area__error'}>{msg.text}</p>}
      {books.error && <p className="area__error">{books.error}</p>}

      <form className="area__card area__form" onSubmit={(e) => void upload(e)}>
        <h2 className="area__h2" style={{ marginTop: 0 }}>رفع كتاب أو مصدر</h2>
        <label>
          الملف (PDF أو Markdown أو DOCX، حتى ٥٠ ميغابايت)
          <input type="file" accept=".pdf,.md,.markdown,.txt,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        </label>
        <label>
          العنوان
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: كتاب العلوم للصف الثامن" />
        </label>
        <div className="area__row">
          <label>
            المادة
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">—</option>
              {(subjects.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name_ar}
                </option>
              ))}
            </select>
          </label>
          <label>
            الصف
            <input type="number" min={1} max={12} value={grade} onChange={(e) => setGrade(Number(e.target.value))} />
          </label>
          <label>
            الفصل
            <input type="number" min={1} max={3} value={semester} onChange={(e) => setSemester(Number(e.target.value))} />
          </label>
        </div>
        <button type="submit" className="area__btn" disabled={busy || !file}>
          {busy ? 'جارٍ الرفع…' : 'رفع'}
        </button>
      </form>

      <div className="area__card area__table-wrap">
        <table className="area__table">
          <thead>
            <tr>
              <th>الكتاب</th>
              <th>النوع</th>
              <th>الصفحات</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {(books.data ?? []).map((b) => (
              <tr key={b.id}>
                <td>
                  <strong>{b.title}</strong>
                  <div className="area__muted">{subjects.data?.find((s) => s.id === b.subject_id)?.name_ar ?? '—'}</div>
                </td>
                <td dir="ltr">{b.mime_type.split('/').pop()?.replace('vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx')}</td>
                <td>{b.page_count ? ar(b.page_count) : '—'}</td>
                <td>{STATUS[b.status] ?? b.status}</td>
                <td>
                  <div className="area__row">
                    <button type="button" className="area__btn area__btn--ghost" onClick={() => setViewing(viewing === b.id ? null : b.id)}>
                      الصفحات
                    </button>
                    {b.mime_type === 'application/pdf' && b.status !== 'archived' && (
                      <button type="button" className="area__btn" onClick={() => void extract(b)}>
                        استخراج النص
                      </button>
                    )}
                    {b.status !== 'archived' ? (
                      <button type="button" className="area__btn area__btn--ghost" onClick={() => void removeFile(b)}>
                        حذف الملف
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewing && (
        <div className="area__card">
          <h2 className="area__h2" style={{ marginTop: 0 }}>الصفحات المستخرجة</h2>
          {pages.data?.length === 0 && <p className="area__muted">لا توجد صفحات مستخرجة بعد.</p>}
          {(pages.data ?? []).map((p) => (
            <details key={p.page_number} style={{ marginBottom: 6 }}>
              <summary>
                صفحة {ar(p.page_number)} {p.lesson_hint ? `— ${p.lesson_hint}` : ''} <span className="area__muted">({p.extracted_by})</span>
              </summary>
              <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.9 }}>{p.content}</p>
            </details>
          ))}
        </div>
      )}
    </>
  )
}
