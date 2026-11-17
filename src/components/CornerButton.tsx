import type { ReactNode } from 'react'

interface CornerButtonProps {
  icon: ReactNode
  label: string
  onClick: () => void
}

/** Small, low-key pixel button for secondary entries (parent, settings). */
export function CornerButton({ icon, label, onClick }: CornerButtonProps) {
  return (
    <button type="button" className="corner-button" onClick={onClick}>
      <span className="corner-button__icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  )
}
