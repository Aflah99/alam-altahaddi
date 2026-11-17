import { isSupported, moveX, moveY } from './collision'
import type { Body, CollisionWorld, InputState, StepEvents } from './types'

/** Tuned for gentle, predictable exploration (world units per second). */
export const PHYSICS = {
  walkSpeed: 72,
  groundAccel: 720,
  groundDecel: 960,
  airAccel: 520,
  gravity: 560,
  /** v² / 2g ≈ 43 units: about twice the tallest character. */
  jumpSpeed: 220,
  /** Releasing jump early cuts the rise for a shorter hop. */
  jumpCut: 0.5,
  maxFall: 320,
  coyoteTime: 0.1,
  jumpBufferTime: 0.12,
} as const

/** The fixed simulation step (seconds). */
export const STEP = 1 / 60

export function createBody(x: number, w: number, h: number): Body {
  return { x, y: 0, w, h, vx: 0, vy: 0, onGround: true, coyote: 0, jumpBuffer: 0, facing: -1 }
}

function approach(value: number, target: number, delta: number): number {
  return value < target ? Math.min(value + delta, target) : Math.max(value - delta, target)
}

/** Advances the body by one fixed step. Mutates `body` and consumes `input.jumpPressed`. */
export function stepBody(body: Body, input: InputState, world: CollisionWorld, dt: number = STEP): StepEvents {
  const events: StepEvents = { jumped: false, landed: false }
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0)

  // Horizontal velocity
  const target = dir * PHYSICS.walkSpeed
  const rate = body.onGround ? (dir !== 0 ? PHYSICS.groundAccel : PHYSICS.groundDecel) : PHYSICS.airAccel
  body.vx = approach(body.vx, target, rate * dt)
  if (dir !== 0) body.facing = dir as 1 | -1

  // Jump timing helpers
  if (input.jumpPressed) body.jumpBuffer = PHYSICS.jumpBufferTime
  input.jumpPressed = false
  body.coyote = body.onGround ? PHYSICS.coyoteTime : Math.max(0, body.coyote - dt)
  body.jumpBuffer = Math.max(0, body.jumpBuffer - dt)

  if (body.jumpBuffer > 0 && body.coyote > 0) {
    body.vy = PHYSICS.jumpSpeed
    body.onGround = false
    body.coyote = 0
    body.jumpBuffer = 0
    events.jumped = true
  }

  // Variable jump height + gravity
  if (!input.jumpHeld && body.vy > 0) body.vy *= 1 - (1 - PHYSICS.jumpCut) * Math.min(1, dt * 20)
  body.vy = Math.max(body.vy - PHYSICS.gravity * dt, -PHYSICS.maxFall)

  moveX(body, body.vx * dt, world)
  const wasOnGround = body.onGround
  const grounded = moveY(body, body.vy * dt, world)
  body.onGround = grounded || (body.vy <= 0 && isSupported(body, world))
  if (body.onGround && body.vy < 0) body.vy = 0
  if (body.onGround && !wasOnGround && !events.jumped) events.landed = true

  return events
}

/** Runs as many fixed steps as fit in `elapsed`, carrying the remainder. */
export class FixedStepper {
  private acc = 0
  /** Frames longer than this (tab switch, debugger) are clamped to avoid big jumps. */
  static readonly MAX_FRAME = 0.1

  advance(elapsed: number, step: () => void): number {
    this.acc += Math.min(Math.max(elapsed, 0), FixedStepper.MAX_FRAME)
    let steps = 0
    while (this.acc >= STEP) {
      step()
      this.acc -= STEP
      steps++
    }
    return steps
  }

  /** How far we are between the last step and the next (0–1), for smooth rendering. */
  alpha(): number {
    return this.acc / STEP
  }

  reset(): void {
    this.acc = 0
  }
}
