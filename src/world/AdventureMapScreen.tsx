import { useEffect, useState } from 'react'
import { CharacterSprite } from '../characters/CharacterSprite'
import type { CharacterDef } from '../characters/roster'
import { CornerButton } from '../components/CornerButton'
import { PixelSprite } from '../components/PixelSprite'
import { pixelRects } from '../components/pixelRects'
import { Sky } from '../components/Sky'
import { PlayArrow } from '../components/sprites'
import { PORTAL, PORTAL_SWIRL, TREE } from '../lobby/lobbySprites'
import { SUBJECTS, type SubjectId } from './config/subjects'
import { LOCK } from './worldSprites'
import './AdventureMapScreen.css'

interface AdventureMapScreenProps {
  character: CharacterDef
  onEnter: (subject: SubjectId) => void
  onBack: () => void
}

/**
 * World selection. Each configured subject gets a portal on the island; the
 * locked islands in the sky are scenery only (no names, not interactive).
 */
export function AdventureMapScreen({ character, onEnter, onBack }: AdventureMapScreenProps) {
  const [selected, setSelected] = useState<SubjectId>(SUBJECTS[0].id)
  const subject = SUBJECTS.find((s) => s.id === selected) ?? SUBJECTS[0]

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

            <div className="amap__island">
              <PixelSprite rows={TREE.rows} palette={TREE.palette} className="amap__tree" />
              <div className="amap__path" aria-hidden="true" />
              {SUBJECTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="amap__portal"
                  aria-pressed={s.id === selected}
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
              <CharacterSprite character={character} className="amap__hero" />
            </div>
          </div>

          <section className="amap__panel" aria-live="polite">
            <h2 className="amap__subject">{subject.title}</h2>
            <p className="amap__summary">{subject.summary}</p>
            <button type="button" className="pixel-button amap__enter" onClick={() => onEnter(subject.id)}>
              ادخل العالم
            </button>
            <p className="amap__note">مناطق أخرى مغلقة الآن، وستُفتح عند إضافة موادها.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
