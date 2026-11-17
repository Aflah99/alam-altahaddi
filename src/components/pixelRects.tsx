import type { ReactNode } from 'react'

export type Palette = Record<string, string>

/**
 * Turns a character map into SVG rects. Each character is looked up in
 * `palette`; unknown characters are transparent. Horizontal runs of the
 * same colour are merged to keep the DOM small.
 */
export function pixelRects(rows: readonly string[], palette: Palette): ReactNode[] {
  const rects: ReactNode[] = []
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const ch = row[x]
      let run = 1
      while (x + run < row.length && row[x + run] === ch) run++
      const fill = palette[ch]
      if (fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={run} height={1} fill={fill} />)
      x += run
    }
  })
  return rects
}
