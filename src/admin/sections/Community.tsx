import { useState } from 'react'
import type { CourseDetail } from '../../community/api'
import type { AdminNav } from '../AdminApp'
import { rpc, useLoad } from '../data'

interface AdminCourse {
  id: string; slug: string; name_ar: string; category: string; grade: number; status: string; visibility: string; moderation: 'ok' | 'suspended' | 'removed'
  moderation_note: string; kind: string; published_at: string | null; updated_at: string; owner_id: string; owner_email: string | null; creator_name: string
  counts: { units: number; lessons: number; questions: number }; rating: { avg: number | null; count: number }; enrollments: number; open_reports: number; reward_xp_7d: number
}
interface AdminReport {
  id: string; subject_id: string; course: string; course_status: string; moderation: string; creator_name: string; owner_id: string; category: string; details: string
  status: string; resolution: string; created_at: string; reporter: string; reporter_dismissed_30d: number; reports_on_course: number; distinct_reporters: number
}
const CAT_AR: Record<string, string> = { incorrect: 'محتوى غير صحيح', inappropriate: 'محتوى غير مناسب', copyright: 'حقوق النشر', misleading: 'معلومات مضلّلة', other: 'أخرى' }
const MOD_AR: Record<string, string> = { ok: 'سليمة', suspended: 'موقوفة', removed: 'محذوفة من الإدارة' }
const TABS = [['courses', 'المواد'], ['reports', 'البلاغات'], ['insights', 'المؤشرات'], ['settings', 'الإعدادات']] as const

/** المواد المجتمعية — moderation of parent-created courses. Every action is enforced by admin-only database functions. */
export function CommunitySection({ arg }: { arg?: string; navigate: AdminNav }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>(arg === 'reports' ? 'reports' : 'courses')
  return (
    <>
      <h1 className="area__h1">المواد المجتمعية</h1>
      <p className="area__info">مواد أنشأها أولياء الأمور وتُنشر فورًا دون موافقة مسبقة. تتم المراقبة بعد النشر عبر البلاغات والإيقاف. المواد الرسمية تُدار من «المواد الدراسية».</p>
      <div className="area__tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} type="button" className="area__tab" role="tab" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'courses' && <Courses />}
      {tab === 'reports' && <Reports />}
      {tab === 'insights' && <Insights />}
      {tab === 'settings' && <Settings />}
    </>
  )
}

function useAct(reload: () => void) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null)
    try {
      await fn()
      setMsg({ ok: true, text: ok })
      reload()
    } catch (e) {
      setMsg({ ok: false, text: String((e as { message?: string })?.message ?? e) })
    }
  }
  return { msg, act }
}

