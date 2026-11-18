import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { SfxName } from '../audio/sfx'
import { CharacterSprite } from '../characters/CharacterSprite'
import type { CharacterDef } from '../characters/roster'
import { Sky } from '../components/Sky'
import type { Settings } from '../hooks/useSettings'
import { PORTAL_REACH, PORTAL_W, type LevelConfig } from './config/levels'
import type { SubjectConfig } from './config/subjects'
import { PauseMenu } from './components/PauseMenu'
import { PortalGate } from './components/PortalGate'
import { TouchControls, type TouchKey } from './components/TouchControls'
import { WorldScene } from './components/WorldScene'
import { snapCamera, updateCamera } from './engine/camera'
import { STEP, createBody, stepBody } from './engine/physics'
import { createInput } from './engine/types'
import { useGameLoop } from './engine/useGameLoop'
import { useKeyboardControls } from './engine/useKeyboardControls'
import { computeViewport } from './engine/viewport'
import { worldSession } from './worldSession'
import './WorldScreen.css'

interface WorldScreenProps {
  subject: SubjectConfig
  level: LevelConfig
  character: CharacterDef
  /** Equipped cosmetic ids. */
  outfit?: readonly string[]
  settings: Settings
  onSettingsChange: (patch: Partial<Settings>) => void
  play: (name: SfxName) => void
  onOpenChapters: () => void
  onMap: () => void
}

/** The collision box is a little narrower than the sprite so contacts feel fair. */
const HIT_INSET = 2
const LAND_SQUASH_S = 0.16

type PlayerState = 'idle' | 'walk' | 'jump' | 'fall'

function readSafeBottom(): number {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom)'
  document.body.appendChild(probe)
  const value = parseFloat(getComputedStyle(probe).paddingBottom) || 0
  probe.remove()
  return value
}

const measure = () => computeViewport(window.innerWidth, window.innerHeight, readSafeBottom())

/**
 * Side-scrolling world. React renders the scene once; a fixed-step loop moves
 * the player and camera by writing transforms directly, so play causes no
 * React re-renders (only "near the portal" and pause change state).
 */
