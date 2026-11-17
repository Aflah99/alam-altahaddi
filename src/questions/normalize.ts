import type { AuthoringLessonFile, Difficulty, Lesson, OptionId, Question, QuestionBank, Unit } from './types'

const OPTION_IDS: readonly OptionId[] = ['a', 'b', 'c', 'd']
const UNIT_TITLES = ['الوحدة الأولى', 'الوحدة الثانية', 'الوحدة الثالثة', 'الوحدة الرابعة', 'الوحدة الخامسة']

/** Converts authoring files (options[0] = correct) into a typed, ordered question bank. */
export function buildBank(
  meta: { id: string; subjectId: string; prefix: string; title: string; pdfPages: number },
  files: readonly AuthoringLessonFile[],
): QuestionBank {
  const sorted = [...files].sort((a, b) => a.unit - b.unit || a.lesson - b.lesson)
  const units = new Map<number, Lesson[]>()

  for (const f of sorted) {
    const unitId = `u${f.unit}`
    const lessonId = `u${f.unit}-l${f.lesson}`
    const questions: Question[] = f.questions.map((q) => ({
      id: `${meta.prefix}.u${f.unit}.l${f.lesson}.${q.id}`,
      subjectId: meta.subjectId,
      unitId,
      lessonId,
      sourceQuestionNumber: q.id,
      sourcePdfPage: q.page,
      question: q.q,
      options: q.options.map((text, i) => ({ id: OPTION_IDS[i], text })),
      correctOptionId: 'a',
      hint: q.hint,
      explanation: q.explain,
      difficulty: (Math.min(3, Math.max(1, Math.round(q.difficulty))) as Difficulty),
      reviewStatus: q.status ?? 'approved',
    }))
    const lesson: Lesson = {
      id: lessonId,
      unitId,
      number: f.lesson,
      title: f.title,
      pages: f.pages,
      sourceQuestionCount: f.sourceQuestions,
      excluded: f.excluded,
      // Only approved questions are playable.
      questions: questions.filter((q) => q.reviewStatus === 'approved'),
    }
    units.set(f.unit, [...(units.get(f.unit) ?? []), lesson])
  }

  const unitList: Unit[] = [...units.entries()].map(([n, lessons]) => ({
    id: `u${n}`,
    number: n,
    title: UNIT_TITLES[n - 1] ?? `الوحدة ${n}`,
    lessons,
  }))

  return {
    id: meta.id,
    subjectId: meta.subjectId,
    source: { title: meta.title, pdfPages: meta.pdfPages, pageNumbering: 'pdf' },
    units: unitList,
  }
}

export function allLessons(bank: QuestionBank): Lesson[] {
  return bank.units.flatMap((u) => u.lessons)
}

export function findLesson(bank: QuestionBank, lessonId: string): Lesson | undefined {
  return allLessons(bank).find((l) => l.id === lessonId)
}

export function findQuestion(bank: QuestionBank, questionId: string): Question | undefined {
  for (const l of allLessons(bank)) {
    const q = l.questions.find((x) => x.id === questionId)
    if (q) return q
  }
  return undefined
}
