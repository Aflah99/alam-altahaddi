import type { ReactNode } from 'react'
import './area.css'

export interface NavItem {
  id: string
  label: string
}

interface AreaShellProps {
  title: string
  subtitle?: string
  nav: readonly NavItem[]
  active: string
  onNav: (id: string) => void
  onExit: () => void
  exitLabel?: string
  onSignOut?: () => void
  children: ReactNode
}

/** Clean, responsive layout for the parent and admin areas (not the game UI). */
export function AreaShell({ title, subtitle, nav, active, onNav, onExit, exitLabel = 'العودة إلى اللعبة', onSignOut, children }: AreaShellProps) {
  return (
    <div className="area">
      <header className="area__top">
        <div className="area__brand">
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <div className="area__top-actions">
          <button type="button" className="area__btn area__btn--ghost" onClick={onExit}>
            {exitLabel}
          </button>
          {onSignOut && (
            <button type="button" className="area__btn area__btn--ghost" onClick={onSignOut}>
              تسجيل الخروج
            </button>
          )}
        </div>
      </header>
      <div className="area__body">
        <nav className="area__nav" aria-label={title}>
          {nav.map((n) => (
            <button key={n.id} type="button" className="area__nav-item" aria-current={n.id === active ? 'page' : undefined} onClick={() => onNav(n.id)}>
              {n.label}
            </button>
          ))}
        </nav>
        <main className="area__main">{children}</main>
      </div>
    </div>
  )
}

export function AreaMessage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="area area--center">
      <div className="area__card area__card--narrow">
        <h1 className="area__h1">{title}</h1>
        {children}
      </div>
    </div>
  )
}