function Courses() {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('')
  const [inspect, setInspect] = useState<CourseDetail | null>(null)
  const { data, error, reload } = useLoad(() => rpc<AdminCourse[]>('admin_community_courses', { p_q: q, p_filter: filter, p_limit: 100, p_offset: 0 }), [q, filter])
  const { msg, act } = useAct(reload)
  const moderate = (c: AdminCourse, action: string, ok: string, ask: boolean) => {
    const note = ask ? window.prompt('سبب الإجراء (يظهر لصاحب المادة):', '') : ''
    if (note === null) return
    void act(() => rpc('admin_moderate_course', { p_subject: c.id, p_action: action, p_note: note }), ok)
  }
  return (
    <>
      <div className="area__row">
        <input className="area__input" placeholder="بحث باسم المادة أو المبدع" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
        <select className="area__input" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="تصفية">
          <option value="">الكل</option><option value="published">منشورة</option><option value="draft">مسودات</option><option value="archived">مؤرشفة</option>
          <option value="suspended">موقوفة</option><option value="removed">محذوفة من الإدارة</option><option value="reported">عليها بلاغات</option>
        </select>
      </div>
      {error && <p className="area__error">{error}</p>}
      {msg && <p className={msg.ok ? 'area__ok' : 'area__error'} role="status">{msg.text}</p>}
      <div className="area__table-wrap">
        <table className="area__table">
          <thead><tr><th>المادة</th><th>المبدع</th><th>الحالة</th><th>الأسئلة</th><th>مشتركون</th><th>بلاغات</th><th>إجراءات</th></tr></thead>
          <tbody>
            {data?.map((c) => (
              <tr key={c.id} data-testid="admin-course">
                <td><b>{c.name_ar}</b><br /><span className="area__muted">{c.kind === 'official' ? 'رسمية' : 'مجتمعية'} · الصف {c.grade} · {c.category || '—'}</span></td>
                <td>{c.creator_name}<br /><span className="area__muted" dir="ltr">{c.owner_email}</span></td>
                <td><span className={`area__chip ${c.status === 'published' ? 'area__chip--ok' : ''}`}>{c.status}</span> <span className="area__chip">{c.visibility}</span>{c.moderation !== 'ok' && <span className="area__chip area__chip--bad">{MOD_AR[c.moderation]}</span>}</td>
                <td>{c.counts.questions}</td>
                <td>{c.enrollments}</td>
                <td>{c.open_reports > 0 ? <span className="area__chip area__chip--warn">{c.open_reports}</span> : 0}</td>
                <td className="area__row">
                  <button type="button" className="area__btn area__btn--ghost" onClick={() => void rpc<CourseDetail>('cc_get_course', { p_id: c.id }).then(setInspect)}>فحص</button>
                  {c.moderation === 'ok' ? <button type="button" className="area__btn area__btn--danger" onClick={() => moderate(c, 'suspend', 'أُوقفت المادة وخرجت من البحث.', true)}>إيقاف</button> : <button type="button" className="area__btn area__btn--ok" onClick={() => moderate(c, 'restore', 'أُعيدت المادة.', false)}>استعادة</button>}
                  {c.moderation === 'ok' && c.status === 'published' && <button type="button" className="area__btn area__btn--ghost" onClick={() => moderate(c, 'unpublish', 'أُلغي نشر المادة.', true)}>إلغاء النشر</button>}
                  {c.moderation !== 'removed' && <button type="button" className="area__btn area__btn--danger" onClick={() => window.confirm('حذف المادة نهائيًا من المنصة (تبقى النتائج)؟') && moderate(c, 'remove', 'حُذفت المادة من المنصة.', true)}>حذف</button>}
                  {c.kind === 'community' && c.status === 'published' && c.moderation === 'ok' && <button type="button" className="area__btn area__btn--ghost" onClick={() => window.confirm('اعتماد المادة كمادة رسمية؟ ستصبح عامة وتخضع لقواعد المواد الرسمية.') && void act(() => rpc('admin_set_course_kind', { p_subject: c.id, p_kind: 'official' }), 'اعتُمدت كمادة رسمية.')}>اعتماد كرسمية</button>}
                  <button type="button" className="area__btn area__btn--ghost" onClick={() => void rpc<Record<string, unknown>>('admin_creator_standing', { p_user: c.owner_id }).then((s) => window.alert(`المبدع: ${s.creator_name}\nالبريد: ${s.email}\nالمواد: ${s.courses}\nالموقوفة: ${s.suspended}\nبلاغات مؤكدة: ${s.reports_upheld}\nمحظور من النشر: ${s.blocked ? 'نعم' : 'لا'}`))}>المبدع</button>
                  <button type="button" className="area__btn area__btn--ghost" onClick={() => { const blocked = window.confirm('حظر هذا المبدع من النشر وإيقاف مواده؟ (إلغاء = رفع الحظر)'); void act(() => rpc('admin_set_creator_block', { p_user: c.owner_id, p_blocked: blocked, p_note: blocked ? 'مخالفات متكررة' : '' }), blocked ? 'حُظر المبدع.' : 'رُفع الحظر.') }}>حظر/رفع حظر</button>
                </td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={7} className="area__muted">لا توجد مواد.</td></tr>}
          </tbody>
        </table>
      </div>
      {inspect && (
        <section className="area__card" aria-label="فحص المادة">
          <div className="area__row"><h2 className="area__h2" style={{ margin: 0 }}>{inspect.course.name_ar}</h2><button type="button" className="area__btn area__btn--ghost" onClick={() => setInspect(null)}>إغلاق</button></div>
          <p className="area__muted">{inspect.course.description} · {inspect.course.creator_name}</p>
          {inspect.units.map((u) => (
            <div key={u.id}><b>{u.title}</b>
              {u.lessons.map((l) => (
                <details key={l.id}><summary>{l.title} ({l.questions.length})</summary>
                  <ol>{l.questions.map((qn) => <li key={qn.id}>{qn.text} <span className="area__muted">{qn.qtype === 'mcq' ? `— الصحيح: ${'أبجد'['abcd'.indexOf(qn.correct_option ?? 'a')]}` : `— ${qn.accepted_answers.join(' | ')}`}</span></li>)}</ol>
                </details>
              ))}
            </div>
          ))}
        </section>
      )}
    </>
  )
}

function Reports() {
  const [status, setStatus] = useState('open')
  const { data, error, reload } = useLoad(() => rpc<AdminReport[]>('admin_course_reports', { p_status: status }), [status])
  const { msg, act } = useAct(reload)
  return (
    <>
      <div className="area__row">
        <select className="area__input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="حالة البلاغ"><option value="open">مفتوحة</option><option value="resolved">معالجة</option><option value="dismissed">مرفوضة</option><option value="">الكل</option></select>
      </div>
      {error && <p className="area__error">{error}</p>}
      {msg && <p className={msg.ok ? 'area__ok' : 'area__error'} role="status">{msg.text}</p>}
      <p className="area__muted">هوية المُبلِّغ لا تظهر لأحد غير المشرفين. لا يؤدي عدد البلاغات وحده إلى إيقاف مادة تلقائيًا؛ القرار للمشرف.</p>
      <ul className="area__list">
        {data?.map((r) => (
          <li key={r.id} className="area__card" data-testid="admin-report">
            <div className="area__row">
              <b>{r.course}</b><span className="area__chip area__chip--warn">{CAT_AR[r.category] ?? r.category}</span>
              <span className={`area__chip ${r.status === 'open' ? 'area__chip--bad' : 'area__chip--ok'}`}>{r.status}</span>
              {r.moderation !== 'ok' && <span className="area__chip area__chip--bad">{MOD_AR[r.moderation]}</span>}
            </div>
            <p>{r.details || '— بلا تفاصيل —'}</p>
            <p className="area__muted">المبدع: {r.creator_name} · مُبلِّغ #{r.reporter} (رفضت {r.reporter_dismissed_30d} من بلاغاته آخر ٣٠ يومًا) · {r.reports_on_course} بلاغًا مفتوحًا من {r.distinct_reporters} أشخاص على المادة · {new Date(r.created_at).toLocaleString('ar-OM')}</p>
            {r.status === 'open' ? (
              <div className="area__row">
                <button type="button" className="area__btn area__btn--danger" onClick={() => { const note = window.prompt('سبب الإيقاف:', r.details.slice(0, 100)); if (note !== null) void act(async () => { await rpc('admin_moderate_course', { p_subject: r.subject_id, p_action: 'suspend', p_note: note }); await rpc('admin_resolve_course_reports', { p_subject: r.subject_id, p_status: 'resolved', p_note: note }) }, 'أُوقفت المادة وعولجت بلاغاتها.') }}>إيقاف المادة</button>
                <button type="button" className="area__btn area__btn--ok" onClick={() => { const note = window.prompt('ملاحظة المعالجة:', ''); if (note !== null) void act(() => rpc('admin_resolve_report', { p_report: r.id, p_status: 'resolved', p_note: note }), 'عولج البلاغ.') }}>تمت المعالجة</button>
                <button type="button" className="area__btn area__btn--ghost" onClick={() => void act(() => rpc('admin_resolve_report', { p_report: r.id, p_status: 'dismissed', p_note: '' }), 'رُفض البلاغ.')}>رفض البلاغ</button>
              </div>
            ) : <p className="area__muted">{r.resolution}</p>}
          </li>
        ))}
        {data?.length === 0 && <li className="area__muted">لا توجد بلاغات.</li>}
      </ul>
    </>
  )
}

interface Insights {
  totals: Record<string, number>
  top_earners_7d: { student: string; nickname: string; xp: number; coins: number; rewards: number }[]
  top_courses_7d: { id: string; name: string; creator: string; xp: number; students: number }[]
  heavy_publishers: { user_id: string; creator: string; publishes_7d: number; courses: number; suspended: number }[]
  rating_bursts: { id: string; name: string; ratings_24h: number; avg: number }[]
}
function Insights() {
  const { data, error } = useLoad(() => rpc<Insights>('admin_community_insights'), [])
  if (error) return <p className="area__error">{error}</p>
  if (!data) return <p className="area__muted">جارٍ التحميل…</p>
  const t = data.totals
  return (
    <>
      <div className="area__grid">
        {([['courses', 'كل المواد'], ['published', 'منشورة'], ['suspended', 'موقوفة'], ['new_24h', 'جديدة ٢٤ ساعة'], ['open_reports', 'بلاغات مفتوحة'], ['enrollments', 'اشتراكات']] as const).map(([k, l]) => <div key={k} className="area__stat"><b>{t[k]}</b><span>{l}</span></div>)}
      </div>
      <h2 className="area__h2">أعلى المكافآت المجتمعية (٧ أيام) — للتحقق من إساءة الاستخدام</h2>
      <Table head={['الطالب', 'خبرة', 'عملات', 'عدد المكافآت']} rows={data.top_earners_7d.map((r) => [`${r.nickname} (#${r.student})`, r.xp, r.coins, r.rewards])} />
      <h2 className="area__h2">المواد الأعلى مكافآت</h2>
      <Table head={['المادة', 'المبدع', 'خبرة', 'طلاب']} rows={data.top_courses_7d.map((r) => [r.name, r.creator, r.xp, r.students])} />
      <h2 className="area__h2">نشاط نشر مرتفع</h2>
      <Table head={['المبدع', 'عمليات ٧ أيام', 'مواد', 'موقوفة']} rows={data.heavy_publishers.map((r) => [r.creator, r.publishes_7d, r.courses, r.suspended])} />
      <h2 className="area__h2">موجات تقييم مفاجئة</h2>
      <Table head={['المادة', 'تقييمات ٢٤ ساعة', 'المتوسط']} rows={data.rating_bursts.map((r) => [r.name, r.ratings_24h, r.avg])} />
    </>
  )
}
function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="area__table-wrap"><table className="area__table"><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}{rows.length === 0 && <tr><td colSpan={head.length} className="area__muted">لا توجد بيانات.</td></tr>}</tbody></table></div>
  )
}

