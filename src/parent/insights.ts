import { ar } from '../quiz/format'

/** One lesson's results from parent_child_report. */
export interface LessonStat {
  id: string
  subject: string
  unit: number
  unit_title: string
  number: number
  title: string
  answered: number
  first_try: number
  assisted: number
  missed: number
}

export interface Insight {
  kind: 'revise' | 'strength'
  lessonId: string
  lesson: string
  subject: string
  /** Plain-language reason built only from recorded answers. */
  reason: string
  /** Higher = more urgent. */
  score: number
}

const MIN_ANSWERS = 3

/**
 * Deterministic revision suggestions from recorded attempts. They describe results,
 * never the student's abilities, and always show the lesson and the reason.
 */
export function lessonInsights(lessons: readonly LessonStat[]): Insight[] {
  const out: Insight[] = []
  for (const l of lessons) {
    if (l.answered < MIN_ANSWERS) continue
    const firstRate = l.first_try / l.answered
    if (l.missed >= 2 || firstRate < 0.6) {
      const parts: string[] = []
      if (l.missed) parts.push(`${ar(l.missed)} من ${ar(l.answered)} إجابات لم تكن صحيحة بعد المحاولتين`)
      if (l.assisted) parts.push(`${ar(l.assisted)} احتاجت إلى تلميح أو محاولة ثانية`)
      out.push({
        kind: 'revise',
        lessonId: l.id,
        lesson: l.title,
        subject: l.subject,
        reason: `يُنصح بمراجعة درس «${l.title}» (${l.subject})؛ ${parts.join('، و')}.`,
        score: l.missed * 2 + l.assisted + (1 - firstRate) * 5,
      })
    } else if (l.answered >= 5 && firstRate >= 0.9) {
      out.push({
        kind: 'strength',
        lessonId: l.id,
        lesson: l.title,
        subject: l.subject,
        reason: `نتائج قوية في درس «${l.title}»: ${ar(l.first_try)} من ${ar(l.answered)} صحيحة من المحاولة الأولى.`,
        score: firstRate,
      })
    }
  }
  return out.sort((a, b) => (a.kind === b.kind ? b.score - a.score : a.kind === 'revise' ? -1 : 1))
}

export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)
