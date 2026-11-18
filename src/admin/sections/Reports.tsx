import { useState } from 'react'
import { ar } from '../../quiz/format'
import { adminError, db, loadSubjects, rpc, STATUS_AR, useLoad } from '../data'

interface Flag {
  id: string
  key: string | null
  title: string
  details: string
  handling: string
  status: string
  source_page: number | null
  origin: string
}
interface Cov {
  lesson_id: string
  unit: number
  lesson: number
  title: string
  status: string
  pages: string
  published: number
  review: number
  rejected: number
  flagged: number
  missions: number
}
interface Anomaly {
  student_id: string
  nickname: string
  leaderboard_excluded: boolean
  day: string
  fast: number
  answers: number
  accuracy: number
}
interface Deletion {
  id: string
  scope: 'child' | 'family'
  status: 'pending' | 'completed' | 'cancelled'
  reason: string | null
  created_at: string
  requester: string | null
  child: string | null
}
interface Audit {
  id: number
  action: string
  entity: string
  entity_id: string | null
  created_at: string
}

/** التقارير — coverage, open academic issues, suspicious answering and the audit log. */
export function ReportsSection() {
  const subjects = useLoad(loadSubjects, [])
  const [subjectId, setSubjectId] = useState('')
  const sid = subjectId || subjects.data?.[0]?.id || ''
  const coverage = useLoad(() => (sid ? rpc<Cov[]>('admin_coverage', { p_subject: sid }) : Promise.resolve([] as Cov[])), [sid])
  const flags = useLoad(async () => {
    const { data, error } = await db().from('academic_flags').select('*').order('created_at')
    if (error) throw error
    return data as Flag[]
  }, [])
  const anomalies = useLoad(() => rpc<Anomaly[]>('admin_anomalies'), [])
  const deletions = useLoad(() => rpc<Deletion[]>('admin_deletion_requests'), [])
  const audit = useLoad(async () => {
    const { data, error } = await db().from('audit_log').select('id, action, entity, entity_id, created_at').order('created_at', { ascending: false }).limit(40)
    if (error) throw error
    return data as Audit[]
  }, [])
  const [msg, setMsg] = useState<string | null>(null)

  const totals = (coverage.data ?? []).reduce((t, c) => ({ published: t.published + c.published, review: t.review + c.review, flagged: t.flagged + c.flagged }), { published: 0, review: 0, flagged: 0 })

  return (
    <>
      <h1 className="area__h1">التقارير</h1>
      {msg && <p className="area__error">{msg}</p>}

      <h2 className="area__h2">التغطية حسب الدرس</h2>
      <select className="area__input" value={sid} onChange={(e) => setSubjectId(e.target.value)} style={{ maxWidth: 320, marginBottom: 8 }}>
        {(subjects.data ?? []).map((s) => (
          <option key={s.id} value={s.id}>
            {s.name_ar}
          </option>
        ))}
      </select>
      <p className="area__muted">
        المجموع: {ar(totals.published)} منشورًا، {ar(totals.review)} للمراجعة، {ar(totals.flagged)} بعلامة مراجعة أكاديمية.
      </p>
      <div className="area__card area__table-wrap">
        <table className="area__table">
          <thead>
            <tr>
              <th>الوحدة</th>
              <th>الدرس</th>
              <th>الصفحات</th>
              <th>منشورة</th>
              <th>للمراجعة</th>
              <th>مرفوضة</th>
              <th>المهمات</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {(coverage.data ?? []).map((c) => (
              <tr key={c.lesson_id}>
                <td>{ar(c.unit)}</td>
                <td>
                  {ar(c.lesson)}. {c.title}
                </td>
                <td>{c.pages || '—'}</td>
                <td>{ar(c.published)}</td>
                <td>{ar(c.review)}</td>
                <td>{ar(c.rejected)}</td>
                <td>{ar(c.missions)}</td>
                <td>{STATUS_AR[c.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="area__h2">مسائل أكاديمية تحتاج إلى مراجعة معلّم</h2>
      {(flags.data ?? []).map((f) => (
        <div key={f.id} className="area__card" data-testid="academic-flag">
          <strong>{f.title}</strong> <span className={`area__chip ${f.status === 'open' ? 'area__chip--warn' : 'area__chip--ok'}`}>{f.status === 'open' ? 'مفتوحة' : f.status === 'resolved' ? 'محلولة' : 'لن تُعدَّل'}</span>
          <p>{f.details}</p>
          <p className="area__muted">المعالجة الحالية: {f.handling}</p>
          <div className="area__row">
            {f.status === 'open' ? (
              <>
                <button type="button" className="area__btn area__btn--ok" onClick={() => void rpc('admin_resolve_flag', { p_flag: f.id, p_status: 'resolved' }).then(flags.reload, (e) => setMsg(adminError(e)))}>
                  تم الحل
                </button>
                <button type="button" className="area__btn area__btn--ghost" onClick={() => void rpc('admin_resolve_flag', { p_flag: f.id, p_status: 'wont_fix' }).then(flags.reload, (e) => setMsg(adminError(e)))}>
                  إغلاق دون تعديل
                </button>
              </>
            ) : (
              <button type="button" className="area__btn area__btn--ghost" onClick={() => void rpc('admin_resolve_flag', { p_flag: f.id, p_status: 'open' }).then(flags.reload, (e) => setMsg(adminError(e)))}>
                إعادة فتح
              </button>
            )}
          </div>
        </div>
      ))}

      <h2 className="area__h2">إجابات سريعة جدًّا (آخر ١٤ يومًا)</h2>
      <p className="area__muted">حسابات أجابت ١٥ مرة أو أكثر في يوم واحد بأقل من ١٫٥ ثانية للإجابة. هذه مؤشرات للمراجعة وليست دليلًا قاطعًا.</p>
      <div className="area__card area__table-wrap">
        <table className="area__table">
          <thead>
            <tr>
              <th>اللقب</th>
              <th>اليوم</th>
              <th>سريعة / الكل</th>
              <th>الدقة</th>
              <th>لوحات الصدارة</th>
            </tr>
          </thead>
          <tbody>
            {(anomalies.data ?? []).map((a) => (
              <tr key={`${a.student_id}-${a.day}`}>
                <td>{a.nickname}</td>
                <td>{a.day}</td>
                <td>
                  {ar(a.fast)} / {ar(a.answers)}
                </td>
                <td>{ar(a.accuracy)}٪</td>
                <td>
                  <button
                    type="button"
                    className="area__btn area__btn--ghost"
                    onClick={() => void rpc('admin_set_leaderboard_excluded', { p_student: a.student_id, p_excluded: !a.leaderboard_excluded }).then(anomalies.reload, (e) => setMsg(adminError(e)))}
                  >
                    {a.leaderboard_excluded ? 'إعادة إلى اللوحات' : 'استبعاد من اللوحات'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {anomalies.data?.length === 0 && <p className="area__muted">لا توجد مؤشرات حاليًّا.</p>}
      </div>

      <h2 className="area__h2">طلبات حذف البيانات</h2>
      <div className="area__card">
        <p className="area__muted">حذف حساب ابن يتم مباشرة من لوحة ولي الأمر. طلبات حذف حساب العائلة تُنفَّذ من لوحة Supabase (Authentication → Users) ثم تُعلَّم هنا بأنها نُفّذت.</p>
        {deletions.data?.length === 0 && <p className="area__muted">لا توجد طلبات.</p>}
        <ul>
          {(deletions.data ?? []).map((d) => (
            <li key={d.id} className="area__row" style={{ justifyContent: 'space-between' }}>
              <span>
                {new Date(d.created_at).toLocaleDateString('ar')} — {d.scope === 'family' ? 'حساب العائلة' : `حساب الابن ${d.child ?? ''}`} ({d.requester ?? 'ولي أمر'}){' '}
                <span className="area__chip">{d.status === 'pending' ? 'بانتظار التنفيذ' : d.status === 'completed' ? 'نُفّذ' : 'أُلغي'}</span>
              </span>
              {d.status === 'pending' && (
                <span className="area__row">
                  <button type="button" className="area__btn area__btn--ok" onClick={() => void rpc('admin_set_deletion_request', { p_request: d.id, p_status: 'completed' }).then(deletions.reload, (e) => setMsg(adminError(e)))}>
                    نُفّذ
                  </button>
                  <button type="button" className="area__btn area__btn--ghost" onClick={() => void rpc('admin_set_deletion_request', { p_request: d.id, p_status: 'cancelled' }).then(deletions.reload, (e) => setMsg(adminError(e)))}>
                    إلغاء
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <h2 className="area__h2">سجل التدقيق (آخر ٤٠ عملية)</h2>
      <div className="area__card area__table-wrap">
        <table className="area__table">
          <tbody>
            {(audit.data ?? []).map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.created_at).toLocaleString('ar')}</td>
                <td dir="ltr">{a.action}</td>
                <td dir="ltr">{a.entity}</td>
                <td dir="ltr" className="area__muted">
                  {a.entity_id?.slice(0, 8)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
