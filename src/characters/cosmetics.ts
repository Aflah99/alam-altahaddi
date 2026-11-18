import type { CharacterDef, CharacterId } from './roster'

/**
 * Layered cosmetic items (original pixel art).
 *
 * Items are drawn inside the character's own SVG, in the same pixel grid, so
 * they follow every body animation (breathing, hops, celebrations, walking,
 * jumping and landing) without extra alignment code. Each character declares
 * anchor points (top of the head, neck line, chest, back) and each item is
 * positioned from those anchors:
 *
 *   - `behind` cells are only drawn where the body is transparent (bags),
 *   - `front` cells are drawn over the body (hats, bow ties, badges),
 *   - masked cells (scarves) are clipped to the body so silhouettes stay intact,
 *   - `face` cells are drawn over the eyes (glasses).
 */

export type CosmeticSlot = 'hat' | 'outfit' | 'accessory' | 'bag'

export const SLOT_ORDER: readonly CosmeticSlot[] = ['hat', 'outfit', 'accessory', 'bag']

export interface Cell {
  x: number
  y: number
  c: string
}

export interface CosmeticLayers {
  behind: Cell[]
  front: Cell[]
  face: Cell[]
  /** Body rows hidden by an item (e.g. the robot's antenna under a hat). */
  hideRows: number[]
  /** Body pixels redrawn on top (e.g. the fox's ears poking through a hat). */
  over: Cell[]
}

export interface Anchors {
  /** Head top: centre column (pixel-edge coordinate) and the head's top outline row. */
  hat: {
    cx: number
    y: number
    hideRows?: readonly number[]
    /** Body regions [x0, x1, y0, y1] (inclusive) that stay in front of a hat, like ears. */
    pokeThrough?: readonly (readonly [number, number, number, number])[]
  }
  /** First of the two rows a scarf covers. */
  neckY: number
  /** Centre of a bow tie. */
  bow: { cx: number; y: number }
  /** Centre of a chest badge. */
  badge: { x: number; y: number }
  /** Top-left of a bag peeking out from behind the body. */
  bag: { x: number; y: number }
  /** Row of a belt, and the column its buckle is centred on. */
  belt: { y: number; cx: number }
}

const INK = '#2a1d5c'

export const ANCHORS: Record<CharacterId, Anchors> = {
  'green-slime': { hat: { cx: 9, y: 0 }, neckY: 8, bow: { cx: 9, y: 9 }, badge: { x: 13, y: 9 }, bag: { x: 13, y: 1 }, belt: { y: 9, cx: 9 } },
  'blue-slime': { hat: { cx: 8, y: 2 }, neckY: 11, bow: { cx: 8, y: 12 }, badge: { x: 11, y: 11 }, bag: { x: 11, y: 2 }, belt: { y: 12, cx: 8 } },
  'little-robot': {
    hat: { cx: 8, y: 4, hideRows: [0, 1, 2, 3] },
    neckY: 12,
    bow: { cx: 8, y: 13 },
    badge: { x: 9, y: 14 },
    bag: { x: 12, y: 9 },
    belt: { y: 16, cx: 8 },
  },
  fox: { hat: { cx: 8, y: 3, pokeThrough: [[0, 4, 0, 3], [10, 14, 0, 3]] }, neckY: 12, bow: { cx: 8, y: 13 }, badge: { x: 6, y: 15 }, bag: { x: -3, y: 11 }, belt: { y: 15, cx: 8 } },
  owl: { hat: { cx: 8, y: 2, pokeThrough: [[0, 3, 0, 2], [12, 15, 0, 2]] }, neckY: 10, bow: { cx: 8, y: 10 }, badge: { x: 4, y: 12 }, bag: { x: 13, y: 4 }, belt: { y: 12, cx: 8 } },
  turtle: { hat: { cx: 9, y: 0 }, neckY: 5, bow: { cx: 9, y: 6 }, badge: { x: 9, y: 9 }, bag: { x: 12, y: 0 }, belt: { y: 12, cx: 9 } },
}

/* ---------- helpers ---------- */

function spriteCells(rows: readonly string[], palette: Record<string, string>, ox: number, oy: number): Cell[] {
  const cells: Cell[] = []
  rows.forEach((row, y) => {
    ;[...row].forEach((ch, x) => {
      const c = palette[ch]
      if (c) cells.push({ x: ox + x, y: oy + y, c })
    })
  })
  return cells
}

/** Places a sprite so its bottom row sits on the head's top outline, centred on the head. */
function onHead(rows: readonly string[], palette: Record<string, string>, a: Anchors): Cell[] {
  const w = rows[0].length
  return spriteCells(rows, palette, Math.round(a.hat.cx - w / 2), a.hat.y - rows.length + 1)
}

function centred(rows: readonly string[], palette: Record<string, string>, cx: number, cy: number): Cell[] {
  return spriteCells(rows, palette, Math.round(cx - rows[0].length / 2), Math.round(cy - (rows.length - 1) / 2))
}

