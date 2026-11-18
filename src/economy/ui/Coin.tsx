import { PixelSprite } from '../../components/PixelSprite'
import { ar } from '../../quiz/format'
import { COIN } from './coinArt'
import './economy.css'


export function Coin({ className = '', spin = false }: { className?: string; spin?: boolean }) {
  return <PixelSprite rows={COIN.rows} palette={COIN.palette} className={`coin${spin ? ' coin--spin' : ''} ${className}`} />
}

/** «١٢٠ عملة» with the coin icon. */
export function CoinAmount({ value, className = '', label = 'عملة' }: { value: number; className?: string; label?: string }) {
  return (
    <span className={`coin-amount ${className}`} aria-label={`${ar(value)} ${label}`}>
      <Coin />
      <span aria-hidden="true">{ar(value)}</span>
    </span>
  )
}
