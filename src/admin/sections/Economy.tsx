import { useState } from 'react'
import { RARITIES, type Rarity } from '../../cosmetics/wearables'
import { ar } from '../../quiz/format'
import { adminError, rpc, useLoad } from '../data'

interface Pkg {
  id: string
  name_ar: string
  price: number
  rolls: number
  weights: Record<Rarity, number>
  guarantee: Rarity
  pity_epic: number
  pity_legendary: number
  active: boolean
  opens: number
}
interface Item {
  id: string
  category: string
  name: string
  rarity: Rarity
  price: number
  in_shop: boolean
  in_packages: boolean
  active: boolean
  owners: number
}
interface Eco {
  packages: Pkg[]
  items: Item[]
  totals: { opens: number; duplicates: number; upgrades: number }
}

/** الاقتصاد — package prices and pity, item prices and availability. Every change is audited. */
export function EconomySection() {
  const [tick, setTick] = useState(0)
  const { data, error } = useLoad(() => rpc<Eco>('admin_economy'), [tick])
  const [msg, setMsg] = useState<string | null>(null)
  const save = async (fn: string, p: Record<string, unknown>) => {
    try {
      await rpc(fn, { p })
      setMsg('حُفظ.')
      setTick((n) => n + 1)
    } catch (e) {
      setMsg(adminError(e))
    }
  }
  return (
    <>
      <h1 className="area__h1">الاقتصاد والصناديق</h1>
      <p className="area__muted">كل الأغراض تجميلية. العملات تُكسب من اللعب فقط، ولا توجد أي مشتريات بمال حقيقي. التغييرات تُسجّل في سجل التدقيق.</p>
      {error && <p className="area__error">{error}</p>}
      {msg && <p className="area__muted" role="status">{msg}</p>}
      {data && (
        <>
          <div className="area__grid">
            <div className="area__stat"><b>{ar(data.totals.opens)}</b><span>صندوقًا فُتح</span></div>
            <div className="area__stat"><b>{ar(data.totals.duplicates)}</b><span>مكرّرًا حُوّل إلى نقاط</span></div>
            <div className="area__stat"><b>{ar(data.totals.upgrades)}</b><span>ترقية</span></div>
          </div>
          <h2 className="area__h2">صناديق المفاجآت</h2>
          {data.packages.map((p) => (
            <div key={p.id} className="area__card">
              <b>{p.name_ar}</b> <span className="area__muted">({p.id} · {ar(p.rolls)} مكافآت · فُتح {ar(p.opens)} مرة)</span>
              <p className="area__muted">
                الأوزان: {(Object.keys(RARITIES) as Rarity[]).map((r) => `${RARITIES[r].label} ${ar(p.weights[r] ?? 0)}`).join(' · ')} · الضمان: {RARITIES[p.guarantee].label}
              </p>
              <div className="area__row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <NumberField label="السعر" value={p.price} min={10} max={5000} onSave={(v) => void save('admin_set_package', { id: p.id, price: v })} />
                <NumberField label="ضمان الملحمي بعد" value={p.pity_epic} min={1} max={200} onSave={(v) => void save('admin_set_package', { id: p.id, pity_epic: v })} />
                <NumberField label="ضمان الأسطورة بعد" value={p.pity_legendary} min={1} max={500} onSave={(v) => void save('admin_set_package', { id: p.id, pity_legendary: v })} />
                <label className="area__check">
                  <input type="checkbox" checked={p.active} onChange={(e) => void save('admin_set_package', { id: p.id, active: e.target.checked })} /> متاح
                </label>
              </div>
            </div>
          ))}
          <h2 className="area__h2">الأغراض ({ar(data.items.length)})</h2>
          <div className="area__table-wrap">
            <table className="area__table">
              <thead>
                <tr>
                  <th>الغرض</th>
                  <th>القسم</th>
                  <th>الندرة</th>
                  <th>السعر</th>
                  <th>في المتجر</th>
                  <th>في الصناديق</th>
                  <th>يملكه</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.name}</td>
                    <td>{i.category}</td>
                    <td>{RARITIES[i.rarity].label}</td>
                    <td>{i.category === 'characters' ? '—' : <NumberField value={i.price} min={0} max={10000} onSave={(v) => void save('admin_set_item', { id: i.id, price: v })} />}</td>
                    <td>
                      <input type="checkbox" aria-label="في المتجر" checked={i.in_shop} disabled={i.category === 'characters'} onChange={(e) => void save('admin_set_item', { id: i.id, in_shop: e.target.checked })} />
                    </td>
                    <td>
                      <input type="checkbox" aria-label="في الصناديق" checked={i.in_packages} onChange={(e) => void save('admin_set_item', { id: i.id, in_packages: e.target.checked })} />
                    </td>
                    <td>{ar(i.owners)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}

function NumberField({ label, value, min, max, onSave }: { label?: string; value: number; min: number; max: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value))
  return (
    <label>
      {label}{' '}
      <input
        type="number"
        inputMode="numeric"
        value={v}
        min={min}
        max={max}
        style={{ width: 80 }}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = Math.round(Number(v))
          if (Number.isFinite(n) && n >= min && n <= max && n !== value) onSave(n)
        }}
      />
    </label>
  )
}
