import type { Lesson, OptionId, Question } from '../questions/types'

/**
 * Quiz mission engine — pure functions, no React.
 *
 * Per question:
 *  - The student may request a hint before the first attempt.
 *  - First wrong answer → encouraging feedback + hint, ONE more attempt
 *    (the wrong option is disabled; the correct answer is NOT revealed).
 *  - Correct answer, or a second wrong answer → the question is final:
 *    the correct answer and the explanation are shown, nothing can change.
 *  - `next` only advances from the expected index, so rapid taps can't skip questions.
 */

export const MISSION_SIZE = 10
export const MAX_ATTEMPTS = 2

export type QuestionPhase = 'answering' | 'retry' | 'final'
/** first = correct on the 1st try without a hint; assisted = correct after a hint or on the 2nd try. */
export type QuestionResult = 'first' | 'assisted' | 'missed'

export interface QuestionState {
  questionId: string
  /** Display order of the options (shuffled). */
  order: OptionId[]
  selected: OptionId | null
  /** Confirmed answers, in order. */
  attempts: OptionId[]
  hintUsed: boolean
  phase: QuestionPhase
  result: QuestionResult | null
}

export interface MissionState {
  missionId: string
  lessonId: string
  missionNumber: number
  questions: QuestionState[]
  index: number
  finished: boolean
}

export type Feedback = 'none' | 'correct' | 'try-again' | 'revealed'

/* ---------- missions ---------- */

/** Splits a lesson into balanced missions of at most MISSION_SIZE questions, in booklet order, without repeats. */
export function planMissions(lesson: Lesson, size = MISSION_SIZE): Question[][] {
  const qs = lesson.questions
  if (qs.length === 0) return []
  const count = Math.ceil(qs.length / size)
  const base = Math.floor(qs.length / count)
  const extra = qs.length % count
  const missions: Question[][] = []
  let start = 0
  for (let i = 0; i < count; i++) {
    const n = base + (i < extra ? 1 : 0)
    missions.push(qs.slice(start, start + n))
    start += n
  }
  return missions
}

export function missionId(lessonId: string, missionNumber: number): string {
  return `${lessonId}#${missionNumber}`
}

/** Small deterministic PRNG so a mission's option order can be reproduced from its seed. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function createMission(lesson: Lesson, missionNumber: number, seed: number): MissionState {
  const missions = planMissions(lesson)
  const qs = missions[missionNumber - 1] ?? []
  const rand = seededRandom(seed)
  return {
    missionId: missionId(lesson.id, missionNumber),
    lessonId: lesson.id,
    missionNumber,
    index: 0,
    finished: qs.length === 0,
    questions: qs.map((q) => ({
      questionId: q.id,
      order: shuffle(
        q.options.map((o) => o.id),
        rand,
      ),
      selected: null,
      attempts: [],
      hintUsed: false,
      phase: 'answering',
      result: null,
    })),
  }
}

/* ---------- per-question actions (return new state; never mutate) ---------- */

function updateCurrent(m: MissionState, fn: (q: QuestionState) => QuestionState): MissionState {
  if (m.finished) return m
  const questions = m.questions.slice()
  questions[m.index] = fn(questions[m.index])
  return { ...m, questions }
}

export function current(m: MissionState): QuestionState | undefined {
  return m.questions[m.index]
}

/** Choose an option (not yet confirmed). Ignored once final, or for an option already tried. */
export function selectOption(m: MissionState, option: OptionId): MissionState {
  const q = current(m)
  if (!q || q.phase === 'final' || q.attempts.includes(option)) return m
  return updateCurrent(m, (s) => ({ ...s, selected: option }))
}

/** Reveal the hint before answering. Only possible before the first attempt. */
export function requestHint(m: MissionState): MissionState {
  const q = current(m)
  if (!q || q.phase !== 'answering' || q.hintUsed) return m
  return updateCurrent(m, (s) => ({ ...s, hintUsed: true }))
}

/** Confirm the selected option. Returns the new state and the feedback to show. */
export function confirmAnswer(m: MissionState, question: Question): { state: MissionState; feedback: Feedback } {
  const q = current(m)
  if (!q || q.questionId !== question.id) return { state: m, feedback: 'none' }
  return confirmWithVerdict(m, q.selected === question.correctOptionId)
}

/**
 * Same transition as confirmAnswer, but with correctness decided elsewhere (by the
 * server in cloud mode, where the client never holds the answer key).
 */
export function confirmWithVerdict(m: MissionState, correct: boolean): { state: MissionState; feedback: Feedback } {
  const q = current(m)
  if (!q || q.phase === 'final' || q.selected === null) {
    return { state: m, feedback: 'none' }
  }
  const choice = q.selected
  const attempts = [...q.attempts, choice]

  if (correct) {
    const result: QuestionResult = attempts.length === 1 && !q.hintUsed ? 'first' : 'assisted'
    return {
      state: updateCurrent(m, (s) => ({ ...s, attempts, selected: choice, phase: 'final', result })),
      feedback: 'correct',
    }
  }
  if (attempts.length < MAX_ATTEMPTS) {
    // Wrong on the first try: show the hint, allow one more attempt, keep the answer hidden.
    return {
      state: updateCurrent(m, (s) => ({ ...s, attempts, selected: null, hintUsed: true, phase: 'retry' })),
      feedback: 'try-again',
    }
  }
  return {
    state: updateCurrent(m, (s) => ({ ...s, attempts, selected: choice, phase: 'final', result: 'missed' })),
    feedback: 'revealed',
  }
}

/** Move on from a final question. `fromIndex` guards against double taps advancing twice. */
export function nextQuestion(m: MissionState, fromIndex: number): MissionState {
  const q = current(m)
  if (m.finished || m.index !== fromIndex || !q || q.phase !== 'final') return m
  if (m.index + 1 >= m.questions.length) return { ...m, finished: true }
  return { ...m, index: m.index + 1 }
}

/* ---------- results ---------- */

export interface MissionSummary {
  total: number
  firstTry: number
  assisted: number
  missed: number
  hintsUsed: number
  /** Correct on the first attempt without a hint, 0–100. */
  firstTryAccuracy: number
  /** Questions to revise (assisted or missed), in mission order. */
  review: string[]
}

export function summarize(m: MissionState): MissionSummary {
  const total = m.questions.length
  const count = (r: QuestionResult) => m.questions.filter((q) => q.result === r).length
  const firstTry = count('first')
  return {
    total,
    firstTry,
    assisted: count('assisted'),
    missed: count('missed'),
    hintsUsed: m.questions.filter((q) => q.hintUsed).length,
    firstTryAccuracy: total ? Math.round((firstTry / total) * 100) : 0,
    review: m.questions.filter((q) => q.result !== 'first').map((q) => q.questionId),
  }
}
