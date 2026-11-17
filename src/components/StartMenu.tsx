import { useEffect, useRef, type CSSProperties } from 'react'
import { PixelHeart, PlayArrow } from './sprites'
import './StartMenu.css'

interface StartMenuProps {
  items: readonly { id: string; label: string }[]
  selected: number
  onSelect: (index: number) => void
  onActivate: (index: number) => void
  /** Listen for arrow keys / Enter on the page (off while an overlay is open). */
  keyboardEnabled: boolean
}

/**
 * Arcade-style menu. Tap an option to select it (the heart moves to it);
 * tap the selected option again, or "ابدأ", to open it.
 * Keyboard: ↑/↓ change the selection, Enter opens it.
 */
export function StartMenu({ items, selected, onSelect, onActivate, keyboardEnabled }: StartMenuProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (!keyboardEnabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        const next = (selected + step + items.length) % items.length
        onSelect(next)
        buttons.current[next]?.focus()
      } else if (e.key === 'Enter') {
        // A focused button handles Enter itself (as a click).
        if (e.target instanceof HTMLElement && e.target.closest('button')) return
        e.preventDefault()
        onActivate(selected)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keyboardEnabled, items.length, selected, onSelect, onActivate])

  return (
    <nav className="menu" aria-label="القائمة الرئيسية" style={{ '--sel': selected } as CSSProperties}>
      <p id="menu-hint" className="visually-hidden">
        اختر وضع اللعب، ثم اضغط عليه مرة أخرى أو اضغط «ابدأ» للدخول.
      </p>
      <div className="menu__list">
        <PixelHeart className="menu__heart" />
        <ul>
          {items.map((item, i) => (
            <li key={item.id}>
              <button
                ref={(el) => {
                  buttons.current[i] = el
                }}
                type="button"
                className="menu__item"
                aria-current={i === selected ? 'true' : undefined}
                aria-describedby="menu-hint"
                onClick={() => (i === selected ? onActivate(i) : onSelect(i))}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <button type="button" className="menu__start" onClick={() => onActivate(selected)}>
        <PlayArrow className="menu__start-arrow" />
        <span>ابدأ</span>
      </button>
    </nav>
  )
}
