import { useEffect, useMemo, useRef, useState } from 'react'
import type { TrackId } from '../audio/music'
import type { SfxName } from '../audio/sfx'
import type { CatalogSubject } from '../cloud/types'
import { CornerButton } from '../components/CornerButton'
import { Sky } from '../components/Sky'
import { PlayArrow } from '../components/sprites'
import { ar } from '../quiz/format'
import * as api from './api'
import type { MpMember, MpState } from './api'
import { MemberAvatar } from './Avatar'
import { BossView, ConquestMap, DuelView, Scoreboard, SurvivalView, TeamsView, TournamentView, TreasureMap } from './ModeViews'
import { DURATIONS, MODES, modeInfo, REACTIONS, reactionLabel } from './modes'
import { QuestionBox } from './QuestionBox'
import { useRoom, useTicker } from './useRoom'
import './multiplayer.css'

interface Props {
  roomId: string
  subjects: CatalogSubject[]
  onLeave: () => void
  play: (n: SfxName) => void
  setMusic: (t: TrackId) => void
}

export function RoomScreen({ roomId, subjects, onLeave, play, setMusic }: Props) {
  const { state, error, refresh, now } = useRoom(roomId)
  const [msg, setMsg] = useState<string | null>(null)
  const members = useMemo(() => new Map((state?.members ?? []).map((m) => [m.id, m])), [state?.members])
  const match = state?.match ?? null
  const view = !state ? 'loading' : state.room.status === 'closed' ? 'closed' : match && state.room.status !== 'lobby' ? (match.status === 'finished' ? 'results' : 'match') : 'lobby'

  useEffect(() => {
    setMusic(view === 'match' ? 'match' : view === 'results' ? 'victory' : 'room')
  }, [view, setMusic])
  useGameSounds(state, play)

  const act = async (fn: () => Promise<unknown>) => {
    setMsg(null)
    try {
      await fn()
      await refresh()
    } catch (e) {
      play('wrong')
      setMsg(api.mpError(e))
    }
  }

  if (!state) {
    return (
      <Shell title="غرفة التحدّي" onBack={onLeave}>
        <p className="mp__panel">{error ?? 'جارٍ الاتصال بالغرفة…'}</p>
      </Shell>
    )
  }
  const leave = () => void act(() => api.leaveRoom(roomId)).then(onLeave)

  return (
    <Shell title={modeInfo(state.room.mode).name} onBack={leave} backLabel="مغادرة">
      {error && <p className="mp__error">{error}</p>}
      {msg && (
        <p className="mp__error" role="alert">
          {msg}
        </p>
      )}
      {view === 'closed' && <p className="mp__panel">أُغلقت هذه الغرفة.</p>}
      {view === 'lobby' && <Lobby state={state} subjects={subjects} act={act} play={play} />}
      {view === 'match' && match && <MatchView state={state} members={members} now={now} act={act} play={play} refresh={refresh} />}
      {view === 'results' && match && <Results state={state} members={members} act={act} />}
      {state.reactions_allowed && view !== 'closed' && <ReactionBar roomId={roomId} state={state} members={members} act={act} play={play} />}
    </Shell>
  )
}

function Shell({ title, onBack, backLabel = 'رجوع', children }: { title: string; onBack: () => void; backLabel?: string; children: React.ReactNode }) {
  return (
    <div className="mp">
      <Sky />
      <div className="mp__scroll">
        <header className="mp__header">
          <CornerButton icon={<PlayArrow className="icon-back" />} label={backLabel} onClick={onBack} />
          <h1 className="mp__title">{title}</h1>
        </header>
        {children}
      </div>
    </div>
  )
}

type Act = (fn: () => Promise<unknown>) => Promise<void>