const filled = (ch: CharacterDef, x: number, y: number) => {
  const ch0 = ch.rows[y]?.[x]
  return ch0 !== undefined && ch0 !== '.'
}

/* ---------- item art ---------- */

const GRAD_CAP = {
  rows: ['....OOOO....', '.OOOKKKKOOO.', 'OKKKKKKKKKKO', '.OOOKKKKOOOY', '...OKKKKO..Y', '...OOOOOO..Y'],
  palette: { O: INK, K: '#323a7a', Y: '#ffd23f' },
}
const STRAW_HAT = {
  rows: ['....OOOOOO....', '...OSSSSSSO...', '...ORRRRRRO...', 'OOOOSSSSSSOOOO', 'OSSSSSSSSSSSSO', '.OOOOOOOOOOOO.'],
  palette: { O: '#6b4a1e', S: '#f4cf6a', R: '#e8443a' },
}
const CROWN = {
  rows: ['.O...O...O.', 'OYO.OYO.OYO', 'OYYOYRYOYYO', 'OYYYYYYYYYO', 'OHHHHHHHHHO', 'OOOOOOOOOOO'],
  palette: { O: INK, Y: '#ffd23f', H: '#e09b1a', R: '#ff4f6d' },
}
const BEANIE = {
  rows: ['.....OO.....', '....OWWO....', '...OOOOOO...', '..OBBBBBBO..', '.OBBBBBBBBO.', 'OWWWWWWWWWWO', 'OOOOOOOOOOOO'],
  palette: { O: INK, W: '#fff4e6', B: '#4fb4ff' },
}
const BOW_TIE = {
  rows: ['OO...OO', 'OROOORO', 'ORRKRRO', 'OROOORO', 'OO...OO'],
  palette: { O: INK, R: '#9b5cff', K: '#ffd23f' },
}
const STAR_BADGE = {
  rows: ['..O..', '.OYO.', 'OYWYO', '.OYO.', '..O..'],
  palette: { O: INK, Y: '#ffd23f', W: '#ffffff' },
}
const BAG_SHAPE = ['.OOOOO.', 'OBBBBBO', 'OBLLLBO', 'OBBBBBO', 'OKKKKKO', 'OBBYBBO', 'OBBBBBO', '.OOOOO.']
const bag = (B: string, L: string, K: string) => ({ rows: BAG_SHAPE, palette: { O: INK, B, L, K, Y: '#ffd23f' } })
const SCHOOL_BAG = bag('#e8443a', '#ff8f7a', '#b8262b')
const BOOK_BAG = bag('#2fb84a', '#a6ff8f', '#14803a')
const EXPLORER_BAG = bag('#a8703a', '#d9a56a', '#6b4a1e')

/** A two-row knitted band clipped to the body, keeping the outline. */
function scarf(main: string, dark: string, stripe: string) {
  return (ch: CharacterDef, a: Anchors): Partial<CosmeticLayers> => {
    const front: Cell[] = []
    for (const [dy, base] of [
      [0, main],
      [1, dark],
    ] as const) {
      const y = a.neckY + dy
      const row = ch.rows[y]
      if (!row) continue
      ;[...row].forEach((c, x) => {
        if (c === '.' || c === 'O') return
        front.push({ x, y, c: x % 4 === 1 && dy === 0 ? stripe : base })
      })
    }
    return { front }
  }
}

/** A one-row belt clipped to the body (outline kept), with a gold buckle. */
function belt(strap: string) {
  return (ch: CharacterDef, a: Anchors): Partial<CosmeticLayers> => {
    const front: Cell[] = []
    const row = ch.rows[a.belt.y] ?? ''
    ;[...row].forEach((c, x) => {
      if (c === '.' || c === 'O') return
      const buckle = Math.abs(x + 0.5 - a.belt.cx) <= 1.5
      front.push({ x, y: a.belt.y, c: buckle ? '#ffd23f' : strap })
    })
    return { front }
  }
}

function roundGlasses(frame: string) {
  return (ch: CharacterDef): Partial<CosmeticLayers> => {
    const face: Cell[] = []
    const ring = (x: number, y: number) => {
      for (let dx = -1; dx <= 1; dx++) {
        face.push({ x: x + dx, y: y - 1, c: frame }, { x: x + dx, y: y + 2, c: frame })
      }
      face.push({ x: x - 1, y, c: frame }, { x: x + 1, y, c: frame }, { x: x - 1, y: y + 1, c: frame }, { x: x + 1, y: y + 1, c: frame })
    }
    const [[x1, y1], [x2]] = ch.eyes
    ring(x1, y1)
    ring(x2, y1)
    for (let x = x1 + 2; x <= x2 - 2; x++) face.push({ x, y: y1, c: frame })
    return { face }
  }
}

