import { useEffect, useMemo, useState } from 'react'
import type { SfxName } from '../audio/sfx'
import { CharacterSprite } from '../characters/CharacterSprite'
import { getCharacter, ROSTER, type CharacterDef, type CharacterId } from '../characters/roster'
import type { GameView } from '../cloud/useCloudGame'
import { CornerButton } from '../components/CornerButton'
import { PixelSprite } from '../components/PixelSprite'
import { PlayArrow } from '../components/sprites'
import { MAX_TIER, SLOTS, tierDef, upgradeCost, type Slot } from '../cosmetics/wearables'
import { CATALOG, getItem, type ShopCategory } from '../economy/catalog'
import { CoinAmount } from '../economy/ui/Coin'
import { LevelBar } from '../economy/ui/LevelBar'
import { WARDROBE } from '../lobby/lobbySprites'
import { ar } from '../quiz/format'
import { CategoryTabs } from './CategoryTabs'
import { ItemThumb, RarityTag } from './itemArt'
import { itemFits, tryOn } from './outfit'
import './shop.css'

type Tab = 'characters' | Slot

interface LockerScreenProps {
  character: CharacterDef
  characterId: CharacterId
  nickname: string
  view: GameView
  equipped: Partial<Record<Slot, string>>
  outfit: readonly string[]
  onEquip: (itemId: string) => void
  onUnequip: (slot: Slot) => void
  onSelectCharacter: (id: CharacterId) => void
  onEditAvatar: () => void
  onUpgrade: (itemId: string, fromTier: number) => Promise<unknown>
  onShop: (category: ShopCategory) => void
  onBack: () => void
  play: (name: SfxName) => void
}

const TABS: readonly { id: Tab; label: string }[] = [{ id: 'characters', label: 'الشخصيات' }, ...SLOTS]

