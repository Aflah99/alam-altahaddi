import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  CATEGORIES, courseInvite, createInvite, deleteCourse, getCourse, ICONS, revokeInvites, setStatus, setVisibility, STATUS_AR, THEMES, updateCourse, validateCourse,
  VISIBILITY_AR, VISIBILITY_HELP, type CourseDetail, type Validation, type ValidationIssue, type Visibility,
} from '../../community/api'
import { CONFIRM_LEAVE, errText, useAsyncMsg, useUnsavedWarning } from '../../community/util'
import { ContentTab } from './ContentTab'

const TABS = [
  ['content', 'المحتوى'],
  ['info', 'معلومات المادة'],
  ['preview', 'معاينة'],
  ['publish', 'النشر والمشاركة'],
] as const
type Tab = (typeof TABS)[number][0]

const ISSUE_AR: Record<string, (i: ValidationIssue) => string> = {
  title: () => 'اسم المادة قصير جدًّا (٣ أحرف على الأقل).',
  description: () => 'اكتب وصفًا للمادة (١٠ أحرف على الأقل).',
  no_units: () => 'أضف وحدة واحدة على الأقل.',
  no_lessons: () => 'أضف درسًا واحدًا على الأقل.',
  few_questions: (i) => `المادة تحتوي ${i.have ?? 0} أسئلة فقط، والحد الأدنى ${i.need ?? 5}.`,
  unsafe: (i) => `وُجد نص غير مسموح (روابط أو رموز برمجية أو كلمات محظورة) في ${i.where === 'questions' ? 'الأسئلة' : i.where === 'structure' ? 'عناوين الوحدات والدروس' : 'معلومات المادة'}.`,
  official_claim: () => 'اسم المادة أو وصفها يدّعي أنها رسمية أو معتمدة؛ هذا غير مسموح للمواد المجتمعية.',
  creator_blocked: () => 'تم إيقاف النشر لحسابك من الإدارة.',
  moderated: () => 'هذه المادة موقوفة من الإدارة.',
  empty_lesson: (i) => `الدرس «${i.title}» لا يحتوي أسئلة، ولن يظهر للطلاب.`,
}

/** محرّر المادة: content, details, preview and publishing for one community course. */
export function CourseEditor({ id, tab, navigate }: { id: string; tab?: string; navigate: (path: string[]) => void }) {
  const [detail, setDetail] = useState<CourseDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const current: Tab = (TABS.find((t) => t[0] === tab)?.[0] ?? 'content') as Tab
  useUnsavedWarning(dirty)

  const reload = useCallback(async () => {
    try {
      setDetail(await getCourse(id))
      setError(null)
    } catch (e) {
      setError(errText(e))
    }
  }, [id])
  useEffect(() => {
    const t = window.setTimeout(() => void reload(), 0)
    return () => window.clearTimeout(t)
  }, [reload])

  const go = (path: string[]) => {
    if (dirty && !window.confirm(CONFIRM_LEAVE)) return
    setDirty(false)
    navigate(path)
  }

  if (error) return <p className="area__error">{error}</p>
  if (!detail) return <p className="area__muted">جارٍ التحميل…</p>
  const c = detail.course

  return (
    <div className="cc-editor">
      <div className="area__row">
        <button type="button" className="area__btn area__btn--ghost" onClick={() => go(['courses'])}>← موادي</button>
        <h1 className="area__h1" style={{ margin: 0 }}>{c.name_ar}</h1>
        <span className={`area__chip ${c.status === 'published' ? 'area__chip--ok' : ''}`}>{STATUS_AR[c.status]}</span>
        <span className="area__chip">{VISIBILITY_AR[c.visibility]}</span>
      </div>
      {c.moderation !== 'ok' && (
        <p className="area__error" role="alert">أوقفت الإدارة هذه المادة{c.moderation_note ? `: ${c.moderation_note}` : '.'} لا يمكن تعديلها أو نشرها حتى تُراجَع.</p>
      )}
      <div className="area__tabs" role="tablist" aria-label="أقسام المادة">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" className="area__tab" aria-pressed={current === k} aria-selected={current === k} onClick={() => go(['courses', id, k])}>
            {label}
          </button>
        ))}
      </div>
      {current === 'content' && <ContentTab detail={detail} batchMax={100} reload={reload} />}
      {current === 'info' && <InfoTab detail={detail} reload={reload} setDirty={setDirty} />}
      {current === 'preview' && <PreviewTab detail={detail} />}
      {current === 'publish' && <PublishTab detail={detail} reload={reload} onDeleted={() => navigate(['courses'])} />}
    </div>
  )
}

