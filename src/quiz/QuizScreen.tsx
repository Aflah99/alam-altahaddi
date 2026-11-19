import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SfxName } from '../audio/sfx'
import { CharacterSprite } from '../characters/CharacterSprite'
import type { CharacterDef } from '../characters/roster'
import { Ground } from '../components/Ground'
import { Overlay } from '../components/Overlay'
import { PixelSprite } from '../components/PixelSprite'
import { Sky } from '../components/Sky'
import { findLesson } from '../questions/normalize'
import type { Lesson, OptionId, Question } from '../questions/types'
import type { SubjectConfig } from '../world/config/subjects'
import { PENNANT } from '../world/worldSprites'
import { arabicError } from '../cloud/client'
import type { AnswerResult } from '../cloud/types'
import { rewardFromServer, type QuizDriver } from './driver'
import {
  confirmAnswer,
  confirmWithVerdict,
  createMission,
  current,
  nextQuestion,
  planMissions,
  requestHint,
  selectOption,
  summarize,
  type Feedback,
  type MissionState,
  type MissionSummary,
} from './engine'
import { OPTION_LETTERS, ar, sourceLine } from './format'
import { MissionResults } from './MissionResults'
import type { MissionReward } from '../economy/wallet'
import { MistakeReview } from './MistakeReview'
import { useQuestionBank } from './useQuestionBank'
import './QuizScreen.css'

interface QuizScreenProps {
  subject: SubjectConfig
  lessonId: string
  missionNumber: number
  character: CharacterDef
  /** Equipped cosmetic ids. */
  outfit?: readonly string[]
  reducedMotion: boolean
  play: (name: SfxName) => void
  onRecord: (mission: MissionState, summary: MissionSummary) => void
  /** Applies the finished mission's rewards (idempotent) and reports what was earned. */
  onReward?: (mission: MissionState, summary: MissionSummary) => MissionReward
  /** Times this mission was completed before this visit (Task 05 progress). */
  previousCompletions?: number
  onShop?: () => void
  onLessons: () => void
  onWorld: () => void
  /** The results screen appeared (switches to victory music). */
  onResults?: () => void
}

type View = 'quiz' | 'results' | 'review'

/** ساحة التحدّي — one mission of up to ten questions from a lesson. */
export function QuizScreen(props: QuizScreenProps) {
  const { bank, error } = useQuestionBank(props.subject.bankId ?? '')
  const lesson = bank ? findLesson(bank, props.lessonId) : undefined
  const missionCount = lesson ? planMissions(lesson).length : 0

  if (error || (bank && (!lesson || props.missionNumber > missionCount))) {
    return (
      <div className="quiz quiz--message">
        <Sky />
        <div className="quiz__message">
          <p>{error ? 'تعذّر تحميل الأسئلة.' : 'هذه المهمة غير متاحة.'}</p>
          <button type="button" className="pixel-button" onClick={props.onLessons}>
            اختيار درس آخر
          </button>
        </div>
      </div>
    )
  }
  if (!lesson) {
    return (
      <div className="quiz quiz--message">
        <Sky />
        <p className="quiz__message">جارٍ تحميل المهمة…</p>
      </div>
    )
  }
  return <QuizArena key={`${lesson.id}#${props.missionNumber}`} {...props} lesson={lesson} missionCount={missionCount} />
}

