import { ar } from '../quiz/format'

export interface Bar {
  label: string
  /** Stacked parts, drawn in order: e.g. first-try, assisted, missed. */
  parts: number[]
}

const COLORS = ['#2e9e5b', '#e0a91a', '#d0503f']

/** Horizontal stacked bars (RTL) with an accessible table of the same numbers. */
export function Bars({ bars, legend, caption }: { bars: Bar[]; legend: string[]; caption: string }) {
  const max = Math.max(1, ...bars.map((b) => b.parts.reduce((s, x) => s + x, 0)))
  return (
    <figure className="bars">
      <figcaption className="area__muted">{caption}</figcaption>
      <div className="bars__legend" aria-hidden="true">
        {legend.map((l, i) => (
          <span key={l}>
            <i style={{ background: COLORS[i] }} /> {l}
          </span>
        ))}
      </div>
      <div className="bars__rows" aria-hidden="true">
        {bars.map((b) => {
          const total = b.parts.reduce((s, x) => s + x, 0)
          return (
            <div key={b.label} className="bars__row">
              <span className="bars__label">{b.label}</span>
              <span className="bars__track">
                {b.parts.map((p, i) =>
                  p ? <span key={i} className="bars__seg" style={{ width: `${(p / max) * 100}%`, background: COLORS[i] }} /> : null,
                )}
              </span>
              <span className="bars__total">{ar(total)}</span>
            </div>
          )
        })}
      </div>
      <table className="visually-hidden">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th>البند</th>
            {legend.map((l) => (
              <th key={l}>{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bars.map((b) => (
            <tr key={b.label}>
              <td>{b.label}</td>
              {b.parts.map((p, i) => (
                <td key={i}>{p}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
