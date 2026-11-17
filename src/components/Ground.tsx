import type { ReactNode } from 'react'
import './Ground.css'

/** Full-width grass-and-dirt platform anchored to the bottom of the screen. */
export function Ground({ className = '', children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={`ground ${className}`} aria-hidden="true">
      {children}
    </div>
  )
}
