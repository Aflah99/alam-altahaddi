import { useEffect, useState, type CSSProperties } from 'react'
import { CharacterSprite } from '../characters/CharacterSprite'
import type { CharacterDef } from '../characters/roster'
import { CornerButton } from '../components/CornerButton'
import { PixelSprite } from '../components/PixelSprite'
import { pixelRects } from '../components/pixelRects'
import { Sky } from '../components/Sky'
import { PlayArrow } from '../components/sprites'
import { PORTAL, PORTAL_SWIRL, TREE } from '../lobby/lobbySprites'
import type { SubjectView } from './config/subjects'
import { LOCK } from './worldSprites'
import './AdventureMapScreen.css'

interface AdventureMapScreenProps {
  character: CharacterDef
  /** Equipped cosmetic ids. */
  outfit?: readonly string[]
  /** Published subjects (cloud) or the bundled subject (guest). */
  subjects: readonly SubjectView[]
  /** Arabic message when the cloud catalogue could not be loaded. */
  error?: string | null
  loading?: boolean
  onRetry?: () => void
  onEnter: (subject: string) => void
  /** Opens اكتشف المواد. */
  onDiscover?: () => void
  onBack: () => void
}

/**
 * World selection. Each configured subject gets a portal on the island; the
 * locked islands in the sky are scenery only (no names, not interactive).
 */
export function AdventureMapScreen({ character, outfit, subjects, error, loading, onRetry, onEnter, onDiscover, onBack }: AdventureMapScreenProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const subject = subjects.find((s) => s.id === selected) ?? subjects[0]
  // Official subjects keep the portals; community courses are reached from the list below and are labelled.
  const official = subjects.filter((s) => !s.community)
  const portalSubjects = official.length > 0 ? official : subjects

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  return (
    <div className="amap">
      <Sky />
      <div className="amap__ui">
        <header className="amap__header">
          <CornerButton icon={<PlayArrow className="icon-back" />} label="رجوع" onClick={onBack} />
          <h1 className="amap__title">خريطة المغامرة</h1>
        </header>

        <div className="amap__body">
          <div className="amap__scene">
            <div className="amap__locked amap__locked--a" aria-hidden="true">
              <PixelSprite rows={LOCK.rows} palette={LOCK.palette} className="amap__lock" />
            </div>
            <div className="amap__locked amap__locked--b" aria-hidden="true">
              <PixelSprite rows={LOCK.rows} palette={LOCK.palette} className="amap__lock" />
            </div>

            <div className="amap__island" data-count={Math.min(subjects.length, 3)}>
              <PixelSprite rows={TREE.rows} palette={TREE.palette} className="amap__tree" />
              <div className="amap__path" aria-hidden="true" />
              {portalSubjects.slice(0, 3).map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  className="amap__portal"
                  style={{ '--i': i } as CSSProperties}
                  data-theme={s.theme}
                  aria-pressed={s.id === subject?.id}
                  onClick={() => setSelected(s.id)}
                  onDoubleClick={() => onEnter(s.id)}
                >
                  <span className="amap__portal-label">{s.title}</span>
                  <span className="amap__portal-glow" aria-hidden="true" />
                  <PixelSprite rows={PORTAL.rows} palette={PORTAL.palette} className="amap__portal-art">
                    <g className="portal-swirl">{pixelRects(PORTAL_SWIRL.rows, PORTAL_SWIRL.palette)}</g>
                  </PixelSprite>
                </button>
              ))}
              <CharacterSprite character={character} outfit={outfit} className="amap__hero" />
            </div>
          </div>

          <section className="amap__panel" aria-live="polite">
            {subject ? (
              <>
                {subjects.length > 1 && (
                  <div className="amap__chips" role="group" aria-label="المواد">
                    {subjects.map((s) => (
                      <button key={s.id} type="button" className="amap__chip" aria-pressed={s.id === subject.id} onClick={() => setSelected(s.id)}>
                        {s.title}
                        {s.community ? ' · مجتمعية' : ''}
                      </button>
                    ))}
                  </div>
                )}
                <h2 className="amap__subject">{subject.title}</h2>
                {subject.community ? (
                  <p className="amap__note" role="note">مادة مجتمعية · أنشأها {subject.creator ?? 'ولي أمر'} · غير معتمدة رسميًا</p>
                ) : (
                  <p className="amap__note">مادة أساسية</p>
                )}
                <p className="amap__summary">{subject.summary}</p>
                <button type="button" className="pixel-button amap__enter" onClick={() => onEnter(subject.id)}>
                  ادخل العالم
                </button>
                {onDiscover && (
                  <button type="button" className="pixel-button amap__enter" onClick={onDiscover}>
                    اكتشف المزيد من المواد
                  </button>
                )}
                <p className="amap__note">مناطق أخرى مغلقة الآن، وستُفتح عند إضافة موادها.</p>
              </>
            ) : error ? (
              <>
                <p className="amap__summary">{error}</p>
                {onRetry && (
                  <button type="button" className="pixel-button amap__enter" onClick={onRetry}>
                    إعادة المحاولة
                  </button>
                )}
              </>
            ) : (
              <p className="amap__summary">{loading ? 'جارٍ تحميل المواد…' : 'لا توجد مواد منشورة بعد.'}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
