import { useRef, type KeyboardEvent } from 'react'

interface CategoryTabsProps<T extends string> {
  categories: readonly { id: T; label: string }[]
  active: T
  onSelect: (id: T) => void
  label?: string
}

/** Pixel category tabs (RTL). Arrow keys move between tabs. */
export function CategoryTabs<T extends string>({ categories, active, onSelect, label = 'الأقسام' }: CategoryTabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: KeyboardEvent, i: number) => {
    // In RTL, ArrowLeft moves forward.
    const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const n = (i + step + categories.length) % categories.length
    onSelect(categories[n].id)
    refs.current[n]?.focus()
  }
  return (
    <div className="shopx__tabs" role="tablist" aria-label={label}>
      {categories.map((c, i) => (
        <button
          key={c.id}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="button"
          role="tab"
          aria-selected={c.id === active}
          tabIndex={c.id === active ? 0 : -1}
          className={`shopx__tab${c.id === active ? ' is-active' : ''}`}
          onClick={() => onSelect(c.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}
