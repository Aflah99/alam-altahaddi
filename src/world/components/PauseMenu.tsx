import { useState } from 'react'
import { Overlay } from '../../components/Overlay'
import { SettingsPanel } from '../../components/SettingsPanel'
import type { Settings } from '../../hooks/useSettings'

interface PauseMenuProps {
  subjectTitle: string
  settings: Settings
  onSettingsChange: (patch: Partial<Settings>) => void
  onResume: () => void
  onRestart: () => void
  onMap: () => void
  onChapters: () => void
}

/** Pixel pause menu. Its back control is «متابعة»; Escape also resumes. */
export function PauseMenu({ subjectTitle, settings, onSettingsChange, onResume, onRestart, onMap, onChapters }: PauseMenuProps) {
  const [view, setView] = useState<'menu' | 'settings'>('menu')

  if (view === 'settings') {
    return (
      <Overlay
        key="settings"
        title="الإعدادات"
        onClose={() => setView('menu')}
        reducedMotion={settings.reducedMotion}
      >
        <SettingsPanel settings={settings} onChange={onSettingsChange} />
      </Overlay>
    )
  }

  return (
    <Overlay key="menu" title="إيقاف مؤقت" backLabel="متابعة" onClose={onResume} reducedMotion={settings.reducedMotion}>
      <div className="pause-menu">
        <button type="button" className="pause-menu__item" onClick={onRestart}>
          إعادة إلى البداية
        </button>
        <button type="button" className="pause-menu__item" onClick={onMap}>
          العودة إلى الخريطة
        </button>
        <button type="button" className="pause-menu__item" onClick={() => setView('settings')}>
          الإعدادات
        </button>
        <button type="button" className="pause-menu__item pause-menu__item--quiet" onClick={onChapters}>
          فتح دروس {subjectTitle} مباشرة
        </button>
      </div>
    </Overlay>
  )
}
