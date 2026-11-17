import { useId } from 'react'
import type { Settings } from '../hooks/useSettings'
import './SettingsPanel.css'

interface SettingsPanelProps {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
}

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  return (
    <div className="settings">
      <PixelSwitch
        label="تقليل الحركة"
        description="يوقف حركة السحب وقفز الشخصية والمؤثرات المتحركة."
        checked={settings.reducedMotion}
        onChange={(v) => onChange({ reducedMotion: v })}
      />
      <PixelSwitch
        label="المؤثرات الصوتية"
        description="أصوات قصيرة عند التنقّل في القائمة. مغلقة افتراضيًا."
        checked={settings.sound}
        onChange={(v) => onChange({ sound: v })}
      />
      <p className="settings__note">تُحفظ الإعدادات على هذا الجهاز.</p>
    </div>
  )
}

interface PixelSwitchProps {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}

function PixelSwitch({ label, description, checked, onChange }: PixelSwitchProps) {
  const labelId = useId()
  const descId = useId()
  return (
    <div className="setting">
      <div className="setting__text">
        <span id={labelId} className="setting__label">
          {label}
        </span>
        <span id={descId} className="setting__desc">
          {description}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descId}
        className="switch"
        onClick={() => onChange(!checked)}
      >
        <span className="switch__state" aria-hidden="true">
          {checked ? 'تشغيل' : 'إيقاف'}
        </span>
        <span className="switch__knob" aria-hidden="true" />
      </button>
    </div>
  )
}
