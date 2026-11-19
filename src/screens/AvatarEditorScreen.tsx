import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { SfxName } from '../audio/sfx'
import { CharacterSprite } from '../characters/CharacterSprite'
import {
  CLOTH_COLORS,
  DEFAULT_APPEARANCE,
  HAIR_COLORS,
  HAIR_IDS,
  HAIRS,
  HIJAB_COLORS,
  sanitizeAppearance,
  SKIN_TONES,
  THEME_IDS,
  THEMES,
  type Appearance,
  type BodyId,
} from '../characters/human'
import { getCharacter, humanCharacter, isHumanId, ROSTER, type CharacterId } from '../characters/roster'
import { CornerButton } from '../components/CornerButton'
import { Sky } from '../components/Sky'
import { PlayArrow } from '../components/sprites'
import { RARITIES } from '../cosmetics/wearables'
import { NicknameField } from '../player/NicknameField'
import { validateNickname } from '../player/playerProfile'
import './AvatarEditorScreen.css'

type Tab = 'body' | 'hair' | 'clothes' | 'legends'

interface Props {
  nickname: string
  characterId: CharacterId
  appearance: unknown
  outfit: readonly string[]
  /** Creatures this player owns (legendary collectibles). */
  ownedCreatures: readonly CharacterId[]
  onSave: (r: { appearance: Appearance | null; creature: CharacterId | null; nickname: string }) => void
  onBack: () => void
  play: (name: SfxName) => void
}

/** تصميم الشخصية — two free human avatars with modest fantasy outfits, plus owned legendary creatures. */
export function AvatarEditorScreen({ nickname: initialNick, characterId, appearance, outfit, ownedCreatures, onSave, onBack, play }: Props) {
  const startBody: BodyId = characterId === 'human-girl' ? 'girl' : 'boy'
  const [look, setLook] = useState<Appearance>(() => sanitizeAppearance(appearance, isHumanId(characterId) ? startBody : undefined))
  const [creature, setCreature] = useState<CharacterId | null>(isHumanId(characterId) ? null : characterId)
  const [tab, setTab] = useState<Tab>('body')
  const [nickname, setNickname] = useState(initialNick)
  const [showError, setShowError] = useState(false)
  const nickError = validateNickname(nickname)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  const preview = creature ? getCharacter(creature) : humanCharacter(look.body === 'girl' ? 'human-girl' : 'human-boy', look)
  const set = (patch: Partial<Appearance>) => {
    play('click')
    setCreature(null)
    setLook((l) => sanitizeAppearance({ ...l, ...patch }, patch.body ?? l.body))
  }
  const pickBody = (b: BodyId) => {
    play('select')
    setCreature(null)
    // Switching avatar keeps colours and clothing; the hijab option belongs to the female avatar.
    setLook((l) => sanitizeAppearance({ ...l, body: b, hijab: b === 'girl' ? DEFAULT_APPEARANCE.girl.hijab : false, hair: l.hair }, b))
  }

  const save = () => {
    if (nickError) {
      setShowError(true)
      return
    }
    play('confirm')
    onSave({ appearance: creature ? null : look, creature, nickname })
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'body', label: 'الشكل' },
    { id: 'hair', label: look.body === 'girl' ? 'الشعر والحجاب' : 'الشعر' },
    { id: 'clothes', label: 'الملابس' },
    { id: 'legends', label: 'الأسطورة' },
  ]

  return (
    <div className="avatar">
      <Sky />
      <div className="avatar__ui">
        <header className="avatar__header">
          <CornerButton icon={<PlayArrow className="icon-back" />} label="رجوع" onClick={onBack} />
          <h1 className="avatar__title">تصميم شخصيتك</h1>
        </header>
        <div className="avatar__body">
          <section className="avatar__stage" aria-label="معاينة الشخصية">
            <div className="avatar__preview">
              <CharacterSprite character={preview} outfit={outfit} anim="idle" />
            </div>
            <p className="avatar__caption">{creature ? preview.name : look.body === 'girl' ? 'البطلة' : 'البطل'}</p>
          </section>
          <section className="avatar__panel">
            <div className="avatar__tabs" role="tablist" aria-label="أقسام التصميم">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className="avatar__tab"
                  onClick={() => {
                    play('move')
                    setTab(t.id)
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="avatar__options" role="tabpanel">
              {tab === 'body' && (
                <>
                  <Group label="الشخصية">
                    {(['boy', 'girl'] as const).map((b) => (
                      <button key={b} type="button" className="avatar__choice avatar__choice--big" aria-pressed={!creature && look.body === b} onClick={() => pickBody(b)}>
                        <span className="avatar__thumb">
                          <CharacterSprite character={humanCharacter(b === 'girl' ? 'human-girl' : 'human-boy', { ...look, body: b, hijab: b === 'girl' && look.hijab })} anim="still" decorative />
                        </span>
                        {b === 'girl' ? 'بطلة' : 'بطل'}
                      </button>
                    ))}
                  </Group>
                  <Group label="لون البشرة">
                    {SKIN_TONES.map((s, i) => (
                      <Swatch key={s.name} color={s.base} label={s.name} pressed={look.skin === i} onClick={() => set({ skin: i })} />
                    ))}
                  </Group>
                </>
              )}
              {tab === 'hair' && (
                <>
                  {look.body === 'girl' && (
                    <Group label="الحجاب">
                      <button type="button" className="avatar__choice" aria-pressed={look.hijab} onClick={() => set({ hijab: true })}>
                        بحجاب
                      </button>
                      <button type="button" className="avatar__choice" aria-pressed={!look.hijab} onClick={() => set({ hijab: false })}>
                        دون حجاب
                      </button>
                    </Group>
                  )}
                  {look.body === 'girl' && look.hijab ? (
                    <Group label="لون الحجاب">
                      {HIJAB_COLORS.map((c, i) => (
                        <Swatch key={c.name} color={c.base} label={c.name} pressed={look.hijabColor === i} onClick={() => set({ hijabColor: i })} />
                      ))}
                    </Group>
                  ) : (
                    <>
                      <Group label="تسريحة الشعر">
                        {HAIR_IDS.map((h) => (
                          <button key={h} type="button" className="avatar__choice" aria-pressed={look.hair === h} onClick={() => set({ hair: h })}>
                            {HAIRS[h].name}
                          </button>
                        ))}
                      </Group>
                      <Group label="لون الشعر">
                        {HAIR_COLORS.map((c, i) => (
                          <Swatch key={c.name} color={c.base} label={c.name} pressed={look.hairColor === i} onClick={() => set({ hairColor: i })} />
                        ))}
                      </Group>
                    </>
                  )}
                </>
              )}
              {tab === 'clothes' && (
                <>
                  <Group label="طراز الملابس">
                    {THEME_IDS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className="avatar__choice avatar__choice--theme"
                        aria-pressed={look.theme === t}
                        onClick={() => set({ theme: t, primary: THEMES[t].defaults[0], secondary: THEMES[t].defaults[1] })}
                      >
                        <span className="avatar__thumb avatar__thumb--small">
                          <CharacterSprite
                            character={humanCharacter(look.body === 'girl' ? 'human-girl' : 'human-boy', { ...look, theme: t, primary: THEMES[t].defaults[0], secondary: THEMES[t].defaults[1] })}
                            anim="still"
                            decorative
                          />
                        </span>
                        {THEMES[t].name}
                      </button>
                    ))}
                  </Group>
                  <Group label="اللون الأساسي">
                    {CLOTH_COLORS.map((c, i) => (
                      <Swatch key={c.name} color={c.base} label={c.name} pressed={look.primary === i} onClick={() => set({ primary: i })} />
                    ))}
                  </Group>
                  <Group label="اللون الثانوي">
                    {CLOTH_COLORS.map((c, i) => (
                      <Swatch key={c.name} color={c.base} label={c.name} pressed={look.secondary === i} onClick={() => set({ secondary: i })} />
                    ))}
                  </Group>
                  <p className="avatar__note">كل الأزياء محتشمة وبأكمام وأطوال كاملة. الإكسسوارات تجدها في الخزانة والمتجر.</p>
                </>
              )}
              {tab === 'legends' && (
                <LegendsTab owned={ownedCreatures} selected={creature} onPick={(id) => (play('select'), setCreature(id))} />
              )}
            </div>
            <form
              className="avatar__save"
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                save()
              }}
            >
              <NicknameField
                value={nickname}
                onChange={(v) => {
                  setNickname(v)
                  if (showError && !validateNickname(v)) setShowError(false)
                }}
                error={showError ? nickError : null}
              />
              <button type="submit" className="pixel-button avatar__go">
                حفظ والعودة إلى الساحة
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  )
}

