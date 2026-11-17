import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { PlayArrow } from '../../components/sprites'

export type TouchKey = 'left' | 'right' | 'jump'

interface TouchControlsProps {
  /** Called with the full pressed state whenever it changes. */
  onChange: (key: TouchKey, pressed: boolean) => void
  onJumpPress: () => void
  showInteract: boolean
  onInteract: () => void
}

/**
 * Virtual controller: ◀ ▶ on the left thumb, jump (and enter, when near the
 * portal) on the right thumb. Each button tracks its own pointers, so holding a
 * direction while tapping jump works with multi-touch. Laid out physically
 * (left/right), independent of the page's RTL direction.
 */
export function TouchControls({ onChange, onJumpPress, showInteract, onInteract }: TouchControlsProps) {
  return (
    <div className="tcontrols" dir="ltr">
      <div className="tcontrols__group">
        <HoldButton label="تحرّك يسارًا" onPress={(p) => onChange('left', p)}>
          <PlayArrow className="tbtn__icon" />
        </HoldButton>
        <HoldButton label="تحرّك يمينًا" onPress={(p) => onChange('right', p)}>
          <PlayArrow className="tbtn__icon tbtn__icon--flip" />
        </HoldButton>
      </div>
      <div className="tcontrols__group">
        {showInteract && (
          <button type="button" className="tbtn tbtn--interact" tabIndex={-1} onClick={onInteract}>
            دخول
          </button>
        )}
        <HoldButton
          label="قفز"
          wide
          onPress={(p) => {
            if (p) onJumpPress()
            onChange('jump', p)
          }}
        >
          <span className="tbtn__jump" aria-hidden="true">
            ▲
          </span>
          <span className="tbtn__text">قفز</span>
        </HoldButton>
      </div>
    </div>
  )
}

function HoldButton({
  label,
  children,
  onPress,
  wide = false,
}: {
  label: string
  children: ReactNode
  onPress: (pressed: boolean) => void
  wide?: boolean
}) {
  const pointers = useRef(new Set<number>())
  const pressedRef = useRef(false)
  const [pressed, setPressed] = useState(false)
  const onPressRef = useRef(onPress)
  useEffect(() => {
    onPressRef.current = onPress
  })

  const update = () => {
    const now = pointers.current.size > 0
    if (now === pressedRef.current) return
    pressedRef.current = now
    setPressed(now)
    onPressRef.current(now)
  }

  // Release if the component unmounts while held.
  useEffect(
    () => () => {
      if (pressedRef.current) onPressRef.current(false)
    },
    [],
  )

  const release = (e: PointerEvent<HTMLButtonElement>) => {
    pointers.current.delete(e.pointerId)
    update()
  }

  return (
    <button
      type="button"
      className={`tbtn${wide ? ' tbtn--wide' : ''}`}
      data-pressed={pressed || undefined}
      aria-label={label}
      tabIndex={-1}
      onPointerDown={(e) => {
        e.preventDefault() // no focus, no text selection, no emulated mouse events
        e.currentTarget.setPointerCapture?.(e.pointerId)
        pointers.current.add(e.pointerId)
        update()
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  )
}
