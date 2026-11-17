import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import './Overlay.css'

interface OverlayProps {
  title: string
  icon?: ReactNode
  children: ReactNode
  /** Called after the closing animation finishes. */
  onClose: () => void
  /** Fired immediately when the user asks to go back (for sound effects). */
  onBack?: () => void
  reducedMotion: boolean
  /** Text of the closing button (default «رجوع»). */
  backLabel?: string
}

/**
 * Pixel-art dialog panel. Closes with its back button or Escape, focuses itself
 * on open and returns focus to whatever opened it.
 */
export function Overlay({ title, icon, children, onClose, onBack, reducedMotion, backLabel = 'رجوع' }: OverlayProps) {
  const titleId = useId()
  const backRef = useRef<HTMLButtonElement>(null)
  const [leaving, setLeaving] = useState(false)

  const requestClose = useCallback(() => {
    if (leaving) return
    onBack?.()
    if (reducedMotion) onClose()
    else setLeaving(true)
  }, [leaving, onBack, onClose, reducedMotion])

  // Finish closing after the exit animation (with a safety timeout).
  useEffect(() => {
    if (!leaving) return
    const t = window.setTimeout(onClose, 220)
    return () => window.clearTimeout(t)
  }, [leaving, onClose])

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    backRef.current?.focus()
    return () => opener?.focus?.()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        requestClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestClose])

  return (
    <div className={`overlay${leaving ? ' overlay--leaving' : ''}`} onClick={requestClose}>
      <section
        className="overlay__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        {icon && <div className="overlay__icon">{icon}</div>}
        <h2 id={titleId} className="overlay__title">
          {title}
        </h2>
        <div className="overlay__body">{children}</div>
        <button ref={backRef} type="button" className="pixel-button" onClick={requestClose}>
          {backLabel}
        </button>
      </section>
    </div>
  )
}