/** الخزانة — wear owned items, upgrade them with نقاط التطوير, and switch characters. */
export function LockerScreen(props: LockerScreenProps) {
  const { character, characterId, nickname, view, equipped, outfit, onEquip, onUnequip, onSelectCharacter, onEditAvatar, onUpgrade, onShop, onBack, play } = props
  const [tab, setTab] = useState<Tab>('characters')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cheer, setCheer] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

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

  const ownedInTab = useMemo(() => (tab === 'characters' ? [] : CATALOG.filter((i) => i.category === tab && view.owned.has(i.id))), [tab, view.owned])
  const selected = selectedId ? getItem(selectedId) : ownedInTab[0]
  const tier = selected ? (view.tiers[selected.id] ?? 1) : 1
  const cost = upgradeCost(tier)
  const isWorn = selected ? equipped[selected.category as Slot] === selected.id : false
  const fits = selected ? itemFits(character, selected.id) : true

  const upgrade = async () => {
    if (!selected || cost === null || busy) return
    setBusy(true)
    setMessage(null)
    try {
      await onUpgrade(selected.id, tier)
      play(tier + 1 === MAX_TIER ? 'upgradeMythic' : 'upgrade')
      setCheer((n) => n + 1)
      setMessage(`أصبح «${selected.name}» ${tierDef(tier + 1).label}!`)
    } catch (e) {
      play('wrong')
      const msg = String((e as { message?: string }).message)
      setMessage(/insufficient points/.test(msg) ? 'نقاط التطوير لا تكفي.' : /tier changed|max tier/.test(msg) ? 'تم تحديث المستوى؛ حاول مرة أخرى.' : 'تعذّرت الترقية. حاول مرة أخرى.')
    } finally {
      setBusy(false)
    }
  }

  const ownedCreatures = ROSTER.filter((c) => view.unlockedCharacters.has(c.id))

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
            <span className="shopx__points" title="نقاط التطوير">✦ {ar(view.points)}</span>
          </span>
        </header>

        <div className="shopx__layout">
          <section className="shopx__stage" aria-label="شخصيتك">
            <div className="shopx__preview shopx__preview--big">
              <CharacterSprite character={character} outfit={outfit} mood={cheer ? 'happy' : 'neutral'} decorative />
            </div>
            <div className="shopx__details">
              <h2 className="shopx__name">{nickname}</h2>
              <LevelBar info={view.level} />
              {!character.human && <p className="shopx__hint">الكائنات الأسطورية ترتدي بعض الإكسسوارات والرفاق فقط؛ الشخصية البشرية ترتدي كل شيء.</p>}
            </div>
          </section>

          <section className="shopx__catalog">
            <CategoryTabs
              categories={TABS}
              active={tab}
              onSelect={(t) => {
                play('move')
                setTab(t)
                setSelectedId(null)
                setMessage(null)
              }}
            />
            {tab === 'characters' ? (
              <div className="locker__chars">
                <button
                  type="button"
                  className={`shopx__card${character.human ? ' is-selected' : ''}`}
                  onClick={() => {
                    play('select')
                    onEditAvatar()
                  }}
                >
                  <span className="shopx__thumb">
                    <CharacterSprite character={character.human ? character : getCharacter('human-boy')} anim="still" decorative />
                  </span>
                  <span className="shopx__card-name">شخصيتك البشرية</span>
                  <span className="shopx__card-owned">تصميم ✎</span>
                </button>
                {ownedCreatures.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`shopx__card${characterId === c.id ? ' is-selected' : ''}`}
                    data-rarity="legendary"
                    aria-pressed={characterId === c.id}
                    onClick={() => {
                      play('select')
                      setCheer((n) => n + 1)
                      onSelectCharacter(c.id)
                    }}
                  >
                    <span className="shopx__thumb">
                      <CharacterSprite character={c} anim="still" decorative />
                    </span>
                    <span className="shopx__card-name">{c.name}</span>
                    <RarityTag rarity="legendary" />
                  </button>
                ))}
                {ownedCreatures.length === 0 && <p className="shopx__note">الكائنات الأسطورية (السلايم، الثعلب، الروبوت، البومة، السلحفاة) نادرة جدًّا وتظهر في صناديق المفاجآت.</p>}
              </div>
            ) : ownedInTab.length === 0 ? (
              <div className="shopx__empty">
                <p>لا تملك شيئًا في هذا القسم بعد.</p>
                <button type="button" className="pixel-button" onClick={() => onShop(tab)}>
                  تسوّق من المتجر
                </button>
              </div>
            ) : (
              <>
                <ul className="shopx__shelf" role="list">
                  {ownedInTab.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`shopx__card${item.id === selected?.id ? ' is-selected' : ''}`}
                        data-rarity={item.rarity}
                        aria-pressed={item.id === selected?.id}
                        onClick={() => {
                          play('move')
                          setSelectedId(item.id)
                          setMessage(null)
                        }}
                      >
                        <span className="shopx__thumb">
                          <ItemThumb itemId={item.id} character={character} tier={view.tiers[item.id] ?? 1} />
                        </span>
                        <span className="shopx__card-name">{item.name}</span>
                        <span className="tier-tag" data-tier={view.tiers[item.id] ?? 1}>
                          {tierDef(view.tiers[item.id] ?? 1).label}
                          {equipped[item.category as Slot] === item.id ? ' · مرتدى' : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {selected && (
                  <div className="locker__detail">
                    <h3 className="shopx__name">
                      {selected.name} <RarityTag rarity={selected.rarity} />
                    </h3>
                    {!fits && <p className="shopx__warn">يظهر على الشخصيات البشرية فقط.</p>}
                    <div className="shopx__buy">
                      {isWorn ? (
                        <button
                          type="button"
                          className="pixel-button"
                          onClick={() => {
                            play('menuClose')
                            onUnequip(selected.category as Slot)
                          }}
                        >
                          خلعه
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="pixel-button"
                          onClick={() => {
                            play('equip')
                            setCheer((n) => n + 1)
                            onEquip(selected.id)
                          }}
                        >
                          ارتداؤه
                        </button>
                      )}
                    </div>
                    <div className="upgrade">
                      <h4>الترقية · المستوى الحالي: {tierDef(tier).label}</h4>
                      <ol className="upgrade__tiers" aria-label="مستويات الترقية">
                        {[1, 2, 3, 4, 5, 6].map((t) => (
                          <li key={t} className="tier-tag" data-tier={t} aria-current={t === tier ? 'step' : undefined} data-done={t <= tier || undefined}>
                            {tierDef(t).label}
                          </li>
                        ))}
                      </ol>
                      {cost === null ? (
                        <p className="shopx__note">وصل هذا الغرض إلى أعلى مستوى: أسطوري ✨</p>
                      ) : (
                        <>
                          <div className="upgrade__compare">
                            <figure>
                              <span className="shopx__thumb">
                                <CharacterSprite character={character} outfit={tryOn(outfit, selected.id, tier)} anim="still" decorative />
                              </span>
                              <figcaption>{tierDef(tier).label}</figcaption>
                            </figure>
                            <span aria-hidden="true">←</span>
                            <figure>
                              <span className="shopx__thumb">
                                <CharacterSprite character={character} outfit={tryOn(outfit, selected.id, tier + 1)} anim="still" decorative />
                              </span>
                              <figcaption>{tierDef(tier + 1).label}</figcaption>
                            </figure>
                          </div>
                          <p className="shopx__desc">
                            التكلفة: {ar(cost)} نقطة تطوير · لديك {ar(view.points)}
                          </p>
                          <button type="button" className="pixel-button" disabled={busy || view.points < cost} onClick={() => void upgrade()}>
                            ترقية إلى {tierDef(tier + 1).label}
                          </button>
                          {view.points < cost && <p className="shopx__hint">تحصل على نقاط التطوير من المكرّرات في صناديق المفاجآت.</p>}
                        </>
                      )}
                      {message && (
                        <p className="shopx__note" role="status">
                          {message}
                        </p>
                      )}
                      <p className="shopx__note">الترقية للمظهر فقط ولا تمنح أي أفضلية في الأسئلة أو المنافسات.</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