function LegendsTab({ owned, selected, onPick }: { owned: readonly CharacterId[]; selected: CharacterId | null; onPick: (id: CharacterId) => void }) {
  const legends = useMemo(() => ROSTER, [])
  return (
    <>
      <p className="avatar__note">
        الكائنات الأسطورية شخصيات نادرة جدًّا تظهر في صناديق المفاجآت. ما تملكه منها يمكنك اختياره هنا.
      </p>
      <div className="avatar__legends">
        {legends.map((c) => {
          const has = owned.includes(c.id)
          return (
            <button
              key={c.id}
              type="button"
              className="avatar__legend"
              aria-pressed={selected === c.id}
              disabled={!has}
              onClick={() => onPick(c.id)}
              style={{ '--rarity': RARITIES.legendary.color } as CSSProperties}
            >
              <span className="avatar__thumb avatar__thumb--small" data-locked={!has || undefined}>
                <CharacterSprite character={c} anim="still" decorative />
              </span>
              <span>{c.name}</span>
              <span className="avatar__legend-state">{has ? 'مملوكة' : '🔒 من الصناديق'}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="avatar__group">
      <legend>{label}</legend>
      <div className="avatar__row">{children}</div>
    </fieldset>
  )
}

function Swatch({ color, label, pressed, onClick }: { color: string; label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button type="button" className="avatar__swatch" aria-pressed={pressed} aria-label={label} title={label} onClick={onClick}>
      <span style={{ background: color }} />
    </button>
  )
}
