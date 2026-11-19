import { useEffect, useState } from 'react'
import type { SfxName } from '../audio/sfx'
import type { CharacterDef } from '../characters/roster'
import { Sky } from '../components/Sky'
import type { Lesson, OptionId, Question } from '../questions/types'
import type { QuizDriver } from '../quiz/driver'
import { QuizArena } from '../quiz/QuizScreen'
import * as api from './api'
import { arabicError } from './client'
import type { CatalogSubject, QuizSession } from './types'

interface CloudQuizScreenProps {
  subject: CatalogSubject
  lessonId: string
  missionNumber: number
  character: CharacterDef
  outfit: readonly string[]
  reducedMotion: boolean
  play: (name: SfxName) => void
  onLessons: () => void
  onWorld: () => void
  onShop: () => void
  /** Called after the server records a finished mission (refreshes XP and coins). */
  onFinished: () => void
  onResults?: () => void
}

/** ساحة التحدّي backed by the server: one validated session per attempt. */
export function CloudQuizScreen(props: CloudQuizScreenProps) {
  const { subject, lessonId, missionNumber } = props
  const found = findMission(subject, lessonId, missionNumber)
  const [attempt, setAttempt] = useState(0)
  const [session, setSession] = useState<QuizSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const missionUuid = found?.mission?.id

  useEffect(() => {
    if (!missionUuid) return
    let alive = true
    api
      .startQuizSession(missionUuid)
      .then((s) => alive && (setSession(s), setError(null)))
      .catch((e) => alive && setError(arabicError(e)))
    return () => {
      alive = false
    }
  }, [missionUuid, attempt])

  const lesson = buildLesson(subject, found, session)



  const onFinished = props.onFinished
  const driver: QuizDriver | null = session
    ? {
        submit: (qid, option) => api.submitAnswer(session.session_id, qid, option),
        submitWritten: (qid, text) => api.submitWritten(session.session_id, qid, text),
        hint: (qid) => api.requestHint(session.session_id, qid),
        complete: async () => {
          const s = await api.completeQuizSession(session.session_id)
          onFinished()
          return s
        },
      }
    : null

  if (!found?.mission || error) {
    return (
      <div className="quiz quiz--message">
        <Sky />
        <div className="quiz__message">
          <p>{error ?? 'هذه المهمة غير متاحة.'}</p>
          {error && (
            <button type="button" className="pixel-button" onClick={() => setAttempt((n) => n + 1)}>
              إعادة المحاولة
            </button>
          )}
          <button type="button" className="pixel-button" onClick={props.onLessons}>
            اختيار درس آخر
          </button>
        </div>
      </div>
    )
  }
  if (!lesson || !driver) {
    return (
      <div className="quiz quiz--message">
        <Sky />
        <p className="quiz__message">جارٍ تحميل المهمة…</p>
      </div>
    )
  }
  return (
    <QuizArena
      key={session!.session_id}
      lesson={lesson}
      driver={driver}
      missionNumber={missionNumber}
      missionCount={found.lesson.missions.length}
      character={props.character}
      outfit={props.outfit}
      reducedMotion={props.reducedMotion}
      play={props.play}
      onRecord={() => {}}
      onShop={props.onShop}
      onRestart={() => {
        setSession(null)
        setAttempt((n) => n + 1)
      }}
      onLessons={props.onLessons}
      onWorld={props.onWorld}
      onResults={props.onResults}
    />
  )
}

function findMission(subject: CatalogSubject, lessonId: string, missionNumber: number) {
  for (const u of subject.units)
    for (const l of u.lessons) if (l.id === lessonId) return { unit: u, lesson: l, mission: l.missions.find((m) => m.number === missionNumber) }
  return null
}

function buildLesson(subject: CatalogSubject, found: ReturnType<typeof findMission>, session: QuizSession | null): Lesson | null {
  if (!found || !session) return null
    const questions: Question[] = session.questions.map((q) => ({
      id: q.id,
      subjectId: subject.id,
      unitId: found.unit.id,
      lessonId: found.lesson.id,
      sourceQuestionNumber: '',
      sourcePdfPage: q.source_page ?? 0,
      sourceLabel: q.source_label,
      question: q.text,
      type: q.type ?? 'mcq',
      options: q.options.map((o) => ({ id: o.id as OptionId, text: o.text })),
      // Unknown until the server reveals them after the student answers.
      correctOptionId: '' as OptionId,
      hint: '',
      explanation: '',
      difficulty: 2,
      reviewStatus: 'approved',
    }))
    return { id: found.lesson.id, unitId: found.unit.id, number: found.lesson.number, title: found.lesson.title, pages: [found.lesson.page_start ?? 0, found.lesson.page_end ?? 0], sourceQuestionCount: questions.length, excluded: [], questions }
}
