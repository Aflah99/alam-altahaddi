import { characterOf } from '../cloud/useCloudGame'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CharacterSprite } from '../characters/CharacterSprite'
import { groupLeaderboard, joinGroupWithCode, leaveGroup, myGroups, type Leaderboard } from '../cloud/api'
import { arabicError } from '../cloud/client'
import { CornerButton } from '../components/CornerButton'
import { PlayArrow } from '../components/sprites'
import { ar } from '../quiz/format'
import './groups.css'

type MyGroup = Awaited<ReturnType<typeof myGroups>>[number]

const JOIN_MSG: Record<string, { ok: boolean; text: string }> = {
  pending: { ok: true, text: 'أُرسل طلبك! سيظهر لولي أمرك ليوافق عليه، ثم تنضمّ إلى المجموعة.' },
  active: { ok: true, text: 'أنت عضو في هذه المجموعة بالفعل.' },
  rejected: { ok: false, text: 'لا يمكن الانضمام إلى مجموعات الآن. اطلب ذلك من ولي أمرك.' },
  invalid: { ok: false, text: 'الرمز غير صحيح أو انتهت صلاحيته. تأكّد منه واطلب رمزًا جديدًا.' },
}

/** المجموعات — join private groups with a code (parent approval required) and see group leaderboards. */
export default function StudentGroupsScreen({ onBack }: { onBack: () => void }) {
  const [groups, setGroups] = useState<MyGroup[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const g = await myGroups()
      setGroups(g)
      setSelected((s) => (s && g.some((x) => x.id === s && x.status === 'active') ? s : (g.find((x) => x.status === 'active')?.id ?? null)))
    } catch (e) {
      setMsg({ ok: false, text: arabicError(e) })
      setGroups([])
    }
  }, [])
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(t)
  }, [load])

  const join = async (e: FormEvent) => {
    e.preventDefault()
    const c = code.replace(/[\s-]/g, '').toUpperCase()
    if (c.length < 6 || busy) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await joinGroupWithCode(c)
      setMsg(JOIN_MSG[r.status] ?? JOIN_MSG.invalid)
      if (r.status !== 'invalid') setCode('')
      await load()
    } catch (err) {
      const text = /rate_limited/.test(String((err as Error).message)) ? 'محاولات كثيرة غير صحيحة. انتظر قليلًا ثم حاول مرة أخرى.' : arabicError(err)
      setMsg({ ok: false, text })
    } finally {
      setBusy(false)
    }
  }

  const active = (groups ?? []).filter((g) => g.status === 'active')
  const pending = (groups ?? []).filter((g) => g.status === 'pending')

  return (
    <div className="groupsx">
      <div className="groupsx__scroll">
        <header className="groupsx__header">
          <CornerButton icon={<PlayArrow className="icon-back" />} label="الساحة" onClick={onBack} />
          <h1 className="groupsx__title">لوحة الأبطال</h1>
          <span />
        </header>

        <form className="groupsx__panel groupsx__join" onSubmit={join}>
          <label htmlFor="group-code">عندك رمز مجموعة؟</label>
          <div className="groupsx__join-row">
            <input
              id="group-code"
              className="groupsx__code"
              dir="ltr"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={14}
              placeholder="ABCD234XYZ"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button type="submit" className="pixel-button" disabled={busy}>
              انضمام
            </button>
          </div>
          {msg && (
            <p className={msg.ok ? 'groupsx__ok' : 'groupsx__err'} role="status">
              {msg.text}
            </p>
          )}
        </form>

        {pending.length > 0 && (
          <div className="groupsx__panel">
            {pending.map((g) => (
              <p key={g.id} className="groupsx__pending" data-testid="group-pending">
                ⏳ «{g.name}»: بانتظار موافقة ولي أمرك
              </p>
            ))}
          </div>
        )}

        {groups === null ? (
          <p className="groupsx__muted">جارٍ التحميل…</p>
        ) : active.length === 0 ? (
          <div className="groupsx__panel">
            <p>لست في أي مجموعة بعد. اطلب رمز دعوة من معلّمك أو ولي أمرك، ثم اكتبه في الأعلى.</p>
          </div>
        ) : (
          <>
            <div className="groupsx__tabs" role="tablist" aria-label="مجموعاتي">
              {active.map((g) => (
                <button key={g.id} type="button" role="tab" className="groupsx__tab" aria-selected={selected === g.id} onClick={() => setSelected(g.id)}>
                  {g.name}
                </button>
              ))}
            </div>
            {selected && <GroupBoard key={selected} id={selected} onLeft={() => void load()} />}
          </>
        )}

        <details className="groupsx__panel groupsx__how">
          <summary>كيف يُحسب الترتيب؟</summary>
          <ul>
            <li>الترتيب حسب نقاط الخبرة التي تكسبها من الإجابات الصحيحة وإكمال المهمات، ويتحقق منها الخادم.</li>
            <li>«هذا الأسبوع» يبدأ مع بداية يوم الأحد (بتوقيت غرينتش)، و«كل الوقت» يجمع كل نقاطك منذ إنشاء حسابك.</li>
            <li>شراء الأغراض لا يُنقص نقاط الخبرة، والسجل القديم المستورد من الجهاز لا يُحسب.</li>
            <li>يظهر لقبك وشخصيتك فقط، ولا يظهر اسمك الحقيقي. لا توجد محادثات.</li>
          </ul>
        </details>
      </div>
    </div>
  )
}

