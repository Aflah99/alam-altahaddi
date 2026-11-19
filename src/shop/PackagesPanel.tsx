import { useCallback, useEffect, useRef, useState } from 'react'
import type { SfxName } from '../audio/sfx'
import type { CharacterDef } from '../characters/roster'
import * as api from '../cloud/api'
import { arabicError } from '../cloud/client'
import type { PackageOpen, PackageReward, PackagesInfo, PackageType, RarityName } from '../cloud/types'
import { Overlay } from '../components/Overlay'
import { PixelSprite } from '../components/PixelSprite'
import { RARITIES } from '../cosmetics/wearables'
import { getItem } from '../economy/catalog'
import { CoinAmount } from '../economy/ui/Coin'
import { ar } from '../quiz/format'
import { ItemThumb, RarityTag } from './itemArt'

const CHEST_ROWS = [
  '...OOOOOOOOOO...',
  '..OWWWWWWWWWWO..',
  '.OWBBBBBBBBBBWO.',
  'OWBBBBBBBBBBBBWO',
  'OTTTTTTGGTTTTTTO',
  'OWBBBBBTTBBBBBWO',
  'OWBBBBBBBBBBBBWO',
  'OWBBBBBBBBBBBBWO',
  'OTTTTTTTTTTTTTTO',
  'OOOOOOOOOOOOOOOO',
]
const CHEST_PAL: Record<string, Record<string, string>> = {
  adventure: { O: '#2a1d5c', W: '#c8925a', B: '#8a5a32', T: '#c47a3a', G: '#ffd34d' },
  heroes: { O: '#2a1d5c', W: '#8fd0ff', B: '#2f6fd6', T: '#d6dde8', G: '#6fb8ff' },
  legends: { O: '#2a1d5c', W: '#c9a2ff', B: '#6b3fc4', T: '#ffd34d', G: '#ff4d6d' },
}
export const Chest = ({ id, className = '' }: { id: string; className?: string }) => (
  <PixelSprite rows={CHEST_ROWS} palette={CHEST_PAL[id] ?? CHEST_PAL.adventure} className={`chest ${className}`} />
)

const REWARD_SFX: Record<RarityName, SfxName> = { common: 'rewardCommon', rare: 'rewardRare', epic: 'rewardEpic', legendary: 'rewardLegendary' }
const pct = (n: number) => `${ar(Math.round(n * 10) / 10)}٪`

interface Props {
  character: CharacterDef
  coins: number
  play: (name: SfxName) => void
  reducedMotion: boolean
  /** Server balances changed (coins, points, inventory). */
  onChanged: () => void
  onLocker: () => void
}

