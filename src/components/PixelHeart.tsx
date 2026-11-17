import { PixelSprite } from './PixelSprite'

const HEART = ['.HH.HH.', 'HWHHHHH', 'HHHHHHH', '.HHHHH.', '..HHH..', '...H...'] as const

export function PixelHeart({ className }: { className?: string }) {
  return <PixelSprite rows={HEART} palette={{ H: '#ffffff', W: '#ffd6e4' }} className={className} />
}
