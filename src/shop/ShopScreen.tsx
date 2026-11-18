import { useEffect, useMemo, useState } from 'react'
import type { SfxName } from '../audio/sfx'
import { CharacterSprite } from '../characters/CharacterSprite'
import type { CharacterDef } from '../characters/roster'
import type { GameView, ShopPurchaseResult } from '../cloud/useCloudGame'
import { CornerButton } from '../components/CornerButton'
import { Overlay } from '../components/Overlay'
import { PixelSprite } from '../components/PixelSprite'
import { PlayArrow } from '../components/sprites'
import { CATALOG, CATEGORIES, type CatalogItem, type ShopCategory } from '../economy/catalog'
import { Coin, CoinAmount } from '../economy/ui/Coin'
import { STALL } from '../lobby/lobbySprites'
import { ar } from '../quiz/format'
import { CategoryTabs } from './CategoryTabs'
import { ItemThumb, RarityTag } from './itemArt'
import { itemFits, tryOn } from './outfit'
import { PackagesPanel } from './PackagesPanel'
import './shop.css'

interface ShopScreenProps {
  character: CharacterDef
  view: GameView
  outfit: readonly string[]
  initialCategory?: ShopCategory
  onPurchase: (itemId: string) => Promise<ShopPurchaseResult>
  onChanged: () => void
  onLocker: () => void
  onBack: () => void
  play: (name: SfxName) => void
  reducedMotion: boolean
}

