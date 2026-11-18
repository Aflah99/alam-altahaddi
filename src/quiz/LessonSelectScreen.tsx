import { useEffect, useState } from 'react'
import { CornerButton } from '../components/CornerButton'
import { PixelSprite } from '../components/PixelSprite'
import { Sky } from '../components/Sky'
import { PlayArrow } from '../components/sprites'
import { BOOK } from '../world/worldSprites'
import { ar, missionsLabel, questionsLabel } from './format'
import type { LessonView, UnitView } from './lessonTree'
import './LessonSelectScreen.css'

interface LessonSelectScreenProps {
  subjectTitle: string
  /** null while loading. */
  units: UnitView[] | null
  error: boolean
  lastLessonId: string | null
  /** One honest sentence about where the questions come from and where progress is saved. */
  sourceNote: string
  onRetry?: () => void
  onStartMission: (lessonId: string, mission: number) => void
  onBackToWorld: () => void
}

/** Units and lessons in order, each with its missions. Works for local and cloud content. */
export function LessonSelectScreen({ subjectTitle, units, error, lastLessonId, sourceNote, onRetry, onStartMission, onBackToWorld }: LessonSelectScreenProps) {
  const [open, setOpen] = useState<string | null>(lastLessonId)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onBackToWorld()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBackToWorld])

  return (
    <div className="lessons">
      <Sky />
      <div className="lessons__scroll">
        <header className="lessons__header">
          <CornerButton icon={<PlayArrow className="icon-back" />} label="العالم" onClick={onBackToWorld} />
          <h1 className="lessons__title">دروس {subjectTitle}</h1>
        </header>

        {!units && !error && <p className="lessons__status">جارٍ تحميل الدروس…</p>}
        {error && (
          <div className="lessons__status">
            <p>تعذّر تحميل الدروس. تحقّق من الاتصال ثم حاول مرة أخرى.</p>
            {onRetry && (
              <button type="button" className="pixel-button" onClick={onRetry}>
                إعادة المحاولة
              </button>
            )}
          </div>
        )}

        {units && !error && (
          <main className="lessons__body">
            <p className="lessons__source">{sourceNote}</p>
            {units.length === 0 && <p className="lessons__status">لا توجد دروس منشورة في هذه المادة بعد.</p>}
            {units.map((unit) => (
              <section key={unit.id} className="lessons__unit" aria-labelledby={`unit-${unit.id}`}>
                <h2 id={`unit-${unit.id}`} className="lessons__unit-title">
                  {unit.title}
                </h2>
                <ul className="lessons__list">
                  {unit.lessons.map((lesson) => (
                    <LessonCard
                      key={lesson.id}
                      lesson={lesson}
                      expanded={open === lesson.id}
                      isLast={lastLessonId === lesson.id}
                      onToggle={() => setOpen((o) => (o === lesson.id ? null : lesson.id))}
                      onStart={(n) => onStartMission(lesson.id, n)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </main>
        )}
      </div>
    </div>
  )
}

function LessonCard({
  lesson,
  expanded,
  isLast,
  onToggle,
  onStart,
}: {
  lesson: LessonView
  expanded: boolean
  isLast: boolean
  onToggle: () => void
  onStart: (mission: number) => void
}) {
  const missions = lesson.missions
  const done = missions.filter((m) => m.best).length
  const playable = missions.length > 0
  const panelId = `lesson-${lesson.id}`

  return (
    <li className={`lesson${expanded ? ' lesson--open' : ''}${done === missions.length && playable ? ' lesson--done' : ''}`}>
      <button
        type="button"
        className="lesson__head"
        onClick={onToggle}
        disabled={!playable}
        aria-expanded={playable ? expanded : undefined}
        aria-controls={playable ? panelId : undefined}
      >
        <PixelSprite rows={BOOK.rows} palette={BOOK.palette} className="lesson__icon" />
        <span className="lesson__text">
          <span className="lesson__name">
            الدرس {ar(lesson.number)}: {lesson.title}
          </span>
          <span className="lesson__meta">
            {playable ? `${questionsLabel(lesson.questionCount)}، ${missionsLabel(missions.length)}` : 'لا توجد أسئلة متاحة بعد'}
          </span>
        </span>
        {playable && (
          <span className="lesson__badge" aria-label={`أُنجز ${ar(done)} من ${ar(missions.length)}`}>
            {done === missions.length ? '✓' : `${ar(done)}/${ar(missions.length)}`}
          </span>
        )}
        {isLast && <span className="lesson__last">آخر درس</span>}
      </button>

      {expanded && playable && (
        <div id={panelId} className="lesson__missions">
          {missions.map((m) => (
            <button key={m.number} type="button" className="mission-btn" onClick={() => onStart(m.number)}>
              <span className="mission-btn__name">المهمة {ar(m.number)}</span>
              <span className="mission-btn__meta">{questionsLabel(m.size)}</span>
              <span className="mission-btn__state">{m.best ? `✓ أفضل نتيجة: ${m.best}` : 'ابدأ'}</span>
            </button>
          ))}
        </div>
      )}
    </li>
  )
}
