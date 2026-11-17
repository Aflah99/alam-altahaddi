import type { ReactNode } from 'react'
import { pixelRects, type Palette } from './pixelRects'

export type { Palette }

interface PixelSpriteProps {
  rows: readonly string[]
  palette: Palette
  className?: string
  /** Accessible label. Omit for purely decorative sprites. */
  label?: string
  /** Extra SVG content drawn on top (e.g. animated parts). */
  children?: ReactNode
}

/** Renders a tiny pixel-art sprite as a crisp, scalable SVG. */
export function PixelSprite({ rows, palette, className, label, children }: PixelSpriteProps) {
  const height = rows.length
  const width = rows[0]?.length ?? 0

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      style={{ aspectRatio: `${width} / ${height}` }}
      shapeRendering="crispEdges"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {pixelRects(rows, palette)}
      {children}
    </svg>
  )
}
