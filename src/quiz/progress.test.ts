import { describe, expect, it } from 'vitest'
import type { Lesson } from '../questions/types'
import { confirmAnswer, createMission, current, nextQuestion, selectOption, summarize, type MissionState } from './engine'
import { emptyProgress, loadProgress, questionsToRevise, recordMission, saveProgress, type KeyValueStore } from './progress'

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

const lesson: Lesson = {
  id: 'u1-l1', unitId: 'u1', number: 1, title: 'درس', pages: [4, 8], sourceQuestionCount: 2, excluded: [],
  questions: [1, 2].map((i) => ({
    id: `t.q${i}`, subjectId: 's', unitId: 'u1', lessonId: 'u1-l1', sourceQuestionNumber: String(i), sourcePdfPage: 4,
    question: `سؤال ${i}؟`, options: [{ id: 'a', text: 'صح' }, { id: 'b', text: 'خطأ' }, { id: 'c', text: 'خطأ ٢' }, { id: 'd', text: 'خطأ ٣' }],
    correctOptionId: 'a', hint: 'ت', explanation: 'ش صح', difficulty: 1, reviewStatus: 'approved',
  })),
}

function playMission(answers: ('a' | 'b' | 'c')[][]): MissionState {
  let m = createMission(lesson, 1, 7)
  answers.forEach((choices, i) => {
    for (const c of choices) {
      m = confirmAnswer(selectOption(m, c), lesson.questions.find((q) => q.id === current(m)!.questionId)!).state
    }
    m = nextQuestion(m, i)
  })
  return m
}

describe('local progress', () => {
  it('records a finished mission and the questions to revise', () => {
    const m = playMission([['a'], ['b', 'c']])
    const p = recordMission(emptyProgress('player-1'), m, summarize(m))
    expect(p.missions['u1-l1#1']).toMatchObject({ timesCompleted: 1, total: 2, lastFirstTry: 1, bestFirstTry: 1 })
    expect(p.lastLessonId).toBe('u1-l1')
    expect(questionsToRevise(p)).toEqual(['t.q2'])
  })

  it('does not record an unfinished mission', () => {
    const m = createMission(lesson, 1, 1)
    const p = emptyProgress('player-1')
    expect(recordMission(p, m, summarize(m))).toBe(p)
  })

  it('a retry keeps the best score and clears fixed questions from revision', () => {
    const first = playMission([['b', 'c'], ['b', 'c']])
    let p = recordMission(emptyProgress('p'), first, summarize(first))
    const retry = playMission([['a'], ['a']])
    p = recordMission(p, retry, summarize(retry))
    expect(p.missions['u1-l1#1']).toMatchObject({ timesCompleted: 2, bestFirstTry: 2, lastFirstTry: 2 })
    expect(questionsToRevise(p)).toEqual([])
  })

  it('persists across reloads, per player', () => {
    const store = memoryStore()
    const m = playMission([['a'], ['a']])
    saveProgress(recordMission(emptyProgress('alice'), m, summarize(m)), store)
    expect(loadProgress('alice', store).missions['u1-l1#1'].timesCompleted).toBe(1)
    expect(loadProgress('bob', store).missions).toEqual({})
  })

  it('survives corrupted storage', () => {
    const store = memoryStore()
    store.data.set('alam-altahaddi:progress:v1:alice', '{not json')
    expect(loadProgress('alice', store)).toEqual(emptyProgress('alice'))
  })
})
