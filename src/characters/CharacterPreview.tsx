import { useRef } from 'react'
import { PlayArrow } from '../components/sprites'
import { CharacterSprite, type CharacterMood } from './CharacterSprite'
import type { CharacterDef } from './roster'
import './CharacterPreview.css'

interface CharacterPreviewProps {
  character: CharacterDef
  index: number
  total: number
  /** Which way the last change went, for the slide-in animation. */
  direction: 'next' | 'prev' | null
  mood: CharacterMood
  onNext: () => void
  onPrev: () => void
  onCheer: () => void
}

const SWIPE_PX = 40

/**
 * Big animated preview on a floating grass island, with previous/next arrows,
 * position dots and swipe support. In RTL the "next" arrow is on the left.
 */
export function CharacterPreview({ character, index, total, direction, mood, onNext, onPrev, onCheer }: CharacterPreviewProps) {
  const start = useRef<{ x: number; y: number } | null>(null)

  return (
    <div
      className="preview"
      onPointerDown={(e) => (start.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={(e) => {
        const s = start.current
        start.current = null
        if (!s) return
        const dx = e.clientX - s.x
        if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(e.clientY - s.y)) return
        // RTL: dragging toward the right reveals the next character from the left.
        if (dx > 0) onNext()
        else onPrev()
      }}
      onPointerCancel={() => (start.current = null)}
    >
      <button type="button" className="preview__arrow preview__arrow--prev" onClick={onPrev} aria-label="الشخصية السابقة">
        <PlayArrow className="preview__arrow-icon" />
      </button>

      <div className="preview__stage">
        <button
          key={character.id}
          type="button"
          className={`preview__hero${direction ? ` preview__hero--from-${direction}` : ''}`}
          onClick={onCheer}
          aria-label={`${character.name} — اضغط ليحتفل`}
        >
          <CharacterSprite character={character} mood={mood} decorative />
        </button>
        <div className="preview__island" aria-hidden="true" />
      </div>

      <button type="button" className="preview__arrow preview__arrow--next" onClick={onNext} aria-label="الشخصية التالية">
        <PlayArrow className="preview__arrow-icon" />
      </button>

      <div className="preview__dots" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`preview__dot${i === index ? ' preview__dot--on' : ''}`} />
        ))}
      </div>
    </div>
  )
}
