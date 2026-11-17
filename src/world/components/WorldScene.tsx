import { memo, type CSSProperties } from 'react'
import { PixelSprite } from '../../components/PixelSprite'
import { BUSH, TREE, type SpriteDef } from '../../lobby/lobbySprites'
import type { DecorItem, LevelConfig } from '../config/levels'
import { FLOWER, FLOWER_BLUE, ROCK, SIGNPOST } from '../worldSprites'

const DECOR_SPRITES: Record<Exclude<DecorItem['kind'], 'path'>, SpriteDef> = {
  tree: TREE,
  bush: BUSH,
  rock: ROCK,
  flower: FLOWER,
  flowerBlue: FLOWER_BLUE,
  sign: SIGNPOST,
}

/** CSS variables for an object at world position (x, y), optionally sized w × h units. */
const at = (x: number, y = 0, size?: { w?: number; h?: number }) =>
  ({ '--x': x, '--y': y, '--w': size?.w, '--h': size?.h }) as CSSProperties

/**
 * The static part of a level: ground, blocks, platforms and decorations.
 * Rendered once; the game loop only moves the camera and the player.
 */
export const WorldScene = memo(function WorldScene({ level }: { level: LevelConfig }) {
  return (
    <>
      <div className="wground" style={at(0, 0, { w: level.width })} />

      {level.decor.map((d, i) => {
        if (d.kind === 'path') return <div key={i} className="wobj wpath" style={at(d.x, d.y, { w: d.w ?? 40 })} />
        const sprite = DECOR_SPRITES[d.kind]
        return (
          <span key={i} className={`wobj wdecor wdecor--${d.kind}`} style={at(d.x, d.y, { w: sprite.rows[0].length })}>
            <PixelSprite rows={sprite.rows} palette={sprite.palette} />
            {d.kind === 'sign' && <span className="wsign-label">البوابة</span>}
          </span>
        )
      })}

      {level.solids.map((b, i) => (
        <div key={`s${i}`} className="wobj wblock" style={at(b.x, b.y, b)} />
      ))}
      {level.platforms.map((p, i) => (
        <div key={`p${i}`} className="wobj wplatform" style={at(p.x, p.y - p.h, p)} />
      ))}
    </>
  )
})
