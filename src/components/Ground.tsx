import './Ground.css'

/** Full-width grass-and-dirt platform anchored to the bottom of the screen. */
export function Ground({ className = '' }: { className?: string }) {
  return <div className={`ground ${className}`} aria-hidden="true" />
}
