/**
 * Human fantasy avatars (original pixel art), built from layers on a 20×30 grid:
 *   back hair → head and body → clothing theme → front hair or hijab → eyes (blinking sprite layer).
 *
 * Every clothing theme is modest for both avatars: long sleeves and full-length trousers,
 * robes or skirts. The female avatar can wear a hijab with any theme; the hijab hides the
 * hair completely and covers the neck.
 *
 * This module has no imports so tools can load it directly.
 */

export type BodyId = 'boy' | 'girl'

export interface Appearance {
  body: BodyId
  skin: number
  hair: HairId
  hairColor: number
  theme: ThemeId
  primary: number
  secondary: number
  hijab: boolean
  hijabColor: number
}

export const SKIN_TONES: readonly { name: string; base: string; shade: string }[] = [
  { name: 'فاتح جدًّا', base: '#ffe3cc', shade: '#efbf9c' },
  { name: 'فاتح', base: '#f6cfa5', shade: '#e0a982' },
  { name: 'حنطي', base: '#e3b07f', shade: '#c88c5d' },
  { name: 'قمحي', base: '#c98c5c', shade: '#a96d42' },
  { name: 'أسمر', base: '#9c6640', shade: '#7c4d2c' },
  { name: 'داكن', base: '#6f4529', shade: '#55331d' },
]

export const HAIR_COLORS: readonly { name: string; base: string; shade: string }[] = [
  { name: 'أسود', base: '#2e2622', shade: '#171210' },
  { name: 'بني داكن', base: '#4f321f', shade: '#331f13' },
  { name: 'بني', base: '#7a4a24', shade: '#55321a' },
  { name: 'كستنائي', base: '#a0522d', shade: '#76391d' },
  { name: 'أشقر', base: '#e8c15a', shade: '#c09632' },
  { name: 'برتقالي', base: '#d9702b', shade: '#a8501b' },
  { name: 'فضي سحري', base: '#c9d4e8', shade: '#97a3c0' },
  { name: 'أزرق سحري', base: '#4f86d9', shade: '#2f5ea8' },
]

/** Clothing colours (primary and secondary). */
export const CLOTH_COLORS: readonly { name: string; base: string }[] = [
  { name: 'أزرق', base: '#2f6fd6' },
  { name: 'أحمر', base: '#d63a3a' },
  { name: 'أخضر', base: '#2fa84f' },
  { name: 'بنفسجي', base: '#7c4dd6' },
  { name: 'برتقالي', base: '#e8862f' },
  { name: 'فيروزي', base: '#1fb3b3' },
  { name: 'وردي', base: '#e0609a' },
  { name: 'بني', base: '#8a5a32' },
  { name: 'رمادي', base: '#7d8597' },
  { name: 'أبيض', base: '#eef0f5' },
  { name: 'كحلي', base: '#283c78' },
  { name: 'عنابي', base: '#8e2440' },
]

export const HIJAB_COLORS: readonly { name: string; base: string }[] = [
  { name: 'وردي', base: '#e894b8' },
  { name: 'سماوي', base: '#7cc0ea' },
  { name: 'أبيض', base: '#f2f2f7' },
  { name: 'كحلي', base: '#2b3b75' },
  { name: 'بنفسجي', base: '#9a72d9' },
  { name: 'أخضر', base: '#4fae7a' },
  { name: 'بيج', base: '#d9c3a0' },
  { name: 'أسود', base: '#2b2633' },
  { name: 'عنابي', base: '#93304f' },
]