export function WorldScreen({ subject, level, character, outfit, settings, onSettingsChange, play, onOpenChapters, onMap }: WorldScreenProps) {
  const spriteW = character.rows[0].length
  const spriteH = character.rows.length

  const stageRef = useRef<HTMLDivElement>(null)
  const planeRef = useRef<HTMLDivElement>(null)
  const hillsRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<HTMLDivElement>(null)

  const [layout, setLayout] = useState(measure)
  const layoutRef = useRef(layout)
  const [paused, setPaused] = useState(false)
  const [near, setNear] = useState(false)
  const nearRef = useRef(false)

  const [initialBody] = useState(() => {
    const saved = worldSession.get(level.id)
    const b = createBody(saved?.x ?? level.spawnX, spriteW - HIT_INSET * 2, spriteH)
    if (saved) b.facing = saved.facing
    return b
  })
  const body = useRef(initialBody)
  const prev = useRef({ x: initialBody.x, y: 0, cam: 0 })
  const cam = useRef({ x: 0 })
  const input = useRef(createInput())
  const touch = useRef({ left: false, right: false, jump: false })
  const visual = useRef<{ state: PlayerState; facing: number; land: number }>({ state: 'idle', facing: 0, land: 0 })

  const leftForPortal = useRef(false)

  const pause = useCallback(() => {
    touch.current = { left: false, right: false, jump: false }
    setPaused(true)
  }, [])

  const enterPortal = useCallback(() => {
    // Come back standing just to the right of the portal, facing it — however the portal was entered.
    leftForPortal.current = true
    worldSession.save(level.id, { x: level.portalX + PORTAL_W + 4, facing: -1 })
    play('confirm')
    onOpenChapters()
  }, [level.id, level.portalX, onOpenChapters, play])

  const keyboard = useKeyboardControls({
    enabled: !paused,
    onJumpPress: () => (input.current.jumpPressed = true),
    onInteract: () => nearRef.current && enterPortal(),
    onPause: pause,
  })

  /* ---------- simulation ---------- */
  const step = () => {
    const b = body.current
    const i = input.current
    const kb = keyboard.current
    i.left = kb.left || touch.current.left
    i.right = kb.right || touch.current.right
    i.jumpHeld = kb.jump || touch.current.jump

    prev.current = { x: b.x, y: b.y, cam: cam.current.x }
    const events = stepBody(b, i, level)
    if (events.jumped) play('jump')
    if (events.landed) visual.current.land = LAND_SQUASH_S
    else visual.current.land = Math.max(0, visual.current.land - STEP)

    updateCamera(cam.current, b.x + b.w / 2, layoutRef.current.viewW, level.width, STEP)

    const portalCentre = level.portalX + PORTAL_W / 2
    const isNear = Math.abs(b.x + b.w / 2 - portalCentre) < PORTAL_REACH && b.y < 24
    if (isNear !== nearRef.current) {
      nearRef.current = isNear
      setNear(isNear)
    }
  }

  /* ---------- drawing ---------- */
  const render = (alpha: number) => {
    const { scale } = layoutRef.current
    const b = body.current
    const p = prev.current
    const x = p.x + (b.x - p.x) * alpha
    const y = p.y + (b.y - p.y) * alpha
    const camX = p.cam + (cam.current.x - p.cam) * alpha

    const player = playerRef.current
    if (player) {
      player.style.transform = `translate3d(${Math.round((x - HIT_INSET) * scale)}px, ${-Math.round(y * scale)}px, 0)`
      const state: PlayerState = !b.onGround ? (b.vy > 0 ? 'jump' : 'fall') : Math.abs(b.vx) > 4 ? 'walk' : 'idle'
      const v = visual.current
      if (state !== v.state) {
        v.state = state
        player.dataset.state = state
      }
      if (b.facing !== v.facing) {
        v.facing = b.facing
        player.style.setProperty('--face', b.facing === 1 ? '-1' : '1')
      }
      const landing = v.land > 0 ? '1' : '0'
      if (player.dataset.land !== landing) player.dataset.land = landing
    }
    if (planeRef.current) planeRef.current.style.transform = `translate3d(${-Math.round(camX * scale)}px, 0, 0)`
    if (hillsRef.current) {
      const tile = 96 * scale
      const offset = ((camX * scale * 0.35) % tile + tile) % tile
      hillsRef.current.style.transform = `translate3d(${-Math.round(offset)}px, 0, 0)`
    }
  }

  useGameLoop(!paused, step, render)

  /* ---------- layout: resize / orientation ---------- */
  useEffect(() => {
    let frame = 0
    const onResize = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setLayout(measure()))
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  const firstLayout = useRef(true)
  useLayoutEffect(() => {
    layoutRef.current = layout
    const b = body.current
    if (firstLayout.current) {
      snapCamera(cam.current, b.x + b.w / 2, layout.viewW, level.width)
      firstLayout.current = false
    } else {
      // Re-centre on the player after a resize or rotation so they stay in view.
      snapCamera(cam.current, b.x + b.w / 2, layout.viewW, level.width)
    }
    prev.current = { x: b.x, y: b.y, cam: cam.current.x }
    render(1)
  }, [layout, level.width])

  // Remember the position when leaving the world.
  useEffect(() => {
    const b = body.current
    return () => {
      if (!leftForPortal.current) worldSession.save(level.id, { x: b.x, facing: b.facing })
    }
  }, [level.id])

  // Keyboard focus lives on the stage while playing.
  useEffect(() => {
    if (!paused) stageRef.current?.focus({ preventScroll: true })
  }, [paused])

  const restart = () => {
    worldSession.clear(level.id)
    const b = body.current
    Object.assign(b, createBody(level.spawnX, b.w, b.h))
    snapCamera(cam.current, b.x + b.w / 2, layoutRef.current.viewW, level.width)
    prev.current = { x: b.x, y: 0, cam: cam.current.x }
    render(1)
    setPaused(false)
  }

  const onTouch = (key: TouchKey, pressed: boolean) => {
    touch.current = { ...touch.current, [key]: pressed }
  }

  return (
    <div
      ref={stageRef}
      className="world"
      data-theme={level.id}
      tabIndex={-1}
      aria-label={`عالم ${subject.title}`}
      style={{ '--s': layout.scale, '--ground-bottom': `${layout.groundBottom}px`, '--controls-h': `${layout.controlsH}px` } as CSSProperties}
      data-orientation={layout.landscape ? 'landscape' : 'portrait'}
    >
      <Sky />
      <div className="world__hills" ref={hillsRef} aria-hidden="true" />

      <div className="world__plane" ref={planeRef} inert={paused}>
        <WorldScene level={level} />
        <PortalGate x={level.portalX} title={subject.title} near={near} onEnter={enterPortal} />
        <div className="wplayer" ref={playerRef} data-state="idle" aria-hidden="true">
          <div className="wplayer__flip">
            <CharacterSprite character={character} outfit={outfit} anim="still" decorative />
          </div>
        </div>
      </div>

      <header className="world__hud" inert={paused}>
        <button type="button" className="corner-button world__pause" onClick={pause}>
          <span className="world__pause-icon" aria-hidden="true" />
          <span>إيقاف</span>
        </button>
        <span className="world__subject">{subject.title}</span>
      </header>

      <div className="world__controls" inert={paused}>
        <TouchControls
          onChange={onTouch}
          onJumpPress={() => (input.current.jumpPressed = true)}
          showInteract={near}
          onInteract={enterPortal}
        />
      </div>

      {paused && (
        <PauseMenu
          subjectTitle={subject.title}
          settings={settings}
          onSettingsChange={onSettingsChange}
          onResume={() => setPaused(false)}
          onRestart={restart}
          onMap={onMap}
          onChapters={enterPortal}
        />
      )}
    </div>
  )
}
