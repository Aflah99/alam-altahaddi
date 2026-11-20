import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CATEGORIES, createCourse, ICONS, myCourses, redeemInvite, setCreatorName, STATUS_AR, VISIBILITY_AR, VISIBILITY_HELP, type MyCourse, type Visibility } from '../../community/api'
import { supabase } from '../../cloud/client'
import { errText, useAsyncMsg } from '../../community/util'
import { CourseEditor } from './CourseEditor'
import './community.css'

/** إنشاء مادة تعليمية — the parent's own community courses. */
export function CoursesSection({ path, navigate }: { path: string[]; navigate: (path: string[]) => void }) {
  if (path[0] === 'join') return <JoinPanel code={path[1] ?? ''} navigate={navigate} />
  if (path[0]) return <CourseEditor id={path[0]} tab={path[1]} navigate={navigate} />
  return <CourseList navigate={navigate} />
}

function CourseList({ navigate }: { navigate: (path: string[]) => void }) {
  const [courses, setCourses] = useState<MyCourse[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [creator, setCreator] = useState('')
  const [code, setCode] = useState('')
  const { msg, busy, run } = useAsyncMsg()
  const { msg: joinMsg, run: runJoin, busy: joining } = useAsyncMsg()

  const load = useCallback(async () => {
    try {
      setCourses(await myCourses())
      const { data } = await supabase()!.from('creator_profiles').select('display_name').maybeSingle()
      if (data?.display_name) setCreator(data.display_name)
    } catch (e) {
      setError(errText(e))
    }
  }, [])
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(t)
  }, [load])

  return (
    <div className="cc-list">
      <h1 className="area__h1">إنشاء مادة تعليمية</h1>
      <p className="area__info">
        أنشئ مادتك الخاصة (وحدات ودروس وأسئلة) وانشرها فورًا ليلعبها أبناؤك وأبناء العائلات الأخرى داخل عالم التحدّي. المواد المجتمعية غير معتمدة رسميًا، وتظهر للطلاب بعلامة «مادة مجتمعية».
      </p>
      {error && <p className="area__error">{error}</p>}
      {msg && <p className={msg.ok ? 'area__ok' : 'area__error'} role="status">{msg.text}</p>}

      <div className="area__row">
        <button type="button" className="area__btn" onClick={() => setCreating((c) => !c)} aria-expanded={creating} data-testid="new-course">
          {creating ? 'إغلاق' : '+ مادة جديدة'}
        </button>
      </div>
      {creating && <NewCourse onCreated={(id) => navigate(['courses', id])} />}

      {courses && courses.length === 0 && !creating && <p className="area__card area__muted">لم تُنشئ أي مادة بعد. ابدأ بزر «مادة جديدة».</p>}
      <div className="cc-grid">
        {courses?.map((c) => (
          <article key={c.id} className="area__card cc-course" data-testid="course-card">
            <header>
              <h2 className="area__h2" style={{ margin: 0 }}>{c.name_ar}</h2>
              <span className={`area__chip ${c.status === 'published' ? 'area__chip--ok' : ''}`}>{STATUS_AR[c.status]}</span>
              <span className="area__chip">{VISIBILITY_AR[c.visibility]}</span>
              {c.moderation !== 'ok' && <span className="area__chip area__chip--bad">موقوفة من الإدارة</span>}
            </header>
            <p className="area__muted">{c.description || '—'}</p>
            <p className="area__muted">{c.counts.units} وحدات · {c.counts.lessons} دروس · {c.counts.questions} أسئلة</p>
            {c.status === 'published' && (
              <p className="area__muted">
                {c.enrollments} مشتركًا · {c.rating.count > 0 ? `★ ${c.rating.avg} (${c.rating.count})` : 'بلا تقييمات بعد'}
                {c.my_children_enrolled > 0 && ` · ${c.my_children_enrolled} من أبنائك مشتركون`}
              </p>
            )}
            {c.moderation !== 'ok' && c.moderation_note && <p className="area__error">{c.moderation_note}</p>}
            <div className="area__row">
              <button type="button" className="area__btn" onClick={() => navigate(['courses', c.id])}>تعديل</button>
              <button type="button" className="area__btn area__btn--ghost" onClick={() => navigate(['courses', c.id, 'preview'])}>معاينة</button>
              <button type="button" className="area__btn area__btn--ghost" onClick={() => navigate(['courses', c.id, 'publish'])}>النشر والمشاركة</button>
            </div>
          </article>
        ))}
      </div>

      <section className="area__card area__form">
        <h2 className="area__h2">اسمك الظاهر للآخرين</h2>
        <p className="area__muted">يظهر هذا الاسم على موادك بدل بريدك الإلكتروني. لا تكتب اسمك الحقيقي أو بريدك أو رقم هاتفك.</p>
        <form className="cc-inline" onSubmit={(e) => { e.preventDefault(); void run(() => setCreatorName(creator), 'تم حفظ الاسم.') }}>
          <input value={creator} maxLength={30} aria-label="اسم المبدع" onChange={(e) => setCreator(e.target.value)} />
          <button type="submit" className="area__btn" disabled={busy || creator.trim().length < 2}>حفظ</button>
        </form>
      </section>

      <section className="area__card area__form">
        <h2 className="area__h2">لديك رمز دعوة؟</h2>
        <p className="area__muted">أدخل رمز الدعوة الذي أرسله لك أحد أولياء الأمور لتصبح المادة متاحة لأبنائك.</p>
        <form className="cc-inline" onSubmit={(e) => { e.preventDefault(); void runJoin(async () => { const r = await redeemInvite(code); if (r.status !== 'ok') throw new Error('invalid'); return r }, (r) => `تمت إضافة «${r.course?.name_ar}»؛ يستطيع أبناؤك الاشتراك فيها من «اكتشف المواد».`) }}>
          <input value={code} maxLength={12} dir="ltr" aria-label="رمز الدعوة" onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button type="submit" className="area__btn" disabled={joining || code.trim().length < 6}>انضمام</button>
        </form>
        {joinMsg && <p className={joinMsg.ok ? 'area__ok' : 'area__error'} role="status">{joinMsg.ok ? joinMsg.text : 'الرمز غير صحيح أو انتهت صلاحيته.'}</p>}
      </section>
    </div>
  )
}