function InfoTab({ detail, reload, setDirty }: { detail: CourseDetail; reload: () => Promise<void>; setDirty: (d: boolean) => void }) {
  const c = detail.course
  const [f, setF] = useState({ name_ar: c.name_ar, description: c.description, grade: c.grade, category: c.category, source_label: c.source_label, icon: c.icon, theme: c.theme })
  const { msg, busy, run } = useAsyncMsg()
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF((s) => ({ ...s, [k]: v }))
    setDirty(true)
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const ok = await run(async () => { await updateCourse(c.id, f); await reload(); return true }, 'تم حفظ معلومات المادة.')
    if (ok) setDirty(false)
  }
  return (
    <form className="area__card area__form" onSubmit={(e) => void submit(e)} data-testid="info-form">
      <label>اسم المادة<input value={f.name_ar} maxLength={60} required onChange={(e) => set('name_ar', e.target.value)} /></label>
      <label>وصف قصير (يظهر للطلاب في البحث)<textarea value={f.description} maxLength={400} rows={3} onChange={(e) => set('description', e.target.value)} /></label>
      <div className="area__row">
        <label>الصف<select value={f.grade} onChange={(e) => set('grade', Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => i + 1).map((g) => <option key={g} value={g}>الصف {g}</option>)}</select></label>
        <label>التصنيف
          <select value={CATEGORIES.includes(f.category as never) ? f.category : f.category ? 'أخرى' : ''} onChange={(e) => set('category', e.target.value)}>
            <option value="">— اختر —</option>
            {CATEGORIES.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label>الأيقونة<select value={f.icon} onChange={(e) => set('icon', e.target.value)}>{ICONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>شكل العالم<select value={f.theme} onChange={(e) => set('theme', e.target.value)}>{THEMES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      </div>
      <label>المصدر أو المرجع (اختياري، بلا روابط)<input value={f.source_label} maxLength={80} onChange={(e) => set('source_label', e.target.value)} /></label>
      {msg && <p className={msg.ok ? 'area__ok' : 'area__error'} role="status">{msg.text}</p>}
      <div className="area__row"><button className="area__btn" type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button></div>
    </form>
  )
}

function PreviewTab({ detail }: { detail: CourseDetail }) {
  const c = detail.course
  const [answers, setAnswers] = useState(false)
  const sample = detail.units.flatMap((u) => u.lessons.flatMap((l) => l.questions.map((q) => ({ q, lesson: l.title })))).slice(0, 5)
  return (
    <div className="cc-preview">
      <p className="area__info">هكذا ستظهر المادة للطلاب. الإجابات لا تظهر للطلاب أثناء اللعب إلا بعد أن يجيبوا.</p>
      <article className="cc-card" data-theme={c.theme}>
        <h2>{c.name_ar}</h2>
        <p>{c.description || '— لا يوجد وصف —'}</p>
        <p className="cc-card__meta">
          <span className="area__chip area__chip--warn">مادة مجتمعية · أنشأها ولي أمر ({c.creator_name})</span>
          <span className="area__chip">الصف {c.grade}</span>
          {c.category && <span className="area__chip">{c.category}</span>}
        </p>
        <p className="cc-card__meta">{detail.counts.units} وحدات · {detail.counts.lessons} دروس · {detail.counts.questions} أسئلة</p>
        <p className="area__muted">لم يُراجع محتوى هذه المادة أكاديميًا من المنصة.</p>
      </article>
      {detail.units.map((u) => (
        <div key={u.id} className="area__card">
          <b>{u.title}</b>
          <ul>{u.lessons.map((l) => <li key={l.id}>{l.title} — {l.questions.length} أسئلة</li>)}</ul>
        </div>
      ))}
      <h3 className="area__h2">عيّنة من الأسئلة</h3>
      <label className="area__check"><input type="checkbox" checked={answers} onChange={(e) => setAnswers(e.target.checked)} /> إظهار الإجابات الصحيحة (للمراجعة فقط)</label>
      <ol className="cc-questions">
        {sample.map(({ q, lesson }) => (
          <li key={q.id} className="cc-q">
            <div className="cc-q__main">
              <p className="cc-q__text"><span className="area__chip">{lesson}</span> {q.text}</p>
              {q.qtype === 'mcq' ? (
                <ul className="cc-row__opts">{q.options?.map((o, k) => <li key={k} className={answers && q.correct_option === 'abcd'[k] ? 'is-correct' : ''}>{'أبجد'[k]}: {o}</li>)}</ul>
              ) : (
                <p className="cc-row__opts">{answers ? `الإجابات: ${q.accepted_answers.join(' | ')}` : 'سيكتب الطالب إجابته.'}</p>
              )}
            </div>
          </li>
        ))}
        {sample.length === 0 && <li className="area__muted">لا توجد أسئلة بعد.</li>}
      </ol>
    </div>
  )
}

function PublishTab({ detail, reload, onDeleted }: { detail: CourseDetail; reload: () => Promise<void>; onDeleted: () => void }) {
  const c = detail.course
  const [v, setV] = useState<Validation | null>(null)
  const [invite, setInvite] = useState<Awaited<ReturnType<typeof courseInvite>>>(null)
  const { msg, busy, run } = useAsyncMsg()
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    try {
      setV(await validateCourse(c.id))
      if (c.visibility === 'invite') setInvite(await courseInvite(c.id))
    } catch {
      /* shown by actions */
    }
  }, [c.id, c.visibility])
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(t)
  }, [load, detail])

  const act = (fn: () => Promise<unknown>, ok: string | ((r: never) => string)) => run(async () => { const r = await fn(); await reload(); await load(); return r }, ok as never)
  const link = invite ? `${location.origin}${location.pathname}#/join-course/${invite.code}` : ''

  return (
    <div className="cc-publish">
      <section className="area__card">
        <h2 className="area__h2">جاهزية النشر</h2>
        {!v ? <p className="area__muted">جارٍ الفحص…</p> : (
          <>
            <p className={v.ok ? 'area__ok' : 'area__error'}>{v.ok ? '✓ المادة جاهزة للنشر.' : 'المادة غير جاهزة بعد:'}</p>
            <ul className="cc-checks">
              {v.errors.map((e, i) => <li key={i} className="area__error">⛔ {(ISSUE_AR[e.code] ?? (() => e.code))(e)}</li>)}
              {v.warnings.map((e, i) => <li key={i} className="cc-warn">⚠ {(ISSUE_AR[e.code] ?? (() => e.code))(e)}</li>)}
            </ul>
            <p className="area__muted">{v.counts.units} وحدات · {v.counts.lessons} دروس · {v.counts.questions} أسئلة ({v.counts.mcq} اختيار، {v.counts.written} كتابي)</p>
          </>
        )}
      </section>

      <section className="area__card area__form">
        <h2 className="area__h2">من يستطيع رؤية المادة؟</h2>
        {(['public', 'private', 'invite'] as Visibility[]).map((k) => (
          <label key={k} className="cc-radio">
            <input type="radio" name="visibility" checked={c.visibility === k} disabled={busy || c.moderation !== 'ok'}
              onChange={() => void act(() => setVisibility(c.id, k), (r: { students_without_access: number }) => r.students_without_access > 0 ? `تم تغيير الظهور. ${r.students_without_access} طالبًا مشتركًا فقدوا الوصول، وتقدّمهم محفوظ ويعود إليهم إن أعدتها عامة.` : 'تم تغيير الظهور.')} />
            <span><b>{VISIBILITY_AR[k]}</b> — {VISIBILITY_HELP[k]}</span>
          </label>
        ))}
        {c.visibility === 'invite' && (
          <div className="cc-invite">
            {invite ? (
              <>
                <p>رمز الدعوة: <code className="cc-code" data-testid="invite-code">{invite.code}</code></p>
                <p className="area__muted">ينتهي في {new Date(invite.expires_at).toLocaleDateString('ar-OM')} · استُخدم {invite.uses} من {invite.max_uses} · {invite.invited_families} مدعوًّا</p>
                <div className="area__row">
                  <button type="button" className="area__btn area__btn--ghost" onClick={() => void navigator.clipboard?.writeText(invite.code).then(() => setCopied(true)).catch(() => setCopied(false))}>نسخ الرمز</button>
                  <button type="button" className="area__btn area__btn--ghost" onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => setCopied(false))}>نسخ الرابط</button>
                </div>
                {copied && <p className="area__ok" role="status">تم النسخ.</p>}
              </>
            ) : <p className="area__muted">لا يوجد رمز دعوة فعّال.</p>}
            <div className="area__row">
              <button type="button" className="area__btn" disabled={busy} onClick={() => void act(() => createInvite(c.id), 'تم إنشاء رمز جديد، وتوقّف الرمز القديم عن العمل.')}>{invite ? 'رمز جديد' : 'إنشاء رمز دعوة'}</button>
              {invite && <button type="button" className="area__btn area__btn--danger" disabled={busy} onClick={() => window.confirm('إلغاء الرمز؟') && void act(() => revokeInvites(c.id, false), 'أُلغي الرمز؛ من انضم سابقًا يحتفظ بالوصول.')}>إلغاء الرمز</button>}
              <button type="button" className="area__btn area__btn--danger" disabled={busy} onClick={() => window.confirm('إلغاء الرمز وسحب الوصول من كل من انضم بالدعوة؟') && void act(() => revokeInvites(c.id, true), (n: number) => `أُلغي الرمز وسُحب الوصول من ${n} مدعوًّا.`)}>إلغاء الرمز وسحب الوصول</button>
            </div>
          </div>
        )}
      </section>

      <section className="area__card">
        <h2 className="area__h2">النشر</h2>
        <p className="area__info">النشر فوري ولا يحتاج موافقة الإدارة. المواد المجتمعية غير معتمدة رسميًا ولا تُراجَع أكاديميًا مسبقًا، وقد تُراجَع أو تُوقَف لاحقًا إذا وصلت بلاغات عنها. أنت مسؤول عن صحة المحتوى وحقوق نشره.</p>
        {msg && <p className={msg.ok ? 'area__ok' : 'area__error'} role="status">{msg.text}</p>}
        <div className="area__row">
          {c.status !== 'published' ? (
            <button type="button" className="area__btn area__btn--ok" disabled={busy || !v?.ok || c.moderation !== 'ok'} onClick={() => void act(() => setStatus(c.id, 'published'), c.visibility === 'public' ? 'تم النشر! تظهر المادة الآن في «اكتشف المواد».' : 'تم النشر.')} data-testid="publish">
              {c.status === 'archived' ? 'إعادة النشر' : 'نشر المادة الآن'}
            </button>
          ) : (
            <button type="button" className="area__btn" disabled={busy} onClick={() => void act(() => setStatus(c.id, 'draft'), 'أُلغي النشر وعادت المادة مسودة. المشتركون يحتفظون بتقدّمهم.')}>إلغاء النشر</button>
          )}
          {c.status !== 'archived' && <button type="button" className="area__btn area__btn--ghost" disabled={busy} onClick={() => window.confirm('أرشفة المادة؟') && void act(() => setStatus(c.id, 'archived'), 'تمت الأرشفة.')}>أرشفة</button>}
          <button type="button" className="area__btn area__btn--danger" disabled={busy} onClick={() => window.confirm('حذف المادة؟ إن لعبها طلاب تُؤرشف بدل الحذف للحفاظ على نتائجهم.') && void run(async () => { const r = await deleteCourse(c.id); if (r === 'deleted') onDeleted(); else await reload(); return r }, (r) => (r === 'deleted' ? 'تم الحذف.' : 'أُرشفت المادة بدل حذفها لأن طلابًا لعبوها.'))}>حذف</button>
        </div>
      </section>
    </div>
  )
}
