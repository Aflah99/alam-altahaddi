import { useCallback, useMemo, useEffect, useRef, useState } from 'react'
import type { SfxName } from '../audio/sfx'
import { CharacterPreview } from '../characters/CharacterPreview'
import { ROSTER, type CharacterId } from '../characters/roster'
import { CornerButton } from '../components/CornerButton'
import { Sky } from '../components/Sky'
import { PlayArrow } from '../components/sprites'
import { NicknameField } from '../player/NicknameField'
import type { LocalPlayerProfile } from '../player/playerProfile'
import { validateNickname } from '../player/playerProfile'
import './CharacterSelectScreen.css'

interface CharacterSelectScreenProps {
  profile: LocalPlayerProfile | null
  onConfirm: (characterId: CharacterId, nickname: string) => void
  onBack: () => void
  play: (name: SfxName) => void
  reducedMotion: boolean
  /** Characters this player may pick (the base four plus shop unlocks). */
  available: readonly CharacterId[]
  /** Equipped cosmetics, shown on the preview. */
  outfit?: readonly string[]
}

const CELEBRATE_MS = 1000

export function CharacterSelectScreen({ profile, onConfirm, onBack, play, reducedMotion, available, outfit }: CharacterSelectScreenProps) {
  // Never hide the character the player already uses, even if its unlock record is missing.
  const roster = useMemo(
    () => ROSTER.filter((c) => available.includes(c.id) || c.id === profile?.characterId),
    [available, profile?.characterId],
  )
  const [index, setIndex] = useState(() => Math.max(0, roster.findIndex((c) => c.id === profile?.characterId)))
  const [direction, setDirection] = useState<'next' | 'prev' | null>(null)
  const [nickname, setNickname] = useState(profile?.nickname ?? '')
  const [showError, setShowError] = useState(false)
  const [cheering, setCheering] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const inputWrap = useRef<HTMLFormElement>(null)
  const cheerTimer = useRef<number | undefined>(undefined)
  const confirmTimer = useRef<number | undefined>(undefined)

  const character = roster[index] ?? roster[0]
  const error = validateNickname(nickname)

  const browse = useCallback(
    (step: 1 | -1) => {
      if (leaving) return
      setIndex((i) => (i + step + roster.length) % roster.length)
      setDirection(step === 1 ? 'next' : 'prev')
      setCheering(false)
      play('move')
    },
    [leaving, play, roster.length],
  )

  const cheer = useCallback(() => {
    window.clearTimeout(cheerTimer.current)
    setCheering(true)
    cheerTimer.current = window.setTimeout(() => setCheering(false), CELEBRATE_MS)
  }, [])

  useEffect(
    () => () => {
      window.clearTimeout(cheerTimer.current)
      window.clearTimeout(confirmTimer.current)
    },
    [],
  )

  const confirm = useCallback(() => {
    if (leaving) return
    if (error) {
      setShowError(true)
      inputWrap.current?.querySelector('input')?.focus()
      return
    }
    setLeaving(true)
    play('confirm')
    if (reducedMotion) {
      onConfirm(character.id, nickname)
      return
    }
    setCheering(true)
    confirmTimer.current = window.setTimeout(() => onConfirm(character.id, nickname), CELEBRATE_MS)
  }, [leaving, error, play, reducedMotion, onConfirm, character.id, nickname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const inField = e.target instanceof HTMLInputElement
      if (leaving) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onBack()
      } else if (!inField && e.key === 'ArrowLeft') {
        e.preventDefault()
        browse(1) // RTL: left is forward
      } else if (!inField && e.key === 'ArrowRight') {
        e.preventDefault()
        browse(-1)
      } else if (e.key === 'Enter' && !(e.target instanceof HTMLElement && e.target.closest('button, input'))) {
        e.preventDefault()
        confirm()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [browse, confirm, onBack, leaving])

  return (
    <div className="select">
      <Sky />
      <div className="select__ui">
        <header className="select__header">
          <CornerButton icon={<PlayArrow className="icon-back" />} label="رجوع" onClick={onBack} />
          <h1 className="select__title">اختر شخصيتك</h1>
        </header>

        <div className="select__body">
          <CharacterPreview
            character={character}
            outfit={outfit}
            index={index}
            total={roster.length}
            direction={direction}
            mood={cheering ? 'happy' : 'neutral'}
            onNext={() => browse(1)}
            onPrev={() => browse(-1)}
            onCheer={cheer}
          />

          <section className="select__panel">
            <div className="select__info" aria-live="polite">
              <h2 className="select__name">
                {character.name}
                <span className="visually-hidden">
                  {' '}
                  — الشخصية {index + 1} من {roster.length}
                </span>
              </h2>
              <p className="select__desc">{character.description}</p>
            </div>

            <form
              ref={inputWrap}
              className="select__form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                confirm()
              }}
            >
              <NicknameField
                value={nickname}
                onChange={(v) => {
                  setNickname(v)
                  if (showError && !validateNickname(v)) setShowError(false)
                }}
                error={showError ? error : null}
              />
              <button type="submit" className="pixel-button select__go" disabled={leaving}>
                ابدأ المغامرة
              </button>
            </form>
            <p className="select__note">يُحفظ على هذا الجهاز فقط — هذا ليس حسابًا.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
