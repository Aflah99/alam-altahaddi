import { PixelSprite } from './PixelSprite'

const CLOUD = [
  '.....WWWW.......',
  '...WWWWWWWW.WW..',
  '.WWWWWWWWWWWWWW.',
  'WWWWWWWWWWWWWWWW',
  '.SSSSSSSSSSSSSS.',
] as const

export function PixelCloud({ className }: { className?: string }) {
  return <PixelSprite rows={CLOUD} palette={{ W: '#ffffff', S: '#c9f6ff' }} className={className} />
}
