import { useCallback, useEffect, useRef, useState } from 'react'
import type { SfxName } from '../audio/sfx'
import { CharacterSprite } from '../characters/CharacterSprite'
import type { CharacterDef } from '../characters/roster'
import { CornerButton } from '../components/CornerButton'
import { Ground } from '../components/Ground'
import { Overlay } from '../components/Overlay'
import { PixelSprite } from '../components/PixelSprite'
import { pixelRects } from '../components/pixelRects'
import { Sky } from '../components/Sky'
import { FamilyIcon, MiniSlime, PlayArrow } from '../components/sprites'
import { DEMO_NOTE, LOBBY_PLACES, type LobbyPlaceId } from '../content/lobby'
import { LobbyPlace } from '../lobby/LobbyPlace'
import { ARENA, BUSH, LIBRARY, PODIUM, PORTAL, PORTAL_SWIRL, STALL, TREE, WARDROBE, type SpriteDef } from '../lobby/lobbySprites'
import { CoinAmount } from '../economy/ui/Coin'
import { LevelBar } from '../economy/ui/LevelBar'
import type { WalletView } from '../economy/wallet'
import type { PlayerIdentity } from '../player/playerProfile'
import './LobbyScreen.css'

interface LobbyScreenProps {
  profile: PlayerIdentity
  character: CharacterDef
  view: WalletView
  outfit: readonly string[]
  onChangeCharacter: () => void
  /** خريطة المغامرة leads to the adventure map. */
  onOpenMap: () => void
  onOpenRooms: () => void
  onOpenShop: () => void
  onOpenLocker: () => void
  /** اكتشف المواد: community courses. */
  onOpenDiscover?: () => void
  /** Group leaderboards (signed-in students); falls back to an info panel. */
  onOpenBoard?: () => void
  /** Account / sign-in screen. */
  onAccount?: () => void
  /** Where progress is stored (shown under the nickname). */
  storageNote?: string
  onHome: () => void
  play: (name: SfxName) => void
  reducedMotion: boolean
}

const PLACE_SPRITES: Record<LobbyPlaceId, SpriteDef> = {
  map: PORTAL,
  rooms: ARENA,
  closet: WARDROBE,
  shop: STALL,
  board: PODIUM,
  discover: LIBRARY,
}

/** The player's home base: a small pixel village with entrances to future features. */
export function LobbyScreen({ profile, character, view, outfit, onChangeCharacter, onOpenMap, onOpenRooms, onOpenShop, onOpenLocker, onOpenDiscover, onOpenBoard, onAccount, storageNote = DEMO_NOTE, onHome, play, reducedMotion }: LobbyScreenProps) {
  const [open, setOpen] = useState<LobbyPlaceId | null>(null)
  const [cheering, setCheering] = useState(!reducedMotion)
  const cheerTimer = useRef<number | undefined>(undefined)

  const cheer = useCallback(() => {
    window.clearTimeout(cheerTimer.current)
    setCheering(true)
    cheerTimer.current = window.setTimeout(() => setCheering(false), 1000)
  }, [])

  // Celebrate arriving in the lobby once.
  useEffect(() => {
    cheerTimer.current = window.setTimeout(() => setCheering(false), 1000)
    return () => window.clearTimeout(cheerTimer.current)
  }, [])

  useEffect(() => {
    if (open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onHome()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onHome])

  const openPlace = (id: LobbyPlaceId) => {
    play('confirm')
    if (id === 'map') onOpenMap()
    else if (id === 'rooms') onOpenRooms()
    else if (id === 'shop') onOpenShop()
    else if (id === 'closet') onOpenLocker()
    else if (id === 'discover' && onOpenDiscover) onOpenDiscover()
    else if (id === 'board' && onOpenBoard) onOpenBoard()
    else setOpen(id)
  }

  const info = open ? LOBBY_PLACES[open].info : null

  return (
    <div className="lobby">
      <Sky />

      <div className="lobby__ui" inert={open !== null}>
        <header className="lobby__hud">
          <div className="hud-card">
            <CharacterSprite character={character} outfit={outfit} anim="still" className="hud-card__avatar" decorative />
            <div className="hud-card__text">
              <strong className="hud-card__nick">{profile.nickname}</strong>
              <span className="hud-card__char">{character.name}</span>
            </div>
            <div className="hud-card__stats">
              <LevelBar info={view.level} compact />
              <CoinAmount value={view.coins} className="hud-card__coins" />
            </div>
            <span className="hud-card__demo">{storageNote}</span>
          </div>
          <nav className="hud-actions" aria-label="خيارات اللاعب">
            <CornerButton icon={<MiniSlime />} label="تغيير الشخصية" onClick={onChangeCharacter} />
            {onAccount && <CornerButton icon={<FamilyIcon />} label="الحساب" onClick={onAccount} />}
            <CornerButton icon={<PlayArrow className="icon-back" />} label="القائمة الرئيسية" onClick={onHome} />
          </nav>
        </header>

        <main className="lobby__world">
          <h1 className="visually-hidden">ساحة اللاعب</h1>
          <div className="lobby__places">
            <PixelSprite rows={TREE.rows} palette={TREE.palette} className="lobby__tree lobby__tree--a" />
            <PixelSprite rows={TREE.rows} palette={TREE.palette} className="lobby__tree lobby__tree--b" />

            {(Object.keys(LOBBY_PLACES) as LobbyPlaceId[]).map((id) => (
              <LobbyPlace
                key={id}
                area={id}
                label={LOBBY_PLACES[id].label}
                sprite={PLACE_SPRITES[id]}
                onOpen={() => openPlace(id)}
              >
                {id === 'map' && <g className="portal-swirl">{pixelRects(PORTAL_SWIRL.rows, PORTAL_SWIRL.palette)}</g>}
                {id === 'board' && (
                  <g className="trophy-glint" fill="#ffffff">
                    <rect x={9} y={0} width={1} height={1} />
                    <rect x={8} y={1} width={3} height={1} />
                    <rect x={9} y={2} width={1} height={1} />
                  </g>
                )}
              </LobbyPlace>
            ))}

            <div className="lobby__player" style={{ gridArea: 'player' }}>
              <span className="lobby__nametag">{profile.nickname}</span>
              <button type="button" className="lobby__hero" onClick={cheer} aria-label={`${character.name} — اضغط ليحتفل`}>
                <CharacterSprite character={character} outfit={outfit} mood={cheering ? 'happy' : 'neutral'} decorative />
              </button>
              <PixelSprite rows={BUSH.rows} palette={BUSH.palette} className="lobby__bush lobby__bush--a" />
              <PixelSprite rows={BUSH.rows} palette={BUSH.palette} className="lobby__bush lobby__bush--b" />
            </div>
          </div>
        </main>
      </div>

      <Ground className="lobby__ground">
        <div className="lobby__path" />
      </Ground>

      {open && info && (
        <Overlay
          key={open}
          title={info.title}
          icon={
            <PixelSprite
              rows={PLACE_SPRITES[open].rows}
              palette={PLACE_SPRITES[open].palette}
              className="overlay-sprite overlay-sprite--place"
            />
          }
          onClose={() => setOpen(null)}
          onBack={() => play('back')}
          reducedMotion={reducedMotion}
        >
          {info.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <p className="overlay__status">{info.status}</p>
        </Overlay>
      )}
    </div>
  )
}