function Lobby({ state, subjects, act, play }: { state: MpState; subjects: CatalogSubject[]; act: Act; play: (n: SfxName) => void }) {
  const { room, me } = state
  const isHost = room.host === me
  const mine = state.members.find((m) => m.id === me)
  const info = modeInfo(room.mode)
  const n = state.members.length
  const link = room.code ? `${window.location.origin}${import.meta.env.BASE_URL}#/join/${room.code}` : ''
  const [copied, setCopied] = useState(false)
  const notReady = state.members.filter((m) => !m.ready && m.id !== room.host).length
  const subjectIds = room.subjects.length ? room.subjects : subjects.map((s) => s.id)
  return (
    <>
      <section className="mp__panel mp__invite">
        <h2 className="mp__h2">رمز الدعوة</h2>
        {room.code ? (
          <>
            <p className="mp__code" dir="ltr" aria-label={`الرمز ${room.code.split('').join(' ')}`}>
              {room.code}
            </p>
            <div className="mp__row">
              <button
                type="button"
                className="pixel-button"
                onClick={() => {
                  void navigator.clipboard?.writeText(link).then(() => setCopied(true))
                  play('click')
                }}
              >
                {copied ? 'نُسخ الرابط ✓' : 'نسخ رابط الدعوة'}
              </button>
              {isHost && (
                <button type="button" className="pause-menu__item" onClick={() => void act(() => api.newInvite(room.id))}>
                  رمز جديد
                </button>
              )}
              {isHost && (
                <button type="button" className="pause-menu__item" onClick={() => void act(() => api.closeInvite(room.id))}>
                  إيقاف الدعوات
                </button>
              )}
            </div>
            <p className="mp__note">شارك الرمز مع أصدقائك فقط. ينتهي بعد ثلاث ساعات.</p>
          </>
        ) : (
          <>
            <p>الدعوات متوقفة.</p>
            {isHost && (
              <button type="button" className="pixel-button" onClick={() => void act(() => api.newInvite(room.id))}>
                إنشاء رمز جديد
              </button>
            )}
          </>
        )}
      </section>

      <section className="mp__panel">
        <h2 className="mp__h2">
          {info.icon} {info.name}
        </h2>
        <p className="mp__summary">{info.summary}</p>
        {isHost && (
          <div className="mp__row mp__row--wrap">
            <label className="mp__field">
              النمط
              <select
                value={room.mode}
                onChange={(e) => void act(() => api.updateRoom(room.id, e.target.value as api.ModeId, room.subjects, room.settings.duration ?? 150))}
              >
                {MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.min === m.max ? ar(m.min) : `${ar(m.min)}–${ar(m.max)}`})
                  </option>
                ))}
              </select>
            </label>
            {info.timed && (
              <label className="mp__field">
                المدة
                <select
                  value={room.settings.duration ?? 150}
                  onChange={(e) => void act(() => api.updateRoom(room.id, room.mode, room.subjects, Number(e.target.value)))}
                >
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d < 120 ? `${ar(d)} ثانية` : `${ar(d / 60)} دقائق`}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        <p className="mp__note">المواد: {subjects.filter((s) => subjectIds.includes(s.id)).map((s) => s.name_ar).join('، ') || '—'}</p>
      </section>

      <section className="mp__panel">
        <h2 className="mp__h2">
          اللاعبون ({ar(n)} من {ar(info.max)})
        </h2>
        <ul className="mp__members">
          {state.members.map((m) => (
            <MemberCard key={m.id} m={m} host={m.id === room.host} me={m.id === me} />
          ))}
        </ul>
        <div className="mp__row">
          {!isHost && mine && (
            <button
              type="button"
              className="pixel-button"
              onClick={() => {
                play('ready')
                void act(() => api.setReady(room.id, !mine.ready))
              }}
            >
              {mine.ready ? 'لست جاهزًا' : 'أنا جاهز!'}
            </button>
          )}
          {isHost && (
            <button
              type="button"
              className="pixel-button mp__start"
              disabled={n < info.min || n > info.max || notReady > 0}
              onClick={() => {
                play('missionStart')
                void act(() => api.startMatch(room.id))
              }}
            >
              ابدأ المباراة
            </button>
          )}
        </div>
        <p className="mp__note" aria-live="polite">
          {n < info.min
            ? `يحتاج هذا النمط ${ar(info.min)} لاعبين على الأقل.`
            : notReady > 0
              ? `بانتظار ${ar(notReady)} لاعبين ليضغطوا «جاهز».`
              : isHost
                ? 'الجميع جاهز!'
                : 'بانتظار المضيف ليبدأ المباراة.'}
        </p>
      </section>
    </>
  )
}