/** المتجر — cosmetic items for coins earned from learning, plus surprise packages. */
export function ShopScreen({ character, view, outfit, initialCategory = 'packages', onPurchase, onChanged, onLocker, onBack, play, reducedMotion }: ShopScreenProps) {
  const [category, setCategory] = useState<ShopCategory>(initialCategory)
  const items = useMemo(() => CATALOG.filter((i) => i.category === category && i.price !== null), [category])
  const [selectedId, setSelectedId] = useState<string>(items[0]?.id ?? '')
  const selected = items.find((i) => i.id === selectedId) ?? items[0]
  const [confirm, setConfirm] = useState<CatalogItem | null>(null)
  const [bought, setBought] = useState<CatalogItem | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [buying, setBuying] = useState(false)
  const dialogOpen = confirm !== null || bought !== null

  useEffect(() => {
    if (dialogOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.overlay')) {
        e.preventDefault()
        onBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialogOpen, onBack])

  const pickCategory = (c: ShopCategory) => {
    play('move')
    setCategory(c)
    setSelectedId(CATALOG.find((i) => i.category === c && i.price !== null)?.id ?? '')
    setNotice(null)
  }

  const doPurchase = async (item: CatalogItem) => {
    let r: ShopPurchaseResult
    setBuying(true)
    try {
      r = await onPurchase(item.id)
    } catch {
      play('wrong')
      setNotice('تعذّر إتمام الشراء. تحقّق من الاتصال ثم حاول مرة أخرى.')
      return
    } finally {
      setBuying(false)
    }
    if (r.ok) {
      play('purchase')
      setBought(item)
      setNotice(null)
    } else {
      play('wrong')
      setNotice(
        r.reason === 'owned'
          ? 'تملك هذا الغرض بالفعل.'
          : r.reason === 'insufficient'
            ? `رصيدك لا يكفي؛ تحتاج ${ar(r.missing ?? 0)} عملة إضافية.`
            : 'هذا الغرض غير متوفر.',
      )
    }
  }

  const isPackages = category === 'packages'
  const owned = selected ? view.owned.has(selected.id) : false
  const price = selected?.price ?? 0
  const missing = Math.max(0, price - view.coins)
  const fits = selected ? itemFits(character, selected.id) : true
  const previewOutfit = selected && !isPackages ? tryOn(outfit, selected.id, view.tiers[selected.id] ?? 1) : outfit

  return (
    <div className="shopx shopx--shop">
      <div className="shopx__scroll" inert={dialogOpen}>
        <header className="shopx__header">
          <CornerButton icon={<PlayArrow className="icon-back" />} label="الساحة" onClick={onBack} />
          <h1 className="shopx__title">
            <PixelSprite rows={STALL.rows} palette={STALL.palette} className="shopx__title-art" />
            المتجر
          </h1>
          <span className="shopx__balance" data-testid="coin-balance">
            <CoinAmount value={view.coins} />
            <span className="shopx__points" title="نقاط التطوير">✦ {ar(view.points)}</span>
          </span>
        </header>

        <CategoryTabs categories={CATEGORIES} active={category} onSelect={pickCategory} />

        {isPackages ? (
          <PackagesPanel character={character} coins={view.coins} play={play} reducedMotion={reducedMotion} onChanged={onChanged} onLocker={onLocker} />
        ) : (
          <div className="shopx__layout">
            <section className="shopx__stage" aria-label="معاينة">
              <div className="shopx__preview">
                <CharacterSprite character={character} outfit={fits ? previewOutfit : outfit} mood="neutral" decorative />
              </div>
              {selected && (
                <div className="shopx__details">
                  <h2 className="shopx__name">
                    {selected.name} <RarityTag rarity={selected.rarity} />
                  </h2>
                  <p className="shopx__desc">{selected.description}</p>
                  {!fits && (
                    <p className="shopx__warn" role="note">
                      يظهر هذا الغرض على الشخصيات البشرية فقط.
                    </p>
                  )}
                  {owned ? (
                    <div className="shopx__buy">
                      <span className="shopx__owned">✓ مملوك</span>
                      <button type="button" className="pixel-button" onClick={onLocker}>
                        ارتداؤه وترقيته في الخزانة
                      </button>
                    </div>
                  ) : (
                    <div className="shopx__buy">
                      <CoinAmount value={price} className="shopx__price" />
                      <button
                        type="button"
                        className="pixel-button shopx__buy-btn"
                        disabled={missing > 0 || buying}
                        onClick={() => {
                          play('click')
                          setConfirm(selected)
                        }}
                      >
                        شراء
                      </button>
                    </div>
                  )}
                  {!owned && missing > 0 && <p className="shopx__hint">تحتاج {ar(missing)} عملة إضافية. أجب عن أسئلة الدروس لتكسب العملات.</p>}
                  {notice && (
                    <p className="shopx__warn" role="status">
                      {notice}
                    </p>
                  )}
                </div>
              )}
            </section>

            <section className="shopx__catalog" aria-label="الأغراض">
              <ul className="shopx__shelf" role="list">
                {items.map((item) => {
                  const isOwned = view.owned.has(item.id)
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`shopx__card${item.id === selected?.id ? ' is-selected' : ''}${isOwned ? ' is-owned' : ''}`}
                        aria-pressed={item.id === selected?.id}
                        data-rarity={item.rarity}
                        onClick={() => {
                          play('move')
                          setSelectedId(item.id)
                          setNotice(null)
                        }}
                      >
                        <span className="shopx__thumb">
                          <ItemThumb itemId={item.id} character={character} tier={view.tiers[item.id] ?? 1} />
                        </span>
                        <span className="shopx__card-name">{item.name}</span>
                        {isOwned ? <span className="shopx__card-owned">✓ مملوك</span> : <CoinAmount value={item.price ?? 0} className="shopx__card-price" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="shopx__note">
                أغراض أندر وشخصيات أسطورية تجدها في «صناديق المفاجآت». كل الأغراض تجميلية، وتُشترى فقط بالعملات التي تكسبها من الإجابة عن الأسئلة. لا يوجد
                شراء بمال حقيقي.
              </p>
            </section>
          </div>
        )}
      </div>

      {confirm && (
        <Overlay
          title="تأكيد الشراء"
          icon={<Coin className="overlay-sprite" />}
          backLabel="إلغاء"
          onClose={() => setConfirm(null)}
          onBack={() => play('back')}
          reducedMotion={reducedMotion}
        >
          <p>
            هل تريد شراء «{confirm.name}» مقابل {ar(confirm.price ?? 0)} عملة؟
          </p>
          <p>سيصبح رصيدك {ar(view.coins - (confirm.price ?? 0))} عملة.</p>
          <button
            type="button"
            className="pixel-button shopx__confirm"
            onClick={() => {
              const item = confirm
              setConfirm(null)
              void doPurchase(item)
            }}
          >
            تأكيد الشراء
          </button>
        </Overlay>
      )}

      {bought && (
        <Overlay
          title="تم الشراء!"
          icon={
            <span className="shopx__bought-art">
              <ItemThumb itemId={bought.id} character={character} />
            </span>
          }
          backLabel="متابعة التسوق"
          onClose={() => setBought(null)}
          onBack={() => play('back')}
          reducedMotion={reducedMotion}
        >
          <p>أصبح «{bought.name}» ملكك.</p>
          <p>تجده الآن في الخزانة، وتستطيع ارتداءه وترقيته متى شئت.</p>
          <button
            type="button"
            className="pixel-button shopx__confirm"
            onClick={() => {
              setBought(null)
              onLocker()
            }}
          >
            الذهاب إلى الخزانة
          </button>
        </Overlay>
      )}
    </div>
  )
}