export function shade(hex: string, f = 0.72): string {
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)))
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, '0')).join('')}`
}

const INK = '#2a1d5c'
export const HUMAN_W = 20
export const HUMAN_H = 30

/* ---------------------------------------------------------------- base */

const HEAD = [
  '....................',
  '....................',
  '....................',
  '......OOOOOOOO......',
  '....OOSSSSSSSSOO....',
  '...OSSSSSSSSSSSSO...',
  '..OSSSSSSSSSSSSSSO..',
  '..OSSSSSSSSSSSSSSO..',
  '..OSSSSSSSSSSSSSSO..',
  '..OSSSSSSSSSSSSSSO..',
  '..OSSSSSSSSSSSSSSO..',
  '..OSSSSSSSSSSSSSSO..',
  '..OSBBSSSMMSSSBBSO..',
  '...OSSSSSSSSSSSSO...',
  '....OOSSSSSSSSOO....',
  '......OOOOOOOO......',
]

/** Eyes: 2×3, with a white glint. Top-left pixel of each eye. */
export const HUMAN_EYES: readonly (readonly [number, number])[] = [
  [5, 9],
  [13, 9],
]

/* ---------------------------------------------------------------- clothing themes
 * Rows 16–29. Letters: P primary, p primary shade, U secondary, u secondary shade,
 * T trim, L belt/sash, K boots, k boot shade, F fur/cream, W white, S skin (hands), s neck.
 */
export type ThemeId = 'arabian' | 'medieval' | 'chinese' | 'eastern' | 'adventurer' | 'scholar'

interface Theme {
  name: string
  trim: string
  belt: string
  boots: string
  fur?: string
  boy: readonly string[]
  girl: readonly string[]
  /** Default primary / secondary colour indexes. */
  defaults: readonly [number, number]
}

export const THEMES: Record<ThemeId, Theme> = {
  arabian: {
    name: 'عربي خيالي',
    trim: '#ffd34d',
    belt: '#d63a3a',
    boots: '#8a5a32',
    defaults: [9, 3],
    boy: [
      '........OssO........',
      '.....OOOPTTPOOO.....',
      '....OPPPPTTPPPPO....',
      '...OPPpPPTTPPpPPO...',
      '...OPpOPPTTPPOpPO...',
      '...OPpOPPTTPPOpPO...',
      '...OPpOLLLLLLOpPO...',
      '...OSSOPPPPPPOSSO...',
      '....OOOPPPPPPOOO....',
      '......OPPPPPPO......',
      '.....OPPPPPPPPO.....',
      '.....OPpPPPPpPO.....',
      '.....OTTTTTTTTO.....',
      '.....OKKKOOKKKO.....',
    ],
    girl: [
      '........OssO........',
      '.....OOOUTTUOOO.....',
      '....OUUUUTTUUUUO....',
      '...OUUuUUTTUUuUUO...',
      '...OUuOUUTTUUOuUO...',
      '...OUuOUUTTUUOuUO...',
      '...OTTOLLLLLLOTTO...',
      '...OSSOUUUUUUOSSO...',
      '....OOOUUUUUUOOO....',
      '......OUUUUUUO......',
      '.....OUUUuUUUUO.....',
      '....OUUuUUUUuUUO....',
      '....OTTTTTTTTTTO....',
      '.....OKKOOOOKKO.....',
    ],
  },
  medieval: {
    name: 'فارس القرون الوسطى',
    trim: '#c9d4e8',
    belt: '#6b4423',
    boots: '#4a3020',
    defaults: [0, 7],
    boy: [
      '........OssO........',
      '.....OOOPPPPOOO.....',
      '....OTTPPPPPPTTO....',
      '...OPTTPPTTPPTTPO...',
      '...OPpOPPTTPPOpPO...',
      '...OPpOPPPPPPOpPO...',
      '...OPpOLLTTLLOpPO...',
      '...OSSOPPPPPPOSSO...',
      '....OOOPPPPPPOOO....',
      '......OUUUUUUO......',
      '......OUUOOUUO......',
      '......OKKOOKKO......',
      '......OKKOOKKO......',
      '.....OKKKOOKKKO.....',
    ],
    girl: [
      '........OssO........',
      '.....OOOPPPPOOO.....',
      '....OTTPPPPPPTTO....',
      '...OPTTPPTTPPTTPO...',
      '...OPpOPPTTPPOpPO...',
      '...OPpOPPPPPPOpPO...',
      '...OPpOLLTTLLOpPO...',
      '...OSSOPPPPPPOSSO...',
      '....OOOPPPPPPOOO....',
      '......OPPPPPPO......',
      '.....OPPpPPpPPO.....',
      '....OPPpPPPPpPPO....',
      '....OUUUUUUUUUUO....',
      '.....OKKOOOOKKO.....',
    ],
  },
  chinese: {
    name: 'صيني خيالي',
    trim: '#ffd34d',
    belt: '#ffd34d',
    boots: '#2b2633',
    defaults: [1, 10],
    boy: [
      '........OssO........',
      '.....OOOTPPPOOO.....',
      '....OPPPPTPPPPPO....',
      '...OPPpPPPTPPpPPO...',
      '...OPpOPPPPTPOpPO...',
      '..OPPpOPPPPPTOpPPO..',
      '..OTTTOLLLLLLOTTTO..',
      '...OSSOPPPPPPOSSO...',
      '....OOOPPPPPPOOO....',
      '......OUUUUUUO......',
      '......OUUOOUUO......',
      '......OUUOOUUO......',
      '......OKKOOKKO......',
      '.....OKKKOOKKKO.....',
    ],
    girl: [
      '........OssO........',
      '.....OOOTPPPOOO.....',
      '....OPPPPTPPPPPO....',
      '...OPPpPPPTPPpPPO...',
      '...OPpOPPPPTPOpPO...',
      '..OPPpOPPPPPTOpPPO..',
      '..OTTTOLLLLLLOTTTO..',
      '...OSSOPPPPPPOSSO...',
      '....OOOPPPPPPOOO....',
      '......OPPPPPPO......',
      '.....OPPPPPPPPO.....',
      '....OPPpPPPPpPPO....',
      '....OTTTTTTTTTTO....',
      '.....OKKOOOOKKO.....',
    ],
  },
  eastern: {
    name: 'آسيوي خيالي',
    trim: '#f2f2f7',
    belt: '#2b2633',
    boots: '#8a5a32',
    defaults: [2, 10],
    boy: [
      '........OssO........',
      '.....OOOTOOTOOO.....',
      '....OPPPPTTPPPPO....',
      '...OPPpPPTTPPpPPO...',
      '..OPPpOPTPPTPOpPPO..',
      '..OPPpOPPPPPPOpPPO..',
      '..OPPPOLLLLLLOPPPO..',
      '...OSSOUUUUUUOSSO...',
      '....OOUUUUUUUUOO....',
      '.....OUUuUUuUUO.....',
      '.....OUUuOOuUUO.....',
      '....OUUUuOOuUUUO....',
      '....OUUUUOOUUUUO....',
      '.....OKKKOOKKKO.....',
    ],
    girl: [
      '........OssO........',
      '.....OOOTOOTOOO.....',
      '....OPPPPTTPPPPO....',
      '...OPPpPPTTPPpPPO...',
      '..OPPpOPTPPTPOpPPO..',
      '..OPPpOPPPPPPOpPPO..',
      '..OPPPOLLLLLLOPPPO..',
      '...OSSOUUUUUUOSSO...',
      '....OOUUUUUUUUOO....',
      '.....OUUuUUuUUO.....',
      '....OUUUuUUuUUUO....',
      '....OUUUuUUuUUUO....',
      '...OUUUUUUUUUUUUO...',
      '.....OKKKOOKKKO.....',
    ],
  },
  adventurer: {
    name: 'مغامر الشمال',
    trim: '#c8a25a',
    belt: '#5a3a22',
    boots: '#5a3a22',
    fur: '#efe2c4',
    defaults: [7, 2],
    boy: [
      '........OssO........',
      '.....OOFFFFFFOO.....',
      '....OFFUUUUUUFFO....',
      '...OPFUUUUUUUUFPO...',
      '...OPpOUUPPUUOpPO...',
      '...OPpOUUPPUUOpPO...',
      '...OPpOLLTTLLOpPO...',
      '...OSSOUUUUUUOSSO...',
      '....OOOKKKKKKOOO....',
      '......OKKKKKKO......',
      '......OKKOOKKO......',
      '......OFFOOFFO......',
      '......OKKOOKKO......',
      '.....OKKKOOKKKO.....',
    ],
    girl: [
      '........OssO........',
      '.....OOFFFFFFOO.....',
      '....OFFUUUUUUFFO....',
      '...OPFUUUUUUUUFPO...',
      '...OPpOUUPPUUOpPO...',
      '...OPpOUUPPUUOpPO...',
      '...OPpOLLTTLLOpPO...',
      '...OSSOPPPPPPOSSO...',
      '....OOOPPPPPPOOO....',
      '......OPPPPPPO......',
      '.....OPPpPPpPPO.....',
      '....OPPPpPPpPPPO....',
      '....OFFFFFFFFFFO....',
      '.....OKKOOOOKKO.....',
    ],
  },
  scholar: {
    name: 'ساحر الحكمة',
    trim: '#ffd34d',
    belt: '#ffd34d',
    boots: '#3a2a5a',
    defaults: [3, 4],
    boy: [
      '........OssO........',
      '.....OOOPTTPOOO.....',
      '....OPPPPTTPPPPO....',
      '...OPPpPPTTPPpPPO...',
      '..OPPpOPPTTPPOpPPO..',
      '..OPPpOPTPPTPOpPPO..',
      '..OUUUOLLLLLLOUUUO..',
      '...OSSOPPTPPPOSSO...',
      '....OOOPPPPPPOOO....',
      '......OPPPPTPO......',
      '.....OPPTPPPPPO.....',
      '....OPPpPPPPTpPO....',
      '....OUUUUUUUUUUO....',
      '.....OKKOOOOKKO.....',
    ],
    girl: [
      '........OssO........',
      '.....OOOPTTPOOO.....',
      '....OPPPPTTPPPPO....',
      '...OPPpPPTTPPpPPO...',
      '..OPPpOPPTTPPOpPPO..',
      '..OPPpOPTPPTPOpPPO..',
      '..OUUUOLLLLLLOUUUO..',
      '...OSSOPPTPPPOSSO...',
      '....OOOPPPPPPOOO....',
      '......OPPPPTPO......',
      '.....OPPTPPPPPO.....',
      '....OPPpPPPPTpPO....',
      '...OUUUUUUUUUUUUO...',
      '.....OKKOOOOKKO.....',
    ],
  },
}

export const THEME_IDS = Object.keys(THEMES) as ThemeId[]

/* ---------------------------------------------------------------- hair
 * front: drawn over the head (rows 0–15). back: drawn only where nothing else is (behind).
 */
export type HairId = 'spiky' | 'short' | 'curly' | 'ponytail' | 'long' | 'braid' | 'bun' | 'bob'

interface Hair {
  name: string
  front: readonly string[]
  back?: readonly string[]
}

export const HAIRS: Record<HairId, Hair> = {
  spiky: {
    name: 'شعر شائك',
    front: [
      '.......O..O.........',
      '....O.OHO.OHO.O.....',
      '....OHOHHOHHOHHO.O..',
      '...OHHHHHHHHHHHHOHO.',
      '..OHHHHHHHHHHHHHHHO.',
      '.OHHHHHHHHHHHHHHHHHO',
      '.OHHhHHHHHHHHHHhHHO.',
      '.OHhHHHhHHHHhHHHhHO.',
      '.OHOHhOHhHHhOhHOHHO.',
      '.OHO.O.OhOO.O.O.OhO.',
      '.OO..............OO.',
    ],
  },
  short: {
    name: 'شعر قصير',
    front: [
      '....................',
      '....................',
      '.....OOOOOOOOO......',
      '...OOHHHHHHHHHOO....',
      '..OHHHHHHHHHHHHHO...',
      '.OHHHHHHHHHHHHHHHO..',
      '.OHHhHHHHHHHHHhHHHO.',
      '.OHhHHHHHHHHHHHHhHO.',
      '.OHOhhhhOOhhhhhOhHO.',
      '.OO.OOOO..OOOOO.OHO.',
      '..................O.',
    ],
  },
  curly: {
    name: 'شعر مجعّد',
    front: [
      '....................',
      '.....O.OO.OO.O......',
      '....OHOHHOHHOHO.....',
      '...OHhHHhHHhHHhO....',
      '..OHHHHHHHHHHHHHHO..',
      '.OHhHHhHHhHHhHHhHHO.',
      '.OHHHHHHHHHHHHHHHHO.',
      '.OhHHhHHhHHhHHhHHhO.',
      '.OHOHHOHHOOHHOHHOHO.',
      '.OHO.O.OO..OO.O.OHO.',
      '.OHO............OHO.',
      '.OO..............OO.',
    ],
  },
  ponytail: {
    name: 'ذيل حصان',
    front: [
      '....................',
      '....................',
      '.....OOOOOOOOO......',
      '...OOHHHHHHHHHOO....',
      '..OHHHHHHHHHHHHHO...',
      '.OHHHHHHHHHHHHHHHO..',
      '.OHhHHHHHHHHHHhHHHO.',
      '.OHHhHHHHHHHHhHHHHO.',
      '.OHOOhhhOOhhhOOOhHO.',
      '.OHO.OOO..OOO...OHO.',
      '.OO..............OO.',
    ],
    back: [
      '....................',
      '....................',
      '....................',
      '....................',
      '................OOO.',
      '...............OHHHO',
      '...............OHhHO',
      '................OHHO',
      '................OHhO',
      '................OHHO',
      '................OHhO',
      '................OHO.',
      '................OHO.',
      '.................O..',
    ],
  },
  long: {
    name: 'شعر طويل',
    front: [
      '....................',
      '....................',
      '.....OOOOOOOOO......',
      '...OOHHHHHHHHHOO....',
      '..OHHHHHHHHHHHHHO...',
      '.OHHHHHHHHHHHHHHHO..',
      '.OHHhHHHHHHHHHHhHHO.',
      '.OHhHHHHhHHhHHHHhHO.',
      '.OHHOhhhOOOOhhhOHHO.',
      '.OHHO..........OHHO.',
      '.OHO............OHO.',
      '.OHO............OHO.',
    ],
    back: [
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      'OHHO............OHHO',
      'OHhO............OhHO',
      'OHHO............OHHO',
      'OHhO............OhHO',
      'OHHO............OHHO',
      'OHHO............OHHO',
      'OHhO............OhHO',
      '.OOO............OOO.',
    ],
  },
  braid: {
    name: 'ضفيرة',
    front: [
      '....................',
      '....................',
      '.....OOOOOOOOO......',
      '...OOHHHHHHHHHOO....',
      '..OHHHHHHHhHHHHHO...',
      '.OHHHHHHHhHHHHHHHO..',
      '.OHHhHHHhHHHHHHhHHO.',
      '.OHhHHHhHHHHHHHHhHO.',
      '.OHOhhOOhhhhhhhOHHO.',
      '.OHO.OO.OOOOOOO.OHO.',
      '.OHO............OHO.',
      '.OO..............OO.',
    ],
    back: [
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '................OHO.',
      '................OHhO',
      '................OHHO',
      '...............OhHO.',
      '...............OHHO.',
      '...............OHhO.',
      '...............OTTO.',
      '................OO..',
    ],
  },
  bun: {
    name: 'كعكة',
    front: [
      '.......OOOOO........',
      '......OHHhHHO.......',
      '......OOHHHOO.......',
      '...OOOHHHHHHHOO.....',
      '..OHHHHHHHHHHHHHO...',
      '.OHHHHHHHHHHHHHHHO..',
      '.OHHhHHHHHHHHHHhHHO.',
      '.OHhHHHHHHHHHHHHhHO.',
      '.OHOOhhhhhhhhhOOhHO.',
      '.OHO.OOOOOOOOO..OHO.',
      '.OO..............OO.',
    ],
  },
  bob: {
    name: 'قَصّة قصيرة مستديرة',
    front: [
      '....................',
      '....................',
      '.....OOOOOOOOO......',
      '...OOHHHHHHHHHOO....',
      '..OHHHHHHHHHHHHHO...',
      '.OHHHHHHHHHHHHHHHO..',
      '.OHHhHHHHHHHHHHhHHO.',
      '.OHhhhhhhhhhhhhhhHO.',
      '.OHOOOOOOOOOOOOOOHO.',
      '.OHO............OHO.',
      '.OHO............OHO.',
      '.OHHO..........OHHO.',
      '..OO............OO..',
    ],
  },
}

export const HAIR_IDS = Object.keys(HAIRS) as HairId[]

/** Hijab: covers all hair, the ears and the neck, and falls over the shoulders. */
const HIJAB = [
  '....................',
  '....................',
  '.....OOOOOOOOOO.....',
  '...OOJJJJJJJJJJOO...',
  '..OJJJJJJJJJJJJJJO..',
  '.OJJJJJJJJJJJJJJJJO.',
  '.OJJjOOOOOOOOOOjJJO.',
  '.OJJO..........OJJO.',
  '.OJJO..........OJJO.',
  '.OJJO..........OJJO.',
  '.OJJO..........OJJO.',
  '.OJJO..........OJJO.',
  '.OJJjO........OjJJO.',
  '.OJJJjO......OjJJJO.',
  '..OJJJjOOOOOOjJJJO..',
  '..OJJJJJJJJJJJJJJO..',
  '...OJJJJJjJJJJJJO...',
  '....OOJJJJJJJJOO....',
  '......OOOOOOOO......',
]

/* ---------------------------------------------------------------- compose */

export const DEFAULT_APPEARANCE: Record<BodyId, Appearance> = {
  boy: { body: 'boy', skin: 1, hair: 'spiky', hairColor: 2, theme: 'medieval', primary: 0, secondary: 7, hijab: false, hijabColor: 0 },
  girl: { body: 'girl', skin: 1, hair: 'long', hairColor: 1, theme: 'arabian', primary: 9, secondary: 3, hijab: true, hijabColor: 0 },
}

const idx = (v: unknown, n: number, d: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < n ? (v as number) : d)

/** Validates an appearance from storage or the server (unknown shape) — the server applies the same rules. */
export function sanitizeAppearance(raw: unknown, body?: BodyId): Appearance {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const b: BodyId = body ?? (r.body === 'girl' ? 'girl' : 'boy')
  const d = DEFAULT_APPEARANCE[b]
  return {
    body: b,
    skin: idx(r.skin, SKIN_TONES.length, d.skin),
    hair: HAIR_IDS.includes(r.hair as HairId) ? (r.hair as HairId) : d.hair,
    hairColor: idx(r.hairColor, HAIR_COLORS.length, d.hairColor),
    theme: THEME_IDS.includes(r.theme as ThemeId) ? (r.theme as ThemeId) : d.theme,
    primary: idx(r.primary, CLOTH_COLORS.length, d.primary),
    secondary: idx(r.secondary, CLOTH_COLORS.length, d.secondary),
    hijab: b === 'girl' && typeof r.hijab === 'boolean' ? r.hijab : b === 'girl' ? d.hijab : false,
    hijabColor: idx(r.hijabColor, HIJAB_COLORS.length, d.hijabColor),
  }
}

function paint(grid: string[][], map: readonly string[], oy: number, mode: 'over' | 'behind' = 'over') {
  map.forEach((row, y) => {
    const gy = y + oy
    if (gy < 0 || gy >= grid.length) return
    for (let x = 0; x < row.length && x < grid[gy].length; x++) {
      const c = row[x]
      if (c === '.') continue
      if (mode === 'behind' && grid[gy][x] !== '.') continue
      grid[gy][x] = c
    }
  })
}

export interface HumanSprite {
  rows: string[]
  palette: Record<string, string>
}

export function composeHuman(a: Appearance): HumanSprite {
  const grid = Array.from({ length: HUMAN_H }, () => Array<string>(HUMAN_W).fill('.'))
  const theme = THEMES[a.theme]
  paint(grid, HEAD, 0)
  paint(grid, a.body === 'girl' ? theme.girl : theme.boy, 16)
  if (a.hijab && a.body === 'girl') {
    paint(grid, HIJAB, 0)
  } else {
    const hair = HAIRS[a.hair]
    paint(grid, hair.front, 0)
    if (hair.back) paint(grid, hair.back, 0, 'behind')
  }
  const skin = SKIN_TONES[a.skin]
  const hair = HAIR_COLORS[a.hairColor]
  const p = CLOTH_COLORS[a.primary].base
  const u = CLOTH_COLORS[a.secondary].base
  const j = HIJAB_COLORS[a.hijabColor].base
  return {
    rows: grid.map((r) => r.join('')),
    palette: {
      O: INK,
      S: skin.base,
      s: skin.shade,
      B: '#ff9aa8',
      M: '#a23a4a',
      H: hair.base,
      h: hair.shade,
      P: p,
      p: shade(p),
      U: u,
      u: shade(u),
      T: theme.trim,
      L: theme.belt,
      K: theme.boots,
      k: shade(theme.boots),
      F: theme.fur ?? '#efe2c4',
      W: '#ffffff',
      J: j,
      j: shade(j, 0.8),
    },
  }
}

/** Anchor points used by wearables (same for both bodies). */
export const HUMAN_ANCHORS = {
  /** Top of the head (hats sit on row y, centred on cx). */
  head: { cx: 10, y: 3 },
  /** Hair-accessory spot (side of the head). */
  hairPin: { x: 14, y: 4 },
  /** Eye row (glasses, masks). */
  face: { y: 9 },
  /** Neck row (scarves). */
  neck: { y: 15 },
  /** Chest / torso rows. */
  torso: { y: 17 },
  /** Hands: left (x 4–5) and right (x 14–15) on row 23. */
  hands: { y: 23, left: 4, right: 14 },
  /** Feet row. */
  feet: { y: 28 },
  /** Back accessories peek out on both sides of the shoulders. */
  back: { y: 16 },
} as const
