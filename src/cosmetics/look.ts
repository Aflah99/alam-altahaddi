import { composeOutfit, getCosmetic, type Cell } from '../characters/cosmetics'
import type { CharacterDef } from '../characters/roster'
import { getWearable, parseWorn, SLOT_ORDER, tierDef, type Art, type Wearable } from './wearables'

/** One equipped item's pixels, grouped so tier effects can be applied per item. */
export interface ItemLayer {
  id: string
  tier: number
  cells: Cell[]
  /** Cells drawn in the tier's trim colour (animated at the Mythic tier). */
  trim: Cell[]
}

export interface Look {
  behind: ItemLayer[]
  front: ItemLayer[]
  /** Old creature art: glasses drawn over the eyes. */
  face: Cell[]
  hideRows: number[]
  over: Cell[]
  /** Palette overrides (shoes recolour the boots). */
  palette: Record<string, string>
  /** Extra sprite pixels to the right of the body (pets). */
  extraRight: number
}

const INK = '#2a1d5c'
const empty = (): Look => ({ behind: [], front: [], face: [], hideRows: [], over: [], palette: {}, extraRight: 0 })

function artCells(art: Art, item: Wearable, tier: number, dx = 0, dy = 0): { cells: Cell[]; trim: Cell[] } {
  const t = tierDef(tier)
  const cells: Cell[] = []
  const trim: Cell[] = []
  art.rows.forEach((row, y) => {
    ;[...row].forEach((ch, x) => {
      if (ch === '.' || ch === ' ') return
      const cx = art.x + x + dx
      const cy = art.y + y + dy
      if (ch === 'T' || ch === 'G') trim.push({ x: cx, y: cy, c: ch === 'T' ? t.trim : t.gem })
      else if (ch === 't') cells.push({ x: cx, y: cy, c: t.trimShade })
      else if (ch === 'O') cells.push({ x: cx, y: cy, c: INK })
      else {
        const c = item.pal[ch]
        if (c) cells.push({ x: cx, y: cy, c })
      }
    })
  })
  return { cells, trim }
}

const filled = (ch: CharacterDef, x: number, y: number) => {
  const c = ch.rows[y]?.[x]
  return c !== undefined && c !== '.'
}

/**
 * Layers for `character` wearing the items in `worn` ("id@tier" keys).
 * Humans support every slot. Creatures draw only items marked compatible:
 * their original accessory art plus companions.
 */
export function composeLook(ch: CharacterDef, worn: readonly string[]): Look {
  const out = empty()
  const items = worn
    .map(parseWorn)
    .map((w) => ({ ...w, def: getWearable(w.id) }))
    .filter((w): w is { id: string; tier: number; def: Wearable } => !!w.def)
    .sort((a, b) => SLOT_ORDER.indexOf(a.def.slot) - SLOT_ORDER.indexOf(b.def.slot))

  const w = ch.rows[0]?.length ?? 0
  const h = ch.rows.length
  for (const { id, tier, def } of items) {
    if (ch.human) {
      if (def.boots) {
        out.palette.K = def.boots.base
        out.palette.k = def.boots.shade
      }
      if (def.behind) {
        const { cells, trim } = artCells(def.behind, def, tier)
        const keep = (c: Cell) => !filled(ch, c.x, c.y)
        out.behind.push({ id, tier, cells: cells.filter(keep), trim: trim.filter(keep) })
      }
      const parts = [def.front, tier >= 3 ? def.extra : undefined].filter((a): a is Art => !!a)
      if (parts.length) {
        const layer: ItemLayer = { id, tier, cells: [], trim: [] }
        for (const art of parts) {
          const { cells, trim } = artCells(art, def, tier)
          layer.cells.push(...cells)
          layer.trim.push(...trim)
        }
        out.front.push(layer)
      }
      if (def.slot === 'pet') out.extraRight = Math.max(out.extraRight, 8)
      continue
    }
    // Creatures: companions sit beside the body; older accessories use their own creature art.
    if (def.slot === 'pet' && def.front) {
      const ph = def.front.rows.length
      const { cells, trim } = artCells(def.front, def, tier, w + 1 - def.front.x, h - ph - def.front.y)
      out.front.push({ id, tier, cells, trim })
      out.extraRight = Math.max(out.extraRight, 8)
      continue
    }
    if (!def.creatureOk || !getCosmetic(id)) continue
    const l = composeOutfit(ch, [id])
    out.behind.push({ id, tier, cells: l.behind, trim: [] })
    out.front.push({ id, tier, cells: l.front, trim: [] })
    out.face.push(...l.face)
    out.hideRows.push(...l.hideRows)
    out.over.push(...l.over)
  }
  return out
}

/** Highest tier among the equipped items (drives the sprite's aura at Diamond and Mythic). */
export function topTier(worn: readonly string[]): number {
  return worn.reduce((m, k) => Math.max(m, parseWorn(k).tier), 0)
}

/** Whether a creature can show this item. */
export function fitsCreature(id: string): boolean {
  const d = getWearable(id)
  return !!d && (d.slot === 'pet' || (!!d.creatureOk && !!getCosmetic(id)))
}