function NewCourse({ onCreated }: { onCreated: (id: string) => void }) {
  const [f, setF] = useState({ name_ar: '', description: '', grade: 8, category: '', icon: 'book', visibility: 'public' as Visibility })
  const { msg, busy, run } = useAsyncMsg()
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const id = await run(() => createCourse(f))
    if (id) onCreated(id)
  }
  return (
    <form className="area__card area__form" onSubmit={(e) => void submit(e)} data-testid="create-form">
      <label>اسم المادة<input value={f.name_ar} maxLength={60} required placeholder="مثال: علوم الصف الثامن — الوحدة الأولى" onChange={(e) => setF({ ...f, name_ar: e.target.value })} /></label>
      <label>وصف قصير<textarea rows={2} maxLength={400} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      <div className="area__row">
        <label>الصف<select value={f.grade} onChange={(e) => setF({ ...f, grade: Number(e.target.value) })}>{Array.from({ length: 12 }, (_, i) => i + 1).map((g) => <option key={g} value={g}>الصف {g}</option>)}</select></label>
        <label>التصنيف<select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">— اختر —</option>{CATEGORIES.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
        <label>الأيقونة<select value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })}>{ICONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      </div>
      <fieldset className="cc-options">
        <legend>الظهور</legend>
        {(['public', 'private', 'invite'] as Visibility[]).map((k) => (
          <label key={k} className="cc-radio"><input type="radio" name="vis" checked={f.visibility === k} onChange={() => setF({ ...f, visibility: k })} /><span><b>{VISIBILITY_AR[k]}</b> — {VISIBILITY_HELP[k]}</span></label>
        ))}
      </fieldset>
      {msg && <p className={msg.ok ? 'area__ok' : 'area__error'} role="status">{msg.text}</p>}
      <div className="area__row"><button className="area__btn" type="submit" disabled={busy}>{busy ? 'جارٍ الإنشاء…' : 'إنشاء المادة'}</button></div>
    </form>
  )
}

function JoinPanel({ code, navigate }: { code: string; navigate: (path: string[]) => void }) {
  const { msg, run } = useAsyncMsg()
  const [done, setDone] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (code) void run(async () => { const r = await redeemInvite(code); if (r.status !== 'ok') throw new Error('invalid'); setDone(true); return r })
    }, 0)
    return () => window.clearTimeout(t)
  }, [code, run])
  return (
    <div className="area__card">
      <h1 className="area__h1">رمز الدعوة</h1>
      {done ? <p className="area__ok">تمت إضافة المادة. يستطيع أبناؤك الاشتراك فيها من «اكتشف المواد».</p> : msg ? <p className="area__error">الرمز غير صحيح أو انتهت صلاحيته.</p> : <p className="area__muted">جارٍ التحقق…</p>}
      <button type="button" className="area__btn" onClick={() => navigate(['courses'])}>موادي</button>
    </div>
  )
}
