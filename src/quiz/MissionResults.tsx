import type { CSSProperties } from 'react'
import type { Question } from '../questions/types'
import type { MissionSummary } from './engine'
import { ar } from './format'

interface MissionResultsProps {
  summary: MissionSummary
  lessonTitle: string
  missionNumber: number
  missionCount: number
  reviewQuestions: Question[]
  reducedMotion: boolean
  onReview: () => void
  onRetry: () => void
  onLessons: () => void
  onWorld: () => void
}

function verdict(accuracy: number): string {
  if (accuracy >= 90) return 'أداء رائع! أنت بطل هذه المهمة.'
  if (accuracy >= 70) return 'أحسنت! أداء جيد جدًّا.'
  if (accuracy >= 40) return 'بداية طيبة، راجع الأسئلة التي احتجت فيها إلى مساعدة.'
  return 'لا بأس، المراجعة طريق التفوّق. جرّب المهمة مرة أخرى.'
}

/** نتائج المهمة — scores, what to revise, and where to go next. */
export function MissionResults({
  summary,
  lessonTitle,
  missionNumber,
  missionCount,
  reviewQuestions,
  reducedMotion,
  onReview,
  onRetry,
  onLessons,
  onWorld,
}: MissionResultsProps) {
  const celebrate = summary.firstTryAccuracy >= 70 && !reducedMotion
  return (
    <section className="results" aria-labelledby="results-title">
      {celebrate && (
        <div className="results__confetti" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      )}
      <h2 id="results-title" className="results__title">
        نتائج المهمة
      </h2>
      <p className="results__sub">
        {lessonTitle} — المهمة {ar(missionNumber)} من {ar(missionCount)}
      </p>
      <p className="results__verdict">{verdict(summary.firstTryAccuracy)}</p>

      <div className="results__score" aria-label={`دقة المحاولة الأولى ${ar(summary.firstTryAccuracy)}٪`}>
        <span className="results__pct">{ar(summary.firstTryAccuracy)}٪</span>
        <span className="results__pct-label">دقة المحاولة الأولى</span>
      </div>

      <dl className="results__stats">
        <div>
          <dt>إجمالي الأسئلة</dt>
          <dd>{ar(summary.total)}</dd>
        </div>
        <div className="results__stat--first">
          <dt>صحيحة من المحاولة الأولى</dt>
          <dd>{ar(summary.firstTry)}</dd>
        </div>
        <div className="results__stat--assisted">
          <dt>صحيحة بعد تلميح أو محاولة ثانية</dt>
          <dd>{ar(summary.assisted)}</dd>
        </div>
        <div className="results__stat--missed">
          <dt>لم تُجب عنها إجابة صحيحة</dt>
          <dd>{ar(summary.missed)}</dd>
        </div>
      </dl>

      <div className="results__revise">
        <h3>مفاهيم تحتاج إلى مراجعة</h3>
        {reviewQuestions.length === 0 ? (
          <p>لا توجد أسئلة تحتاج إلى مراجعة في هذه المهمة. أحسنت!</p>
        ) : (
          <ul>
            {reviewQuestions.map((q) => (
              <li key={q.id}>{q.question}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="results__actions">
        <button type="button" className="pixel-button" onClick={onReview}>
          مراجعة الأخطاء
        </button>
        <button type="button" className="pause-menu__item" onClick={onRetry}>
          إعادة التحدّي
        </button>
        <button type="button" className="pause-menu__item" onClick={onLessons}>
          اختيار درس آخر
        </button>
        <button type="button" className="pause-menu__item" onClick={onWorld}>
          العودة إلى العالم
        </button>
      </div>
      <p className="results__note">تُحفظ نتائجك على هذا الجهاز فقط.</p>
    </section>
  )
}
