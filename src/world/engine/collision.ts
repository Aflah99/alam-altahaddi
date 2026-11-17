import type { Body, Box, CollisionWorld } from './types'

const EPS = 0.001

const overlapsX = (a: Box, b: Box) => a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS
const overlapsY = (a: Box, b: Box) => a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS

/**
 * Moves the body horizontally by dx, stopping at solids and the level bounds.
 * Returns true if it hit something.
 */
export function moveX(body: Body, dx: number, world: CollisionWorld): boolean {
  let hit = false
  body.x += dx
  for (const s of world.solids) {
    if (!overlapsY(body, s) || !overlapsX(body, s)) continue
    if (dx > 0) body.x = s.x - body.w
    else if (dx < 0) body.x = s.x + s.w
    hit = true
  }
  if (body.x < 0) {
    body.x = 0
    hit = true
  } else if (body.x + body.w > world.width) {
    body.x = world.width - body.w
    hit = true
  }
  if (hit) body.vx = 0
  return hit
}

/**
 * Moves the body vertically by dy. Lands on the ground, on top of solids and
 * on one-way platforms (only while falling onto them); bumps heads on solids.
 * Returns true if the body is standing on something after the move.
 */
export function moveY(body: Body, dy: number, world: CollisionWorld): boolean {
  const prevBottom = body.y
  const prevTop = body.y + body.h
  body.y += dy
  let grounded = false

  for (const s of world.solids) {
    if (!overlapsX(body, s) || !overlapsY(body, s)) continue
    const top = s.y + s.h
    if (dy <= 0 && prevBottom >= top - EPS) {
      body.y = top
      grounded = true
    } else if (dy > 0 && prevTop <= s.y + EPS) {
      body.y = s.y - body.h
    }
    body.vy = 0
  }

  if (dy <= 0) {
    for (const p of world.platforms) {
      if (!overlapsX(body, p)) continue
      if (prevBottom >= p.y - EPS && body.y <= p.y) {
        body.y = p.y
        body.vy = 0
        grounded = true
      }
    }
  }

  if (body.y <= 0) {
    body.y = 0
    body.vy = 0
    grounded = true
  }
  return grounded
}

/** True if the body is resting on the ground, a solid or a platform (probe 1 unit down). */
export function isSupported(body: Body, world: CollisionWorld): boolean {
  if (body.y <= EPS) return true
  const feet: Box = { x: body.x, y: body.y - 1, w: body.w, h: 1 }
  return (
    world.solids.some((s) => overlapsX(feet, s) && Math.abs(s.y + s.h - body.y) < 0.01) ||
    world.platforms.some((p) => overlapsX(feet, p) && Math.abs(p.y - body.y) < 0.01)
  )
}