function GroupBoard({ id, onLeft }: { id: string; onLeft: () => void }) {
  const [period, setPeriod] = useState<'week' | 'all'>('week')
  const [board, setBoard] = useState<Leaderboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    groupLeaderboard(id, period)
      .then((b) => alive && (setBoard(b), setError(null)))
      .catch((e) => alive && setError(arabicError(e)))
    return () => {
      alive = false
    }
  }, [id, period])

  const leave = async () => {
    if (!window.confirm('هل تريد مغادرة هذه المجموعة؟ ستحتاج إلى رمز جديد وموافقة ولي أمرك للعودة.')) return
    try {
      await leaveGroup(id)
      onLeft()
    } catch (e) {
      setError(arabicError(e))
    }
  }

  return (
    <section className="groupsx__panel groupsx__board" aria-label="لوحة الصدارة">
      <div className="groupsx__periods">
        <button type="button" className="groupsx__tab" aria-pressed={period === 'week'} onClick={() => setPeriod('week')}>
          هذا الأسبوع
        </button>
        <button type="button" className="groupsx__tab" aria-pressed={period === 'all'} onClick={() => setPeriod('all')}>
          كل الوقت
        </button>
      </div>
      {error && <p className="groupsx__err">{error}</p>}
      {board && board.rows.length === 0 && <p className="groupsx__muted">لا توجد نقاط بعد. أكمل مهمة لتظهر هنا!</p>}
      <ol className="groupsx__rows" data-testid="leaderboard">
        {board?.rows.map((r) => (
          <li key={`${r.rank}-${r.nickname}`} className={`groupsx__row${r.is_me ? ' groupsx__row--me' : ''}`} data-testid="leader-row">
            <span className={`groupsx__rank groupsx__rank--${Math.min(r.rank, 4)}`}>{ar(r.rank)}</span>
            <span className="groupsx__avatar">
              <CharacterSprite character={characterOf(r.character_id, r.appearance)} outfit={r.outfit ?? []} anim="still" decorative />
            </span>
            <span className="groupsx__nick">
              {r.nickname}
              {r.is_me && <small> (أنت)</small>}
            </span>
            <span className="groupsx__xp">
              {ar(r.xp)} <small>خبرة</small>
            </span>
          </li>
        ))}
      </ol>
      <button type="button" className="groupsx__leave" onClick={() => void leave()}>
        مغادرة المجموعة
      </button>
    </section>
  )
}
