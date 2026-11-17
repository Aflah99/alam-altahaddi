/**
 * Horizontal follow camera with a dead zone and restrained smoothing.
 * Units are world units; `x` is the left edge of the view.
 */
export interface Camera {
  x: number
}

/** The player may roam the middle part of the view before the camera moves. */
export const DEAD_ZONE = { from: 0.36, to: 0.64 }
/** Higher = snappier. 6/s gives smooth, non-disorienting follow. */
export const CAMERA_STIFFNESS = 6

export function clampCamera(x: number, viewW: number, levelW: number): number {
  if (levelW <= viewW) return (levelW - viewW) / 2
  return Math.min(Math.max(x, 0), levelW - viewW)
}

/** The camera position that keeps `targetX` inside the dead zone. */
export function desiredCameraX(camX: number, targetX: number, viewW: number, levelW: number): number {
  let x = camX
  const left = camX + viewW * DEAD_ZONE.from
  const right = camX + viewW * DEAD_ZONE.to
  if (targetX < left) x = targetX - viewW * DEAD_ZONE.from
  else if (targetX > right) x = targetX - viewW * DEAD_ZONE.to
  return clampCamera(x, viewW, levelW)
}

export function updateCamera(cam: Camera, targetX: number, viewW: number, levelW: number, dt: number): void {
  const desired = desiredCameraX(cam.x, targetX, viewW, levelW)
  const t = 1 - Math.exp(-CAMERA_STIFFNESS * dt)
  cam.x = clampCamera(cam.x + (desired - cam.x) * t, viewW, levelW)
}

/** Centres the view on `targetX` immediately (spawn, reset, resize). */
export function snapCamera(cam: Camera, targetX: number, viewW: number, levelW: number): void {
  cam.x = clampCamera(targetX - viewW / 2, viewW, levelW)
}
