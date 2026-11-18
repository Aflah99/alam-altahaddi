import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { groupLeaderboard, type Leaderboard } from '../cloud/api'
import { arabicError, supabase } from '../cloud/client'
import { ar } from '../quiz/format'
import type { ChildRow } from './ParentApp'

interface ChildGroup {
  group_id: string
  name: string
  status: 'pending' | 'active'
  members: number
}
interface Managed {
  id: string
  name: string
  active: boolean
  members: number
  pending: number
}
interface ManagerView {
  group: { id: string; name: string; active: boolean }
  members: { student_id: string; nickname: string; status: string }[]
  invites: { id: string; code: string; expires_at: string | null; revoked: boolean; uses: number }[]
  participation: { active_members: number; active_this_week: number; missions_this_week: number }
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase()!.rpc(fn, args)
  if (error) throw error
  return data as T
}

/** المجموعات — approve your children's requests, and manage groups you created. */
export function ParentGroups({ kids }: { kids: ChildRow[] }) {
  const [childGroups, setChildGroups] = useState<Record<string, ChildGroup[]>>({})
  const [managed, setManaged] = useState<Managed[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [name, setName] = useState('')

  const load = useCallback(async () => {
    try {
      const entries = await Promise.all(kids.map(async (k) => [k.id, await rpc<ChildGroup[]>('parent_child_groups', { p_student: k.id })] as const))
      setChildGroups(Object.fromEntries(entries))
      setManaged(await rpc<Managed[]>('my_managed_groups'))
    } catch (e) {
      setMsg({ ok: false, text: arabicError(e) })
    }
  }, [kids])
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(t)
  }, [load])

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null)
    try {
      await fn()
      setMsg({ ok: true, text: ok })
      await load()
    } catch (e) {
      setMsg({ ok: false, text: arabicError(e) })
    }
  }

  const create = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) return
    void act(async () => setSelected(await rpc<string>('create_group', { p_name: name.trim() })), 'أُنشئت المجموعة. أنشئ رمز دعوة وشاركه مع أولياء الأمور.')
    setName('')
  }

  const pendingAll = kids.flatMap((k) => (childGroups[k.id] ?? []).filter((g) => g.status === 'pending').map((g) => ({ kid: k, g })))

  return (
    <>
      <h1 className="area__h1">المجموعات الخاصة</h1>
      <p className="area__info">
        لا توجد لوحة صدارة عامة. تظهر في المجموعة الألقاب والشخصيات ونقاط الخبرة الموثّقة فقط، ولا توجد محادثات. لا ينضم ابنك إلى أي مجموعة إلا بموافقتك.
      </p>
      {msg && <p className={msg.ok ? 'area__ok' : 'area__error'}>{msg.text}</p>}

      <h2 className="area__h2">طلبات بانتظار موافقتك</h2>
      {pendingAll.length === 0 ? (
        <p className="area__muted">لا توجد طلبات.</p>
      ) : (
        pendingAll.map(({ kid, g }) => (
          <div key={`${kid.id}-${g.group_id}`} className="area__card area__row" data-testid="pending-request" style={{ justifyContent: 'space-between' }}>
            <span>
              يطلب <strong>{kid.nickname}</strong> الانضمام إلى مجموعة «{g.name}» ({ar(g.members)} أعضاء)
            </span>
            <span className="area__row">
              <button type="button" className="area__btn area__btn--ok" onClick={() => void act(() => rpc('parent_decide_membership', { p_group: g.group_id, p_student: kid.id, p_approve: true }), 'تمت الموافقة.')}>
                موافقة
              </button>
              <button type="button" className="area__btn area__btn--ghost" onClick={() => void act(() => rpc('parent_decide_membership', { p_group: g.group_id, p_student: kid.id, p_approve: false }), 'رُفض الطلب.')}>
                رفض
              </button>
            </span>
          </div>
        ))
      )}

      <h2 className="area__h2">مجموعات أبنائي</h2>
      {kids.map((k) => {
        const active = (childGroups[k.id] ?? []).filter((g) => g.status === 'active')
        return (
          <div key={k.id} className="area__card">
            <strong>{k.nickname}</strong>
            {active.length === 0 ? (
              <p className="area__muted">ليس عضوًا في أي مجموعة.</p>
            ) : (
              <ul>
                {active.map((g) => (
                  <li key={g.group_id} className="area__row" style={{ justifyContent: 'space-between' }}>
                    <span>
                      {g.name} ({ar(g.members)} أعضاء)
                    </span>
                    <button type="button" className="area__btn area__btn--ghost" onClick={() => void act(() => rpc('parent_remove_from_group', { p_group: g.group_id, p_student: k.id }), 'أُخرج ابنك من المجموعة.')}>
                      إخراج من المجموعة
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}

      <h2 className="area__h2">مجموعات أديرها</h2>
      <form className="area__card area__row" onSubmit={create}>
        <input className="area__input" style={{ flex: '1 1 160px', minWidth: 0, width: 'auto' }} placeholder="اسم المجموعة (مثال: أصدقاء الصف الثامن)" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="area__btn">
          إنشاء مجموعة
        </button>
      </form>
      <div className="area__tabs">
        {managed.map((g) => (
          <button key={g.id} type="button" className="area__tab" aria-pressed={selected === g.id} onClick={() => setSelected(g.id)}>
            {g.name} {g.active ? `(${ar(g.members)})` : '(مغلقة)'}
          </button>
        ))}
      </div>
      {selected && <ManagedGroup key={selected} id={selected} onChanged={() => void load()} />}
    </>
  )
}

function ManagedGroup({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [view, setView] = useState<ManagerView | null>(null)
  const [board, setBoard] = useState<Leaderboard | null>(null)
  const [period, setPeriod] = useState<'week' | 'all'>('week')
  const [days, setDays] = useState(14)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setView(await rpc<ManagerView>('group_manager_view', { p_group: id }))
      setBoard(await groupLeaderboard(id, period))
    } catch (e) {
      setError(arabicError(e))
    }
  }, [id, period])
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(t)
  }, [load])

  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      await load()
      onChanged()
    } catch (e) {
      setError(arabicError(e))
    }
  }

  if (!view) return <p className="area__muted">{error ?? 'جارٍ التحميل…'}</p>
  return (
    <div className="area__card" data-testid="managed-group">
      <h3 style={{ marginTop: 0 }}>{view.group.name}</h3>
      {error && <p className="area__error">{error}</p>}
      <p className="area__muted">
        الأعضاء النشطون: {ar(view.participation.active_members)} · نشطون هذا الأسبوع: {ar(view.participation.active_this_week)} · مهمات هذا الأسبوع:{' '}
        {ar(view.participation.missions_this_week)}
      </p>

      {view.group.active && (
        <div className="area__row">
          <label className="area__label">
            صلاحية الرمز (أيام، ٠ = بلا انتهاء)
            <input className="area__input" type="number" min={0} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} />
          </label>
          <button type="button" className="area__btn" onClick={() => void act(() => rpc('create_group_invite', { p_group: id, p_days: days }))}>
            إنشاء رمز دعوة
          </button>
        </div>
      )}
      <ul>
        {view.invites.map((i) => (
          <li key={i.id} className="area__row" style={{ justifyContent: 'space-between' }}>
            <span>
              <code dir="ltr" data-testid="invite-code" style={{ fontSize: '1.1rem', letterSpacing: 2 }}>
                {i.code}
              </code>{' '}
              <span className="area__muted">
                {i.revoked ? 'ملغى' : i.expires_at ? `ينتهي ${new Date(i.expires_at).toLocaleDateString('ar')}` : 'بلا انتهاء'} · استُخدم {ar(i.uses)}
              </span>
            </span>
            {!i.revoked && (
              <button type="button" className="area__btn area__btn--ghost" onClick={() => void act(() => rpc('revoke_group_invite', { p_invite: i.id }))}>
                إلغاء الرمز
              </button>
            )}
          </li>
        ))}
      </ul>

      <h4>الأعضاء</h4>
      <ul>
        {view.members.map((m) => (
          <li key={m.student_id} className="area__row" style={{ justifyContent: 'space-between' }}>
            <span>
              {m.nickname} <span className="area__chip">{m.status === 'pending' ? 'بانتظار موافقة ولي أمره' : 'نشط'}</span>
            </span>
            <button type="button" className="area__btn area__btn--ghost" onClick={() => void act(() => rpc('owner_remove_member', { p_group: id, p_student: m.student_id }))}>
              إزالة
            </button>
          </li>
        ))}
      </ul>

      <h4>لوحة الصدارة</h4>
      <div className="area__tabs">
        <button type="button" className="area__tab" aria-pressed={period === 'week'} onClick={() => setPeriod('week')}>
          هذا الأسبوع
        </button>
        <button type="button" className="area__tab" aria-pressed={period === 'all'} onClick={() => setPeriod('all')}>
          كل الوقت
        </button>
      </div>
      <ol>
        {board?.rows.map((r) => (
          <li key={`${r.rank}-${r.nickname}`}>
            {r.nickname} — {ar(r.xp)} نقطة خبرة
          </li>
        ))}
      </ol>
      {view.group.active && (
        <button
          type="button"
          className="area__btn area__btn--danger"
          onClick={() => {
            if (window.confirm('إغلاق المجموعة نهائيًّا؟ تُلغى رموز الدعوة.')) void act(() => rpc('close_group', { p_group: id }))
          }}
        >
          إغلاق المجموعة
        </button>
      )}
    </div>
  )
}
