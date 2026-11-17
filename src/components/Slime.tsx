import { PixelSprite } from './PixelSprite'

const SLIME = [
  '......OOOOOO......',
  '....OOGGGGGGOO....',
  '...OGGGGGGGGLWGO..',
  '..OGGGGGGGGGGLLGO.',
  '.OGGGGGGGGGGGGLGO.',
  '.OGGGGEGGGGEGGGGO.',
  '.OGGGGEGGGGEGGGGO.',
  'ODGGGPGGGGGGPGGGGO',
  'ODGGGGGGGGGGGGGGDO',
  'OBDGGGGGGGGGGGGDBO',
  'OBBDDGGGGGGGGDDBBO',
  '.OBBBBBBBBBBBBBBO.',
  '..OOOOOOOOOOOOOO..',
] as const

const PALETTE = {
  O: '#2a1d5c', // outline
  G: '#2fe04a', // body
  L: '#a6ff8f', // shine
  W: '#ffffff', // highlight
  D: '#14a84a', // shade
  B: '#2f9aa6', // underside
  E: '#1a1a2e', // eyes
  P: '#ff8fb1', // cheeks
}

export function Slime({ className }: { className?: string }) {
  return <PixelSprite rows={SLIME} palette={PALETTE} className={className} label="شخصية سلايم خضراء" />
}
