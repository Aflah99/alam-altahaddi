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
import {
  confirmAnswer,
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
import { OPTION_LETTERS, ar } from './format'
import { MissionResults } from './MissionResults'
import { MistakeReview } from './MistakeReview'
import { useQuestionBank } from './useQuestionBank'
import './QuizScreen.css'

interface QuizScreenProps {
  subject: SubjectConfig
  lessonId: string
  missionNumber: number
  character: CharacterDef
  reducedMotion: boolean
  play: (name: SfxName) => void
  onRecord: (mission: MissionState, summary: MissionSummary) => void
  onLessons: () => void
  onWorld: () => void
}

type View = 'quiz' | 'results' | 'review'

/** ساحة التحدّي — one mission of up to ten questions from a lesson. */
export function QuizScreen(props: QuizScreenProps) {
  const { bank, error } = useQuestionBank(props.subject.bankId)
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

function QuizArena({
  lesson,
  missionNumber,
  missionCount,
  character,
  reducedMotion,
  play,
  onRecord,
  onLessons,
  onWorld,
}: QuizScreenProps & { lesson: Lesson; missionCount: number }) {
  const [mission, setMission] = useState<MissionState>(() => createMission(lesson, missionNumber, Date.now()))
  const [feedback, setFeedback] = useState<Feedback>('none')
  const [view, setView] = useState<View>('quiz')
  const [summary, setSummary] = useState<MissionSummary | null>(null)
  const [confirmExit, setConfirmExit] = useState(false)
  const [reaction, setReaction] = useState<'none' | 'happy' | 'oops'>('none')
  const reactionTimer = useRef<number | undefined>(undefined)
  const nextRef = useRef<HTMLButtonElement>(null)

  const byId = useMemo(() => new Map(lesson.questions.map((q) => [q.id, q])), [lesson])
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

  const confirm = () => {
    if (!question || view !== 'quiz' || confirmExit) return
    const r = confirmAnswer(mission, question)
    if (r.feedback === 'none') return
    setMission(r.state)
    setFeedback(r.feedback)
    if (r.feedback === 'correct') {
      play('confirm')
      react('happy')
    } else {
      play('back')
      react('oops')
    }
  }

  const advance = () => {
    if (view !== 'quiz' || confirmExit) return
    const m = nextQuestion(mission, mission.index)
    if (m === mission) return
    setMission(m)
    setFeedback('none')
    if (m.finished) {
      const s = summarize(m)
      setSummary(s)
      onRecord(m, s)
      setView('results')
      play('confirm')
    }
  }

  const hint = () => {
    if (view !== 'quiz') return
    setMission((m) => requestHint(m))
  }

  const retry = () => {
    setMission(createMission(lesson, missionNumber, Date.now()))
    setFeedback('none')
    setSummary(null)
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
      const n = Math.max('1234'.indexOf(e.key), '١٢٣٤'.indexOf(e.key))
      if (n >= 0 && state) {
        e.preventDefault()
        choose(state.order[n])
      } else if (e.key === 'Enter' && !onButton) {
        e.preventDefault()
        if (final) advance()
        else confirm()
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
            <CharacterSprite character={character} mood={reaction === 'happy' || (view === 'results' && (summary?.firstTryAccuracy ?? 0) >= 70) ? 'happy' : 'neutral'} decorative />
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
                        disabled={final || tried}
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

              <div ref={feedbackRef} className="qcard__feedback" role="status" aria-live="polite">
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
                        {question.options.find((o) => o.id === question.correctOptionId)?.text}
                      </p>
                    ) : (
                      <p className="qfb__title qfb__title--ok">إجابة صحيحة! أحسنت.</p>
                    )}
                    <p className="qfb__explain">
                      <strong>شرح الإجابة: </strong>
                      {question.explanation}
                    </p>
                    <p className="qfb__source">المصدر: كتيّب ديني قيمي، صفحة {ar(question.sourcePdfPage)}</p>
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
            {final ? (
              <button ref={nextRef} type="button" className="pixel-button quiz__primary" onClick={advance}>
                {isLast ? 'إنهاء المهمة' : 'السؤال التالي'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="quiz__hint-btn"
                  onClick={hint}
                  disabled={state.hintUsed || state.phase !== 'answering'}
                >
                  تلميح
                </button>
                <button type="button" className="pixel-button quiz__primary" onClick={confirm} disabled={!state.selected}>
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