function MemberCard({ m, host, me }: { m: MpMember; host: boolean; me: boolean }) {
  return (
    <li className="mp__member" data-offline={!m.online || undefined} data-me={me || undefined}>
      <span className="mp__member-avatar">
        <MemberAvatar m={m} />
      </span>
      <span className="mp__member-name">
        {host && <span aria-label="المضيف">👑 </span>}
        {m.nickname}
      </span>
      <span className="mp__member-state">{!m.online ? 'غير متصل' : host || m.ready ? '✓ جاهز' : '… ينتظر'}</span>
    </li>
  )
}

function MatchView({
  state,
  members,
  now,
  act,
  play,
  refresh,
}: {
  state: MpState
  members: Map<string, MpMember>
  now: () => number
  act: Act
  play: (n: SfxName) => void
  refresh: () => Promise<void>
}) {
  useTicker(250)
  const match = state.match!
  const me = state.me
  const [selected, setSelected] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<{ kind: string } | null>(null)
  const flashTimer = useRef<number | undefined>(undefined)
  const showFlash = (kind: string) => {
    window.clearTimeout(flashTimer.current)
    setFeedback({ kind })
    flashTimer.current = window.setTimeout(() => setFeedback(null), 1500)
  }
  useEffect(() => () => window.clearTimeout(flashTimer.current), [])
  const t = now()
  const countdown = match.status === 'countdown' ? Math.ceil((Date.parse(match.starts_at) - t) / 1000) : 0
  const deadline =
    match.mode === 'conquest' && match.state.phase === 'choose'
      ? match.state.deadline
      : match.round && !match.round.resolved
        ? Date.parse(match.round.starts_at) > t
          ? null
          : match.round.ends_at
        : match.ends_at
  const left = deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - t) / 1000)) : null
  const waitingRound = match.round && !match.round.resolved && Date.parse(match.round.starts_at) > t
  const mePlayer = match.players.find((p) => p.student === me)
  useEffect(() => {
    if (countdown > 0 && countdown <= 3) play('countdown')
    if (countdown === 0 && match.status === 'countdown') play('countdownGo')
  }, [countdown, match.status, play])

  const onAnswer = async (a: string) => {
    if (!match.question) return 'error' as const
    try {
      const r = await api.answer(match.id, match.question.idx, match.question.round, a)
      if (r.feedback === 'unsure') {
        play('unsure')
        return 'unsure' as const
      }
      play(r.feedback === 'correct' ? (match.mode === 'boss' ? 'bossHit' : match.mode === 'treasure' && (r.gain ?? 0) > 5 ? 'treasure' : 'correct') : 'wrong')
      showFlash(r.feedback)
      await refresh()
      return r.feedback
    } catch (e) {
      play('wrong')
      await refresh()
      showFlash(api.mpError(e))
      return 'error' as const
    }
  }
  const showFeedback = !!feedback

  let modeView = null
  if (match.mode === 'speed') modeView = <Scoreboard match={match} members={members} me={me} />
  if (match.mode === 'teams') modeView = <TeamsView match={match} members={members} me={me} />
  if (match.mode === 'survival') modeView = <SurvivalView match={match} members={members} me={me} />
  if (match.mode === 'duel') modeView = <DuelView match={match} members={members} me={me} />
  if (match.mode === 'tournament') modeView = <TournamentView match={match} members={members} me={me} />
  if (match.mode === 'boss') modeView = <BossView match={match} members={members} me={me} />
  if (match.mode === 'treasure')
    modeView = <TreasureMap match={match} members={members} me={me} onPick={(i) => void act(() => api.pickChest(match.id, i))} />
  if (match.mode === 'conquest')
    modeView = (
      <ConquestMap
        match={match}
        members={members}
        me={me}
        selected={selected}
        onTile={(i) => {
          if (selected === null || match.state.owners[i] === me) {
            setSelected(i)
            play('click')
          } else {
            const from = selected
            setSelected(null)
            play('attack')
            void act(() => api.attack(match.id, from, i))
          }
        }}
      />
    )

  return (
    <div className="mpmatch">
      {match.status === 'countdown' && (
        <div className="mp__countdown" role="status" aria-live="assertive">
          {countdown > 0 ? ar(countdown) : 'انطلق!'}
        </div>
      )}
      <div className="mpmatch__bar">
        {left !== null && (
          <span className="mpmatch__timer" data-low={left <= 5 || undefined} role="timer">
            ⏱ {ar(left)}
          </span>
        )}
        {mePlayer && (
          <span className="mpmatch__me">
            نقاطك: <b>{ar(mePlayer.score)}</b> · صحيحة: {ar(mePlayer.correct)}
          </span>
        )}
      </div>
      <div className="mpmatch__layout">
        <div className="mpmatch__main">
          {match.question && !waitingRound ? (
            <QuestionBox key={`${match.question.idx}:${match.question.round}`} question={match.question} onAnswer={onAnswer} />
          ) : (
            <p className="mp__panel mpmatch__wait" aria-live="polite">
              {waitingRound
                ? 'استعدّ… السؤال التالي قادم.'
                : match.round?.me_answered
                  ? `أجبت! بانتظار البقية (${ar(match.round.answered)} من ${ar(match.round.participants.length)}).`
                  : mePlayer && !mePlayer.alive
                    ? 'أنت تشاهد المباراة الآن.'
                    : match.mode === 'conquest'
                      ? 'تابع الخريطة.'
                      : match.mode === 'treasure'
                        ? 'اختر صندوقًا.'
                        : match.round && !match.round.participants.includes(me)
                          ? 'تشاهد هذه الجولة.'
                          : 'انتظر…'}
            </p>
          )}
          {showFeedback && (
            <p className={`mp__flash mp__flash--${feedback!.kind === 'correct' ? 'ok' : 'bad'}`} role="status">
              {feedback!.kind === 'correct' ? 'إجابة صحيحة! ✓' : feedback!.kind === 'wrong' ? 'إجابة خاطئة ✗' : feedback!.kind}
            </p>
          )}
          {match.last_round && !match.question && (
            <p className="mp__note mp__last">
              الإجابة الصحيحة للسؤال السابق: <b>{match.last_round.answer}</b>
            </p>
          )}
        </div>
        <aside className="mpmatch__side">{modeView}</aside>
      </div>
    </div>
  )
}

