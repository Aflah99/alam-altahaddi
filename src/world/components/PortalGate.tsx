import type { CSSProperties } from 'react'
import { PixelSprite } from '../../components/PixelSprite'
import { pixelRects } from '../../components/pixelRects'
import { PORTAL, PORTAL_SWIRL } from '../../lobby/lobbySprites'

interface PortalGateProps {
  x: number
  title: string
  near: boolean
  onEnter: () => void
}

/**
 * The subject portal in the world. It can be entered by walking up to it and
 * pressing the interact control, or by tapping/clicking it directly (an
 * accessible shortcut that needs no precise movement).
 */
export function PortalGate({ x, title, near, onEnter }: PortalGateProps) {
  return (
    <button
      type="button"
      className={`wobj wportal${near ? ' wportal--near' : ''}`}
      style={{ '--x': x, '--y': 0, '--w': PORTAL.rows[0].length } as CSSProperties}
      onClick={onEnter}
      aria-label={`بوابة ${title} — ادخل لاختيار الفصل`}
    >
      <span className="wportal__glow" aria-hidden="true" />
      <PixelSprite rows={PORTAL.rows} palette={PORTAL.palette} className="wportal__art">
        <g className="portal-swirl">{pixelRects(PORTAL_SWIRL.rows, PORTAL_SWIRL.palette)}</g>
      </PixelSprite>
      <span className="wportal__label" aria-hidden="true">
        {title}
      </span>
      {near && (
        <span className="wportal__prompt" role="status">
          اضغط للدخول
        </span>
      )}
    </button>
  )
}
