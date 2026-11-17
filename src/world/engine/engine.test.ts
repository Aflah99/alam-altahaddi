import { describe, expect, it } from 'vitest'
import { DEAD_ZONE, clampCamera, desiredCameraX, snapCamera, updateCamera } from './camera'
import { FixedStepper, PHYSICS, STEP, createBody, stepBody } from './physics'
import { createInput, type CollisionWorld, type InputState } from './types'
import { computeViewport } from './viewport'

const flat: CollisionWorld = { width: 400, solids: [], platforms: [] }

function run(body: ReturnType<typeof createBody>, input: InputState, world: CollisionWorld, seconds: number) {
  const events = { jumped: 0, landed: 0 }
  for (let t = 0; t < seconds; t += STEP) {
    const e = stepBody(body, input, world)
    if (e.jumped) events.jumped++
    if (e.landed) events.landed++
  }
  return events
}

describe('walking', () => {
  it('accelerates to walking speed and moves right', () => {
    const body = createBody(100, 12, 16)
    const input = { ...createInput(), right: true }
    run(body, input, flat, 1)
    expect(body.vx).toBeCloseTo(PHYSICS.walkSpeed)
    expect(body.x).toBeGreaterThan(160)
    expect(body.facing).toBe(1)
  })

  it('moves left and faces left', () => {
    const body = createBody(200, 12, 16)
    run(body, { ...createInput(), left: true }, flat, 0.5)
    expect(body.x).toBeLessThan(200)
    expect(body.facing).toBe(-1)
  })

  it('stops quickly when input is released', () => {
    const body = createBody(100, 12, 16)
    const input = { ...createInput(), right: true }
    run(body, input, flat, 0.5)
    input.right = false
    run(body, input, flat, 0.2)
    expect(body.vx).toBe(0)
  })

  it('cancels out when both directions are held', () => {
    const body = createBody(100, 12, 16)
    run(body, { ...createInput(), left: true, right: true }, flat, 0.5)
    expect(body.x).toBe(100)
  })
})

describe('world bounds', () => {
  it('cannot leave the left edge', () => {
    const body = createBody(5, 12, 16)
    run(body, { ...createInput(), left: true }, flat, 2)
    expect(body.x).toBe(0)
  })

  it('cannot leave the right edge', () => {
    const body = createBody(380, 12, 16)
    run(body, { ...createInput(), right: true }, flat, 2)
    expect(body.x).toBe(flat.width - body.w)
  })
})

describe('jumping', () => {
  it('jumps, reaches a sensible height and lands again', () => {
    const body = createBody(100, 12, 16)
    const input = { ...createInput(), jumpPressed: true, jumpHeld: true }
    let peak = 0
    let events = { jumped: 0, landed: 0 }
    for (let t = 0; t < 1.5; t += STEP) {
      const e = stepBody(body, input, flat)
      peak = Math.max(peak, body.y)
      if (e.jumped) events = { ...events, jumped: events.jumped + 1 }
      if (e.landed) events = { ...events, landed: events.landed + 1 }
    }
    expect(events.jumped).toBe(1)
    expect(events.landed).toBe(1)
    expect(peak).toBeGreaterThan(35)
    expect(peak).toBeLessThan(50)
    expect(body.y).toBe(0)
    expect(body.onGround).toBe(true)
  })

  it('a tap gives a lower hop than a held jump', () => {
    const held = createBody(100, 12, 16)
    const tapped = createBody(100, 12, 16)
    const heldInput = { ...createInput(), jumpPressed: true, jumpHeld: true }
    const tapInput = { ...createInput(), jumpPressed: true, jumpHeld: false }
    let peakHeld = 0
    let peakTap = 0
    for (let t = 0; t < 1; t += STEP) {
      stepBody(held, heldInput, flat)
      stepBody(tapped, tapInput, flat)
      peakHeld = Math.max(peakHeld, held.y)
      peakTap = Math.max(peakTap, tapped.y)
    }
    expect(peakTap).toBeLessThan(peakHeld)
    expect(peakTap).toBeGreaterThan(8)
  })

  it('cannot double-jump in mid-air', () => {
    const body = createBody(100, 12, 16)
    const input = { ...createInput(), jumpPressed: true, jumpHeld: true }
    run(body, input, flat, 0.25)
    input.jumpPressed = true
    const e = stepBody(body, input, flat)
    expect(e.jumped).toBe(false)
  })

  it('buffers a jump pressed just before landing', () => {
    const body = createBody(100, 12, 16)
    body.y = 2
    body.onGround = false
    body.vy = -60
    const input = { ...createInput(), jumpPressed: true, jumpHeld: true }
    const events = run(body, input, flat, 0.1)
    expect(events.jumped).toBe(1)
  })
})

