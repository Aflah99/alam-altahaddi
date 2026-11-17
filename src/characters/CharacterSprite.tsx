import { useMemo, type CSSProperties } from 'react'
import { pixelRects } from '../components/pixelRects'
import type { CharacterDef } from './roster'
import './CharacterSprite.css'

export type CharacterAnim =
  /** Breathing, plus a small hop every few seconds. */
  | 'idle'
  /** The start screen's livelier hop loop. */
  | 'hop'
  /** No body motion (blinking still happens). */
  | 'still'

export type CharacterMood = 'neutral' | 'happy'

interface CharacterSpriteProps {
  character: CharacterDef
  anim?: CharacterAnim
  /** 'happy' plays a short celebration: double hop, ^ ^ eyes and sparkles. */
  mood?: CharacterMood
  className?: string
  /** Hide from assistive tech when the surrounding UI already names the character. */
  decorative?: boolean
}

/**
 * Shared sprite renderer + animation set for every playable character.
 * Size it by setting `--cell` (the size of one sprite pixel) on it or a parent.
 */
export function CharacterSprite({
  character,
  anim = 'idle',
  mood = 'neutral',
  className = '',
  decorative = false,
}: CharacterSpriteProps) {
  const { rows, palette, eyes, eyeColor, name } = character
  const w = rows[0].length
  const h = rows.length
  const body = useMemo(() => pixelRects(rows, palette), [rows, palette])

  return (
    <div
      className={`char ${className}`}
      data-anim={anim}
      data-mood={mood}
      style={{ '--w': w, '--h': h } as CSSProperties}
    >
      <span className="char__shadow" aria-hidden="true" />
      <svg
        className="char__body"
        viewBox={`0 0 ${w} ${h}`}
        shapeRendering="crispEdges"
        role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : name}
        aria-hidden={decorative ? true : undefined}
        focusable="false"
      >
        {body}
        <g className="char__eyes">
          <g className="char__pupils">
            {eyes.map(([x, y]) => (
              <rect key={`${x}-${y}`} x={x} y={y} width={1} height={2} fill={eyeColor} />
            ))}
          </g>
        </g>
        <g className="char__joy">
          {eyes.map(([x, y]) => (
            <g key={`${x}-${y}`} fill={eyeColor}>
              <rect x={x - 1} y={y + 1} width={1} height={1} />
              <rect x={x} y={y} width={1} height={1} />
              <rect x={x + 1} y={y + 1} width={1} height={1} />
            </g>
          ))}
        </g>
      </svg>
      <svg className="char__sparkles" viewBox="0 0 24 24" shapeRendering="crispEdges" aria-hidden="true">
        <path className="char__spark" d="M2 5h1v1h1v1H3v1H2V7H1V6h1z" />
        <path className="char__spark" d="M20 2h1v1h1v1h-1v1h-1V4h-1V3h1z" />
        <path className="char__spark" d="M1 15h1v1h1v1H2v1H1v-1H0v-1h1z" />
        <path className="char__spark" d="M22 13h1v1h1v1h-1v1h-1v-1h-1v-1h1z" />
      </svg>
    </div>
  )
}
