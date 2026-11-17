/**
 * World coordinates: 1 unit = 1 sprite pixel (the same density as the characters).
 * x grows to the right; y is height above the ground (y = 0 is the ground surface).
 */

/** Axis-aligned box. (x, y) is the bottom-left corner. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface Body extends Box {
  vx: number
  vy: number
  onGround: boolean
  /** Seconds left in which a jump is still allowed after walking off a ledge. */
  coyote: number
  /** Seconds left in which an early jump press will still fire on landing. */
  jumpBuffer: number
  facing: 1 | -1
}

/** Merged keyboard + touch input. `jumpPressed` is an edge, consumed by the physics step. */
export interface InputState {
  left: boolean
  right: boolean
  jumpHeld: boolean
  jumpPressed: boolean
}

export interface StepEvents {
  jumped: boolean
  landed: boolean
}

export interface CollisionWorld {
  /** Level width; the playable area is 0 ≤ x ≤ width. */
  width: number
  /** Fully solid blocks (collide on every side). */
  solids: readonly Box[]
  /** One-way platforms: land on top, pass through from below. Only x, y (top) and w are used. */
  platforms: readonly Box[]
}

export function createInput(): InputState {
  return { left: false, right: false, jumpHeld: false, jumpPressed: false }
}

export function clearInput(input: InputState): void {
  input.left = false
  input.right = false
  input.jumpHeld = false
  input.jumpPressed = false
}