describe('collisions', () => {
  const block: CollisionWorld = { width: 400, solids: [{ x: 150, y: 0, w: 20, h: 12 }], platforms: [] }

  it('walking into a block stops at its side', () => {
    const body = createBody(100, 12, 16)
    run(body, { ...createInput(), right: true }, block, 2)
    expect(body.x).toBeCloseTo(150 - 12)
  })

  it('can jump onto a block and stand on it', () => {
    const body = createBody(120, 12, 16)
    const input = { ...createInput(), right: true, jumpPressed: true, jumpHeld: true }
    for (let t = 0; t < 0.45; t += STEP) stepBody(body, input, block)
    input.right = false
    run(body, input, block, 1)
    expect(body.y).toBe(12)
    expect(body.onGround).toBe(true)
  })

  it('bumps its head on a block above', () => {
    const ceiling: CollisionWorld = { width: 400, solids: [{ x: 90, y: 24, w: 40, h: 8 }], platforms: [] }
    const body = createBody(100, 12, 16)
    let peak = 0
    const input = { ...createInput(), jumpPressed: true, jumpHeld: true }
    for (let t = 0; t < 1; t += STEP) {
      stepBody(body, input, ceiling)
      peak = Math.max(peak, body.y)
    }
    expect(peak).toBeLessThanOrEqual(24 - 16 + 0.001)
    expect(body.y).toBe(0)
  })

  it('passes up through a one-way platform and lands on top of it', () => {
    const world: CollisionWorld = { width: 400, solids: [], platforms: [{ x: 80, y: 28, w: 60, h: 4 }] }
    const body = createBody(100, 12, 16)
    const input = { ...createInput(), jumpPressed: true, jumpHeld: true }
    run(body, input, world, 1.5)
    expect(body.y).toBe(28)
    expect(body.onGround).toBe(true)
  })

  it('falls off the end of a platform', () => {
    const world: CollisionWorld = { width: 400, solids: [], platforms: [{ x: 80, y: 28, w: 60, h: 4 }] }
    const body = createBody(120, 12, 16)
    body.y = 28
    run(body, { ...createInput(), right: true }, world, 1.5)
    expect(body.y).toBe(0)
  })
})

describe('fixed stepper', () => {
  it('runs the same number of steps regardless of frame rate', () => {
    const a = new FixedStepper()
    const b = new FixedStepper()
    let stepsA = 0
    let stepsB = 0
    for (let i = 0; i < 60; i++) stepsA += a.advance(1 / 60, () => {})
    for (let i = 0; i < 144; i++) stepsB += b.advance(1 / 144, () => {})
    expect(Math.abs(stepsA - 60)).toBeLessThanOrEqual(1)
    expect(Math.abs(stepsB - 60)).toBeLessThanOrEqual(1)
  })

  it('clamps a long pause (tab switch) instead of fast-forwarding', () => {
    const s = new FixedStepper()
    const steps = s.advance(30, () => {})
    expect(steps).toBeLessThanOrEqual(Math.ceil(FixedStepper.MAX_FRAME / STEP))
  })

  it('does not step when paused (no time advanced)', () => {
    const s = new FixedStepper()
    expect(s.advance(0, () => {})).toBe(0)
  })
})

describe('camera', () => {
  it('stays put while the player is inside the dead zone', () => {
    expect(desiredCameraX(100, 100 + 200 * 0.5, 200, 1000)).toBe(100)
  })

  it('follows the player past the dead zone', () => {
    const x = desiredCameraX(100, 100 + 200 * 0.9, 200, 1000)
    expect(x).toBeCloseTo(100 + 200 * 0.9 - 200 * DEAD_ZONE.to)
  })

  it('never shows outside the level', () => {
    expect(clampCamera(-50, 200, 1000)).toBe(0)
    expect(clampCamera(950, 200, 1000)).toBe(800)
  })

  it('centres a level narrower than the view', () => {
    expect(clampCamera(0, 300, 200)).toBe(-50)
  })

  it('moves smoothly rather than jumping', () => {
    const cam = { x: 0 }
    updateCamera(cam, 600, 200, 1000, STEP)
    expect(cam.x).toBeGreaterThan(0)
    expect(cam.x).toBeLessThan(600 - 200 * DEAD_ZONE.to)
  })

  it('snaps to centre the target', () => {
    const cam = { x: 0 }
    snapCamera(cam, 500, 200, 1000)
    expect(cam.x).toBe(400)
  })
})

describe('viewport', () => {
  it('portrait phones keep a playable width', () => {
    const v = computeViewport(320, 568)
    expect(v.landscape).toBe(false)
    expect(v.viewW).toBeGreaterThanOrEqual(120)
    expect(v.groundBottom).toBeGreaterThanOrEqual(128)
  })

  it('landscape shows a wider slice of the world', () => {
    const portrait = computeViewport(820, 1180)
    const landscape = computeViewport(1180, 820)
    expect(landscape.landscape).toBe(true)
    expect(landscape.viewW).toBeGreaterThan(portrait.viewW)
  })

  it('reserves the iPhone home-indicator area for the controls', () => {
    expect(computeViewport(390, 844, 34).controlsH).toBe(computeViewport(390, 844, 0).controlsH + 34)
  })
})
