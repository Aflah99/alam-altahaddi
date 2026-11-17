import type { SpriteDef } from '../lobby/lobbySprites'

/** Small original decorations for the adventure world. */
const INK = '#2a1d5c'

export const FLOWER: SpriteDef = {
  rows: ['.PP.', 'PYYP', '.PP.', '.g..', 'gg..', '.g..'],
  palette: { P: '#ff7eb6', Y: '#ffe14d', g: '#16b13e' },
}

export const FLOWER_BLUE: SpriteDef = {
  rows: ['.BB.', 'BWWB', '.BB.', '..g.', '..gg', '..g.'],
  palette: { B: '#6ec3ff', W: '#ffffff', g: '#16b13e' },
}

export const ROCK: SpriteDef = {
  rows: ['..OOOO..', '.OLLGGO.', 'OLGGGGgO', 'OGGGGggO', 'OOOOOOOO'],
  palette: { O: INK, L: '#d4daf0', G: '#a3abcc', g: '#7c84a8' },
}

/** Wooden signpost pointing left (towards the portal). */
export const SIGNPOST: SpriteDef = {
  rows: [
    '...OOOOOOOOOO.',
    '..OLLLLLLLLLWO',
    '.OLWWWWWWWWWWO',
    'OLWWAWWWWWWWwO',
    '.OwwwwwwwwwwwO',
    '..OOOOOOOOOOO.',
    '.......OwO....',
    '.......OwO....',
    '.......OwO....',
    '......OOwOO...',
  ],
  palette: { O: INK, L: '#e8a35a', W: '#c8742f', w: '#8a4a1c', A: '#2a1d5c' },
}

/** Lock for regions that are not available yet. */
export const LOCK: SpriteDef = {
  rows: ['..OOOO..', '.O....O.', '.O....O.', 'OOOOOOOO', 'OYYYYYYO', 'OYYOOYYO', 'OYYYYYYO', 'OOOOOOOO'],
  palette: { O: INK, Y: '#ffd23f' },
}
