import type { Box } from '../engine/types'

/**
 * Level layouts in world units (1 unit = 1 sprite pixel; y = height above the ground).
 * The first level is deliberately gentle: mostly flat, a few low steps,
 * optional platforms, no enemies, no pits. Progress runs right → left,
 * following Arabic reading direction: you start on the right, the portal is on the left.
 */
export type DecorKind = 'tree' | 'bush' | 'rock' | 'flower' | 'flowerBlue' | 'sign' | 'path'

export interface DecorItem {
  kind: DecorKind
  x: number
  y?: number
  /** Width, for stretchable decor (path). */
  w?: number
}

export interface LevelConfig {
  id: string
  width: number
  /** Where the player's left edge starts. */
  spawnX: number
  /** Left edge of the portal (20 units wide). */
  portalX: number
  solids: readonly Box[]
  platforms: readonly Box[]
  decor: readonly DecorItem[]
}

export const PORTAL_W = 20
/** How close (in units, centre to centre) the player must be to use the portal. */
export const PORTAL_REACH = 26

const MEADOW: LevelConfig = {
  id: 'meadow',
  width: 760,
  spawnX: 704,
  portalX: 34,
  solids: [
    { x: 588, y: 0, w: 24, h: 10 },
    { x: 404, y: 0, w: 24, h: 10 },
    { x: 380, y: 0, w: 24, h: 18 },
    { x: 196, y: 0, w: 28, h: 12 },
  ],
  platforms: [
    { x: 488, y: 30, w: 44, h: 6 },
    { x: 276, y: 32, w: 40, h: 6 },
  ],
  decor: [
    { kind: 'sign', x: 680 },
    { kind: 'tree', x: 724 },
    { kind: 'bush', x: 652 },
    { kind: 'flower', x: 640 },
    { kind: 'rock', x: 560 },
    { kind: 'tree', x: 532 },
    { kind: 'flowerBlue', x: 498, y: 30 },
    { kind: 'flower', x: 516, y: 30 },
    { kind: 'bush', x: 456 },
    { kind: 'flower', x: 444 },
    { kind: 'rock', x: 352 },
    { kind: 'tree', x: 330 },
    { kind: 'flowerBlue', x: 292, y: 32 },
    { kind: 'bush', x: 248 },
    { kind: 'flower', x: 238 },
    { kind: 'flowerBlue', x: 176 },
    { kind: 'tree', x: 146 },
    { kind: 'rock', x: 120 },
    { kind: 'path', x: 14, w: 110 },
    { kind: 'flower', x: 8 },
  ],
}

/** Theme variants reuse the meadow's collision layout (tested, gentle) with different scenery. */
function variant(id: string, swap: Partial<Record<DecorItem['kind'], DecorItem['kind'] | null>>): LevelConfig {
  return {
    ...MEADOW,
    id,
    decor: MEADOW.decor.flatMap((d) => {
      const to = d.kind in swap ? swap[d.kind] : d.kind
      return to ? [{ ...d, kind: to }] : []
    }),
  }
}

export const LEVELS: Readonly<Record<string, LevelConfig>> = {
  meadow: MEADOW,
  forest: variant('forest', { flower: 'bush', flowerBlue: 'tree', rock: 'tree' }),
  desert: variant('desert', { tree: 'rock', bush: 'rock', flower: null, flowerBlue: null }),
  castle: variant('castle', { tree: 'rock', flower: null, flowerBlue: 'flower' }),
  future: variant('future', { tree: 'rock', bush: null, flower: 'flowerBlue' }),
}
