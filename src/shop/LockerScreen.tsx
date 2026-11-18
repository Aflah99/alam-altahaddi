import { useEffect, useState } from 'react'
import type { SfxName } from '../audio/sfx'
import { CharacterSprite } from '../characters/CharacterSprite'
import { fitsCharacter, getCosmetic, type CosmeticSlot } from '../characters/cosmetics'
import { ROSTER, type CharacterDef, type CharacterId } from '../characters/roster'
import { CornerButton } from '../components/CornerButton'
import { PixelSprite } from '../components/PixelSprite'
import { PlayArrow } from '../components/sprites'
import { CATALOG, CATEGORIES, getItem, itemForCharacter, type ShopCategory } from '../economy/catalog'
import { CoinAmount } from '../economy/ui/Coin'
import { LevelBar } from '../economy/ui/LevelBar'
import type { Equipped, WalletView } from '../economy/wallet'
import { WARDROBE } from '../lobby/lobbySprites'
import { CategoryTabs } from './CategoryTabs'
import './shop.css'

interface LockerScreenProps {
  character: CharacterDef
  nickname: string
  view: WalletView
  equipped: Equipped
  outfit: readonly string[]
  onEquip: (itemId: string) => void
  onUnequip: (slot: CosmeticSlot) => void
  onSelectCharacter: (id: CharacterId) => void
  onShop: (category: ShopCategory) => void
  onBack: () => void
  play: (name: SfxName) => void
}

const SLOT_NAMES: Record<CosmeticSlot, string> = { hat: 'القبعة', outfit: 'الملابس', accessory: 'الإكسسوار', bag: 'الحقيبة' }

