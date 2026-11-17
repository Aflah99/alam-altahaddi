import { useEffect, useState } from 'react'
import { CornerButton } from '../components/CornerButton'
import { PixelSprite } from '../components/PixelSprite'
import { Sky } from '../components/Sky'
import { PlayArrow } from '../components/sprites'
import type { Lesson } from '../questions/types'
import type { SubjectConfig } from '../world/config/subjects'
import { BOOK } from '../world/worldSprites'
import { missionId, planMissions } from './engine'
import { ar, missionsLabel, questionsLabel } from './format'
import type { LearningProgress } from './progress'
import { useQuestionBank } from './useQuestionBank'
import './LessonSelectScreen.css'

interface LessonSelectScreenProps {
  subject: SubjectConfig
  progress: LearningProgress
  onStartMission: (lessonId: string, mission: number) => void
  onBackToWorld: () => void
}

/** «دروس ديني قيمي»: units and lessons in booklet order, each with its missions. */
export function LessonSelectScreen({ subject, progress, onStartMission, onBackToWorld }: LessonSelectScreenProps) {
  const { bank, error } = useQuestionBank(subject.bankId)
  const [open, setOpen] = useState<string | null>(progress.lastLessonId)

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
          <h1 className="lessons__title">دروس {subject.title}</h1>
        </header>

        {!bank && !error && <p className="lessons__status">جارٍ تحميل الدروس…</p>}
        {error && <p className="lessons__status">تعذّر تحميل الدروس. تحقّق من الاتصال ثم حاول مرة أخرى.</p>}

        {bank && (
          <main className="lessons__body">
            <p className="lessons__source">
              الأسئلة مأخوذة من كتيّب «زاد الطالب» للفصل الدراسي الأول. يُحفظ تقدّمك على هذا الجهاز فقط.
            </p>
            {bank.units.map((unit) => (
              <section key={unit.id} className="lessons__unit" aria-labelledby={`unit-${unit.id}`}>
                <h2 id={`unit-${unit.id}`} className="lessons__unit-title">
                  {unit.title}
                </h2>
                <ul className="lessons__list">
                  {unit.lessons.map((lesson) => (
                    <LessonCard
                      key={lesson.id}
                      lesson={lesson}
                      progress={progress}
                      expanded={open === lesson.id}
                      isLast={progress.lastLessonId === lesson.id}
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
  progress,
  expanded,
  isLast,
  onToggle,
  onStart,
}: {
  lesson: Lesson
  progress: LearningProgress
  expanded: boolean
  isLast: boolean
  onToggle: () => void
  onStart: (mission: number) => void
}) {
  const missions = planMissions(lesson)
  const done = missions.filter((_, i) => progress.missions[missionId(lesson.id, i + 1)]).length
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
            {playable
              ? `${questionsLabel(lesson.questions.length)}، ${missionsLabel(missions.length)}`
              : 'لا توجد أسئلة متاحة بعد'}
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
          {missions.map((qs, i) => {
            const n = i + 1
            const rec = progress.missions[missionId(lesson.id, n)]
            return (
              <button key={n} type="button" className="mission-btn" onClick={() => onStart(n)}>
                <span className="mission-btn__name">المهمة {ar(n)}</span>
                <span className="mission-btn__meta">{questionsLabel(qs.length)}</span>
                <span className="mission-btn__state">
                  {rec ? `✓ أفضل نتيجة: ${ar(rec.bestFirstTry)}/${ar(rec.total)}` : 'ابدأ'}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </li>
  )
}
