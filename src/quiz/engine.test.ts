import { describe, expect, it } from 'vitest'
import type { Lesson, OptionId, Question } from '../questions/types'
import {
  MISSION_SIZE,
  confirmAnswer,
  createMission,
  current,
  nextQuestion,
  planMissions,
  requestHint,
  selectOption,
  summarize,
  type MissionState,
} from './engine'

function makeQuestion(i: number): Question {
  return {
    id: `t.q${i}`, subjectId: 's', unitId: 'u1', lessonId: 'u1-l1', sourceQuestionNumber: String(i), sourcePdfPage: 4,
    question: `سؤال رقم ${i}؟`,
    options: [{ id: 'a', text: 'صحيح' }, { id: 'b', text: 'خطأ ١' }, { id: 'c', text: 'خطأ ٢' }, { id: 'd', text: 'خطأ ٣' }],
    correctOptionId: 'a', hint: 'تلميح', explanation: 'شرح صحيح', difficulty: 1, reviewStatus: 'approved',
  }
}
function makeLesson(n: number): Lesson {
  return { id: 'u1-l1', unitId: 'u1', number: 1, title: 'درس', pages: [4, 8], sourceQuestionCount: n, excluded: [],
    questions: Array.from({ length: n }, (_, i) => makeQuestion(i + 1)) }
}
const lesson = makeLesson(12)
const byId = new Map(lesson.questions.map((q) => [q.id, q]))
const q = (m: MissionState) => byId.get(current(m)!.questionId)!
const answer = (m: MissionState, opt: OptionId) => confirmAnswer(selectOption(m, opt), q(m))

describe('missions', () => {
  it('splits lessons into balanced, non-repeating missions of at most 10', () => {
    expect(planMissions(makeLesson(31)).map((x) => x.length)).toEqual([8, 8, 8, 7])
    expect(planMissions(makeLesson(10)).map((x) => x.length)).toEqual([10])
    expect(planMissions(makeLesson(7)).map((x) => x.length)).toEqual([7])
    const ids = planMissions(makeLesson(31)).flat().map((x) => x.id)
    expect(new Set(ids).size).toBe(31)
    for (const m of planMissions(makeLesson(55))) expect(m.length).toBeLessThanOrEqual(MISSION_SIZE)
  })

  it('handles an empty lesson without crashing', () => {
    expect(planMissions(makeLesson(0))).toEqual([])
    expect(createMission(makeLesson(0), 1, 1).finished).toBe(true)
  })

  it('shuffles options but keeps all four, and the seed makes it reproducible', () => {
    const a = createMission(lesson, 1, 42)
    const b = createMission(lesson, 1, 42)
    expect(a.questions[0].order).toEqual(b.questions[0].order)
    expect([...a.questions[0].order].sort()).toEqual(['a', 'b', 'c', 'd'])
    const firstPositions = new Set(Array.from({ length: 20 }, (_, s) => createMission(lesson, 1, s + 1).questions[0].order.indexOf('a')))
    expect(firstPositions.size).toBeGreaterThan(1) // the correct answer isn't always in the same place
  })
})

describe('answering', () => {
  it('correct on the first attempt → final, counted as first-try', () => {
    const { state, feedback } = answer(createMission(lesson, 1, 1), 'a')
    expect(feedback).toBe('correct')
    expect(current(state)!.phase).toBe('final')
    expect(current(state)!.result).toBe('first')
  })

  it('first mistake → try again with the hint, answer stays hidden', () => {
    const { state, feedback } = answer(createMission(lesson, 1, 1), 'b')
    expect(feedback).toBe('try-again')
    const s = current(state)!
    expect(s.phase).toBe('retry')
    expect(s.hintUsed).toBe(true)
    expect(s.result).toBeNull()
    expect(s.selected).toBeNull()
  })

  it('the wrong option cannot be chosen again on the retry', () => {
    const { state } = answer(createMission(lesson, 1, 1), 'b')
    expect(current(selectOption(state, 'b'))!.selected).toBeNull()
  })

  it('correct on the second attempt → assisted', () => {
    const first = answer(createMission(lesson, 1, 1), 'b').state
    const { state, feedback } = answer(first, 'a')
    expect(feedback).toBe('correct')
    expect(current(state)!.result).toBe('assisted')
  })

  it('second mistake → revealed, missed, no third attempt', () => {
    const first = answer(createMission(lesson, 1, 1), 'b').state
    const { state, feedback } = answer(first, 'c')
    expect(feedback).toBe('revealed')
    expect(current(state)!.result).toBe('missed')
    // locked: further selections/confirmations do nothing
    const again = answer(state, 'a')
    expect(again.feedback).toBe('none')
    expect(current(again.state)!.attempts).toEqual(['b', 'c'])
  })

  it('a hint requested before answering is tracked and makes a correct answer assisted', () => {
    let m = requestHint(createMission(lesson, 1, 1))
    expect(current(m)!.hintUsed).toBe(true)
    m = answer(m, 'a').state
    expect(current(m)!.result).toBe('assisted')
  })

  it('cannot request a hint after the first attempt', () => {
    const m = answer(createMission(lesson, 1, 1), 'a').state
    expect(requestHint(m)).toBe(m)
  })

  it('confirming without a selection does nothing', () => {
    const m = createMission(lesson, 1, 1)
    expect(confirmAnswer(m, q(m)).feedback).toBe('none')
  })

  it('repeated confirmation of a final answer is not counted again', () => {
    const m = answer(createMission(lesson, 1, 1), 'a').state
    const again = confirmAnswer(m, q(m))
    expect(again.state).toBe(m)
    expect(current(again.state)!.attempts).toHaveLength(1)
  })
})

describe('advancing', () => {
  it('cannot advance before the question is final', () => {
    const m = createMission(lesson, 1, 1)
    expect(nextQuestion(m, 0)).toBe(m)
  })

  it('rapid double taps advance only one question', () => {
    const m = answer(createMission(lesson, 1, 1), 'a').state
    const once = nextQuestion(m, 0)
    const twice = nextQuestion(once, 0) // stale index from the second tap
    expect(once.index).toBe(1)
    expect(twice.index).toBe(1)
  })

  it('finishes after the last question', () => {
    let m = createMission(makeLesson(2), 1, 1)
    const local = new Map(makeLesson(2).questions.map((x) => [x.id, x]))
    for (let i = 0; i < 2; i++) {
      m = confirmAnswer(selectOption(m, 'a'), local.get(current(m)!.questionId)!).state
      m = nextQuestion(m, i)
    }
    expect(m.finished).toBe(true)
  })
})

describe('results', () => {
  it('computes first-try accuracy and the review list', () => {
    let m = createMission(makeLesson(4), 1, 1)
    const local = new Map(makeLesson(4).questions.map((x) => [x.id, x]))
    const play = (choices: OptionId[], hint = false) => {
      if (hint) m = requestHint(m)
      for (const c of choices) {
        const r = confirmAnswer(selectOption(m, c), local.get(current(m)!.questionId)!)
        m = r.state
        if (current(m)!.phase === 'final') break
      }
      m = nextQuestion(m, m.index)
    }
    play(['a']) // first
    play(['b', 'a']) // assisted
    play(['b', 'c']) // missed
    play(['a'], true) // assisted (hint)
    const s = summarize(m)
    expect(m.finished).toBe(true)
    expect(s).toMatchObject({ total: 4, firstTry: 1, assisted: 2, missed: 1, hintsUsed: 3, firstTryAccuracy: 25 })
    expect(s.review).toEqual(['t.q2', 't.q3', 't.q4'])
  })
})
