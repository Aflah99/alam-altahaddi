import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { SfxName } from '../audio/sfx'
import { CornerButton } from '../components/CornerButton'
import { PlayArrow } from '../components/sprites'
import {
  CATEGORIES, communityInfo, enrollCourse, myEnrolled, rateCourse, redeemInvite, REPORT_CATEGORIES, reportCourse, searchCourses, toggleFavorite, unenrollCourse,
  type CourseCard, type Sort,
} from './api'
import { errText } from './util'
import './discover.css'

type Tab = 'all' | 'mine' | 'favorites'
const SORTS: [Sort, string][] = [['relevance', 'الأكثر صلة'], ['popular', 'الأكثر شعبية'], ['rating', 'الأعلى تقييمًا'], ['recent', 'الأحدث']]
const ICON: Record<string, string> = { book: '📖', star: '⭐', flask: '🧪', globe: '🌍', calc: '🧮', quill: '🪶', leaf: '🍃', gear: '⚙️' }

interface Props {
  initialCode?: string
  onBack: () => void
  /** Opens the course world (slug). */
  onPlay: (slug: string) => void
  /** Re-fetch the student's community catalogue after enrolling or leaving. */
  onChanged: () => void
  play: (name: SfxName) => void
}

/** اكتشف المواد — search public community courses, enrol directly, rate, favourite and report. */
export default function DiscoverScreen({ initialCode, onBack, onPlay, onChanged, play }: Props) {
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  const [grade, setGrade] = useState<number | null>(null)
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState<Sort>('relevance')
  const [items, setItems] = useState<CourseCard[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [code, setCode] = useState(initialCode ?? '')
  const [reporting, setReporting] = useState<CourseCard | null>(null)
  const [info, setInfo] = useState<Awaited<ReturnType<typeof communityInfo>> | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const seq = useRef(0)

  const load = useCallback(
    async (offset = 0) => {
      const my = ++seq.current
      try {
        const r =
          tab === 'mine'
            ? await myEnrolled().then((list) => ({ total: list.length, items: list }))
            : await searchCourses({ q, grade, category, sort, favorites: tab === 'favorites', limit: 12, offset })
        if (my !== seq.current) return
        setItems((cur) => (offset > 0 && cur ? [...cur, ...r.items] : r.items))
        setTotal(r.total)
        setError(null)
      } catch (e) {
        if (my === seq.current) {
          setError(errText(e))
          setItems([])
        }
      }
    },
    [tab, q, grade, category, sort],
  )
  useEffect(() => {
    const t = window.setTimeout(() => void load(0), q ? 350 : 0)
    return () => window.clearTimeout(t)
  }, [load, q])
  useEffect(() => {
    void communityInfo().then(setInfo).catch(() => {})
  }, [])

  const patch = (id: string, p: Partial<CourseCard>) => setItems((l) => l?.map((c) => (c.id === id ? { ...c, ...p } : c)) ?? l)
  const act = async (id: string, fn: () => Promise<void>) => {
    setBusy(id)
    setNote(null)
    try {
      await fn()
    } catch (e) {
      setNote({ ok: false, text: errText(e) })
    } finally {
      setBusy(null)
    }
  }

  const redeem = async (e: FormEvent) => {
    e.preventDefault()
    const c = code.replace(/[\s-]/g, '').toUpperCase()
    if (c.length < 6) return
    setBusy('code')
    try {
      const r = await redeemInvite(c)
      if (r.status === 'ok' && r.course) {
        play('confirm')
        await enrollCourse(r.course.id)
        onChanged()
        setNote({ ok: true, text: `تمت إضافة «${r.course.name_ar}» إلى موادك. اضغط «موادي» لتلعبها.` })
        setCode('')
        setTab('mine')
      } else setNote({ ok: false, text: 'الرمز غير صحيح أو انتهت صلاحيته. اطلب رمزًا جديدًا.' })
    } catch (err) {
      setNote({ ok: false, text: errText(err) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="disc">
      <div className="disc__scroll">
        <header className="disc__header">
          <CornerButton icon={<PlayArrow className="icon-back" />} label="الساحة" onClick={onBack} />
          <h1 className="disc__title">اكتشف المواد</h1>
          <span />
        </header>
        <p className="disc__lead">مواد صنعها أولياء أمور للتعلّم واللعب. اشترك في أي مادة عامة والعب فيها مباشرة.</p>
        <p className="disc__notice" role="note">⚠ هذه مواد مجتمعية لم تُراجع رسميًا من المنصة. إن رأيت خطأً أو محتوى غير مناسب فاضغط «الإبلاغ عن المحتوى».</p>

        <div className="disc__tabs" role="tablist" aria-label="أقسام المواد">
          {(
            [['all', 'اكتشف'], ['mine', 'موادي'], ['favorites', 'المفضّلة']] as [Tab, string][]
          ).map(([k, label]) => (
            <button key={k} type="button" role="tab" className="disc__tab" aria-selected={tab === k} onClick={() => { play('click'); setItems(null); setTab(k) }}>
              {label}
            </button>
          ))}
        </div>

        {tab !== 'mine' && (
          <form className="disc__filters" onSubmit={(e) => e.preventDefault()} role="search">
            <input className="disc__search" type="search" value={q} placeholder="ابحث باسم المادة أو موضوعها…" aria-label="بحث" maxLength={80} onChange={(e) => setQ(e.target.value)} data-testid="search" />
            <select aria-label="الصف" value={grade ?? ''} onChange={(e) => setGrade(e.target.value ? Number(e.target.value) : null)}>
              <option value="">كل الصفوف</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => <option key={g} value={g}>الصف {g}</option>)}
            </select>
            <select aria-label="التصنيف" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">كل التصنيفات</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select aria-label="الترتيب" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </form>
        )}

        <form className="disc__code" onSubmit={(e) => void redeem(e)}>
          <label htmlFor="course-code">عندك رمز دعوة لمادة خاصة؟</label>
          <div className="disc__code-row">
            <input id="course-code" dir="ltr" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={14} placeholder="ABCD234XYZ" value={code} onChange={(e) => setCode(e.target.value)} />
            <button type="submit" className="pixel-button" disabled={busy === 'code'}>انضمام</button>
          </div>
        </form>

        {info && info.rewards_enabled && (
          <p className="disc__info">مكافآت المواد المجتمعية محدودة يوميًا ({info.daily_xp_cap} خبرة و{info.daily_coin_cap} عملة)، وقد حصلت اليوم على {info.used_xp} خبرة و{info.used_coins} عملة منها.</p>
        )}
        {note && <p className={note.ok ? 'disc__ok' : 'disc__err'} role="status">{note.text}</p>}
        {error && <p className="disc__err" role="alert">{error}</p>}
        {items === null && <p className="disc__muted" role="status">جارٍ التحميل…</p>}
        {items && items.length === 0 && !error && (
          <p className="disc__empty">{tab === 'mine' ? 'لم تشترك في مواد مجتمعية بعد. افتح «اكتشف» وابحث عن مادة تعجبك.' : tab === 'favorites' ? 'لا توجد مواد في المفضّلة بعد.' : 'لا توجد مواد مطابقة. جرّب كلمات أخرى أو غيّر الفلاتر.'}</p>
        )}

        <ul className="disc__list">
          {items?.map((c) => (
            <li key={c.id} className="disc__card" data-testid="course-card">
              <div className="disc__card-head">
                <span className="disc__icon" aria-hidden="true">{ICON[c.icon] ?? '📖'}</span>
                <div className="disc__titles">
                  <h2>{c.name_ar}</h2>
                  <span className="disc__by">{c.kind === 'official' ? 'مادة أساسية رسمية' : `مادة مجتمعية · أنشأها ${c.creator_name ?? 'ولي أمر'}`}</span>
                </div>
                {c.kind === 'community' && (
                  <button type="button" className={`disc__fav ${c.favorited ? 'is-on' : ''}`} aria-pressed={c.favorited} aria-label={c.favorited ? 'إزالة من المفضّلة' : 'إضافة إلى المفضّلة'} disabled={busy === c.id}
                    onClick={() => void act(c.id, async () => { await toggleFavorite(c.id, !c.favorited); patch(c.id, { favorited: !c.favorited, favorites: c.favorites + (c.favorited ? -1 : 1) }); if (tab === 'favorites') void load(0) })}>
                    {c.favorited ? '♥' : '♡'}
                  </button>
                )}
              </div>
              <p className="disc__desc">{c.description || 'لا يوجد وصف.'}</p>
              <p className="disc__chips">
                <span>الصف {c.grade}</span>
                {c.category && <span>{c.category}</span>}
                <span>{c.unit_count} وحدات</span>
                <span>{c.lesson_count} دروس</span>
                <span>{c.question_count} سؤالًا</span>
              </p>
              <p className="disc__rating">
                <Stars value={c.rating_avg} /> {c.rating_count >= 3 && c.rating_avg ? <b>{c.rating_avg}</b> : <span className="disc__muted">جديدة</span>}
                <span className="disc__muted"> ({c.rating_count} تقييمًا · {c.enrollments} مشتركًا · ♥ {c.favorites})</span>
              </p>
              {c.enrolled && c.kind === 'community' && !c.is_mine && <RateRow card={c} busy={busy === c.id} onRate={(n) => void act(c.id, async () => { const r = await rateCourse(c.id, n); patch(c.id, { my_rating: n, rating_avg: r.avg, rating_count: r.count }) })} />}
              <div className="disc__actions">
                {c.enrolled ? (
                  <button type="button" className="pixel-button" onClick={() => { play('portal'); onPlay(c.slug) }} data-testid="play">العب الآن</button>
                ) : (
                  <button type="button" className="pixel-button" disabled={busy === c.id} data-testid="enroll"
                    onClick={() => void act(c.id, async () => { await enrollCourse(c.id); play('confirm'); patch(c.id, { enrolled: true, enrollments: c.enrollments + 1 }); onChanged(); setNote({ ok: true, text: `اشتركت في «${c.name_ar}». اضغط «العب الآن» لتبدأ.` }) })}>
                    اشترك والعب
                  </button>
                )}
                {c.enrolled && c.kind === 'community' && (
                  <button type="button" className="disc__link" disabled={busy === c.id} onClick={() => void act(c.id, async () => { await unenrollCourse(c.id); patch(c.id, { enrolled: false }); onChanged(); if (tab === 'mine') void load(0) })}>إزالة من موادي</button>
                )}
                {c.kind === 'community' && !c.is_mine && <button type="button" className="disc__link" onClick={() => setReporting(c)}>الإبلاغ عن المحتوى</button>}
              </div>
            </li>
          ))}
        </ul>
        {tab !== 'mine' && items && items.length < total && (
          <button type="button" className="pixel-button disc__more" onClick={() => void load(items.length)}>عرض المزيد</button>
        )}
      </div>
      {reporting && <ReportDialog card={reporting} onClose={(msg) => { setReporting(null); if (msg) setNote({ ok: true, text: msg }) }} />}
    </div>
  )
}

function Stars({ value }: { value: number | null }) {
  const v = Math.round(value ?? 0)
  return <span className="disc__stars" aria-label={value ? `${value} من ٥` : 'بلا تقييم'}>{[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= v ? 'on' : ''}>★</span>)}</span>
}

function RateRow({ card, onRate, busy }: { card: CourseCard; onRate: (n: number) => void; busy: boolean }) {
  return (
    <div className="disc__rate" role="group" aria-label="قيّم المادة">
      <span>تقييمك:</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={busy} aria-pressed={card.my_rating === n} aria-label={`${n} نجوم`} className={`disc__star ${(card.my_rating ?? 0) >= n ? 'on' : ''}`} onClick={() => onRate(n)}>★</button>
      ))}
      <span className="disc__muted">(بعد إكمال مهمة واحدة)</span>
    </div>
  )
}

