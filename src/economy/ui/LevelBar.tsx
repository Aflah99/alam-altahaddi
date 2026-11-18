import type { CSSProperties } from 'react'
import { ar } from '../../quiz/format'
import type { LevelInfo } from '../config'
import './economy.css'

interface LevelBarProps {
  info: LevelInfo
  /** Compact layout for HUDs. */
  compact?: boolean
  className?: string
}

/** Level badge + XP progress bar (the fill animates when XP changes). */
export function LevelBar({ info, compact = false, className = '' }: LevelBarProps) {
  const pct = Math.round(info.ratio * 100)
  const toNext = info.needed - info.into
  return (
    <div className={`levelbar${compact ? ' levelbar--compact' : ''} ${className}`}>
      <span className="levelbar__badge">
        <span className="levelbar__lv">المستوى</span> {ar(info.level)}
      </span>
      <div className="levelbar__main">
        <div
          className="levelbar__track"
          role="progressbar"
          aria-label="التقدم نحو المستوى التالي"
          aria-valuemin={0}
          aria-valuemax={info.needed || 1}
          aria-valuenow={info.needed ? info.into : 1}
          aria-valuetext={info.needed ? `${ar(info.into)} من ${ar(info.needed)} نقطة خبرة` : 'أعلى مستوى'}
        >
          <span className="levelbar__fill" style={{ '--pct': `${pct}%` } as CSSProperties} />
        </div>
        <span className="levelbar__text">
          {info.needed ? (
            <>
              {ar(info.into)} / {ar(info.needed)} خبرة
              {!compact && <> · يتبقّى {ar(toNext)} للمستوى {ar(info.level + 1)}</>}
            </>
          ) : (
            'أعلى مستوى!'
          )}
        </span>
      </div>
    </div>
  )
}