function Results({ state, members, act }: { state: MpState; members: Map<string, MpMember>; act: Act }) {
  const match = state.match!
  const r = match.result
  const me = state.me
  const mine = r?.ranking.find((x) => x.student === me)
  const won = !!r?.winners.includes(me)
  return (
    <>
      <section className="mp__panel mp__results">
        <h2 className="mp__h2">
          {match.mode === 'boss'
            ? r?.boss_defeated
              ? 'هزمتم الزعيم! 🎉'
              : 'نجا الزعيم هذه المرة!'
            : won
              ? 'فزت! 🏆'
              : r?.winners.length === 0
                ? 'تعادل!'
                : `الفائز: ${r?.winners.map((w) => members.get(w)?.nickname ?? '').join('، ')}`}
        </h2>
        {r?.team_scores && (
          <p>
            نقاط الفرق: {Object.entries(r.team_scores).map(([t, s]) => `${['الشمس', 'القمر', 'النجوم', 'الرعد'][Number(t)]} ${ar(s)}`).join(' · ')}
          </p>
        )}
        <ol className="mp__ranking">
          {r?.ranking.map((x) => (
            <li key={x.student} data-me={x.student === me || undefined} data-win={r.winners.includes(x.student) || undefined}>
              <span className="mpsb__rank">{ar(x.rank)}</span>
              <span className="mpsb__avatar">
                <MemberAvatar m={members.get(x.student)} mood={r.winners.includes(x.student) ? 'happy' : 'neutral'} />
              </span>
              <span className="mpsb__name">{members.get(x.student)?.nickname ?? 'لاعب'}</span>
              <span>
                {ar(x.correct)} صحيحة من {ar(x.answered)}
              </span>
            </li>
          ))}
        </ol>
        {mine && (
          <p className="mp__reward">
            {mine.capped
              ? 'وصلت إلى حد مكافآت المباريات اليوم؛ العب للمتعة والتعلّم!'
              : (mine.xp ?? 0) > 0
                ? `مكافأتك: +${ar(mine.xp ?? 0)} خبرة · +${ar(mine.coins ?? 0)} عملة`
                : 'تُمنح المكافآت لمن يجيب عن ٣ أسئلة على الأقل.'}
          </p>
        )}
        <button type="button" className="pixel-button mp__wide" onClick={() => void act(() => api.backToLobby(state.room.id))}>
          العودة إلى الغرفة (مباراة أخرى)
        </button>
      </section>
      {match.review && match.review.length > 0 && (
        <details className="mp__panel">
          <summary>مراجعة إجاباتي</summary>
          <ul className="mp__review">
            {match.review.map((q, i) => (
              <li key={i} data-ok={q.correct || undefined}>
                <p>{q.question}</p>
                <p>
                  {q.correct ? '✓' : '✗'} الإجابة الصحيحة: <b>{q.answer}</b>
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

function ReactionBar({ roomId, state, members, act, play }: { roomId: string; state: MpState; members: Map<string, MpMember>; act: Act; play: (n: SfxName) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="mp__bubbles" aria-live="polite">
        {state.reactions.slice(-4).map((r) => (
          <span key={r.id} className="mp__bubble">
            <b>{members.get(r.student)?.nickname ?? ''}:</b> {reactionLabel(r.reaction)}
          </span>
        ))}
      </div>
      <div className="mp__reactions">
        <button type="button" className="pause-menu__item" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          💬 رسائل سريعة
        </button>
        {open && (
          <div className="mp__reaction-grid" role="group" aria-label="رسائل جاهزة">
            {REACTIONS.map((r) => (
              <button
                key={r.id}
                type="button"
                className="mp__reaction"
                onClick={() => {
                  play('reaction')
                  setOpen(false)
                  void act(() => api.react(roomId, r.id))
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

/** Sounds for what happened since the last update (captures, hearts, the boss, results…). */
function useGameSounds(state: MpState | null, play: (n: SfxName) => void) {
  const prev = useRef<MpState | null>(null)
  useEffect(() => {
    const p = prev.current
    prev.current = state
    if (!p || !state) return
    const a = p.match
    const b = state.match
    if (state.members.length > p.members.length) play('playerJoin')
    if (state.reactions.length && state.reactions.at(-1)?.id !== p.reactions.at(-1)?.id && state.reactions.at(-1)?.student !== state.me) play('reaction')
    if (!a || !b || a.id !== b.id) return
    if (b.status === 'finished' && a.status !== 'finished') {
      if (b.mode === 'boss') play(b.result?.boss_defeated ? 'bossDefeat' : 'defeat')
      else play(b.result?.winners.includes(state.me) ? 'victory' : 'defeat')
      return
    }
    if (b.mode === 'conquest' && JSON.stringify(a.state.owners) !== JSON.stringify(b.state.owners)) play('capture')
    if (b.mode === 'conquest' && a.state.phase !== 'duel' && b.state.phase === 'duel') play('attack')
    const meA = a.players.find((x) => x.student === state.me)
    const meB = b.players.find((x) => x.student === state.me)
    if (meA && meB && meB.hearts < meA.hearts) play(meB.alive ? 'heartLost' : 'eliminated')
    if (b.mode === 'boss' && (b.state.hp as number) < (a.state.hp as number)) play('bossHit')
  }, [state, play])
}
