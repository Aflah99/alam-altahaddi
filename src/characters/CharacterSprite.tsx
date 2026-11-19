import { useId, useMemo, type CSSProperties } from 'react'
import { pixelRects } from '../components/pixelRects'
import { composeLook, topTier, type ItemLayer } from '../cosmetics/look'
import type { Cell } from './cosmetics'
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
  /** Equipped cosmetic item ids. Items that do not fit this character are not drawn. */
  outfit?: readonly string[]
}

const NO_OUTFIT: readonly string[] = []

function cellRects(cells: readonly Cell[], prefix: string, cls?: string) {
  return cells.map((c, i) => <rect key={`${prefix}${i}`} x={c.x} y={c.y} width={1} height={1} fill={c.c} className={cls} />)
}

function ItemGroup({ layer, glow }: { layer: ItemLayer; glow: string }) {
  if (!layer.cells.length && !layer.trim.length) return null
  return (
    <g data-item={layer.id} data-tier={layer.tier} filter={layer.tier >= 5 ? `url(#${glow})` : undefined}>
      {cellRects(layer.cells, 'c')}
      {cellRects(layer.trim, 't', layer.tier >= 6 ? 'char__mythic' : undefined)}
    </g>
  )
}

/**
 * Shared sprite renderer + animation set for every playable character (creatures and
 * human avatars). `outfit` holds equipped items as "id@tier" keys (plain ids = tier 1).
 * Size it by setting `--cell` (the size of one sprite pixel) on it or a parent.
 */
export function CharacterSprite({
  character,
  anim = 'idle',
  mood = 'neutral',
  className = '',
  decorative = false,
  outfit = NO_OUTFIT,
}: CharacterSpriteProps) {
  const { rows, palette, eyes, eyeColor, name, eyeSize = [1, 2], glint } = character
  const [ew, eh] = eyeSize
  const w = rows[0].length
  const h = rows.length
  const outfitKey = outfit.join('|')
  const glowId = `glow${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const look = useMemo(() => composeLook(character, outfitKey ? outfitKey.split('|') : []), [character, outfitKey])
  const aura = useMemo(() => topTier(outfitKey ? outfitKey.split('|') : []), [outfitKey])
  const body = useMemo(() => {
    const hidden = new Set(look.hideRows)
    const pal = Object.keys(look.palette).length ? { ...palette, ...look.palette } : palette
    return pixelRects(hidden.size ? rows.map((r, y) => (hidden.has(y) ? '.'.repeat(r.length) : r)) : rows, pal)
  }, [rows, palette, look])

  return (
    <div
      className={`char ${className}`}
      data-anim={anim}
      data-mood={mood}
      data-aura={aura >= 5 ? aura : undefined}
      style={{ '--w': w, '--h': h, '--extra': look.extraRight } as CSSProperties}
      data-outfit={outfitKey || undefined}
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
        {aura >= 5 && (
          <defs>
            <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="0.6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        )}
        {look.behind.map((l) => (
          <ItemGroup key={`b${l.id}`} layer={l} glow={glowId} />
        ))}
        {body}
        <g className="char__eyes">
          <g className="char__pupils">
            {eyes.map(([x, y]) => (
              <rect key={`${x}-${y}`} x={x} y={y} width={ew} height={eh} fill={eyeColor} />
            ))}
            {glint && eyes.map(([x, y]) => <rect key={`g${x}-${y}`} x={x + ew - 1} y={y} width={1} height={1} fill={glint} />)}
          </g>
        </g>
        <g className="char__joy">
          {eyes.map(([x, y]) => (
            <g key={`${x}-${y}`} fill={eyeColor}>
              <rect x={x - 1} y={y + eh - 1} width={1} height={1} />
              <rect x={x} y={y + eh - 2} width={ew} height={1} />
              <rect x={x + ew} y={y + eh - 1} width={1} height={1} />
            </g>
          ))}
        </g>
        {look.front.map((l) => (
          <ItemGroup key={`f${l.id}`} layer={l} glow={glowId} />
        ))}
        {look.face.length > 0 && <g className="char__face">{cellRects(look.face, 'g')}</g>}
        {look.over.length > 0 && <g className="char__over">{cellRects(look.over, 'o')}</g>}
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
