import { useCallback, useState, type ReactNode } from 'react'
import { APP_NAME } from '../config'
import { INFO, MENU_ITEMS, type ModeId } from '../content/startMenu'
import { sfx, type SfxName } from '../audio/sfx'
import type { Settings } from '../hooks/useSettings'
import { CornerButton } from '../components/CornerButton'
import { Ground } from '../components/Ground'
import { Overlay } from '../components/Overlay'
import { SettingsPanel } from '../components/SettingsPanel'
import { Sky } from '../components/Sky'
import { StartMenu } from '../components/StartMenu'
import { FamilyIcon, GearIcon, MiniSlime } from '../components/sprites'
import { CharacterSprite } from '../characters/CharacterSprite'
import { getCharacter } from '../characters/roster'
import './StartScreen.css'

type OverlayId = ModeId | 'parent' | 'settings'

interface StartScreenProps {
  settings: Settings
  onSettingsChange: (patch: Partial<Settings>) => void
  /** «مغامرة فردية» leads to character selection. */
  onStartSolo: () => void
  /** Opens the parent area (cloud). Without it, «ولي الأمر» shows the information panel. */
  onParent?: () => void
}

const OVERLAY_ICONS: Record<OverlayId, ReactNode> = {
  solo: <MiniSlime className="overlay-sprite" />,
  friends: (
    <>
      <MiniSlime colour="pink" className="overlay-sprite overlay-sprite--small" />
      <MiniSlime className="overlay-sprite" />
      <MiniSlime colour="blue" className="overlay-sprite overlay-sprite--small" />
    </>
  ),
  parent: <FamilyIcon className="overlay-sprite overlay-sprite--icon" />,
  settings: <GearIcon className="overlay-sprite overlay-sprite--icon" />,
}

const MASCOT = getCharacter('green-slime')

export function StartScreen({ settings, onSettingsChange, onStartSolo, onParent }: StartScreenProps) {
  const [selected, setSelected] = useState(0)
  const [overlay, setOverlay] = useState<OverlayId | null>(null)

  const sound = useCallback(
    (name: SfxName) => {
      if (settings.sound) sfx[name]()
    },
    [settings.sound],
  )

  const select = useCallback(
    (i: number) => {
      setSelected(i)
      sound('move')
    },
    [sound],
  )

  const open = useCallback(
    (id: OverlayId) => {
      setOverlay(id)
      sound('confirm')
    },
    [sound],
  )

  const activate = useCallback(
    (i: number) => {
      const id = MENU_ITEMS[i].id
      if (id === 'solo') {
        sound('confirm')
        onStartSolo()
      } else open(id)
    },
    [open, sound, onStartSolo],
  )
  const close = useCallback(() => setOverlay(null), [])

  const changeSettings = (patch: Partial<Settings>) => {
    onSettingsChange(patch)
    // Confirm the switch audibly when sound is (or has just been) turned on.
    if (patch.sound ?? settings.sound) sfx.toggle()
  }

  const info = overlay && overlay !== 'settings' ? INFO[overlay] : null

  return (
    <div className="start">
      <Sky />

      <div className="start__ui" inert={overlay !== null}>
        <header className="start__corners">
          <CornerButton icon={<FamilyIcon />} label="ولي الأمر" onClick={() => (onParent ? onParent() : open('parent'))} />
          <CornerButton icon={<GearIcon />} label="الإعدادات" onClick={() => open('settings')} />
        </header>

        <main className="start__main">
          <h1 className="game-title">{APP_NAME}</h1>
          <StartMenu
            items={MENU_ITEMS}
            selected={selected}
            onSelect={select}
            onActivate={activate}
            keyboardEnabled={overlay === null}
          />
        </main>

        <div className="start__stage">
          <CharacterSprite character={MASCOT} anim="hop" className="start__slime" />
        </div>
      </div>

      <Ground className="start__ground" />

      {overlay && (
        <Overlay
          key={overlay}
          title={overlay === 'settings' ? 'الإعدادات' : info!.title}
          icon={OVERLAY_ICONS[overlay]}
          onClose={close}
          onBack={() => sound('back')}
          reducedMotion={settings.reducedMotion}
        >
          {overlay === 'settings' ? (
            <SettingsPanel settings={settings} onChange={changeSettings} />
          ) : (
            <>
              {info!.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
              <p className="overlay__status">{info!.status}</p>
            </>
          )}
        </Overlay>
      )}
    </div>
  )
}
