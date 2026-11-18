import { useEffect, useMemo, useState } from 'react'
import type { SfxName } from '../audio/sfx'
import { CharacterSprite } from '../characters/CharacterSprite'
import { fitsCharacter, getCosmetic } from '../characters/cosmetics'
import { getCharacter, type CharacterDef } from '../characters/roster'
import { CornerButton } from '../components/CornerButton'
import { Overlay } from '../components/Overlay'
import { PixelSprite } from '../components/PixelSprite'
import { PlayArrow } from '../components/sprites'
import { CATALOG, CATEGORIES, type CatalogItem, type ShopCategory } from '../economy/catalog'
import { Coin, CoinAmount } from '../economy/ui/Coin'
import type { WalletView } from '../economy/wallet'
import { STALL } from '../lobby/lobbySprites'
import { ar } from '../quiz/format'
import { CategoryTabs } from './CategoryTabs'
import { previewOutfit, thumbFor } from './preview'
import './shop.css'

interface ShopScreenProps {
  character: CharacterDef
  view: WalletView
  outfit: readonly string[]
  initialCategory?: ShopCategory
  /** Local wallet (sync) or server purchase (async). */
  onPurchase: (itemId: string) => ShopPurchaseResult | Promise<ShopPurchaseResult>
  onLocker: () => void
  onBack: () => void
  play: (name: SfxName) => void
  reducedMotion: boolean
}

export type ShopPurchaseResult = { ok: true } | { ok: false; reason: 'unknown-item' | 'owned' | 'insufficient'; missing?: number }

/** المتجر — a retro item shop for cosmetic items, paid with coins earned from learning. */
export function ShopScreen({ character, view, outfit, initialCategory = 'hat', onPurchase, onLocker, onBack, play, reducedMotion }: ShopScreenProps) {
  const [category, setCategory] = useState<ShopCategory>(initialCategory)
  const items = useMemo(() => CATALOG.filter((i) => i.category === category), [category])
  const [selectedId, setSelectedId] = useState<string>(items[0]?.id ?? '')
  const selected = items.find((i) => i.id === selectedId) ?? items[0]
  const [confirm, setConfirm] = useState<CatalogItem | null>(null)
  const [bought, setBought] = useState<CatalogItem | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const dialogOpen = confirm !== null || bought !== null

  useEffect(() => {
    if (dialogOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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
    setSelectedId(CATALOG.find((i) => i.category === c)?.id ?? '')
    setNotice(null)
  }

  const [buying, setBuying] = useState(false)
  const doPurchase = async (item: CatalogItem) => {
    let r: ShopPurchaseResult
    setBuying(true)
    try {
      r = await onPurchase(item.id)
    } catch {
      play('back')
      setNotice('تعذّر إتمام الشراء. تحقّق من الاتصال ثم حاول مرة أخرى.')
      return
    } finally {
      setBuying(false)
    }
    if (r.ok) {
      play('confirm')
      setBought(item)
      setNotice(null)
    } else {
      play('back')
      setNotice(
        r.reason === 'owned'
          ? 'تملك هذا الغرض بالفعل.'
          : r.reason === 'insufficient'
            ? `رصيدك لا يكفي؛ تحتاج ${ar(r.missing ?? 0)} عملة إضافية.`
            : 'هذا الغرض غير متوفر.',
      )
    }
  }

  const previewChar = selected?.characterId ? getCharacter(selected.characterId) : character
  const previewItems = selected ? previewOutfit(outfit, selected) : outfit
  const cosmetic = selected && selected.category !== 'characters' ? getCosmetic(selected.id) : undefined
  const fits = !cosmetic || fitsCharacter(cosmetic, character.id)
  const owned = selected ? view.owned.has(selected.id) : false
  const missing = selected ? Math.max(0, selected.price - view.coins) : 0

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
          </span>
        </header>

        <div className="shopx__layout">
          <section className="shopx__stage" aria-label="معاينة">
            <div className="shopx__preview">
              <CharacterSprite key={previewChar.id} character={previewChar} outfit={previewItems} mood="neutral" decorative />
            </div>
            {selected && (
              <div className="shopx__details">
                <h2 className="shopx__name">{selected.name}</h2>
                <p className="shopx__desc">{selected.description}</p>
                {!fits && (
                  <p className="shopx__warn" role="note">
                    لا يناسب «{character.name}»؛ يمكن ارتداؤه مع شخصيات أخرى.
                  </p>
                )}
                {owned ? (
                  <div className="shopx__buy">
                    <span className="shopx__owned">✓ مملوك</span>
                    <button type="button" className="pixel-button" onClick={onLocker}>
                      {selected.category === 'characters' ? 'اختيارها من الخزانة' : 'ارتداؤه في الخزانة'}
                    </button>
                  </div>
                ) : (
                  <div className="shopx__buy">
                    <CoinAmount value={selected.price} className="shopx__price" />
                    <button
                      type="button"
                      className="pixel-button shopx__buy-btn"
                      disabled={missing > 0 || buying}
                      onClick={() => {
                        play('move')
                        setConfirm(selected)
                      }}
                    >
                      شراء
                    </button>
                  </div>
                )}
                {!owned && missing > 0 && (
                  <p className="shopx__hint">تحتاج {ar(missing)} عملة إضافية. أجب عن أسئلة الدروس لتكسب العملات.</p>
                )}
                {notice && (
                  <p className="shopx__warn" role="status">
                    {notice}
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="shopx__catalog" aria-label="الأغراض">
            <CategoryTabs categories={CATEGORIES} active={category} onSelect={pickCategory} />
            <ul className="shopx__shelf" role="list">
              {items.map((item) => {
                const thumb = thumbFor(item, character)
                const isOwned = view.owned.has(item.id)
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`shopx__card${item.id === selected?.id ? ' is-selected' : ''}${isOwned ? ' is-owned' : ''}`}
                      aria-pressed={item.id === selected?.id}
                      onClick={() => {
                        play('move')
                        setSelectedId(item.id)
                        setNotice(null)
                      }}
                    >
                      <span className="shopx__thumb">
                        <CharacterSprite character={thumb.character} outfit={thumb.outfit} anim="still" decorative />
                      </span>
                      <span className="shopx__card-name">{item.name}</span>
                      {isOwned ? <span className="shopx__card-owned">✓ مملوك</span> : <CoinAmount value={item.price} className="shopx__card-price" />}
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="shopx__note">
              كل الأغراض تجميلية، وتُشترى فقط بالعملات التي تكسبها من الإجابة عن الأسئلة. لا يوجد شراء بمال حقيقي.
            </p>
          </section>
        </div>
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
            هل تريد شراء «{confirm.name}» مقابل {ar(confirm.price)} عملة؟
          </p>
          <p>سيصبح رصيدك {ar(view.coins - confirm.price)} عملة.</p>
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
              <CharacterSprite
                character={bought.characterId ? getCharacter(bought.characterId) : thumbFor(bought, character).character}
                outfit={bought.characterId ? [] : thumbFor(bought, character).outfit}
                mood={reducedMotion ? 'neutral' : 'happy'}
                decorative
              />
            </span>
          }
          backLabel="متابعة التسوق"
          onClose={() => setBought(null)}
          onBack={() => play('back')}
          reducedMotion={reducedMotion}
        >
          <p>أصبح «{bought.name}» ملكك.</p>
          <p>{bought.category === 'characters' ? 'يمكنك اختيار الشخصية الجديدة من الخزانة.' : 'تجده الآن في الخزانة، وتستطيع ارتداءه متى شئت.'}</p>
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
