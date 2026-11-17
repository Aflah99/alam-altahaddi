import { describe, expect, it } from 'vitest'
import { RELIGION_VALUES_G8 as bank } from './banks/religionValuesG8'
import { allLessons, buildBank, findLesson } from './normalize'
import { validateBank, validateQuestion } from './validate'
import type { AuthoringLessonFile, Question } from './types'

const lessons = allLessons(bank)
const questions = lessons.flatMap((l) => l.questions)

describe('question bank: structure', () => {
  it('has three units of seven lessons each, in booklet order', () => {
    expect(bank.units.map((u) => u.number)).toEqual([1, 2, 3])
    for (const u of bank.units) expect(u.lessons.map((l) => l.number)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('lesson page ranges are increasing and inside the 93-page PDF', () => {
    let last = 0
    for (const l of lessons) {
      expect(l.pages[0]).toBeGreaterThan(last)
      expect(l.pages[1]).toBeLessThanOrEqual(bank.source.pdfPages)
      last = l.pages[1]
    }
  })

  it('every lesson has playable questions', () => {
    for (const l of lessons) expect(l.questions.length, l.id).toBeGreaterThan(0)
  })

  it('publishes a substantial number of questions', () => {
    expect(questions.length).toBeGreaterThan(400)
  })

  it('maps questions to the right lesson', () => {
    const l = findLesson(bank, 'u1-l6')!
    expect(l.title).toBe('غزوة الأحزاب')
    expect(l.questions.every((q) => q.lessonId === 'u1-l6' && q.unitId === 'u1')).toBe(true)
  })
})

describe('question bank: validation pipeline', () => {
  const issues = validateBank(bank)
  it('has no validation issues', () => {
    expect(issues.map((i) => `${i.questionId} [${i.rule}] ${i.message}`)).toEqual([])
  })

  it('every question has exactly four options and one correct answer', () => {
    for (const q of questions) {
      expect(q.options).toHaveLength(4)
      expect(q.options.filter((o) => o.id === q.correctOptionId)).toHaveLength(1)
    }
  })

  it('ids are unique and stable', () => {
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length)
    expect(questions[0].id).toMatch(/^rv8\.u1\.l1\./)
  })

  it('page references point inside each lesson', () => {
    for (const l of lessons) for (const q of l.questions) {
      expect(q.sourcePdfPage).toBeGreaterThanOrEqual(l.pages[0])
      expect(q.sourcePdfPage).toBeLessThanOrEqual(l.pages[1])
    }
  })

  it('every lesson records its coverage (excluded items have reasons)', () => {
    for (const l of lessons) {
      expect(l.sourceQuestionCount).toBeGreaterThan(0)
      for (const e of l.excluded) {
        expect(e.reason.length).toBeGreaterThan(2)
        expect(e.detail.length).toBeGreaterThan(5)
      }
    }
  })
})

describe('validator catches bad questions', () => {
  const good: Question = {
    id: 'x.1', subjectId: 's', unitId: 'u1', lessonId: 'u1-l1', sourceQuestionNumber: '1', sourcePdfPage: 4,
    question: 'ما معنى أن القرآن نزل منجمًا؟',
    options: [
      { id: 'a', text: 'نزل مفرقًا' }, { id: 'b', text: 'نزل جملة واحدة' },
      { id: 'c', text: 'نزل في ليلة واحدة' }, { id: 'd', text: 'نزل بسبب سؤال' },
    ],
    correctOptionId: 'a', hint: 'نزوله استمر سنوات.', explanation: 'نزل القرآن منجمًا أي مفرقًا.', difficulty: 1, reviewStatus: 'approved',
  }
  const rules = (q: Question) => validateQuestion(q, [4, 8]).map((i) => i.rule)

  it('accepts a good question', () => expect(rules(good)).toEqual([]))
  it('rejects three options', () => expect(rules({ ...good, options: good.options.slice(0, 3) })).toContain('four-options'))
  it('rejects duplicate options', () =>
    expect(rules({ ...good, options: [...good.options.slice(0, 3), { id: 'd', text: 'نَزَلَ مُفَرَّقًا' }] })).toContain('distinct-options'))
  it('rejects a hint that gives the answer away', () => expect(rules({ ...good, hint: 'الجواب: نزل مفرقا' })).toContain('hint-reveals'))
  it('rejects an explanation unrelated to the answer', () => expect(rules({ ...good, explanation: 'سؤال عن الصيام.' })).toContain('explanation-match'))
  it('rejects a page outside the lesson', () => expect(rules({ ...good, sourcePdfPage: 50 })).toContain('page-ref'))
  it('rejects broken extraction characters', () => expect(rules({ ...good, question: 'ما معنى ﻻ نزل منجمًا؟' })).toContain('arabic-text'))
  it('rejects a missing correct option', () => expect(rules({ ...good, correctOptionId: 'd', options: good.options.slice(0, 3).concat({ id: 'c', text: 'x y z' }) })).toContain('one-correct'))
})

describe('import pipeline', () => {
  const file: AuthoringLessonFile = {
    unit: 1, lesson: 1, title: 'اختبار', pages: [4, 8], sourceQuestions: 2, excluded: [],
    questions: [
      { id: '1', page: 4, q: 'سؤال أول للاختبار؟', options: ['صحيح', 'خطأ ١', 'خطأ ٢', 'خطأ ٣'], hint: 'تلميح', explain: 'الشرح صحيح', difficulty: 1 },
      { id: '2', page: 5, q: 'سؤال مرفوض للاختبار؟', options: ['أ', 'ب', 'ج', 'د'], hint: 'ت', explain: 'ش', difficulty: 2, status: 'flagged' },
    ],
  }
  const built = buildBank({ id: 'b', subjectId: 's', prefix: 't', title: 't', pdfPages: 10 }, [file])
  it('first authoring option becomes the correct answer', () => {
    const q = built.units[0].lessons[0].questions[0]
    expect(q.options.find((o) => o.id === q.correctOptionId)?.text).toBe('صحيح')
  })
  it('flagged questions are not published', () => {
    expect(built.units[0].lessons[0].questions.map((q) => q.sourceQuestionNumber)).toEqual(['1'])
  })
})