/** صناديق المفاجآت — server-decided rewards paid with coins earned in the game. */
export function PackagesPanel({ character, coins, play, reducedMotion, onChanged, onLocker }: Props) {
  const [info, setInfo] = useState<PackagesInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<PackageType | null>(null)
  const [opening, setOpening] = useState<{ pk: PackageType; result: PackageOpen | null; error: string | null; retry?: boolean } | null>(null)
  const [showOdds, setShowOdds] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  // Same request id for retries of the same purchase, so a lost response never charges twice.
  const requestRef = useRef<{ pk: string; id: string } | null>(null)

  const load = useCallback(() => {
    api
      .getPackages()
      .then((i) => (setInfo(i), setError(null)))
      .catch((e) => setError(arabicError(e)))
  }, [])
  useEffect(() => load(), [load])

  const open = async (pk: PackageType) => {
    if (!requestRef.current || requestRef.current.pk !== pk.id) requestRef.current = { pk: pk.id, id: crypto.randomUUID() }
    setOpening({ pk, result: null, error: null })
    play('packageShake')
    try {
      const [r] = await Promise.all([api.openPackage(pk.id, requestRef.current.id), new Promise((res) => setTimeout(res, reducedMotion ? 0 : 1100))])
      requestRef.current = null
      play('packageOpen')
      setOpening({ pk, result: r, error: null })
      onChanged()
      load()
    } catch (e) {
      const msg = String((e as { message?: string }).message)
      // Definite refusals start a fresh request next time; network errors keep the id for a safe retry.
      const definite = /insufficient|disabled|daily|unknown/.test(msg)
      if (definite) requestRef.current = null
      play('wrong')
      setOpening({
        pk,
        retry: !definite,
        result: null,
        error: /daily package limit/.test(msg)
          ? 'وصلت إلى الحدّ اليومي لفتح الصناديق الذي حدّده ولي الأمر. عُد غدًا!'
          : /packages disabled/.test(msg)
            ? 'فتح الصناديق متوقف حاليًّا بقرار من ولي الأمر.'
            : arabicError(e),
      })
    }
  }

  if (error && !info) return <p className="shopx__warn">{error}</p>
  if (!info) return <p className="shopx__note">جارٍ تحميل الصناديق…</p>
  const remaining = Math.max(0, info.daily_limit - info.opened_today)

  return (
    <div className="pkgs">
      {!info.allowed ? (
        <p className="shopx__warn">فتح صناديق المفاجآت متوقف حاليًّا بقرار من ولي الأمر.</p>
      ) : (
        <p className="shopx__note">يمكنك فتح {ar(remaining)} من {ar(info.daily_limit)} صناديق اليوم (حدّ يضبطه ولي الأمر).</p>
      )}
      <ul className="pkgs__list" role="list">
        {info.packages.map((pk) => {
          const missing = Math.max(0, pk.price - coins)
          return (
            <li key={pk.id} className="pkgs__card" data-package={pk.id}>
              <Chest id={pk.id} className="pkgs__chest" />
              <h3 className="pkgs__name">{pk.name}</h3>
              <p className="pkgs__desc">{pk.description}</p>
              <CoinAmount value={pk.price} className="shopx__price" />
              <button
                type="button"
                className="pixel-button"
                disabled={!info.allowed || remaining === 0 || missing > 0 || !!opening}
                onClick={() => {
                  play('click')
                  setConfirm(pk)
                }}
              >
                فتح الصندوق
              </button>
              {missing > 0 && <p className="shopx__hint">تحتاج {ar(missing)} عملة إضافية.</p>}
            </li>
          )
        })}
      </ul>

      <div className="pkgs__info">
        <button type="button" className="acct__link" aria-expanded={showInfo} onClick={() => (play('menuOpen'), setShowInfo((v) => !v))}>
          ماذا يوجد داخل الصناديق؟
        </button>
        {showInfo && (
          <div className="pkgs__explain">
            <p>
              كل صندوق يعطي مكافآت يختارها الخادم عشوائيًّا: زينة للرأس والوجه والملابس والعباءات والأحذية والقفازات، أسلحة للزينة فقط، رفاق صغار،
              ونادرًا جدًّا شخصيات أسطورية. أحيانًا تحصل على حزمة صغيرة من العملات أو نقاط التطوير.
            </p>
            <ul className="pkgs__rarities">
              {(['common', 'rare', 'epic', 'legendary'] as const).map((r) => (
                <li key={r}>
                  <RarityTag rarity={r} /> {ar(info.pools[r] ?? 0)} غرضًا · المكرّر يتحوّل إلى {ar(RARITIES[r].dupPoints)} نقطة تطوير
                  {r === 'legendary' ? ' (الشخصية المكرّرة ١٥٠)' : ''}
                </li>
              ))}
            </ul>
            <p>
              إذا حصلت على شيء تملكه من قبل، يتحوّل تلقائيًّا إلى نقاط التطوير مرة واحدة فقط، وتستخدمها لترقية زينتك من برونزي حتى أسطوري. الترقيات
              للمظهر فقط ولا تؤثر في الأسئلة أو النقاط أو المنافسات.
            </p>
            <p>إذا لم تحصل على مكافأة ملحمية أو أفضل لعدة صناديق متتالية، يضمن لك الصندوق التالي واحدة.</p>
            <button type="button" className="acct__link" aria-expanded={showOdds} onClick={() => setShowOdds((v) => !v)}>
              {showOdds ? 'إخفاء الاحتمالات' : 'عرض الاحتمالات بالتفصيل'}
            </button>
            {showOdds && (
              <table className="pkgs__odds">
                <thead>
                  <tr>
                    <th>الصندوق</th>
                    {(['common', 'rare', 'epic', 'legendary'] as const).map((r) => (
                      <th key={r}>{RARITIES[r].label}</th>
                    ))}
                    <th>ضمان</th>
                  </tr>
                </thead>
                <tbody>
                  {info.packages.map((pk) => {
                    const total = Object.values(pk.weights).reduce((a, b) => a + b, 0) || 1
                    return (
                      <tr key={pk.id}>
                        <td>{pk.name}</td>
                        {(['common', 'rare', 'epic', 'legendary'] as const).map((r) => (
                          <td key={r}>{pct(((pk.weights[r] ?? 0) * 100) / total)}</td>
                        ))}
                        <td>
                          ملحمي كل {ar(pk.pity_epic)} · أسطورة كل {ar(pk.pity_legendary)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {info.history.length > 0 && (
        <details className="pkgs__history">
          <summary>آخر الصناديق التي فتحتها</summary>
          <ul>
            {info.history.map((h, i) => (
              <li key={i}>
                {new Date(h.at).toLocaleDateString('ar-EG')} — {info.packages.find((p) => p.id === h.package)?.name ?? h.package}: {h.rewards.map(rewardName).join('، ')}
              </li>
            ))}
          </ul>
        </details>
      )}

      {confirm && (
        <Overlay title="فتح صندوق" icon={<Chest id={confirm.id} className="overlay-sprite" />} backLabel="إلغاء" onClose={() => setConfirm(null)} onBack={() => play('back')} reducedMotion={reducedMotion}>
          <p>
            هل تريد فتح «{confirm.name}» مقابل {ar(confirm.price)} عملة؟
          </p>
          <p>سيصبح رصيدك {ar(coins - confirm.price)} عملة.</p>
          <button
            type="button"
            className="pixel-button shopx__confirm"
            onClick={() => {
              const pk = confirm
              setConfirm(null)
              void open(pk)
            }}
          >
            افتح!
          </button>
        </Overlay>
      )}

      {opening && (
        <Overlay
          title={opening.result ? 'مكافآتك!' : opening.error ? 'تعذّر الفتح' : 'جارٍ الفتح…'}
          icon={<Chest id={opening.pk.id} className={`overlay-sprite${!opening.result && !opening.error ? ' chest--shake' : ''}`} />}
          backLabel="متابعة"
          onClose={() => setOpening(null)}
          onBack={() => play('back')}
          reducedMotion={reducedMotion}
        >
          {opening.error && (
            <>
              <p>{opening.error}</p>
              {opening.retry && (
                <button type="button" className="pixel-button" onClick={() => void open(opening.pk)}>
                  إعادة المحاولة (لن تُخصم مرتين)
                </button>
              )}
            </>
          )}
          {!opening.result && !opening.error && <p aria-live="polite">الصندوق يهتزّ…</p>}
          {opening.result && (
            <RewardReveal result={opening.result} character={character} play={play} reducedMotion={reducedMotion} onLocker={onLocker} />
          )}
        </Overlay>
      )}
    </div>
  )
}

function rewardName(r: PackageReward): string {
  if (r.kind === 'coins') return `${ar(r.coins ?? 0)} عملة`
  if (r.kind === 'points') return `${ar(r.points ?? 0)} نقطة تطوير`
  const name = getItem(r.item ?? '')?.name ?? r.item ?? ''
  return r.duplicate ? `${name} (مكرّر → ${ar(r.points ?? 0)} نقطة)` : name
}

function RewardReveal({
  result,
  character,
  play,
  reducedMotion,
  onLocker,
}: {
  result: PackageOpen
  character: CharacterDef
  play: (n: SfxName) => void
  reducedMotion: boolean
  onLocker: () => void
}) {
  const [shown, setShown] = useState(reducedMotion ? result.rewards.length : 0)
  useEffect(() => {
    if (shown >= result.rewards.length) return
    const t = window.setTimeout(
      () => {
        const r = result.rewards[shown]
        play(REWARD_SFX[r.rarity])
        if (r.duplicate) window.setTimeout(() => play('convert'), 650)
        setShown((n) => n + 1)
      },
      shown === 0 ? 150 : 900,
    )
    return () => window.clearTimeout(t)
  }, [shown, result, play])

  const newItems = result.rewards.some((r) => r.kind === 'item' && !r.duplicate)
  return (
    <div className="reveal">
      <ul className="reveal__list" role="list" aria-live="polite">
        {result.rewards.slice(0, shown).map((r, i) => (
          <li key={i} className="reveal__item" data-rarity={r.rarity} style={{ '--rarity': RARITIES[r.rarity].color } as React.CSSProperties}>
            <span className="reveal__art">
              {r.kind === 'item' && r.item ? (
                <ItemThumb itemId={r.item} character={character} />
              ) : (
                <span className="reveal__bundle">{r.kind === 'coins' ? '🪙' : '✦'}</span>
              )}
            </span>
            <span className="reveal__text">
              <RarityTag rarity={r.rarity} />
              <strong>{r.kind === 'item' ? (getItem(r.item ?? '')?.name ?? r.item) : rewardName(r)}</strong>
              {r.kind === 'item' && !r.duplicate && <span className="reveal__new">جديد!</span>}
              {r.duplicate && (
                <span className="reveal__dup">
                  تملكه من قبل ← <span className="reveal__points">+{ar(r.points ?? 0)} نقطة تطوير</span>
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {shown >= result.rewards.length && (
        <>
          <p className="reveal__balance">
            رصيدك الآن: {ar(result.coins)} عملة · {ar(result.points)} نقطة تطوير
          </p>
          {newItems && (
            <button type="button" className="pixel-button shopx__confirm" onClick={onLocker}>
              الذهاب إلى الخزانة
            </button>
          )}
        </>
      )}
    </div>
  )
}
