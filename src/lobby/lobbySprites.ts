/** Original pixel-art for the player lobby (same pixel density as the characters). */

const INK = '#2a1d5c'

export interface SpriteDef {
  rows: readonly string[]
  palette: Readonly<Record<string, string>>
}

/** Mirrors the cells that use `chars` inside columns x0..x1 of each row; everything else becomes transparent. */
function mirroredRegion(rows: readonly string[], x0: number, x1: number, chars: string): string[] {
  return rows.map((row) =>
    [...row]
      .map((ch, x) => {
        if (x < x0 || x > x1 || !chars.includes(ch)) return '.'
        const m = row[x0 + x1 - x]
        return chars.includes(m) ? m : '.'
      })
      .join(''),
  )
}

/* ---------- Adventure-map portal ---------- */
const PORTAL_ROWS = [
  '.......OOOOOO.......',
  '.....OOllGGGGOO.....',
  '....OlGGGGGGGGgO....',
  '...OlGGOOOOOOGGgO...',
  '..OlGGOVVVVVVOGGgO..',
  '..OGGOVvVVVVCVOGgO..',
  '.OlGOVVVCCVVVVVOGgO.',
  '.OGGOVvVCwCVVVVOGgO.',
  '.OGGOVVVCCVVvVVOGgO.',
  '.OlGOVVVVVVVVVVOGgO.',
  '.OGGOVVCVVVVVVVOGgO.',
  '.OGGOVVVVVvVVCVOGgO.',
  '.OlGOVVvVVVVVVVOGgO.',
  '.OGGOVVVVVCVVVVOGgO.',
  '.OGGOVVVVVVVVvVOGgO.',
  '.OlGOVCVVVVVVVVOGgO.',
  '.OGGOVVVVVVVVVVOGgO.',
  '.OGGOVVVvVVVVCVOGgO.',
  'OOOOOOOOOOOOOOOOOOOO',
  'OllGGGGGGGGGGGGGGggO',
  'OGGGGGGGGGGGGGGGGggO',
  'OOOOOOOOOOOOOOOOOOOO',
]

const PORTAL_PALETTE = {
  O: INK,
  G: '#8d8fb3',
  g: '#5c5e86',
  l: '#c3c6e6',
  V: '#7c4dff',
  v: '#c4b5fd',
  C: '#5ae9fb',
  w: '#ffffff',
}

export const PORTAL: SpriteDef = { rows: PORTAL_ROWS, palette: PORTAL_PALETTE }
/** Second animation frame for the swirling portal (mirror image of the inside). */
export const PORTAL_SWIRL: SpriteDef = { rows: mirroredRegion(PORTAL_ROWS, 5, 14, 'VvCw'), palette: PORTAL_PALETTE }

/* ---------- Wardrobe (customisation) ---------- */
export const WARDROBE: SpriteDef = {
  rows: [
    '.....OOOOOOO.....',
    '....OLLLLLLLO....',
    '...OLWWWWWWWwO...',
    '.OOOOOOOOOOOOOOO.',
    '.OLWWWWWOLWWWWWO.',
    '.OLWWWWWOLWWWWWO.',
    '.OLSSWSSOLWWWWWO.',
    '.OLSSSSSOLWWWWWO.',
    '.OLWSSSWOLWWWWWO.',
    '.OLWSSSWOLWWWWWO.',
    '.OLWWWWKOKWWWWWO.',
    '.OLWWWWWOLWWWWWO.',
    '.OLWWWWWOLWWWWWO.',
    '.OLWWWWWOLWWWWWO.',
    '.OLwwwwwOLwwwwwO.',
    '.OOOOOOOOOOOOOOO.',
    '.OwO.........OwO.',
    '.OOO.........OOO.',
  ],
  palette: { O: INK, W: '#c8742f', w: '#8a4a1c', L: '#e8a35a', K: '#ffd23f', S: '#ff7eb6' },
}

/* ---------- Market stall (shop) ---------- */
function buildStall(): string[] {
  const W = 22
  const stripe = (i: number) => (Math.floor(i / 4) % 2 === 0 ? 'R' : 'Z')
  const rows: string[] = []
  rows.push('.' + 'O'.repeat(W - 2) + '.')
  for (let r = 0; r < 3; r++) rows.push('O' + Array.from({ length: 20 }, (_, i) => stripe(i)).join('') + 'O')
  rows.push('O' + [0, 1, 2, 3, 4].map((s) => 'O' + stripe(s * 4) + stripe(s * 4) + 'O').join('') + 'O')
  rows.push('.' + '.OO.'.repeat(5) + '.')
  rows.push('..OwO' + 'b'.repeat(12) + 'OwO..')
  rows.push('..OwO' + 'bAbbJJbbAbJb' + 'OwO..')
  rows.push('..OwO' + 'bAbbJJbbAbJb' + 'OwO..')
  rows.push('..OwO' + 'O'.repeat(12) + 'OwO..')
  rows.push('..OwO' + 'bbbbbbbbbbbb' + 'OwO..')
  rows.push('..OwO' + 'bbbbbbbbbbbb' + 'OwO..')
  rows.push('O'.repeat(W))
  rows.push('OL' + 'W'.repeat(18) + 'wO')
  rows.push('OL' + 'WWWWWWSSSSSSWWWWWW' + 'wO')
  rows.push('OL' + 'WWWWWWSSSSSSWWWWWW' + 'wO')
  rows.push('OL' + 'w'.repeat(18) + 'wO')
  rows.push('O'.repeat(W))
  return rows
}

