import type { CSSProperties } from 'react'
import { PixelSprite } from '../components/PixelSprite'
import { ar } from '../quiz/format'
import type { MpMatch, MpMember } from './api'
import { MemberAvatar } from './Avatar'
import { PLAYER_COLORS, TEAM_COLORS, TEAM_NAMES, TERRITORIES } from './modes'

type Props = { match: MpMatch; members: Map<string, MpMember>; me: string }
const nick = (members: Map<string, MpMember>, id: string | null | undefined) => (id ? (members.get(id)?.nickname ?? 'لاعب') : '—')

export function Scoreboard({ match, members, me }: Props) {
  const max = Math.max(1, ...match.players.map((p) => p.score))
  return (
    <ol className="mpsb" aria-label="الترتيب">
      {match.players.slice(0, 50).map((p, i) => (
        <li key={p.student} className="mpsb__row" data-me={p.student === me || undefined}>
          <span className="mpsb__rank">{ar(i + 1)}</span>
          <span className="mpsb__avatar">
            <MemberAvatar m={members.get(p.student)} />
          </span>
          <span className="mpsb__name">{nick(members, p.student)}</span>
          <span className="mpsb__bar" style={{ '--pct': `${(p.score / max) * 100}%` } as CSSProperties} />
          <b className="mpsb__score">{ar(p.score)}</b>
        </li>
      ))}
    </ol>
  )
}

export function TeamsView({ match, members, me }: Props) {
  const teams = Array.from({ length: (match.state.teams as number) ?? 2 }, (_, t) => {
    const ps = match.players.filter((p) => p.team === t)
    return { t, total: ps.reduce((n, p) => n + p.score, 0), ps }
  })
  const max = Math.max(1, ...teams.map((t) => t.total))
  return (
    <div className="mpteams">
      {teams.map(({ t, total, ps }) => (
        <section key={t} className="mpteam" style={{ '--team': TEAM_COLORS[t] } as CSSProperties} data-mine={ps.some((p) => p.student === me) || undefined}>
          <h3>
            {TEAM_NAMES[t]} <b>{ar(total)}</b>
          </h3>
          <span className="mpteam__bar" style={{ '--pct': `${(total / max) * 100}%` } as CSSProperties} />
          <p className="mpteam__members">{ps.map((p) => `${nick(members, p.student)} (${ar(p.score)})`).join('، ')}</p>
        </section>
      ))}
    </div>
  )
}

export function SurvivalView({ match, members, me }: Props) {
  return (
    <ul className="mpsurv">
      {match.players.map((p) => (
        <li key={p.student} className="mpsurv__p" data-out={!p.alive || undefined} data-me={p.student === me || undefined}>
          <span className="mpsb__avatar">
            <MemberAvatar m={members.get(p.student)} />
          </span>
          <span>{nick(members, p.student)}</span>
          <span className="mpsurv__hearts" aria-label={`${ar(p.hearts)} قلوب`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className="mpheart" data-on={i < p.hearts || undefined}>
                ♥
              </span>
            ))}
          </span>
          {!p.alive && <span className="mpsurv__out">يشاهد</span>}
        </li>
      ))}
    </ul>
  )
}

export function DuelView({ match, members }: Props) {
  const [a, b] = [...match.players].sort((x, y) => x.student.localeCompare(y.student))
  if (!a || !b) return null
  return (
    <div className="mpduel">
      {[a, b].map((p, i) => (
        <div key={p.student} className="mpduel__side" data-side={i}>
          <span className="mpduel__avatar">
            <MemberAvatar m={members.get(p.student)} />
          </span>
          <b>{nick(members, p.student)}</b>
          <span className="mpduel__score">{ar(p.correct)}</span>
        </div>
      ))}
      <span className="mpduel__vs">ضد</span>
      <p className="mpduel__round">السؤال {ar(Math.min(match.round_no, 7))} من ٧</p>
    </div>
  )
}

export function TournamentView({ match, members, me }: Props) {
  const s = match.state
  const pairs = (s.pairs ?? []) as [string, string | null][]
  const history = (s.history ?? []) as { stage: number; pairs: [string, string | null][]; winners: string[] }[]
  const out = (s.out ?? {}) as Record<string, number>
  return (
    <div className="mptour">
      <p className="mptour__stage">
        الدور {ar(s.stage ?? 1)} · السؤال {ar(s.stage_round ?? 1)} من {ar(s.stage_rounds ?? 3)}
      </p>
      {out[me] !== undefined && out[me] < 100 && <p className="mp__note">خرجت من البطولة — تابع المباريات كمشاهد.</p>}
      <ul className="mptour__pairs">
        {pairs.map(([a, b]) => (
          <li key={`${a}-${b}`} className="mptour__pair" data-me={a === me || b === me || undefined}>
            <span>{nick(members, a)}</span>
            <span className="mptour__vs">{b ? 'ضد' : 'يتأهل مباشرة'}</span>
            {b && <span>{nick(members, b)}</span>}
          </li>
        ))}
      </ul>
      {history.length > 0 && (
        <details className="mptour__history">
          <summary>الأدوار السابقة</summary>
          {history.map((h) => (
            <p key={h.stage}>
              الدور {ar(h.stage)}: تأهّل {h.winners.map((w) => nick(members, w)).join('، ')}
            </p>
          ))}
        </details>
      )}
    </div>
  )
}

