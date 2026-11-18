/**
 * Playable characters. All artwork is original.
 *
 * Every sprite is a character map drawn at the same pixel density, so the
 * characters stay consistent with each other at any on-screen size. Eyes are
 * listed separately (as 1×2 columns) so the shared sprite system can make any
 * character blink, glance around and switch to a happy ^ ^ face.
 */

export type CharacterId = 'green-slime' | 'blue-slime' | 'little-robot' | 'fox' | 'owl' | 'turtle'

export interface CharacterDef {
  id: CharacterId
  name: string
  description: string
  rows: readonly string[]
  palette: Readonly<Record<string, string>>
  /** Top pixel of each 1×2 eye: [x, y]. */
  eyes: readonly (readonly [number, number])[]
  eyeColor: string
}

const INK = '#2a1d5c'
const EYE = '#1a1a2e'

/** Paints `sprite` onto `base` at (x, y), filling only transparent cells (so it sits behind). */
function behind(base: readonly string[], sprite: readonly string[], x: number, y: number): string[] {
  return base.map((row, ry) => {
    const s = sprite[ry - y]
    if (s === undefined) return row
    return [...row].map((ch, rx) => (ch === '.' && s[rx - x] !== undefined && s[rx - x] !== '.' ? s[rx - x] : ch)).join('')
  })
}

const GREEN_SLIME: CharacterDef = {
  id: 'green-slime',
  name: 'سلايم الأخضر',
  description: 'هادئ ولطيف، يحب القفز فوق العشب ويتعلّم خطوة بخطوة.',
  rows: [
    '......OOOOOO......',
    '....OOGGGGGGOO....',
    '...OGGGGGGGGLWGO..',
    '..OGGGGGGGGGGLLGO.',
    '.OGGGGGGGGGGGGLGO.',
    '.OGGGGGGGGGGGGGGO.',
    '.OGGGGGGGGGGGGGGO.',
    'ODGGGPGGGGGGPGGGGO',
    'ODGGGGGGGGGGGGGGDO',
    'OBDGGGGGGGGGGGGDBO',
    'OBBDDGGGGGGGGDDBBO',
    '.OBBBBBBBBBBBBBBO.',
    '..OOOOOOOOOOOOOO..',
  ],
  palette: { O: INK, G: '#2fe04a', L: '#a6ff8f', W: '#ffffff', D: '#14a84a', B: '#2f9aa6', P: '#ff8fb1' },
  eyes: [
    [6, 5],
    [11, 5],
  ],
  eyeColor: EYE,
}

const BLUE_SLIME: CharacterDef = {
  id: 'blue-slime',
  name: 'سلايم الأزرق',
  description: 'مبتسم دائمًا ومليء بالحماس، يحوّل كل سؤال صعب إلى مغامرة.',
  rows: [
    '.......OO.......',
    '......OWBO......',
    '.....OLBBBO.....',
    '....OLBBBBBO....',
    '...OLBBBBBBBO...',
    '..OLBBBBBBBBBO..',
    '..OBBBBBBBBBBO..',
    '.OBBBBBBBBBBBBO.',
    '.OBBBBBBBBBBBBO.',
    'OBBPBBMBBMBBPBBO',
    'OBBBBBBMMBBBBBBO',
    'ODBBBBBBBBBBBBDO',
    'ODDBBBBBBBBBBDDO',
    '.ODDDDDDDDDDDDO.',
    '..OOOOOOOOOOOO..',
  ],
  palette: { O: INK, B: '#4fb4ff', L: '#c2e8ff', W: '#ffffff', D: '#2a78d4', M: INK, P: '#ff8fb1' },
  eyes: [
    [5, 6],
    [10, 6],
  ],
  eyeColor: EYE,
}

const LITTLE_ROBOT: CharacterDef = {
  id: 'little-robot',
  name: 'الروبوت الصغير',
  description: 'مساعد ذكي بشاشة مبتسمة، يحب الأرقام وحلّ الألغاز.',
  rows: [
    '......OOOO......',
    '......OYYO......',
    '......OOOO......',
    '.......OO.......',
    '..OOOOOOOOOOOO..',
    '.OAAAAAAAAAAAAO.',
    '.OAKKKKKKKKKKAO.',
    'OOAKKKKKKKKKKAOO',
    'OGAKKKKKKKKKKAGO',
    'OOAKKCKKKKCKKAOO',
    '.OAKKKCCCCKKKAO.',
    '.ORRRRRRRRRRRRO.',
    '..OOOOOOOOOOOO..',
    'OO.OAAAAAAAAO.OO',
    'OAOOAYAAAAAAOOAO',
    'OAOOAAAAAAAAOOAO',
    '.O.ORRRRRRRRO.O.',
    '...OOOO..OOOO...',
    '...OGGO..OGGO...',
    '...OOOO..OOOO...',
  ],
  palette: { O: INK, Y: '#ffe14d', A: '#ff9a3c', R: '#d9661c', K: '#1d2a4a', G: '#b8bfd9', C: '#5ae9fb' },
  eyes: [
    [5, 6],
    [10, 6],
  ],
  eyeColor: '#5ae9fb',
}

