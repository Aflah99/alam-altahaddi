import { PixelSprite, type Palette } from './PixelSprite'

/** Small static pixel-art sprites used around the UI. All original artwork. */

const INK = '#2a1d5c'

const HEART = [
  '.OO.OO.',
  'OWWOWPO',
  'OWWWWPO',
  '.OWWPO.',
  '..OPO..',
  '...O...',
] as const

export function PixelHeart({ className }: { className?: string }) {
  return <PixelSprite rows={HEART} palette={{ O: INK, W: '#ffffff', P: '#ff9ec0' }} className={className} />
}

const CLOUD = [
  '.......WWWW.........',
  '.....WWWWWWWW.WWW...',
  '..WWWWWWWWWWWWWWWW..',
  '.WWWWWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWWWWWW',
  '.SSSSSSSSSSSSSSSSSS.',
] as const

export function PixelCloud({ className }: { className?: string }) {
  return <PixelSprite rows={CLOUD} palette={{ W: '#ffffff', S: '#c4f3ff' }} className={className} />
}

const GEAR = [
  '....WWW....',
  '.WW.WWW.WW.',
  '.WWWWWWWWW.',
  '..WWWWWWW..',
  'WWWW...WWWW',
  'WWWW...WWWW',
  'WWWW...WWWW',
  '..WWWWWWW..',
  '.WWWWWWWWW.',
  '.WW.WWW.WW.',
  '....WWW....',
] as const

export function GearIcon({ className }: { className?: string }) {
  return <PixelSprite rows={GEAR} palette={{ W: '#ffffff' }} className={className} />
}

const FAMILY = [
  '..WWW......',
  '..WWW......',
  '..WWW...WW.',
  '........WW.',
  '.WWWWW.WWWW',
  '.WWWWW.WWWW',
  '.WWWWW.WWWW',
  '.WWWWW.WWWW',
  '.WWWWW.....',
  '.WWWWW.....',
] as const

export function FamilyIcon({ className }: { className?: string }) {
  return <PixelSprite rows={FAMILY} palette={{ W: '#ffffff' }} className={className} />
}

const MINI_SLIME = [
  '...OOOO...',
  '.OOGGGGOO.',
  'OGGGGGGLGO',
  'OGGEGGEGGO',
  'OGGGGGGGGO',
  'ODGGGGGGDO',
  '.OOOOOOOO.',
] as const

const SLIME_COLOURS: Record<'green' | 'pink' | 'blue', Palette> = {
  green: { O: INK, G: '#2fe04a', L: '#a6ff8f', D: '#14a84a', E: '#1a1a2e' },
  pink: { O: INK, G: '#ff7eb6', L: '#ffd0e4', D: '#d9468a', E: '#1a1a2e' },
  blue: { O: INK, G: '#4fb4ff', L: '#c2e8ff', D: '#2a78d4', E: '#1a1a2e' },
}

export function MiniSlime({ colour = 'green', className }: { colour?: keyof typeof SLIME_COLOURS; className?: string }) {
  return <PixelSprite rows={MINI_SLIME} palette={SLIME_COLOURS[colour]} className={className} />
}

/** Left-pointing play arrow (forward in RTL). */
const ARROW = ['...W', '..WW', '.WWW', 'WWWW', '.WWW', '..WW', '...W'] as const

export function PlayArrow({ className }: { className?: string }) {
  return <PixelSprite rows={ARROW} palette={{ W: '#ffffff' }} className={className} />
}
