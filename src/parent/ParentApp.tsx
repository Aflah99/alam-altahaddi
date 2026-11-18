import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { BASE_CHARACTER_IDS, getCharacter } from '../characters/roster'
import { invokeFunction } from '../cloud/api'
import { PASSWORD_HINT, passwordProblem, useAuth } from '../cloud/auth'
import { AreaMessage, AreaShell } from '../cloud/AreaShell'
import { arabicError, supabase } from '../cloud/client'
import { USERNAME_RE } from '../cloud/config'
import { ParentChildDashboard } from './ParentChildDashboard'
import { ParentGroups } from './ParentGroups'
import { ParentPrivacy } from './ParentPrivacy'

export interface ChildRow {
  id: string
  username: string
  nickname: string
  character_id: string
  show_in_leaderboards: boolean
  created_at: string
}

interface ParentAppProps {
  path: string[]
  navigate: (path: string[]) => void
  onExit: () => void
}

const NAV = [
  { id: 'children', label: 'أبنائي' },
  { id: 'results', label: 'النتائج' },
  { id: 'groups', label: 'المجموعات' },
  { id: 'privacy', label: 'الخصوصية والحساب' },
] as const

/** لوحة ولي الأمر — linked children, their results, groups and privacy. */
export default function ParentApp({ path, navigate, onExit }: ParentAppProps) {
  const auth = useAuth()
  const { state } = auth
  const [children, setChildren] = useState<ChildRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const c = supabase()
    if (!c) return
    const { data, error: e } = await c
      .from('student_profiles')
      .select('id, username, nickname, character_id, show_in_leaderboards, created_at')
      .order('created_at')
    if (e) setError(arabicError(e))
    else setChildren(data as ChildRow[])
  }, [])

  const isParent = state.status === 'signed-in' && state.role === 'parent'
  useEffect(() => {
    if (!isParent) return
    const t = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(t)
  }, [isParent, load])

  if (state.status === 'disabled') {
    return (
      <AreaMessage title="لوحة ولي الأمر">
        <p>الحسابات السحابية غير مفعّلة في هذه النسخة بعد.</p>
        <button type="button" className="area__btn" onClick={onExit}>
          العودة
        </button>
      </AreaMessage>
    )
  }
  if (state.status !== 'signed-in') {
    return (
      <AreaMessage title="لوحة ولي الأمر">
        <p>{state.status === 'loading' ? 'جارٍ التحقّق من الجلسة…' : 'سجّل الدخول بحساب ولي الأمر للمتابعة.'}</p>
        <button type="button" className="area__btn" onClick={onExit}>
          العودة
        </button>
      </AreaMessage>
    )
  }
  if (state.role !== 'parent') {
    return (
      <AreaMessage title="لوحة ولي الأمر">
        <p>هذه اللوحة لحسابات أولياء الأمور فقط.</p>
        <button type="button" className="area__btn" onClick={onExit}>
          العودة
        </button>
      </AreaMessage>
    )
  }

  const section = (NAV.find((n) => n.id === path[0])?.id ?? 'children') as (typeof NAV)[number]['id']
  const childId = path[1]

  return (
    <AreaShell
      title="لوحة ولي الأمر"
      subtitle={state.email ?? undefined}
      nav={NAV}
      active={section}
      onNav={(id) => navigate([id])}
      onExit={onExit}
      onSignOut={() => void auth.signOut().then(onExit)}
    >
      {error && <p className="area__error">{error}</p>}
      {section === 'children' && <ChildrenSection kids={children} reload={load} onOpen={(id) => navigate(['results', id])} />}
      {section === 'results' && children && (
        <ParentChildDashboard kids={children} childId={childId ?? children[0]?.id} onPick={(id) => navigate(['results', id])} />
      )}
      {section === 'groups' && children && <ParentGroups kids={children} />}
      {section === 'privacy' && children && <ParentPrivacy kids={children} reload={load} />}
    </AreaShell>
  )
}

