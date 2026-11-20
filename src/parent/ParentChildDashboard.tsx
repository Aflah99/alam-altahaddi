import { characterOf } from '../cloud/useCloudGame'
import { useEffect, useState } from 'react'
import { CharacterSprite } from '../characters/CharacterSprite'
import { arabicError, supabase } from '../cloud/client'
import { ar } from '../quiz/format'
import { Bars } from './Bars'
import { lessonInsights, pct, type LessonStat } from './insights'
import { ChildCommunity } from './community/ChildCommunity'
import type { ChildRow } from './ParentApp'

interface Counts {
  answered: number
  first_try: number
  assisted: number
  missed: number
}
interface Report {
  summary: Counts & { hints: number; missions_completed: number; minutes: number; xp: number; last_active: string | null }
  by_subject: (Counts & { id: string; name: string })[]
  by_unit: (Counts & { id: string; subject: string; title: string; number: number })[]
  by_lesson: LessonStat[]
  weekly: { week: string; answered: number; first_try: number }[]
  daily: { day: string; answered: number }[]
  most_missed: { question: string; lesson: string; misses: number; assisted: number }[]
  legacy: { imported_at: string; summary: { missions: number; questions: number } } | null
}

const RANGES = [
  { id: 7, label: 'آخر ٧ أيام' },
  { id: 30, label: 'آخر ٣٠ يومًا' },
  { id: 0, label: 'كل الوقت' },
] as const
const LEGEND = ['صحيحة من المحاولة الأولى', 'بعد تلميح أو محاولة ثانية', 'غير صحيحة']
const parts = (c: Counts) => [c.first_try, c.assisted, c.missed]