/** الخزانة — equip owned cosmetics and switch between unlocked characters. */
export function LockerScreen({ character, nickname, view, equipped, outfit, onEquip, onUnequip, onSelectCharacter, onShop, onBack, play }: LockerScreenProps) {
  const [tab, setTab] = useState<ShopCategory>('hat')
  const [cheer, setCheer] = useState(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  useEffect(() => {
    if (!cheer) return
    const t = window.setTimeout(() => setCheer(0), 1000)
    return () => window.clearTimeout(t)
  }, [cheer])

  const ownedInTab = tab === 'characters' ? [] : CATALOG.filter((i) => i.category === tab && view.owned.has(i.id))
  const slot = tab === 'characters' ? null : tab

  return (
    <div className="shopx shopx--locker">
      <div className="shopx__scroll">
        <header className="shopx__header">
          <CornerButton icon={<PlayArrow className="icon-back" />} label="الساحة" onClick={onBack} />
          <h1 className="shopx__title">
            <PixelSprite rows={WARDROBE.rows} palette={WARDROBE.palette} className="shopx__title-art" />
            الخزانة
          </h1>
          <span className="shopx__balance">
            <CoinAmount value={view.coins} />
          </span>
        </header>

        <div className="shopx__layout">
          <section className="shopx__stage" aria-label="شخصيتك">
            <div className="shopx__preview shopx__preview--big">
              <CharacterSprite character={character} outfit={outfit} mood={cheer ? 'happy' : 'neutral'} decorative />
            </div>
            <div className="shopx__details">
              <h2 className="shopx__name">
                {nickname} <span className="shopx__sub">— {character.name}</span>
              </h2>
              <LevelBar info={view.level} />
              <ul className="shopx__worn" aria-label="ما ترتديه الآن">
                {(Object.keys(SLOT_NAMES) as CosmeticSlot[]).map((s) => {
                  const id = equipped[s]
                  const item = id ? getItem(id) : undefined
                  const hidden = id && !fitsCharacter(getCosmetic(id)!, character.id)
                  return (
                    <li key={s}>
                      <span className="shopx__worn-slot">{SLOT_NAMES[s]}:</span> {item ? item.name : 'لا شيء'}
                      {hidden && <span className="shopx__worn-hidden"> (لا يظهر على هذه الشخصية)</span>}
                    </li>
                  )
                })}
              </ul>
            </div>
          </section>

          <section className="shopx__catalog" aria-label="أغراضك">
            <CategoryTabs
              categories={CATEGORIES}
              active={tab}
              onSelect={(c) => {
                play('move')
                setTab(c)
              }}
            />

            {tab === 'characters' ? (
              <ul className="shopx__shelf" role="list">
                {ROSTER.map((c) => {
                  const unlocked = view.unlockedCharacters.has(c.id)
                  const isCurrent = c.id === character.id
                  const shopItem = itemForCharacter(c.id)
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={`shopx__card${isCurrent ? ' is-selected' : ''}${unlocked ? '' : ' is-locked'}`}
                        aria-pressed={isCurrent}
                        onClick={() => {
                          if (!unlocked) {
                            play('move')
                            onShop('characters')
                            return
                          }
                          if (isCurrent) return
                          play('confirm')
                          onSelectCharacter(c.id)
                          setCheer((n) => n + 1)
                        }}
                      >
                        <span className="shopx__thumb">
                          <CharacterSprite character={c} outfit={unlocked ? outfit : []} anim="still" decorative />
                        </span>
                        <span className="shopx__card-name">{c.name}</span>
                        {isCurrent ? (
                          <span className="shopx__card-owned">✓ الشخصية الحالية</span>
                        ) : unlocked ? (
                          <span className="shopx__card-action">اختيار</span>
                        ) : (
                          <span className="shopx__card-lock">
                            مقفلة · في المتجر {shopItem && <CoinAmount value={shopItem.price} />}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : ownedInTab.length === 0 ? (
              <div className="shopx__empty">
                <p>لا تملك أغراضًا في هذا القسم بعد.</p>
                <button type="button" className="pixel-button" onClick={() => onShop(tab)}>
                  الذهاب إلى المتجر
                </button>
              </div>
            ) : (
              <ul className="shopx__shelf" role="list">
                {slot && (
                  <li>
                    <button
                      type="button"
                      className={`shopx__card${!equipped[slot] ? ' is-selected' : ''}`}
                      aria-pressed={!equipped[slot]}
                      onClick={() => {
                        play('back')
                        onUnequip(slot)
                      }}
                    >
                      <span className="shopx__thumb">
                        <CharacterSprite character={character} outfit={outfit.filter((id) => getCosmetic(id)?.slot !== slot)} anim="still" decorative />
                      </span>
                      <span className="shopx__card-name">بدون {SLOT_NAMES[slot]}</span>
                      <span className="shopx__card-action">{!equipped[slot] ? '✓ مختار' : 'خلع'}</span>
                    </button>
                  </li>
                )}
                {ownedInTab.map((item) => {
                  const cosmetic = getCosmetic(item.id)!
                  const fits = fitsCharacter(cosmetic, character.id)
                  const worn = equipped[cosmetic.slot] === item.id
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`shopx__card${worn ? ' is-selected' : ''}${fits ? '' : ' is-unfit'}`}
                        aria-pressed={worn}
                        aria-disabled={!fits}
                        onClick={() => {
                          if (!fits) {
                            play('back')
                            return
                          }
                          if (worn) {
                            play('back')
                            onUnequip(cosmetic.slot)
                          } else {
                            play('confirm')
                            onEquip(item.id)
                            setCheer((n) => n + 1)
                          }
                        }}
                      >
                        <span className="shopx__thumb">
                          <CharacterSprite
                            character={character}
                            outfit={[...outfit.filter((id) => getCosmetic(id)?.slot !== cosmetic.slot), item.id]}
                            anim="still"
                            decorative
                          />
                        </span>
                        <span className="shopx__card-name">{item.name}</span>
                        {!fits ? (
                          <span className="shopx__card-lock">لا يناسب {character.name}</span>
                        ) : worn ? (
                          <span className="shopx__card-owned">✓ مُرتدى — اضغط للخلع</span>
                        ) : (
                          <span className="shopx__card-action">ارتداء</span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <button type="button" className="pause-menu__item shopx__to-shop" onClick={() => onShop(tab)}>
              تسوّق المزيد من الأغراض
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
