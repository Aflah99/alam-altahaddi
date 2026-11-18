import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useAuth, PASSWORD_MIN } from '../cloud/auth'
import { arabicError } from '../cloud/client'
import { USERNAME_RE } from '../cloud/config'
import { CornerButton } from '../components/CornerButton'
import { Sky } from '../components/Sky'
import { PlayArrow } from '../components/sprites'
import './account.css'

type Tab = 'student' | 'adult'
type AdultView = 'signin' | 'signup' | 'forgot'

interface AccountScreenProps {
  /** Continue as a device-local guest (no account). */
  onGuest: () => void
  onBack: () => void
  /** Signed in: go to the right place for the role. */
  onSignedIn: (role: 'student' | 'parent' | 'admin' | null) => void
}

/** تسجيل الدخول — students (username), parents and administrators (email). */
export function AccountScreen({ onGuest, onBack, onSignedIn }: AccountScreenProps) {
  const auth = useAuth()
  const { state } = auth
  const [tab, setTab] = useState<Tab>('student')
  const [adultView, setAdultView] = useState<AdultView>('signin')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [consent, setConsent] = useState(false)
  // Signing in from this screen goes straight to the right place for the role.
  const justSignedIn = useRef(false)
  useEffect(() => {
    if (justSignedIn.current && state.status === 'signed-in' && !state.recovery && state.role) {
      justSignedIn.current = false
      onSignedIn(state.role)
    }
  }, [state, onSignedIn])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await fn()
    } catch (e) {
      setError(arabicError(e))
    } finally {
      setBusy(false)
    }
  }

  if (state.status === 'disabled') {
    return (
      <Shell onBack={onBack} title="الحساب">
        <p className="acct__note">
          الحسابات السحابية (حفظ التقدّم على أكثر من جهاز، لوحة ولي الأمر والمجموعات الخاصة) غير مفعّلة في هذه النسخة بعد.
        </p>
        <button type="button" className="pixel-button acct__wide" onClick={onGuest}>
          اللعب كضيف على هذا الجهاز
        </button>
      </Shell>
    )
  }

  if (state.status === 'loading') {
    return (
      <Shell onBack={onBack} title="الحساب">
        <p className="acct__note">جارٍ التحقّق من الجلسة…</p>
      </Shell>
    )
  }

  if (state.status === 'signed-in' && state.recovery) {
    const submit = (e: FormEvent) => {
      e.preventDefault()
      if (password.length < PASSWORD_MIN) return setError(`كلمة المرور قصيرة؛ استخدم ${PASSWORD_MIN} أحرف على الأقل.`)
      if (password !== password2) return setError('كلمتا المرور غير متطابقتين.')
      void run(async () => {
        await auth.updatePassword(password)
        setNotice('تم تغيير كلمة المرور.')
      })
    }
    return (
      <Shell onBack={onBack} title="كلمة مرور جديدة">
        <form className="acct__form" onSubmit={submit}>
          <Field label="كلمة المرور الجديدة" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
          <Field label="تأكيد كلمة المرور" type="password" value={password2} onChange={setPassword2} autoComplete="new-password" />
          <Status error={error} notice={notice} />
          <button type="submit" className="pixel-button acct__wide" disabled={busy}>
            حفظ كلمة المرور
          </button>
        </form>
      </Shell>
    )
  }

  if (state.status === 'signed-in') {
    const roleName = state.role === 'student' ? 'طالب' : state.role === 'admin' ? 'مشرف' : state.role === 'parent' ? 'ولي أمر' : 'حساب'
    return (
      <Shell onBack={onBack} title="الحساب">
        <p className="acct__note">
          أنت مسجّل الدخول ({roleName}){state.email && state.role !== 'student' ? `: ${state.email}` : ''}.
        </p>
        <button type="button" className="pixel-button acct__wide" onClick={() => onSignedIn(state.role)}>
          {state.role === 'student' ? 'متابعة اللعب' : state.role === 'admin' ? 'لوحة المشرف' : 'لوحة ولي الأمر'}
        </button>
        <button type="button" className="pause-menu__item acct__wide" disabled={busy} onClick={() => void run(auth.signOut)}>
          تسجيل الخروج
        </button>
        <Status error={error} notice={null} />
      </Shell>
    )
  }

  const studentSubmit = (e: FormEvent) => {
    e.preventDefault()
    const u = username.trim().toLowerCase()
    if (!USERNAME_RE.test(u)) return setError('اسم الدخول من ٣ إلى ٢٠ حرفًا إنجليزيًّا صغيرًا أو رقمًا أو شرطة سفلية.')
    justSignedIn.current = true
    void run(() => auth.signInStudent(u, password))
  }

  const adultSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (adultView === 'forgot') {
      void run(async () => {
        await auth.sendPasswordReset(email)
        setNotice('إذا كان البريد مسجّلًا فستصلك رسالة لتعيين كلمة مرور جديدة.')
      })
      return
    }
    if (adultView === 'signup') {
      if (password.length < PASSWORD_MIN) return setError(`كلمة المرور قصيرة؛ استخدم ${PASSWORD_MIN} أحرف على الأقل.`)
      if (password !== password2) return setError('كلمتا المرور غير متطابقتين.')
      if (!consent) return setError('يجب الموافقة على إشعار الخصوصية بوصفك ولي الأمر.')
      void run(async () => {
        const r = await auth.signUpParent(email, password, displayName)
        setNotice(r.needsConfirmation ? 'أرسلنا رسالة تأكيد إلى بريدك. افتحها لتفعيل الحساب ثم سجّل الدخول.' : 'تم إنشاء الحساب.')
        setAdultView('signin')
      })
      return
    }
    justSignedIn.current = true
    void run(() => auth.signInWithEmail(email, password))
  }

  return (
    <Shell onBack={onBack} title="تسجيل الدخول">
      {state.expired && <p className="acct__warn">انتهت الجلسة. سجّل الدخول مرة أخرى للمتابعة.</p>}
      <div className="acct__tabs" role="tablist" aria-label="نوع الحساب">
        <button type="button" role="tab" aria-selected={tab === 'student'} className="acct__tab" onClick={() => (setTab('student'), setError(null))}>
          طالب
        </button>
        <button type="button" role="tab" aria-selected={tab === 'adult'} className="acct__tab" onClick={() => (setTab('adult'), setError(null))}>
          ولي الأمر / المشرف
        </button>
      </div>

      {tab === 'student' ? (
        <form className="acct__form" onSubmit={studentSubmit}>
          <Field label="اسم الدخول" value={username} onChange={setUsername} autoComplete="username" dir="ltr" />
          <Field label="كلمة المرور" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
          <Status error={error} notice={notice} />
          <button type="submit" className="pixel-button acct__wide" disabled={busy}>
            دخول
          </button>
          <p className="acct__small">ينشئ ولي الأمر حساب الطالب ويعطيه اسم الدخول. نسيت كلمة المرور؟ يغيّرها ولي الأمر من لوحته.</p>
        </form>
      ) : (
        <form className="acct__form" onSubmit={adultSubmit}>
          {adultView === 'signup' && <Field label="اسم العرض (اختياري)" value={displayName} onChange={setDisplayName} autoComplete="nickname" />}
          <Field label="البريد الإلكتروني" type="email" value={email} onChange={setEmail} autoComplete="email" dir="ltr" />
          {adultView !== 'forgot' && (
            <Field
              label="كلمة المرور"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={adultView === 'signup' ? 'new-password' : 'current-password'}
            />
          )}
          {adultView === 'signup' && (
            <>
              <Field label="تأكيد كلمة المرور" type="password" value={password2} onChange={setPassword2} autoComplete="new-password" />
              <label className="acct__check">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  أنا ولي الأمر، وقرأت <a href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noreferrer">إشعار الخصوصية</a> وأوافق على إنشاء حسابات أبنائي بنفسي.
                </span>
              </label>
            </>
          )}
          <Status error={error} notice={notice} />
          <button type="submit" className="pixel-button acct__wide" disabled={busy}>
            {adultView === 'signup' ? 'إنشاء حساب ولي أمر' : adultView === 'forgot' ? 'إرسال رابط الاستعادة' : 'دخول'}
          </button>
          <div className="acct__links">
            {adultView !== 'signin' && (
              <button type="button" className="acct__link" onClick={() => (setAdultView('signin'), setError(null))}>
                لدي حساب
              </button>
            )}
            {adultView !== 'signup' && (
              <button type="button" className="acct__link" onClick={() => (setAdultView('signup'), setError(null))}>
                إنشاء حساب ولي أمر
              </button>
            )}
            {adultView !== 'forgot' && (
              <button type="button" className="acct__link" onClick={() => (setAdultView('forgot'), setError(null))}>
                نسيت كلمة المرور
              </button>
            )}
          </div>
          <p className="acct__small">حسابات المشرفين لا تُنشأ من هنا؛ يمنحها مالك المنصة فقط.</p>
        </form>
      )}

      <div className="acct__divider" />
      <button type="button" className="pause-menu__item acct__wide" onClick={onGuest}>
        اللعب كضيف على هذا الجهاز (دون حساب)
      </button>
    </Shell>
  )
}

function Shell({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className="acct">
      <Sky />
      <div className="acct__scroll">
        <header className="acct__header">
          <CornerButton icon={<PlayArrow className="icon-back" />} label="رجوع" onClick={onBack} />
          <h1 className="acct__title">{title}</h1>
        </header>
        <main className="acct__panel">{children}</main>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  dir,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoComplete?: string
  dir?: 'ltr' | 'rtl'
}) {
  return (
    <label className="acct__field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} dir={dir} required={!label.includes('اختياري')} />
    </label>
  )
}

function Status({ error, notice }: { error: string | null; notice: string | null }) {
  if (error) return <p className="acct__error" role="alert">{error}</p>
  if (notice) return <p className="acct__notice" role="status">{notice}</p>
  return null
}