function ChildrenSection({ kids, reload, onOpen }: { kids: ChildRow[] | null; reload: () => Promise<void>; onOpen: (id: string) => void }) {
  const [username, setUsername] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [character, setCharacter] = useState<string>('green-slime')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [resetFor, setResetFor] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')

  const create = async (e: FormEvent) => {
    e.preventDefault()
    const u = username.trim().toLowerCase()
    if (!USERNAME_RE.test(u)) return setMsg({ ok: false, text: 'اسم الدخول من ٣ إلى ٢٠ حرفًا إنجليزيًّا صغيرًا أو رقمًا أو شرطة سفلية.' })
    const pwProblem = passwordProblem(password)
    if (pwProblem) return setMsg({ ok: false, text: pwProblem })
    setBusy(true)
    setMsg(null)
    try {
      await invokeFunction('parent-children', { action: 'create', username: u, nickname, password, character_id: character })
      setMsg({ ok: true, text: `تم إنشاء حساب الطالب. اسم الدخول: ${u}. أعطه كلمة المرور بنفسك.` })
      setUsername('')
      setNickname('')
      setPassword('')
      await reload()
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message && /[؀-ۿ]/.test((err as Error).message) ? (err as Error).message : arabicError(err) })
    } finally {
      setBusy(false)
    }
  }

  const reset = async (id: string) => {
    const pwProblem = passwordProblem(newPassword)
    if (pwProblem) return setMsg({ ok: false, text: pwProblem })
    setBusy(true)
    setMsg(null)
    try {
      await invokeFunction('parent-children', { action: 'reset_password', student_id: id, password: newPassword })
      setMsg({ ok: true, text: 'تم تغيير كلمة مرور الطالب.' })
      setResetFor(null)
      setNewPassword('')
    } catch (err) {
      setMsg({ ok: false, text: /[؀-ۿ]/.test((err as Error).message) ? (err as Error).message : arabicError(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1 className="area__h1">أبنائي</h1>
      {msg && <p className={msg.ok ? 'area__ok' : 'area__error'}>{msg.text}</p>}
      {!kids ? (
        <p className="area__muted">جارٍ التحميل…</p>
      ) : kids.length === 0 ? (
        <p className="area__info">لم تُضف أي ابن بعد. أنشئ له حساب طالب أدناه؛ لا يحتاج الطالب إلى بريد إلكتروني.</p>
      ) : (
        <div className="area__grid">
          {kids.map((c) => (
            <div key={c.id} className="area__card">
              <strong>{c.nickname}</strong>
              <p className="area__muted">
                اسم الدخول: <span dir="ltr">{c.username}</span> · {getCharacter(c.character_id as never).name}
              </p>
              <div className="area__row">
                <button type="button" className="area__btn" onClick={() => onOpen(c.id)}>
                  عرض النتائج
                </button>
                <button type="button" className="area__btn area__btn--ghost" onClick={() => setResetFor(resetFor === c.id ? null : c.id)}>
                  تغيير كلمة المرور
                </button>
              </div>
              {resetFor === c.id && (
                <div className="area__form" style={{ marginTop: 10 }}>
                  <label>
                    كلمة المرور الجديدة ({PASSWORD_HINT})
                    <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
                  </label>
                  <button type="button" className="area__btn" disabled={busy || newPassword.length < 8} onClick={() => void reset(c.id)}>
                    حفظ
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 className="area__h2">إضافة ابن</h2>
      <form className="area__card area__form" onSubmit={(e) => void create(e)}>
        <label>
          اسم الدخول (حروف إنجليزية صغيرة وأرقام)
          <input value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" autoComplete="off" required />
        </label>
        <label>
          اللقب في اللعبة (لا تستخدم الاسم الحقيقي)
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={12} required />
        </label>
        <label>
          كلمة المرور ({PASSWORD_HINT})
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        </label>
        <label>
          الشخصية
          <select value={character} onChange={(e) => setCharacter(e.target.value)}>
            {BASE_CHARACTER_IDS.map((id) => (
              <option key={id} value={id}>
                {getCharacter(id).name}
              </option>
            ))}
          </select>
        </label>
        <p className="area__muted">
          لا نطلب بريد الطالب أو اسمه الحقيقي أو مدرسته. أنت من يعطي الطالب اسم الدخول وكلمة المرور، ويمكنك تغييرها في أي وقت.
        </p>
        <button type="submit" className="area__btn" disabled={busy}>
          إنشاء حساب الطالب
        </button>
      </form>
    </>
  )
}