function ReportDialog({ card, onClose }: { card: CourseCard; onClose: (msg?: string) => void }) {
  const [cat, setCat] = useState('incorrect')
  const [details, setDetails] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await reportCourse(card.id, cat, details)
      onClose(r.status === 'reported' ? 'وصل بلاغك إلى الإدارة. شكرًا لمساعدتنا.' : 'سبق أن أبلغت عن هذه المادة، وبلاغك قيد المراجعة.')
    } catch (e2) {
      setErr(errText(e2))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="disc__modal" role="dialog" aria-modal="true" aria-label="الإبلاغ عن المحتوى">
      <form className="disc__dialog" onSubmit={(e) => void submit(e)}>
        <h2>الإبلاغ عن المحتوى</h2>
        <p className="disc__muted">«{card.name_ar}» — لا يرى أحد اسمك، وتراجع الإدارة البلاغ.</p>
        {REPORT_CATEGORIES.map(([k, l]) => (
          <label key={k} className="disc__radio"><input type="radio" name="rc" checked={cat === k} onChange={() => setCat(k)} /> {l}</label>
        ))}
        <label className="disc__radio disc__radio--col">تفاصيل (اختياري)
          <textarea rows={3} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} />
        </label>
        {err && <p className="disc__err" role="alert">{err}</p>}
        <div className="disc__actions">
          <button type="submit" className="pixel-button" disabled={busy}>إرسال البلاغ</button>
          <button type="button" className="disc__link" onClick={() => onClose()}>إلغاء</button>
        </div>
      </form>
    </div>
  )
}
