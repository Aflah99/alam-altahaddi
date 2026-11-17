import type { CSSProperties, ReactNode } from 'react'
import { PixelSprite } from '../components/PixelSprite'
import type { SpriteDef } from './lobbySprites'

interface LobbyPlaceProps {
  area: string
  label: string
  sprite: SpriteDef
  onOpen: () => void
  /** Extra animated SVG content drawn over the sprite. */
  children?: ReactNode
}

/** A tappable building in the lobby, with a floating signboard above it. */
export function LobbyPlace({ area, label, sprite, onOpen, children }: LobbyPlaceProps) {
  return (
    <button
      type="button"
      className={`place place--${area}`}
      style={{ gridArea: area, '--w': sprite.rows[0].length } as CSSProperties}
      onClick={onOpen}
    >
      <span className="place__sign">{label}</span>
      <PixelSprite rows={sprite.rows} palette={sprite.palette} className="place__art">
        {children}
      </PixelSprite>
    </button>
  )
}
