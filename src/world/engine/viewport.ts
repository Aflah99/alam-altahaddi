/**
 * Maps the logical world onto the screen. The ground line sits just above the
 * touch controls; the scale shows at least VIEW_MIN_W units across (portrait)
 * and VIEW_ABOVE units of sky above the ground (landscape).
 */
export interface ViewportLayout {
  /** Screen pixels per world unit. */
  scale: number
  /** Visible world width in units. */
  viewW: number
  /** Distance from the bottom of the screen to the ground line, in px. */
  groundBottom: number
  /** Height reserved for the touch controls, in px. */
  controlsH: number
  landscape: boolean
}

export const VIEW_ABOVE = 104
export const VIEW_MIN_W = 124
const TOP_BAR = 60

export function computeViewport(width: number, height: number, safeBottom = 0): ViewportLayout {
  const landscape = width > height * 1.15
  const controlsH = Math.round(
    (landscape ? Math.min(Math.max(height * 0.24, 96), 160) : Math.min(Math.max(height * 0.22, 128), 200)) + safeBottom,
  )
  const above = Math.max(height - controlsH - TOP_BAR, 80)
  const scale = Math.max(1, Math.min(above / VIEW_ABOVE, width / VIEW_MIN_W))
  return { scale, viewW: width / scale, groundBottom: controlsH, controlsH, landscape }
}