export function QuizArena({
  lesson,
  driver,
  onRestart,
  missionNumber,
  missionCount,
  character,
  outfit,
  reducedMotion,
  play,
  onRecord,
  onReward,
  previousCompletions = 0,
  onShop,
  onLessons,
  onWorld,
  onResults,
}: Omit<QuizScreenProps, 'subject' | 'lessonId'> & { lesson: Lesson; missionCount: number; driver?: QuizDriver; onRestart?: () => void }) {
  const [reward, setReward] = useState<MissionReward | null>(null)
  const [legacy, setLegacy] = useState(false)
  // Cloud: `lesson` holds exactly this session's questions, so it is "mission 1" of itself.
  const [mission, setMission] = useState<MissionState>(() => createMission(lesson, driver ? 1 : missionNumber, Date.now()))
  const [revealed, setRevealed] = useState<Record<string, Partial<Question>>>({})
  const [busy, setBusy] = useState(false)
  const [netError, setNetError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback>('none')
  const [view, setView] = useState<View>('quiz')
  const [summary, setSummary] = useState<MissionSummary | null>(null)
  const [confirmExit, setConfirmExit] = useState(false)
  const [reaction, setReaction] = useState<'none' | 'happy' | 'oops'>('none')
  const reactionTimer = useRef<number | undefined>(undefined)
  const nextRef = useRef<HTMLButtonElement>(null)
  const streak = useRef(0)
  const [written, setWritten] = useState('')
  const [unsure, setUnsure] = useState(false)

  const byId = useMemo(
    () => new Map(lesson.questions.map((q) => [q.id, revealed[q.id] ? { ...q, ...revealed[q.id] } : q])),
    [lesson, revealed],
  )
  const reveal = (id: string, r: AnswerResult) =>
    setRevealed((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        ...(r.correct_option ? { correctOptionId: r.correct_option } : {}),
        ...(r.correct_answer ? { correctAnswer: r.correct_answer } : {}),
        ...(r.explanation !== null ? { explanation: r.explanation } : {}),
        ...(r.hint ? { hint: r.hint } : {}),
      },
    }))
  const state = current(mission)
  const question: Question | undefined = state ? byId.get(state.questionId) : undefined
  const isLast = mission.index === mission.questions.length - 1
  const title = `${lesson.title} — المهمة ${ar(missionNumber)}`

  const react = useCallback(
    (r: 'happy' | 'oops') => {
      if (reducedMotion) return
      window.clearTimeout(reactionTimer.current)
      setReaction(r)
      reactionTimer.current = window.setTimeout(() => setReaction('none'), r === 'happy' ? 1000 : 600)
    },
    [reducedMotion],
  )
  useEffect(() => () => window.clearTimeout(reactionTimer.current), [])

  const choose = (id: OptionId) => {
    if (view !== 'quiz' || confirmExit) return
    setMission((m) => selectOption(m, id))
    play('move')
  }

  const confirm = async () => {
    if (!question || view !== 'quiz' || confirmExit || busy) return
    let r: { state: MissionState; feedback: Feedback }
    if (driver) {
      const isWritten = question.type === 'written'
      const choice = isWritten ? written.trim() : state?.selected
      if (!choice) return
      if (isWritten && state?.attempts.some((a) => a.trim() === choice)) {
        setNetError('جرّبت هذه الإجابة من قبل؛ اكتب إجابة مختلفة.')
        return
      }
      setBusy(true)
      setNetError(null)
      try {
        if (isWritten) play('submitWritten')
        const res = isWritten ? await driver.submitWritten(question.id, choice) : await driver.submit(question.id, choice)
        if (res.feedback === 'unsure') {
          setUnsure(true)
          play('unsure')
          return
        }
        setUnsure(false)
        reveal(question.id, res)
        if (res.reward && !res.reward.already_rewarded && res.reward.coins > 0) window.setTimeout(() => play('coin'), 260)
        r = confirmWithVerdict(isWritten ? selectOption(mission, choice) : mission, res.feedback === 'correct')
        if (isWritten && r.feedback !== 'correct') setWritten('')
      } catch (e) {
        setNetError(arabicError(e))
        return
      } finally {
        setBusy(false)
      }
    } else {
      r = confirmAnswer(mission, question)
    }
    if (r.feedback === 'none') return
    setMission(r.state)
    setFeedback(r.feedback)
    if (r.feedback === 'correct') {
      streak.current += 1
      play(streak.current >= 3 && streak.current % 3 === 0 ? 'streak' : 'correct')
      react('happy')
    } else {
      streak.current = 0
      play('wrong')
      react('oops')
    }
  }

  const advance = async () => {
    if (view !== 'quiz' || confirmExit || busy) return
    const m = nextQuestion(mission, mission.index)
    if (m === mission) return
    if (m.finished && driver) {
      setBusy(true)
      setNetError(null)
      try {
        const s = await driver.complete()
        setMission(m)
        setFeedback('none')
        setSummary({
          total: s.total,
          firstTry: s.first_try,
          assisted: s.assisted,
          missed: s.missed,
          hintsUsed: s.hints_used,
          firstTryAccuracy: s.first_try_accuracy,
          review: m.questions.filter((q) => q.result !== 'first').map((q) => q.questionId),
        })
        setReward(rewardFromServer(s))
        setView('results')
        onResults?.()
        play(s.first_try_accuracy >= 70 ? 'missionComplete' : 'missionFail')
      } catch (e) {
        setNetError(arabicError(e))
      } finally {
        setBusy(false)
      }
      return
    }
    setMission(m)
    setFeedback('none')
    setWritten('')
    setUnsure(false)
    if (m.finished) {
      const s = summarize(m)
      setSummary(s)
      onRecord(m, s)
      const r = onReward?.(m, s) ?? null
      setReward(r)
      // Completed before rewards existed: nothing on record for this mission yet.
      setLegacy(!!r && previousCompletions > 0 && r.alreadyRewarded === 0 && !r.bonusEarlier)
      setView('results')
      play('confirm')
    }
  }

  const hint = async () => {
    if (view !== 'quiz' || busy || !state) return
    if (driver) {
      setBusy(true)
      setNetError(null)
      try {
        const h = await driver.hint(state.questionId)
        setRevealed((prev) => ({ ...prev, [state.questionId]: { ...prev[state.questionId], hint: h } }))
        play('hint')
      } catch (e) {
        setNetError(arabicError(e))
        return
      } finally {
        setBusy(false)
      }
    }
    setMission((m) => requestHint(m))
  }

  const retry = () => {
    if (onRestart) {
      onRestart()
      return
    }
    setMission(createMission(lesson, missionNumber, Date.now()))
    setFeedback('none')
    setSummary(null)
    setReward(null)
    setLegacy(false)
    setView('quiz')
  }

  // Focus "next" when the explanation appears, so keyboard users can continue,
  // and bring feedback (hint / explanation) into view on small screens.
  const final = state?.phase === 'final'
  const feedbackRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (final) nextRef.current?.focus({ preventScroll: true })
  }, [final, mission.index])
  useEffect(() => {
    if (feedback !== 'none' || state?.hintUsed) {
      feedbackRef.current?.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
    }
  }, [feedback, state?.hintUsed, reducedMotion])
  // New question: start at the top of the card.
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [mission.index, view])

  // Keyboard: 1–4 choose, Enter confirm / next, Escape asks before leaving.
  useEffect(() => {
    if (view !== 'quiz' || confirmExit) return
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'Escape') {
        e.preventDefault()
        setConfirmExit(true)
        return
      }
      const onButton = e.target instanceof HTMLElement && !!e.target.closest('button')
      const inField = e.target instanceof HTMLElement && !!e.target.closest('input, textarea')
      const n = Math.max('1234'.indexOf(e.key), '١٢٣٤'.indexOf(e.key))
      if (n >= 0 && state && question?.type !== 'written' && !inField) {
        e.preventDefault()
        choose(state.order[n])
      } else if (e.key === 'Enter' && !onButton && !inField) {
        e.preventDefault()
        if (final) void advance()
        else void confirm()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className={`quiz quiz--${view}`}>
      <Sky />
      <div className="quiz__layout">
        <header className="quiz__header">
          <button type="button" className="corner-button quiz__exit" onClick={() => (view === 'quiz' ? setConfirmExit(true) : onLessons())}>
            <span aria-hidden="true">✕</span>
            <span>{view === 'quiz' ? 'خروج' : 'الدروس'}</span>
          </button>
          <div className="quiz__heading">
            <span className="quiz__arena-name">ساحة التحدّي</span>
            <h1 className="quiz__title">{title}</h1>
          </div>
        </header>

        <div className="quiz__progress" aria-hidden={view !== 'quiz'}>
          <span className="visually-hidden">
            السؤال {ar(mission.index + 1)} من {ar(mission.questions.length)}
          </span>
          {mission.questions.map((q, i) => (
            <span
              key={q.questionId}
              className={`quiz__seg quiz__seg--${q.result ?? (i === mission.index && view === 'quiz' ? 'now' : 'todo')}`}
            />
          ))}
        </div>

        <aside className="quiz__arena" aria-hidden="true">
          <PixelSprite rows={PENNANT.rows} palette={PENNANT.palette} className="quiz__flag quiz__flag--a" />
          <PixelSprite rows={PENNANT.rows} palette={PENNANT.palette} className="quiz__flag quiz__flag--b" />
          <div className={`quiz__hero quiz__hero--${reaction}`}>
            <CharacterSprite character={character} outfit={outfit} mood={reaction === 'happy' || (view === 'results' && (summary?.firstTryAccuracy ?? 0) >= 70) ? 'happy' : 'neutral'} decorative />
          </div>
          <Ground className="quiz__ground" />
        </aside>

        <main ref={mainRef} className="quiz__main">
          {view === 'quiz' && state && question && (
            <section className="qcard" aria-labelledby="qcard-question">
              <p className="qcard__number">
                السؤال {ar(mission.index + 1)} من {ar(mission.questions.length)}
              </p>
              <h2 id="qcard-question" className="qcard__question">
                {question.question}
              </h2>

              {question.type === 'written' ? (
                <form
                  className="qwrite"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!final) void confirm()
                  }}
                >
                  <label className="qwrite__label" htmlFor="qwrite-input">
                    اكتب إجابتك (كلمة أو عبارة قصيرة)
                  </label>
                  <input
                    id="qwrite-input"
                    className="qwrite__input"
                    type="text"
                    dir="rtl"
                    lang="ar"
                    value={written}
                    maxLength={200}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={final || busy}
                    onChange={(e) => {
                      setWritten(e.target.value)
                      setUnsure(false)
                    }}
                  />
                  {state.attempts.length > 0 && !final && (
                    <p className="qwrite__tried">جرّبت: {state.attempts.join('، ')}</p>
                  )}
                </form>
              ) : (
              <ul className="qcard__options">
                {state.order.map((id, i) => {
                  const option = question.options.find((o) => o.id === id)!
                  const tried = state.attempts.includes(id)
                  const isCorrect = id === question.correctOptionId
                  let status = ''
                  if (final && isCorrect) status = 'correct'
                  else if (tried) status = 'wrong'
                  else if (state.selected === id) status = 'selected'
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        className={`qopt${status ? ` qopt--${status}` : ''}`}
                        onClick={() => choose(id)}
                        disabled={final || tried || busy}
                        aria-pressed={state.selected === id && !final}
                      >
                        <span className="qopt__letter" aria-hidden="true">
                          {OPTION_LETTERS[i]}
                        </span>
                        <span className="qopt__text">{option.text}</span>
                        {status === 'correct' && <span className="qopt__mark">✓<span className="visually-hidden"> الإجابة الصحيحة</span></span>}
                        {status === 'wrong' && <span className="qopt__mark">✗<span className="visually-hidden"> إجابة غير صحيحة</span></span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
              )}

              <div ref={feedbackRef} className="qcard__feedback" role="status" aria-live="polite">
                {!final && unsure && (
                  <p className="qfb qfb--unsure">لم نتمكّن من التأكد من إجابتك. تحقّق من كتابة الكلمات وحاول مرة أخرى — هذه المحاولة لا تُحتسب.</p>
                )}
                {!final && feedback === 'try-again' && (
                  <p className="qfb qfb--retry">ليست هذه الإجابة الصحيحة — لا بأس، حاول مرة أخرى!</p>
                )}
                {!final && state.hintUsed && (
                  <p className="qfb qfb--hint">
                    <strong>تلميح: </strong>
                    {question.hint}
                  </p>
                )}
                {final && (
                  <div className="qfb qfb--final">
                    {state.result === 'missed' ? (
                      <p className="qfb__title qfb__title--missed">
                        <strong>الإجابة الصحيحة: </strong>
                        {question.type === 'written' ? question.correctAnswer : question.options.find((o) => o.id === question.correctOptionId)?.text}
                      </p>
                    ) : (
                      <p className="qfb__title qfb__title--ok">إجابة صحيحة! أحسنت.</p>
                    )}
                    <p className="qfb__explain">
                      <strong>شرح الإجابة: </strong>
                      {question.explanation}
                    </p>
                    <p className="qfb__source">{sourceLine(question)}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {view === 'results' && summary && (
            <MissionResults
              summary={summary}
              lessonTitle={lesson.title}
              missionNumber={missionNumber}
              missionCount={missionCount}
              reviewQuestions={summary.review.map((id) => byId.get(id)!).filter(Boolean)}
              reducedMotion={reducedMotion}
              reward={reward}
              legacy={legacy}
              onShop={onShop}
              onReview={() => setView('review')}
              onRetry={retry}
              onLessons={onLessons}
              onWorld={onWorld}
            />
          )}

          {view === 'review' && summary && (
            <MistakeReview mission={mission} byId={byId} onBack={() => setView('results')} />
          )}
        </main>

        {view === 'quiz' && state && (
          <footer className="quiz__actions">
            {netError && (
              <p className="quiz__neterror" role="alert">
                {netError}
              </p>
            )}
            {final ? (
              <button ref={nextRef} type="button" className="pixel-button quiz__primary" onClick={() => void advance()} disabled={busy}>
                {isLast ? 'إنهاء المهمة' : 'السؤال التالي'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="quiz__hint-btn"
                  onClick={() => void hint()}
                  disabled={state.hintUsed || state.phase !== 'answering' || busy}
                >
                  تلميح
                </button>
                <button type="button" className="pixel-button quiz__primary" onClick={() => void confirm()} disabled={(question?.type === 'written' ? !written.trim() : !state.selected) || busy}>
                  {state.phase === 'retry' ? 'حاول مرة أخرى' : 'تأكيد الإجابة'}
                </button>
              </>
            )}
          </footer>
        )}
      </div>

      {confirmExit && (
        <Overlay
          title="ترك المهمة؟"
          backLabel="متابعة المهمة"
          onClose={() => setConfirmExit(false)}
          reducedMotion={reducedMotion}
        >
          <p>إذا تركت المهمة الآن فلن تُحفظ إجاباتك في هذه المهمة.</p>
          <button type="button" className="pause-menu__item quiz__leave" onClick={onLessons}>
            ترك المهمة والعودة إلى الدروس
          </button>
        </Overlay>
      )}
    </div>
  )
}
