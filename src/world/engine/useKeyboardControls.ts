import { useEffect, useRef } from 'react'

export interface KeyboardState {
  left: boolean
  right: boolean
  jump: boolean
}

interface Options {
  /** Off while paused or a dialog is open. */
  enabled: boolean
  onJumpPress: () => void
  onInteract: () => void
  onPause: () => void
}

// Physical key codes, so A/D/W/E work on Arabic keyboard layouts too.
const LEFT = new Set(['ArrowLeft', 'KeyA'])
const RIGHT = new Set(['ArrowRight', 'KeyD'])
const JUMP = new Set(['ArrowUp', 'KeyW', 'Space'])
const INTERACT = new Set(['KeyE', 'Enter', 'NumpadEnter'])

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * Keyboard controls for the world. Returns a ref with the held keys.
 * Ignores keys while typing, and leaves Enter/Space on focused buttons alone.
 */
export function useKeyboardControls({ enabled, onJumpPress, onInteract, onPause }: Options) {
  const state = useRef<KeyboardState>({ left: false, right: false, jump: false })
  const held = useRef(new Set<string>())
  const handlers = useRef({ onJumpPress, onInteract, onPause })
  useEffect(() => {
    handlers.current = { onJumpPress, onInteract, onPause }
  })

  useEffect(() => {
    const sync = () => {
      const h = held.current
      state.current.left = [...LEFT].some((k) => h.has(k))
      state.current.right = [...RIGHT].some((k) => h.has(k))
      state.current.jump = [...JUMP].some((k) => h.has(k))
    }
    const releaseAll = () => {
      held.current.clear()
      sync()
    }
    if (!enabled) {
      releaseAll()
      return
    }

    const onDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return
      const onButton = e.target instanceof HTMLElement && !!e.target.closest('button, a')
      if (onButton && (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter')) return

      if (e.code === 'Escape') {
        e.preventDefault()
        handlers.current.onPause()
        return
      }
      if (INTERACT.has(e.code)) {
        e.preventDefault()
        if (!e.repeat) handlers.current.onInteract()
        return
      }
      if (!LEFT.has(e.code) && !RIGHT.has(e.code) && !JUMP.has(e.code)) return
      e.preventDefault() // keep arrows/space from scrolling the page
      if (JUMP.has(e.code) && !e.repeat && !held.current.has(e.code)) handlers.current.onJumpPress()
      held.current.add(e.code)
      sync()
    }
    const onUp = (e: KeyboardEvent) => {
      if (held.current.delete(e.code)) sync()
    }

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', releaseAll)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', releaseAll)
      releaseAll()
    }
  }, [enabled])

  return state
}