function sunglasses(ch: CharacterDef): Partial<CosmeticLayers> {
  const face: Cell[] = []
  const [[x1, y], [x2]] = ch.eyes
  for (let x = x1 - 1; x <= x2 + 1; x++) face.push({ x, y: y - 1, c: INK })
  for (const ex of [x1, x2]) {
    for (let dx = -1; dx <= 1; dx++) {
      face.push({ x: ex + dx, y, c: dx === -1 ? '#7fb8ff' : '#151530' }, { x: ex + dx, y: y + 1, c: '#151530' })
    }
  }
  return { face }
}

/* ---------- registry ---------- */

export interface CosmeticDef {
  id: string
  slot: CosmeticSlot
  /** Characters this item is drawn for. Omitted: every character. */
  fits?: readonly CharacterId[]
  draw: (ch: CharacterDef, a: Anchors) => Partial<CosmeticLayers>
}

function bodyCells(ch: CharacterDef, [x0, x1, y0, y1]: readonly [number, number, number, number]): Cell[] {
  const cells: Cell[] = []
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const c = ch.palette[ch.rows[y]?.[x] ?? '.']
      if (c) cells.push({ x, y, c })
    }
  return cells
}

const hat = (art: { rows: string[]; palette: Record<string, string> }) => (ch: CharacterDef, a: Anchors) => ({
  front: onHead(art.rows, art.palette, a),
  hideRows: [...(a.hat.hideRows ?? [])],
  over: (a.hat.pokeThrough ?? []).flatMap((r) => bodyCells(ch, r)),
})

export const COSMETICS: readonly CosmeticDef[] = [
  { id: 'hat-grad', slot: 'hat', draw: hat(GRAD_CAP) },
  { id: 'hat-straw', slot: 'hat', draw: hat(STRAW_HAT) },
  { id: 'hat-crown', slot: 'hat', draw: hat(CROWN) },
  { id: 'hat-beanie', slot: 'hat', draw: hat(BEANIE) },
  { id: 'outfit-scarf', slot: 'outfit', fits: ['green-slime', 'blue-slime', 'little-robot', 'fox', 'owl'], draw: scarf('#e8443a', '#b8262b', '#ffd23f') },
  { id: 'outfit-bowtie', slot: 'outfit', draw: (_ch, a) => ({ front: centred(BOW_TIE.rows, BOW_TIE.palette, a.bow.cx, a.bow.y) }) },
  { id: 'outfit-belt', slot: 'outfit', draw: belt('#6b4a1e') },
  { id: 'acc-glasses', slot: 'accessory', fits: ['green-slime', 'blue-slime', 'fox', 'owl', 'turtle'], draw: roundGlasses('#6b4a1e') },
  { id: 'acc-sunglasses', slot: 'accessory', fits: ['green-slime', 'blue-slime', 'fox', 'owl', 'turtle'], draw: sunglasses },
  { id: 'acc-star', slot: 'accessory', draw: (_ch, a) => ({ front: centred(STAR_BADGE.rows, STAR_BADGE.palette, a.badge.x, a.badge.y) }) },
  { id: 'bag-school', slot: 'bag', draw: (_ch, a) => ({ behind: spriteCells(SCHOOL_BAG.rows, SCHOOL_BAG.palette, a.bag.x, a.bag.y) }) },
  { id: 'bag-books', slot: 'bag', draw: (_ch, a) => ({ behind: spriteCells(BOOK_BAG.rows, BOOK_BAG.palette, a.bag.x, a.bag.y) }) },
  { id: 'bag-explorer', slot: 'bag', draw: (_ch, a) => ({ behind: spriteCells(EXPLORER_BAG.rows, EXPLORER_BAG.palette, a.bag.x, a.bag.y) }) },
]

export function getCosmetic(id: string): CosmeticDef | undefined {
  return COSMETICS.find((c) => c.id === id)
}

export function fitsCharacter(item: CosmeticDef, characterId: CharacterId): boolean {
  return !item.fits || item.fits.includes(characterId)
}

/**
 * Builds the drawable layers for a character wearing `itemIds`. Unknown items
 * and items that do not fit this character are skipped (never drawn wrongly).
 */
export function composeOutfit(ch: CharacterDef, itemIds: readonly string[]): CosmeticLayers {
  const a = ANCHORS[ch.id]
  const out: CosmeticLayers = { behind: [], front: [], face: [], hideRows: [], over: [] }
  if (!a) return out
  const items = itemIds
    .map(getCosmetic)
    .filter((it): it is CosmeticDef => !!it && fitsCharacter(it, ch.id))
    .sort((p, q) => SLOT_ORDER.indexOf(p.slot) - SLOT_ORDER.indexOf(q.slot))
  for (const it of items) {
    const l = it.draw(ch, a)
    out.behind.push(...(l.behind ?? []).filter((c) => !filled(ch, c.x, c.y)))
    out.front.push(...(l.front ?? []))
    out.face.push(...(l.face ?? []))
    out.hideRows.push(...(l.hideRows ?? []))
    out.over.push(...(l.over ?? []))
  }
  return out
}