const FOX_BODY = [
  '.OO..........OO...',
  '.OFO........OFO...',
  '.OFFO......OFFO...',
  '.OFPFOOOOOOFPFO...',
  '.OFFFFFFFFFFFFO...',
  'OFFHFFFFFFFFFFFO..',
  'OFFFFFFFFFFFFFFO..',
  'OFFFFFFFFFFFFFFO..',
  'OFWWWWFFFFWWWWFO..',
  'OWWWWWWNNWWWWWWO..',
  '.OWWWWWWWWWWWWO...',
  '..OOWWWWWWWWOO....',
  '...OGGGGGGGGO.....',
  '..OFgGGGGGGgFO....',
  '..OFFWWWWWWFFO....',
  '..OSFFWWWWFFSO....',
  '...OSSOOOOSSO.....',
  '...OSSO..OSSO.....',
  '...OOOO..OOOO.....',
]

const FOX_TAIL = ['.OO.', 'OTTO', 'OFTO', 'OFFO', 'OFFO', 'OFO.', 'OO..']

const FOX: CharacterDef = {
  id: 'fox',
  name: 'الثعلب المغامر',
  description: 'فضولي وسريع، يحمل وشاحه الأخضر ويبحث عن كنوز المعرفة.',
  rows: behind(FOX_BODY, FOX_TAIL, 14, 10),
  palette: {
    O: INK,
    F: '#ff8a2a',
    H: '#ffc27a',
    S: '#c9561a',
    P: '#ff9ec0',
    W: '#fff4e6',
    T: '#ffffff',
    N: INK,
    G: '#2fe04a',
    g: '#16b13e',
  },
  eyes: [
    [4, 6],
    [11, 6],
  ],
  eyeColor: EYE,
}

const OWL: CharacterDef = {
  id: 'owl',
  name: 'البومة الحكيمة',
  description: 'تسهر على كتبها وتحب الأسئلة الصعبة، وتشجّع أصدقاءها على التفكير.',
  rows: [
    '.OO..........OO.',
    '.OBO........OBO.',
    '.OBBOOOOOOOOBBO.',
    'OBBBBBBBBBBBBBBO',
    'OBWWWWBBBBWWWWBO',
    'OWWWWWWBBWWWWWWO',
    'OWWWWWWBBWWWWWWO',
    'OWWWWWWBBWWWWWWO',
    'OBWWWWBYYBWWWWBO',
    'OBBBBBBYYBBBBBBO',
    'OBBLLLLLLLLLLBBO',
    'OBLLDLLDLLDLLLBO',
    'OBLLLLLLLLLLLLBO',
    '.OBLLDLLDLLDLBO.',
    '..OBBBBBBBBBBO..',
    '...OYYO..OYYO...',
    '...OOOO..OOOO...',
  ],
  palette: { O: INK, B: '#8a5a3b', W: '#fff4e6', Y: '#ffb020', L: '#e8c9a0', D: '#b98b62' },
  eyes: [
    [4, 5],
    [11, 5],
  ],
  eyeColor: EYE,
}

const TURTLE: CharacterDef = {
  id: 'turtle',
  name: 'السلحفاة الصبورة',
  description: 'لا تستعجل أبدًا؛ تقرأ السؤال بتأنٍّ وتصل إلى الجواب الصحيح.',
  rows: [
    '......OOOOOO......',
    '.....OGGGGGGO.....',
    '....OGGGGGGGGO....',
    '....OGGGGGGGGO....',
    '....OGGGGGGGGO....',
    '.....OGGPPGGO.....',
    '...OOOOOOOOOOOO...',
    '..OSSHSSSSSSHSSO..',
    '.OSHHHSSSSSSHHHSO.',
    'OGOSSSSHHHHSSSSOGO',
    'OGOSSSSHHHHSSSSOGO',
    '.OOSSHSSSSSSHSSOO.',
    '..OYYYYYYYYYYYYO..',
    '..OGGO......OGGO..',
    '..OOOO......OOOO..',
  ],
  palette: { O: INK, G: '#6fd36a', S: '#3f8f4a', H: '#2f6b3a', Y: '#f2d68a', P: '#ff9ec0' },
  eyes: [
    [7, 2],
    [10, 2],
  ],
  eyeColor: EYE,
}

/** Every character, including those unlocked in the shop. */
export const ROSTER: readonly CharacterDef[] = [GREEN_SLIME, BLUE_SLIME, LITTLE_ROBOT, FOX, OWL, TURTLE]

/** The original four characters: always available to every player, never locked. */
export const BASE_CHARACTER_IDS: readonly CharacterId[] = ['green-slime', 'blue-slime', 'little-robot', 'fox']

export function getCharacter(id: CharacterId): CharacterDef {
  return ROSTER.find((c) => c.id === id) ?? GREEN_SLIME
}

export function isCharacterId(value: unknown): value is CharacterId {
  return ROSTER.some((c) => c.id === value)
}
