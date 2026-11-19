import { useEffect, useState } from 'react'
import type { SfxName } from '../audio/sfx'
import type { CatalogSubject } from '../cloud/types'
import { CornerButton } from '../components/CornerButton'
import { Sky } from '../components/Sky'
import { PlayArrow } from '../components/sprites'
import { ar } from '../quiz/format'
import * as api from './api'
import { DURATIONS, MODES } from './modes'
import './multiplayer.css'

interface Props {
  subjects: CatalogSubject[]
  allowed: boolean
  /** Code from an invite link (#/join/CODE). */
  inviteCode?: string
  onEnter: (roomId: string) => void
  onBack: () => void
  play: (n: SfxName) => void
}

/** غرف التحدّي — create a private room or join one with a code. Rooms are never listed publicly. */
export function RoomsHub({ subjects, allowed, inviteCode, onEnter, onBack, play }: Props) {
  const [mode, setMode] = useState<api.ModeId>('speed')
  const [chosen, setChosen] = useState<string[]>(subjects.map((s) => s.id))
  const [duration, setDuration] = useState(150)
  const [code, setCode] = useState(inviteCode ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Back to a room this player is already in (reconnect after a reload or a lost connection).
  useEffect(() => {
    if (inviteCode) return
    api
      .myRoom()
      .then((r) => {
        if (r && (r.status === 'playing' || r.status === 'lobby' || r.status === 'finished')) onEnter(r.room_id)
      })
      .catch(() => {})
  }, [inviteCode, onEnter])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      play('wrong')
      setMsg(api.mpError(e))
    } finally {
      setBusy(false)
    }
  }
  const create = () =>
    run(async () => {
      const r = await api.createRoom(mode, chosen.length === subjects.length ? [] : chosen, duration)
      play('confirm')
      onEnter(r.room_id)
    })
  const join = () =>
    run(async () => {
      const r = await api.joinRoom(code)
      if (r.status === 'joined' && r.room_id) {
        play('playerJoin')
        onEnter(r.room_id)
      } else {
        play('wrong')
        setMsg(
          r.status === 'full' ? 'الغرفة ممتلئة.' : r.status === 'in_progress' ? 'المباراة بدأت بالفعل؛ انتظر الجولة القادمة.' : 'الرمز غير صحيح أو انتهت صلاحيته.',
        )
      }
    })

  return (
    <div className="mp">
      <Sky />
      <div className="mp__scroll">
        <header className="mp__header">
          <CornerButton icon={<PlayArrow className="icon-back" />} label="الساحة" onClick={onBack} />
          <h1 className="mp__title">غرف التحدّي</h1>
        </header>
        {!allowed ? (
          <section className="mp__panel">
            <p>غرف التحدّي متوقفة حاليًّا بقرار من ولي الأمر.</p>
          </section>
        ) : (
          <>
            <section className="mp__panel" aria-labelledby="join-title">
              <h2 id="join-title" className="mp__h2">الانضمام بالرمز</h2>
              <form
                className="mp__row"
                onSubmit={(e) => {
                  e.preventDefault()
                  void join()
                }}
              >
                <input
                  className="mp__code-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="مثل: K7QH2MXA"
                  aria-label="رمز الغرفة"
                  dir="ltr"
                  maxLength={12}
                  autoComplete="off"
                  autoCapitalize="characters"
                />
                <button type="submit" className="pixel-button" disabled={busy || code.replace(/[^A-Za-z0-9]/g, '').length < 8}>
                  انضمام
                </button>
              </form>
              <p className="mp__note">الغرف خاصة: لا تظهر في أي قائمة، ولا يدخلها إلا من لديه الرمز.</p>
            </section>
            <section className="mp__panel" aria-labelledby="create-title">
              <h2 id="create-title" className="mp__h2">إنشاء غرفة</h2>
              <div className="mp__modes" role="radiogroup" aria-label="نمط اللعب">
                {MODES.map((m) => (
                  <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className="mp__mode" onClick={() => (play('click'), setMode(m.id))}>
                    <span className="mp__mode-icon" aria-hidden="true">
                      {m.icon}
                    </span>
                    <strong>{m.name}</strong>
                    <span className="mp__mode-players">
                      {m.min === m.max ? `${ar(m.min)} لاعبَين` : `${ar(m.min)}–${ar(m.max)} لاعبًا`}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mp__summary">{MODES.find((m) => m.id === mode)!.summary}</p>
              <fieldset className="mp__fieldset">
                <legend>المواد</legend>
                {subjects.map((s) => (
                  <label key={s.id} className="area__check">
                    <input
                      type="checkbox"
                      checked={chosen.includes(s.id)}
                      onChange={(e) => setChosen((c) => (e.target.checked ? [...c, s.id] : c.filter((x) => x !== s.id)))}
                    />
                    {s.name_ar}
                  </label>
                ))}
              </fieldset>
              {MODES.find((m) => m.id === mode)!.timed && (
                <label className="mp__field">
                  مدة المباراة
                  <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                    {DURATIONS.map((d) => (
                      <option key={d} value={d}>
                        {d < 120 ? `${ar(d)} ثانية` : `${ar(d / 60)} دقائق`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button type="button" className="pixel-button mp__wide" disabled={busy || chosen.length === 0} onClick={() => void create()}>
                إنشاء الغرفة
              </button>
            </section>
          </>
        )}
        {msg && (
          <p className="mp__error" role="alert">
            {msg}
          </p>
        )}
      </div>
    </div>
  )
}
