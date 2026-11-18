import { useId, type CSSProperties } from 'react'
import { playSfx } from '../audio/sfx'
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
        label="كتم كل الأصوات"
        description="يوقف الموسيقى والمؤثرات الصوتية. كل ما يحدث في اللعبة يظهر على الشاشة أيضًا."
        checked={settings.muted}
        onChange={(v) => onChange({ muted: v })}
      />
      <PixelSlider
        label="الموسيقى"
        value={settings.musicVolume}
        disabled={settings.muted}
        onChange={(v) => onChange({ musicVolume: v })}
      />
      <PixelSlider
        label="المؤثرات الصوتية"
        value={settings.sfxVolume}
        disabled={settings.muted}
        onChange={(v) => onChange({ sfxVolume: v })}
        onCommit={() => playSfx('coin')}
      />
      <p className="settings__note">تبدأ الأصوات بعد أول لمسة على الشاشة. تُحفظ الإعدادات في حسابك وعلى هذا الجهاز.</p>
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

function PixelSlider({
  label,
  value,
  disabled,
  onChange,
  onCommit,
}: {
  label: string
  value: number
  disabled?: boolean
  onChange: (v: number) => void
  onCommit?: () => void
}) {
  const id = useId()
  const pct = Math.round(value * 100)
  return (
    <div className="setting setting--slider" data-disabled={disabled || undefined}>
      <label htmlFor={id} className="setting__label">
        {label}
      </label>
      <output htmlFor={id} className="setting__value">
        {pct === 0 ? 'صامت' : `${pct.toLocaleString('ar-EG')}٪`}
      </output>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={5}
        value={pct}
        disabled={disabled}
        className="pixel-range"
        style={{ '--pct': `${pct}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
      />
    </div>
  )
}