/** نتائج الأبناء — real, verified attempt data only; nothing here is estimated or invented. */
export function ParentChildDashboard({ kids, childId, onPick }: { kids: ChildRow[]; childId?: string; onPick: (id: string) => void }) {
  const [range, setRange] = useState<number>(30)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const child = kids.find((k) => k.id === childId) ?? kids[0]

  useEffect(() => {
    if (!child) return
    let alive = true
    supabase()
      ?.rpc('parent_child_report', { p_student: child.id, p_days: range || null })
      .then(({ data, error: e }) => {
        if (!alive) return
        if (e) setError(arabicError(e))
        else {
          setError(null)
          setReport(data as Report)
        }
      })
    return () => {
      alive = false
    }
  }, [child, range])

  if (!child) return <p className="area__info">أضف ابنًا أولًا من صفحة «أبنائي».</p>
  const s = report?.summary
  const insights = report ? lessonInsights(report.by_lesson) : []

  return (
    <>
      <h1 className="area__h1">النتائج</h1>
      <div className="area__tabs" role="group" aria-label="الأبناء">
        {kids.map((k) => (
          <button key={k.id} type="button" className="area__tab" aria-pressed={k.id === child.id} onClick={() => onPick(k.id)}>
            {k.nickname}
          </button>
        ))}
      </div>
      <div className="area__tabs" role="group" aria-label="الفترة">
        {RANGES.map((r) => (
          <button key={r.id} type="button" className="area__tab" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
            {r.label}
          </button>
        ))}
      </div>
      {error && <p className="area__error">{error}</p>}
      {!report && !error && <p className="area__muted">جارٍ التحميل…</p>}

      {report && s && (
        <>
          <div className="area__card area__row" style={{ gap: 14 }}>
            <span style={{ ['--cell' as string]: '3px' }}>
              <CharacterSprite character={characterOf(child.character_id, (child as { appearance?: unknown }).appearance)} anim="still" decorative />
            </span>
            <div>
              <strong>{child.nickname}</strong>
              <div className="area__muted">آخر نشاط: {s.last_active ? new Date(s.last_active).toLocaleDateString('ar') : 'لا يوجد بعد'}</div>
            </div>
          </div>

          {s.answered === 0 ? (
            <p className="area__info">لا توجد إجابات مسجّلة في هذه الفترة.</p>
          ) : (
            <div className="area__grid" data-testid="parent-summary">
              <Stat value={`${ar(pct(s.first_try + s.assisted, s.answered))}٪`} label="الدقة الإجمالية (صحيحة في النهاية)" />
              <Stat value={`${ar(pct(s.first_try, s.answered))}٪`} label="دقة المحاولة الأولى" />
              <Stat value={ar(s.assisted)} label="صحيحة بعد تلميح أو محاولة ثانية" />
              <Stat value={ar(s.missed)} label="أسئلة لم تُجب صحيحًا" />
              <Stat value={ar(s.missions_completed)} label="مهمات مكتملة" />
              <Stat value={`${ar(s.minutes)} د`} label="وقت التعلّم التقريبي (من بدء المهمات المكتملة إلى نهايتها)" />
              <Stat value={ar(s.xp)} label="نقاط خبرة موثّقة" />
              <Stat value={ar(s.answered)} label="أسئلة مجاب عنها" />
            </div>
          )}

          {insights.length > 0 && (
            <>
              <h2 className="area__h2">مقترحات المراجعة</h2>
              {insights.map((i) => (
                <p key={i.lessonId} className={`insight insight--${i.kind}`} data-testid="insight">
                  {i.reason}
                </p>
              ))}
              <p className="area__muted">المقترحات مبنية على الإجابات المسجّلة فقط، ولا تمثّل تقييمًا لقدرات الطالب.</p>
            </>
          )}

          {report.by_subject.length > 0 && (
            <div className="area__card">
              <Bars caption="الأداء حسب المادة" legend={LEGEND} bars={report.by_subject.map((x) => ({ label: x.name, parts: parts(x) }))} />
            </div>
          )}
          {report.by_unit.length > 0 && (
            <div className="area__card">
              <Bars caption="الأداء حسب الوحدة" legend={LEGEND} bars={report.by_unit.map((x) => ({ label: `${x.subject} — ${x.title}`, parts: parts(x) }))} />
            </div>
          )}
          {report.by_lesson.length > 0 && (
            <div className="area__card">
              <Bars caption="الأداء حسب الدرس" legend={LEGEND} bars={report.by_lesson.map((x) => ({ label: x.title, parts: parts(x) }))} />
            </div>
          )}
          {report.weekly.length > 0 && (
            <div className="area__card">
              <Bars
                caption="النشاط والتقدّم أسبوعيًّا (آخر ٨ أسابيع)"
                legend={['صحيحة من المحاولة الأولى', 'باقي الإجابات']}
                bars={report.weekly.map((w) => ({ label: `أسبوع ${new Date(w.week).toLocaleDateString('ar', { day: 'numeric', month: 'short' })}`, parts: [w.first_try, w.answered - w.first_try] }))}
              />
              <p className="area__muted">
                دقة المحاولة الأولى عبر الأسابيع:{' '}
                {report.weekly.map((w) => `${ar(pct(w.first_try, w.answered))}٪`).join(' ← ')}
              </p>
            </div>
          )}
          {report.most_missed.length > 0 && (
            <div className="area__card">
              <h2 className="area__h2" style={{ marginTop: 0 }}>أكثر الأسئلة تعثّرًا</h2>
              <ul>
                {report.most_missed.map((m) => (
                  <li key={m.question}>
                    {m.question} <span className="area__muted">({m.lesson} — {ar(m.misses)} خطأ، {ar(m.assisted)} بمساعدة)</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.legacy && (
            <p className="area__info">
              سجل قديم مستورد من جهاز (غير موثّق، لا يدخل في الأرقام أعلاه ولا في لوحات الصدارة): {ar(report.legacy.summary.missions)} مهمة و
              {ar(report.legacy.summary.questions)} سؤالًا.
            </p>
          )}
        </>
      )}
      <QuestionTypes key={`${child.id}:${range}`} studentId={child.id} days={range} />
      <ChildControls key={child.id} studentId={child.id} />
      <ChildCommunity key={`c-${child.id}`} studentId={child.id} />
    </>
  )
}

/** First-try accuracy by question type (multiple choice vs written answers). */
function QuestionTypes({ studentId, days }: { studentId: string; days: number }) {
  const [t, setT] = useState<Record<string, Counts> | null>(null)
  useEffect(() => {
    void supabase()
      ?.rpc('parent_child_question_types', { p_student: studentId, p_days: days || null })
      .then(({ data }) => setT((data as Record<string, Counts>) ?? {}))
  }, [studentId, days])
  if (!t || Object.keys(t).length === 0) return null
  const label: Record<string, string> = { mcq: 'اختيار من متعدد', written: 'إجابات مكتوبة' }
  return (
    <div className="area__card" data-testid="question-types">
      <h2 className="area__h2" style={{ marginTop: 0 }}>حسب نوع السؤال</h2>
      <div className="area__grid">
        {Object.entries(t).map(([k, c]) => (
          <Stat key={k} value={`${ar(pct(c.first_try, c.answered))}٪`} label={`${label[k] ?? k}: صحيحة من المحاولة الأولى (${ar(c.answered)} سؤالًا)`} />
        ))}
      </div>
    </div>
  )
}

interface Economy {
  controls: { packages_allowed: boolean; packages_daily_limit: number; multiplayer_allowed: boolean; reactions_allowed: boolean }
  coins: number
  upgrade_points: number
  spent_on_packages: number
  spent_in_shop: number
  items: number
  packages: { at: string; name: string; price: number; rewards: number }[]
}

/** Parent controls: surprise packages, multiplayer rooms and reactions, plus the coin history. */
function ChildControls({ studentId }: { studentId: string }) {
  const [eco, setEco] = useState<Economy | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const load = () =>
    supabase()
      ?.rpc('parent_child_economy', { p_student: studentId })
      .then(({ data, error: e }) => (e ? setMsg(arabicError(e)) : setEco(data as Economy)))
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])
  const save = async (patch: Partial<Economy['controls']>) => {
    const { error: e } = (await supabase()?.rpc('parent_set_controls', { p_student: studentId, p: patch })) ?? {}
    setMsg(e ? arabicError(e) : 'حُفظ الإعداد.')
    void load()
  }
  if (!eco) return msg ? <p className="area__error">{msg}</p> : null
  const c = eco.controls
  return (
    <div className="area__card" data-testid="child-controls">
      <h2 className="area__h2" style={{ marginTop: 0 }}>الضوابط والعملات</h2>
      <p className="area__muted">
        العملات تُكسب من الإجابات الصحيحة فقط، ولا يوجد أي شراء بمال حقيقي. صناديق المفاجآت تُفتح بالعملات، ومحتواها يحدّده الخادم.
      </p>
      <label className="area__check">
        <input type="checkbox" checked={c.packages_allowed} onChange={(e) => void save({ packages_allowed: e.target.checked })} /> السماح بفتح صناديق المفاجآت
      </label>
      <label>
        الحدّ الأقصى للصناديق يوميًّا{' '}
        <select value={c.packages_daily_limit} onChange={(e) => void save({ packages_daily_limit: Number(e.target.value) })}>
          {[0, 1, 2, 3, 5, 10, 20].map((n) => (
            <option key={n} value={n}>
              {ar(n)}
            </option>
          ))}
        </select>
      </label>
      <label className="area__check">
        <input type="checkbox" checked={c.multiplayer_allowed} onChange={(e) => void save({ multiplayer_allowed: e.target.checked })} /> السماح بغرف التحدّي الجماعية
      </label>
      <label className="area__check">
        <input type="checkbox" checked={c.reactions_allowed} onChange={(e) => void save({ reactions_allowed: e.target.checked })} /> السماح بالرسائل الجاهزة والرموز في الغرف
      </label>
      {msg && <p className="area__muted" role="status">{msg}</p>}
      <div className="area__grid">
        <Stat value={ar(eco.coins)} label="عملات حالية" />
        <Stat value={ar(eco.upgrade_points)} label="نقاط التطوير" />
        <Stat value={ar(eco.spent_in_shop)} label="أُنفقت في المتجر" />
        <Stat value={ar(eco.spent_on_packages)} label="أُنفقت على الصناديق" />
      </div>
      {eco.packages.length > 0 && (
        <ul className="area__list">
          {eco.packages.map((p, i) => (
            <li key={i}>
              {new Date(p.at).toLocaleDateString('ar')} — {p.name}: {ar(p.price)} عملة، {ar(p.rewards)} مكافآت
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="area__stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}
