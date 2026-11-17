import { useEffect } from 'react'
import { CornerButton } from '../components/CornerButton'
import { PixelSprite } from '../components/PixelSprite'
import { Sky } from '../components/Sky'
import { PlayArrow } from '../components/sprites'
import { PORTAL } from '../lobby/lobbySprites'
import type { ChapterConfig, SubjectConfig } from './config/subjects'
import './ChapterSelectScreen.css'

interface ChapterSelectScreenProps {
  subject: SubjectConfig
  onBackToWorld: () => void
  onBackToMap: () => void
  /** Wired up in Task 05, when chapters exist. */
  onOpenChapter?: (chapter: ChapterConfig) => void
}

/**
 * Chapter selection behind a subject portal. Until the revision booklet is
 * imported (Task 05) the subject has no chapters, so this shows an honest
 * placeholder instead of invented lessons.
 */
export function ChapterSelectScreen({ subject, onBackToWorld, onBackToMap, onOpenChapter }: ChapterSelectScreenProps) {
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
    <div className="chapters">
      <Sky />
      <div className="chapters__ui">
        <header className="chapters__header">
          <CornerButton icon={<PlayArrow className="icon-back" />} label="العالم" onClick={onBackToWorld} />
        </header>
        <section className="chapters__panel">
          <PixelSprite rows={PORTAL.rows} palette={PORTAL.palette} className="chapters__icon" />
          <h1 className="chapters__title">فصول {subject.title}</h1>

          {subject.chapters.length > 0 ? (
            <ul className="chapters__list">
              {subject.chapters.map((c) => (
                <li key={c.id}>
                  <button type="button" className="pause-menu__item" onClick={() => onOpenChapter?.(c)}>
                    {c.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="chapters__empty">
              <p>لا توجد فصول متاحة بعد.</p>
              <p className="overlay__status">ستُستورد الدروس ومهمات الأسئلة من كتيّب المراجعة في المهمة القادمة.</p>
            </div>
          )}

          <div className="chapters__actions">
            <button type="button" className="pixel-button" onClick={onBackToWorld}>
              العودة إلى العالم
            </button>
            <button type="button" className="pause-menu__item pause-menu__item--quiet" onClick={onBackToMap}>
              العودة إلى الخريطة
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