const FIELDS: [string, string][] = [
  ['xp_per_question', 'خبرة لكل سؤال'], ['coins_per_question', 'عملات لكل سؤال'], ['mission_xp', 'خبرة إكمال المهمة'], ['mission_coins', 'عملات إكمال المهمة'],
  ['daily_xp_cap', 'سقف الخبرة اليومي'], ['daily_coin_cap', 'سقف العملات اليومي'], ['course_lifetime_questions', 'أقصى أسئلة مكافأة لكل مادة'],
  ['max_courses_per_parent', 'أقصى مواد لكل ولي أمر'], ['max_questions_per_course', 'أقصى أسئلة في المادة'], ['import_batch_max', 'أقصى دفعة استيراد'],
  ['imports_per_hour', 'عمليات استيراد في الساعة'], ['publishes_per_day', 'عمليات نشر في اليوم'], ['reports_per_day', 'بلاغات في اليوم'],
  ['ratings_per_day', 'تقييمات في اليوم'], ['favorites_max', 'أقصى مفضلات'], ['enrollments_max', 'أقصى اشتراكات'],
]
function Settings() {
  const { data, error, reload } = useLoad(() => rpc<Record<string, number | boolean>>('admin_get_community_settings'), [])
  const [edit, setEdit] = useState<Record<string, number | boolean>>({})
  const { msg, act } = useAct(reload)
  const { data: words, reload: reloadWords } = useLoad(() => rpc<string[]>('admin_blocklist'), [])
  const [word, setWord] = useState('')
  if (error) return <p className="area__error">{error}</p>
  if (!data) return <p className="area__muted">جارٍ التحميل…</p>
  const val = (k: string) => (k in edit ? edit[k] : data[k])
  return (
    <>
      <form className="area__card area__form" onSubmit={(e) => { e.preventDefault(); void act(async () => { await rpc('admin_set_community_settings', { p: edit }); setEdit({}) }, 'حُفظت الإعدادات.') }}>
        <h2 className="area__h2">المكافآت والحدود</h2>
        <label className="area__check"><input type="checkbox" checked={!!val('rewards_enabled')} onChange={(e) => setEdit({ ...edit, rewards_enabled: e.target.checked })} /> تفعيل مكافآت المواد المجتمعية</label>
        <div className="area__grid">
          {FIELDS.map(([k, l]) => <label key={k}>{l}<input type="number" value={Number(val(k))} onChange={(e) => setEdit({ ...edit, [k]: Number(e.target.value) })} /></label>)}
        </div>
        {msg && <p className={msg.ok ? 'area__ok' : 'area__error'} role="status">{msg.text}</p>}
        <div className="area__row"><button className="area__btn" type="submit" disabled={Object.keys(edit).length === 0}>حفظ</button></div>
        <p className="area__muted">مكافآت المواد الرسمية لا تتأثر بهذه الإعدادات.</p>
      </form>
      <section className="area__card">
        <h2 className="area__h2">كلمات محظورة (فحص آلي بسيط، لا يضمن السلامة)</h2>
        <form className="area__row" onSubmit={(e) => { e.preventDefault(); if (word.trim()) void rpc('admin_blocklist', { p_term: word, p_add: true }).then(() => { setWord(''); reloadWords() }) }}>
          <input className="area__input" value={word} onChange={(e) => setWord(e.target.value)} aria-label="كلمة جديدة" /><button className="area__btn" type="submit">إضافة</button>
        </form>
        <p>{words?.map((w) => <button key={w} type="button" className="area__chip" title="اضغط للحذف" onClick={() => void rpc('admin_blocklist', { p_term: w, p_add: false }).then(reloadWords)}>{w} ✕</button>)}</p>
      </section>
    </>
  )
}