const adjacent = (a: number, b: number) => (Math.floor(a / 4) === Math.floor(b / 4) && Math.abs(a - b) === 1) || Math.abs(a - b) === 4

export function ConquestMap({
  match,
  members,
  me,
  selected,
  onTile,
}: Props & { selected: number | null; onTile: (i: number) => void }) {
  const s = match.state
  const owners = (s.owners ?? []) as string[]
  const order = (s.turn_order ?? []) as string[]
  const turnPlayer = order[s.turn ?? 0]
  const myTurn = turnPlayer === me && s.phase === 'choose' && match.status === 'playing'
  const attack = s.attack as { from: number; to: number; attacker: string; defender: string } | null
  const color = (id: string) => PLAYER_COLORS[Math.max(0, order.indexOf(id)) % PLAYER_COLORS.length]
  return (
    <div className="mpmap">
      <p className="mpmap__turn" aria-live="polite">
        {s.phase === 'duel' && attack
          ? `⚔️ ${nick(members, attack.attacker)} يهاجم «${TERRITORIES[attack.to]}» التي يدافع عنها ${nick(members, attack.defender)}`
          : myTurn
            ? selected === null
              ? 'دورك! اختر أرضًا تملكها، ثم أرضًا مجاورة لمنافس.'
              : 'اختر أرضًا مجاورة للهجوم.'
            : `دور ${nick(members, turnPlayer)}`}
      </p>
      <div className="mpmap__grid" role="grid" aria-label="خريطة الممالك">
        {owners.map((o, i) => {
          const canPick = myTurn && (selected === null ? o === me : o !== me && adjacent(selected, i))
          return (
            <button
              key={i}
              type="button"
              className="mpmap__tile"
              style={{ '--owner': color(o) } as CSSProperties}
              data-selected={selected === i || undefined}
              data-attacked={attack && (attack.to === i || attack.from === i) ? true : undefined}
              data-mine={o === me || undefined}
              disabled={!canPick}
              onClick={() => onTile(i)}
              aria-label={`${TERRITORIES[i]} — ${nick(members, o)}`}
            >
              <span className="mpmap__name">{TERRITORIES[i]}</span>
              <span className="mpmap__owner">{nick(members, o)}</span>
            </button>
          )
        })}
      </div>
      <ul className="mpmap__legend">
        {order.map((id) => (
          <li key={id} style={{ '--owner': color(id) } as CSSProperties}>
            {nick(members, id)}: {ar(owners.filter((o) => o === id).length)}
          </li>
        ))}
      </ul>
    </div>
  )
}

const BOSS = {
  rows: [
    '....OO..........OO....',
    '...ORRO........ORRO...',
    '...ORRRO......ORRRO...',
    '....ORRROOOOOORRRO....',
    '.....ORRRRRRRRRRO.....',
    '....ORRWWRRRRWWRRO....',
    '...ORRRWERRRRWERRRO...',
    '...ORRRRRRRRRRRRRRO...',
    '..OGRRRRRYYYYRRRRRGO..',
    '.OGGORRRYWYWYYRRROGGO.',
    'OGGGGORRRRRRRRRROGGGGO',
    'OGGG.OOrRRRRRRrOO.GGGO',
    '.OG...ORRRRRRRRO...GO.',
    '......ORROOOORRO......',
    '.....OYYO....OYYO.....',
    '.....OOOO....OOOO.....',
  ],
  palette: { O: '#2a1d5c', R: '#7c4dd6', r: '#5a32a8', W: '#ffffff', E: '#ff3b5c', Y: '#ffd23f', G: '#3fbf5a' },
}

export function BossView({ match }: Props) {
  const hp = match.state.hp as number
  const max = match.state.max_hp as number
  return (
    <div className="mpboss" data-down={hp <= 0 || undefined}>
      <PixelSprite rows={BOSS.rows} palette={BOSS.palette} className="mpboss__sprite" />
      <div className="mpboss__hp" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={hp} aria-label="صحة الزعيم">
        <span style={{ width: `${(hp / Math.max(1, max)) * 100}%` }} />
      </div>
      <p className="mpboss__label">
        تنين الألغاز: {ar(hp)} / {ar(max)}
      </p>
    </div>
  )
}

export function TreasureMap({ match, members, me, onPick }: Props & { onPick: (i: number) => void }) {
  const chests = (match.state.chests ?? []) as { v: number; o: string | null }[]
  const mine = match.players.find((p) => p.student === me)
  return (
    <div className="mptreasure">
      <p className="mp__note">{mine?.target == null ? 'اختر صندوقًا مغلقًا ثم أجب لتفتحه.' : `تحاول فتح الصندوق رقم ${ar(mine.target + 1)}…`}</p>
      <div className="mptreasure__grid">
        {chests.map((c, i) => (
          <button
            key={i}
            type="button"
            className="mpchest"
            data-v={c.v}
            data-open={c.o ? true : undefined}
            data-target={mine?.target === i || undefined}
            disabled={!!c.o || mine?.target != null || match.status !== 'playing'}
            onClick={() => onPick(i)}
            aria-label={c.o ? `مفتوح — ${nick(members, c.o)}` : `صندوق قيمته ${ar(c.v)}`}
          >
            <span className="mpchest__v">{ar(c.v)}</span>
            {c.o && <span className="mpchest__o">{nick(members, c.o)}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
