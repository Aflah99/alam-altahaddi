import { useEffect, useRef } from 'react'
import type { Question } from '../questions/types'
import type { MissionState } from './engine'
import { ar } from './format'

interface MistakeReviewProps {
  mission: MissionState
  byId: Map<string, Question>
  onBack: () => void
}

/** مراجعة الأخطاء — every assisted or missed question with the student's answers and the explanation. */
export function MistakeReview({ mission, byId, onBack }: MistakeReviewProps) {
  const items = mission.questions.filter((q) => q.result !== 'first')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])

  return (
    <section className="review" aria-labelledby="review-title">
      <h2 id="review-title" ref={heading} tabIndex={-1} className="results__title">
        مراجعة الأخطاء
      </h2>
      {items.length === 0 && <p className="review__empty">لم تحتج إلى أي مساعدة في هذه المهمة، فلا توجد أخطاء لمراجعتها.</p>}
      <ol className="review__list">
        {items.map((s) => {
          const q = byId.get(s.questionId)
          if (!q) return null
          const text = (id: string) => q.options.find((o) => o.id === id)?.text ?? ''
          const wrong = s.attempts.filter((a) => a !== q.correctOptionId)
          return (
            <li key={s.questionId} className="review__item">
              <p className="review__q">{q.question}</p>
              {wrong.map((a, i) => (
                <p key={a} className="review__line review__line--wrong">
                  <strong>{wrong.length > 1 ? `إجابتك ${ar(i + 1)}: ` : 'إجابتك: '}</strong>
                  {text(a)}
                </p>
              ))}
              {s.hintUsed && wrong.length === 0 && <p className="review__line">استخدمت التلميح قبل الإجابة.</p>}
              <p className="review__line review__line--right">
                <strong>الإجابة الصحيحة: </strong>
                {text(q.correctOptionId)}
              </p>
              <p className="review__line">
                <strong>شرح الإجابة: </strong>
                {q.explanation}
              </p>
              <p className="review__source">المصدر: كتيّب ديني قيمي، صفحة {ar(q.sourcePdfPage)}</p>
            </li>
          )
        })}
      </ol>
      <button type="button" className="pixel-button" onClick={onBack}>
        العودة إلى النتائج
      </button>
    </section>
  )
}
