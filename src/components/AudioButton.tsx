import { useState } from 'react'
import { playSfx } from '../audio/sfx'
import type { Settings } from '../hooks/useSettings'
import { Overlay } from './Overlay'
import { SettingsPanel } from './SettingsPanel'
import './AudioButton.css'

/** Small always-available sound button: opens the audio and motion settings. */
export function AudioButton({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  const [open, setOpen] = useState(false)
  const silent = settings.muted || (settings.musicVolume === 0 && settings.sfxVolume === 0)
  return (
    <>
      <button
        type="button"
        className="audio-fab"
        aria-label={silent ? 'الصوت مكتوم — إعدادات الصوت' : 'إعدادات الصوت'}
        data-muted={silent || undefined}
        onClick={() => {
          setOpen(true)
          playSfx('menuOpen')
        }}
      >
        <svg viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden="true">
          <path d="M1 4h2l3-3h1v10H6L3 8H1z" fill="currentColor" />
          {silent ? (
            <path d="M8 4h1v1h1V4h1v1h-1v1h1v1h-1v1h1v-1h-1V7H9v1H8V7h1V6H8z" fill="#ff6b6b" />
          ) : (
            <path d="M8 4h1v4H8zM10 2h1v8h-1z" fill="currentColor" />
          )}
        </svg>
      </button>
      {open && (
        <Overlay title="الصوت والإعدادات" onClose={() => setOpen(false)} onBack={() => playSfx('menuClose')} reducedMotion={settings.reducedMotion}>
          <SettingsPanel
            settings={settings}
            onChange={(patch) => {
              onChange(patch)
              if (patch.muted === false || patch.reducedMotion !== undefined) playSfx('toggle')
            }}
          />
        </Overlay>
      )}
    </>
  )
}
