import { jaccard, normalizeArabic, suspiciousChars, wordSequence, words } from './arabic'
import type { Question, QuestionBank } from './types'

export interface ValidationIssue {
  questionId: string
  rule: string
  message: string
}

const MIN_QUESTION_LEN = 8

/**
 * Structural + content checks for a question bank. Returns every problem found;
 * an empty list means the bank is publishable.
 */
export function validateBank(bank: QuestionBank): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const seenIds = new Set<string>()
  const all: Question[] = []

  for (const unit of bank.units) {
    for (const lesson of unit.lessons) {
      const [from, to] = lesson.pages
      if (!(from >= 1 && to <= bank.source.pdfPages && from <= to)) {
        issues.push({ questionId: lesson.id, rule: 'lesson-pages', message: `invalid page range ${from}-${to}` })
      }
      if (lesson.questions.length === 0) {
        issues.push({ questionId: lesson.id, rule: 'lesson-empty', message: 'lesson has no approved questions' })
      }
      for (const q of lesson.questions) {
        all.push(q)
        issues.push(...validateQuestion(q, [from, to]))
        if (seenIds.has(q.id)) issues.push({ questionId: q.id, rule: 'unique-id', message: 'duplicate id' })
        seenIds.add(q.id)
        if (q.lessonId !== lesson.id || q.unitId !== unit.id) {
          issues.push({ questionId: q.id, rule: 'lesson-mapping', message: 'question is filed under the wrong lesson/unit' })
        }
      }
    }
  }

  // Near-duplicate questions (same question AND same correct answer).
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]
      const b = all[j]
      const sameQ = normalizeArabic(a.question) === normalizeArabic(b.question)
      const qSim = jaccard(words(a.question), words(b.question))
      const ansSim = jaccard(words(correctText(a)), words(correctText(b)))
      if (sameQ || (qSim >= 0.85 && ansSim >= 0.85)) {
        issues.push({ questionId: b.id, rule: 'near-duplicate', message: `near-duplicate of ${a.id}` })
      }
    }
  }
  return issues
}

export function correctText(q: Question): string {
  return q.options.find((o) => o.id === q.correctOptionId)?.text ?? ''
}

export function validateQuestion(q: Question, lessonPages: readonly [number, number]): ValidationIssue[] {
  const out: ValidationIssue[] = []
  const add = (rule: string, message: string) => out.push({ questionId: q.id, rule, message })

  // 1. question text
  if (normalizeArabic(q.question).length < MIN_QUESTION_LEN) add('question-text', 'question text missing or too short')

  // 2. exactly four non-empty options
  if (q.options.length !== 4) add('four-options', `expected 4 options, got ${q.options.length}`)
  if (q.options.some((o) => !o.text.trim())) add('four-options', 'empty option')
  const ids = new Set(q.options.map((o) => o.id))
  if (ids.size !== q.options.length) add('option-ids', 'duplicate option ids')

  // 3. exactly one correct option, present among the options
  if (!q.options.some((o) => o.id === q.correctOptionId)) add('one-correct', 'correct option id not among options')

  // 4. options distinct in meaning (normalised text must differ, and not be near-identical)
  const norm = q.options.map((o) => normalizeArabic(o.text))
  if (new Set(norm).size !== norm.length) add('distinct-options', 'two options are identical')
  // Same significant words in the same order = same meaning (word order can change meaning, so swaps are allowed).
  const seq = q.options.map((o) => wordSequence(o.text))
  for (let i = 0; i < seq.length; i++) {
    for (let j = i + 1; j < seq.length; j++) {
      if (seq[i] && seq[i] === seq[j]) add('distinct-options', `options ${q.options[i].id}/${q.options[j].id} are nearly identical`)
    }
  }

  // 6. the hint must not reveal the answer
  const correct = normalizeArabic(correctText(q))
  const hint = normalizeArabic(q.hint)
  if (!hint) add('hint', 'missing hint')
  else if (correct.length >= 4 && hint.includes(correct)) add('hint-reveals', 'hint contains the full correct answer')

  // 7. the explanation must support the correct choice (shares its key words)
  const exp = words(q.explanation)
  const cw = words(correctText(q))
  if (!q.explanation.trim()) add('explanation', 'missing explanation')
  else if (cw.size > 0) {
    let shared = 0
    for (const w of cw) if (exp.has(w)) shared++
    if (shared === 0) add('explanation-match', 'explanation shares no key words with the correct answer')
  }

  // 8. page reference inside the lesson
  if (!(Number.isInteger(q.sourcePdfPage) && q.sourcePdfPage >= lessonPages[0] && q.sourcePdfPage <= lessonPages[1])) {
    add('page-ref', `page ${q.sourcePdfPage} outside lesson pages ${lessonPages[0]}-${lessonPages[1]}`)
  }

  // 10. text renders correctly (no broken extraction artefacts)
  for (const text of [q.question, q.hint, q.explanation, ...q.options.map((o) => o.text)]) {
    const bad = suspiciousChars(text)
    if (bad.length) add('arabic-text', `suspicious characters: ${bad.join(', ')}`)
    if (/[A-Za-z]{3,}/.test(text)) add('arabic-text', 'unexpected Latin text')
  }
  return out
}