export const STALL: SpriteDef = {
  rows: buildStall(),
  palette: {
    O: INK,
    R: '#ff4d6d',
    Z: '#ffffff',
    W: '#c8742f',
    w: '#8a4a1c',
    L: '#e8a35a',
    b: '#5a2e14',
    A: '#ff4d4d',
    J: '#5ae9fb',
    S: '#fff4d6',
  },
}
/* ---------- Podium with trophy (leaderboard) ---------- */
function buildPodium(): string[] {
  const W = 22
  const trophy = ['OOOOOOOO', 'OYWYYYyO', 'OYYYYYyO', '.OYYYyO.', '..OYyO..', '...OO...', '..OYYO..', '.OOOOOO.']
  const H = 8 + 11
  const rows = Array.from({ length: H }, () => Array<string>(W).fill('.'))
  trophy.forEach((t, y) => [...t].forEach((c, x) => (rows[y][7 + x] = c)))
  const block = (x0: number, x1: number, top: number, fill: string, shade: string) => {
    for (let y = top; y < H; y++)
      for (let x = x0; x <= x1; x++) {
        const edge = y === top || y === H - 1 || x === x0 || x === x1
        rows[y][x] = edge ? 'O' : x === x1 - 1 || y === H - 2 ? shade : fill
      }
  }
  block(0, 7, H - 8, 'G', 'g') // second place
  block(14, 21, H - 6, 'B', 'b') // third place
  block(7, 14, H - 11, 'Y', 'y') // first place (drawn last so it overlaps)
  // a star on the winner's block
  const star = ['.S.', 'SSS', '.S.']
  star.forEach((s, y) => [...s].forEach((c, x) => c !== '.' && (rows[H - 8 + y][9 + x] = c)))
  return rows.map((r) => r.join(''))
}

export const PODIUM: SpriteDef = {
  rows: buildPodium(),
  palette: {
    O: INK,
    Y: '#ffd23f',
    y: '#e0a000',
    W: '#ffffff',
    G: '#d4daf0',
    g: '#9aa3c7',
    B: '#e08a4a',
    b: '#b0602a',
    S: '#ffffff',
  },
}

/* ---------- Scenery ---------- */
export const TREE: SpriteDef = {
  rows: [
    '...OOOOOO...',
    '.OOLLGGGGOO.',
    'OLLGGGGGGGgO',
    'OLGGGGGGGGgO',
    'OGGGGGLGGGgO',
    'OGGGGGGGGggO',
    'OGGLGGGGGGgO',
    '.OGGGGGGGgO.',
    '.OggGGGGggO.',
    '..OOOttOOO..',
    '....OtTO....',
    '....OtTO....',
    '....OtTO....',
    '...OOtTOO...',
  ],
  palette: { O: INK, G: '#2fe04a', L: '#a6ff8f', g: '#16b13e', t: '#8a4a1c', T: '#c8742f' },
}

export const BUSH: SpriteDef = {
  rows: ['..OOOOOO..', '.OLGGGGgO.', 'OLGGGGGGgO', 'OGGGGGGggO', 'OOOOOOOOOO'],
  palette: { O: INK, G: '#2fe04a', L: '#a6ff8f', g: '#16b13e' },
}

/** غرف التحدّي — a small arena tower with two pennants (original pixel art). */
export const ARENA: SpriteDef = {
  rows: [
    '...R..........B.....',
    '...RR.........BB....',
    '...RRR........BBB...',
    '...O..........O.....',
    '.OOOOO.OOOO..OOOOO..',
    '.OSSSO.OSSO..OSSSO..',
    '.OSsSOOOSSOOOOSsSO..',
    '.OSSSSSSSSSSSSSSSO..',
    '.OSsSSSSYYYYSSSsSO..',
    '.OSSSSSYYGGYYSSSSO..',
    '.OSSSSSYGGGGYSSSSO..',
    '.OSsSSSYGGGGYSSsSO..',
    '.OSSSSSYGGGGYSSSSO..',
    '.OSSSSSYGGGGYSSSSO..',
    '.OOOOOOOOOOOOOOOOO..',
  ],
  palette: { O: INK, S: '#c9cfe6', s: '#9aa3c7', Y: '#ffd23f', G: '#3b2d7a', R: '#ff5d5d', B: '#4fb4ff' },
}
