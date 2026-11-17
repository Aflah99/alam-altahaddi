type Palette = Record<string, string>

interface PixelSpriteProps {
  /** Rows of equal length; each character is looked up in `palette`. Unknown characters are transparent. */
  rows: readonly string[]
  palette: Palette
  className?: string
  /** Accessible label. Omit for purely decorative sprites. */
  label?: string
}

/** Renders a tiny pixel-art sprite as a crisp, scalable SVG. */
export function PixelSprite({ rows, palette, className, label }: PixelSpriteProps) {
  const height = rows.length
  const width = rows[0]?.length ?? 0

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) =>
          palette[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={palette[ch]} /> : null,
        ),
      )}
    </svg>
  )
}
