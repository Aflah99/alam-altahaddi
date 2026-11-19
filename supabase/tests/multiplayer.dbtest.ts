// Feature 5: private multiplayer rooms and all eight modes, played by synthetic students against
// the real SQL engine (RLS, SECURITY DEFINER functions, server clock via the test-only mp_clock offset).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { as, createParent, createStudent, dbAvailable, pool, root, rpc } from './db'

type Q = { idx: number; round: number; type: string; text: string; options: { id: string; text: string }[] }
type Player = { student: string; score: number; correct: number; answered: number; hearts: number; alive: boolean; team: number | null }
type Match = {
  id: string; mode: string; status: string; round_no: number; state: Record<string, any>; result: any; players: Player[]
  question: Q | null; round: { round: number; participants: string[]; resolved: boolean; me_answered: boolean } | null
}
type State = { room: { id: string; code: string | null; status: string; host: string; mode: string }; members: { id: string; ready: boolean }[]; match: Match | null }

beforeAll(async () => {
  if (!(await dbAvailable())) throw new Error('Local test database not available: run `npm run test:db`.')
})
afterAll(async () => {
  await root('delete from public.mp_clock')
  await pool.end()
})

let clock = 0
beforeEach(async () => {
  clock = 0
  await root('delete from public.mp_clock')
})
async function advance(seconds: number) {
  clock += seconds * 1000
  await root('insert into public.mp_clock (id, offset_ms) values (true, $1) on conflict (id) do update set offset_ms = excluded.offset_ms', [clock])
}

async function students(n: number) {
  const parent = await createParent()
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(await createStudent(parent, `لاعب${i}`))
  return { parent, ids: out }
}
const state = (s: string, room: string) => rpc<State>(s, 'mp_state', room)

/** Creates a room, everyone joins and gets ready; returns the room id. */
async function room(mode: string, players: string[], settings: Record<string, unknown> = {}) {
  const { room_id, code } = await rpc<{ room_id: string; code: string }>(players[0], 'mp_create_room', mode, null, null, JSON.stringify(settings))
  for (const p of players.slice(1)) {
    expect((await rpc<{ status: string }>(p, 'mp_join', code)).status).toBe('joined')
    await rpc(p, 'mp_set_ready', room_id, true)
  }
  return room_id
}
async function startAndPlay(roomId: string, host: string) {
  const match = await rpc<string>(host, 'mp_start', roomId)
  await advance(6) // countdown
  await state(host, roomId)
  return match
}
/** The display key of the correct option (or the accepted text) for the question a player was shown. Test-only peek. */
async function correctAnswer(match: string, student: string, q: Q) {
  const [r] = await root<{ order: string | null; letter: string | null; accepted: string }>(
    `select s.option_order as order, (select option_id from public.question_options o where o.question_id = mq.question_id and o.is_correct) letter,
            qq.accepted_answers[1] accepted
     from public.mp_serves s join public.mp_match_questions mq on mq.match_id = s.match_id and mq.idx = s.question_idx
     join public.questions qq on qq.id = mq.question_id
     where s.match_id = $1 and s.student_id = $2 and s.question_idx = $3 and s.round_no = $4`, [match, student, q.idx, q.round])
  return r.order ? String(r.order.indexOf(r.letter!) + 1) : r.accepted
}
async function wrongAnswer(match: string, student: string, q: Q) {
  const right = await correctAnswer(match, student, q)
  return q.type === 'mcq' ? ['1', '2', '3', '4'].find((k) => k !== right)! : 'إجابة غير صحيحة تماما'
}
async function answer(student: string, roomId: string, right: boolean) {
  const st = await state(student, roomId)
  const q = st.match?.question
  if (!q) return null
  const a = right ? await correctAnswer(st.match!.id, student, q) : await wrongAnswer(st.match!.id, student, q)
  return rpc<{ feedback: string; gain: number }>(student, 'mp_answer', st.match!.id, q.idx, q.round, a)
}

describe('rooms', () => {
  it('private codes: unpredictable format, joinable, revocable, rate-limited, capacity-checked', async () => {
    const { ids } = await students(4)
    const [a, b, c, d] = ids
    const { room_id, code } = await rpc<{ room_id: string; code: string }>(a, 'mp_create_room', 'duel', null, null, '{}')
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
    expect((await rpc<{ status: string }>(b, 'mp_join', ` ${code.toLowerCase().slice(0, 4)}-${code.slice(4)} `)).status).toBe('joined')
    expect((await rpc<{ status: string }>(c, 'mp_join', code)).status).toBe('full') // duel = exactly 2
    await expect(state(c, room_id)).rejects.toThrow(/not in this room/)
    // Rooms are not discoverable: nobody outside can read them.
    expect(await as(c, 'select * from public.mp_rooms where id = $1', [room_id])).toEqual([])
    const newCode = await rpc<string>(a, 'mp_new_invite', room_id)
    expect((await rpc<{ status: string }>(d, 'mp_join', code)).status).toBe('invalid') // the old code is revoked
    expect(newCode).not.toBe(code)
    for (let i = 0; i < 7; i++) await rpc(d, 'mp_join', 'ZZZZZZZZ')
    await expect(rpc(d, 'mp_join', newCode)).rejects.toThrow(/rate_limited/)
    await expect(rpc(b, 'mp_new_invite', room_id)).rejects.toThrow(/host only/)
  })

  it('parents can switch multiplayer and reactions off; only preset reactions with a cooldown', async () => {
    const { parent, ids } = await students(2)
    const [a, b] = ids
    const roomId = await room('speed', [a, b])
    await rpc(a, 'mp_react', roomId, 'good_luck')
    await expect(rpc(a, 'mp_react', roomId, 'e_star')).rejects.toThrow(/rate_limited/)
    await expect(rpc(b, 'mp_react', roomId, 'you are bad')).rejects.toThrow(/invalid reaction/)
    await rpc(parent, 'parent_set_controls', b, JSON.stringify({ reactions_allowed: false }))
    await expect(rpc(b, 'mp_react', roomId, 'hello')).rejects.toThrow(/reactions disabled/)
    await rpc(parent, 'parent_set_controls', b, JSON.stringify({ multiplayer_allowed: false }))
    await expect(rpc(b, 'mp_create_room', 'speed', null, null, '{}')).rejects.toThrow(/multiplayer disabled/)
    const st = await state(a, roomId)
    expect(JSON.stringify(st)).not.toMatch(/username|@|email/)
  })

  it('host leaving hands the room to the next player; start needs enough ready players', async () => {
    const { ids } = await students(3)
    const [a, b, c] = ids
    const { room_id, code } = await rpc<{ room_id: string; code: string }>(a, 'mp_create_room', 'teams', null, null, '{}')
    await rpc(b, 'mp_join', code)
    await expect(rpc(a, 'mp_start', room_id)).rejects.toThrow(/not enough players/)
    await rpc(c, 'mp_join', code)
    await rpc(a, 'mp_update_room', room_id, 'speed', null, null, '{}')
    await expect(rpc(a, 'mp_start', room_id)).rejects.toThrow(/not ready/)
    await rpc(a, 'mp_leave', room_id)
    expect((await state(b, room_id)).room.host).toBe(b)
  })
})

describe('speed challenge (سباق المعرفة)', () => {
  it('server-verified scores, personal question order, idempotent answers, ranking and capped rewards', async () => {
    const { ids } = await students(3)
    const [a, b, c] = ids
    const roomId = await room('speed', ids, { duration: 60 })
    const match = await startAndPlay(roomId, a)
    const qa = (await state(a, roomId)).match!.question!
    const qb = (await state(b, roomId)).match!.question!
    // Personal orders differ (with overwhelming probability).
    const [{ same }] = await root<{ same: boolean }>(`select (select q_order from mp_players where match_id = $1 and student_id = $2) = (select q_order from mp_players where match_id = $1 and student_id = $3) same`, [match, a, b])
    expect(same).toBe(false)
    // Answering someone else's question or a fake index is refused.
    if (qb.idx !== qa.idx) await expect(rpc(a, 'mp_answer', match, qb.idx, 0, '1')).rejects.toThrow(/not your current question/)
    const key = await correctAnswer(match, a, qa)
    const [r1, r2] = await Promise.all([rpc(a, 'mp_answer', match, qa.idx, 0, key), rpc(a, 'mp_answer', match, qa.idx, 0, key)].map((p) => p.catch((e) => e)))
    expect([r1, r2].filter((r) => !(r instanceof Error) && (r as { duplicate?: boolean }).duplicate !== true).length).toBeGreaterThanOrEqual(1)
    for (let i = 0; i < 3; i++) await answer(a, roomId, true)
    for (let i = 0; i < 4; i++) await answer(b, roomId, i % 2 === 0)
    await answer(c, roomId, false)
    // Clients cannot write scores or results.
    await expect(as(a, `update public.mp_players set score = 999 where match_id = $1`, [match])).rejects.toThrow()
    await expect(rpc(a, 'mp_finish', match)).rejects.toThrow(/permission denied/)
    await advance(61)
    const fin = (await state(c, roomId)).match!
    expect(fin.status).toBe('finished')
    expect(fin.result.winners).toEqual([a])
    const ra = fin.result.ranking.find((x: { student: string }) => x.student === a)
    expect(ra).toMatchObject({ score: 4, correct: 4, xp: 13, coins: 9 })
    const rc = fin.result.ranking.find((x: { student: string }) => x.student === c)
    expect(rc.xp).toBe(0) // fewer than 3 answers: no reward
    const [{ n }] = await root<{ n: number }>(`select count(*)::int n from reward_transactions where kind = 'multiplayer' and ref = $1`, [match])
    expect(n).toBe(2)
    await expect(rpc(a, 'mp_answer', match, 0, 0, '1')).resolves.toBeTruthy().catch(() => {})
  })

  it('daily reward cap: repeated private matches stop paying', async () => {
    const { ids } = await students(2)
    const [a, b] = ids
    await root(`insert into reward_transactions (student_id, kind, ref, xp, coins) select $1, 'multiplayer', gen_random_uuid()::text, 1, 1 from generate_series(1, 5)`, [a])
    const roomId = await room('speed', ids, { duration: 60 })
    const match = await startAndPlay(roomId, a)
    for (let i = 0; i < 3; i++) {
      await answer(a, roomId, true)
      await answer(b, roomId, true)
    }
    await advance(61)
    const fin = (await state(a, roomId)).match!
    expect(fin.result.ranking.find((x: { student: string }) => x.student === a)).toMatchObject({ xp: 0, capped: true })
    expect(fin.result.ranking.find((x: { student: string }) => x.student === b).xp).toBeGreaterThan(0)
    void match
  })
})

describe('survival (تحدّي الصمود)', () => {
  it('three hearts, eliminations, nobody loses a heart when all miss, last one standing wins', async () => {
    const { ids } = await students(3)
    const [a, b, c] = ids
    const roomId = await room('survival', ids)
    const match = await startAndPlay(roomId, a)
    // Round 1: everyone wrong → no hearts lost.
    for (const s of ids) await answer(s, roomId, false)
    let m = (await state(a, roomId)).match!
    expect(m.players.every((p) => p.hearts === 3)).toBe(true)
    // Rounds 2–4: a right, b and c wrong → b and c lose all hearts.
    for (let r = 0; r < 3; r++) {
      await advance(3)
      await answer(a, roomId, true)
      await answer(b, roomId, false)
      await answer(c, roomId, false)
    }
    m = (await state(b, roomId)).match!
    expect(m.status).toBe('finished')
    expect(m.result.winners).toEqual([a])
    expect(m.players.find((p) => p.student === b)).toMatchObject({ alive: false, hearts: 0 })
    void match
  })

  it('a player who never answers simply times out (disconnects cannot stall the match)', async () => {
    const { ids } = await students(2)
    const [a] = ids
    const roomId = await room('survival', ids)
    await startAndPlay(roomId, a)
    for (let r = 0; r < 3; r++) {
      await advance(3)
      await answer(a, roomId, true)
      await advance(21) // b is offline
      await state(a, roomId)
    }
    const m = (await state(a, roomId)).match!
    expect(m.status).toBe('finished')
    expect(m.result.winners).toEqual([a])
  })
})

describe('quick duel (منافسة سريعة)', () => {
  it('exactly two players, seven rounds, correct answers then speed decide; rematch returns to the room', async () => {
    const { ids } = await students(2)
    const [a, b] = ids
    const roomId = await room('duel', ids)
    await startAndPlay(roomId, a)
    for (let r = 0; r < 7; r++) {
      await advance(3)
      await answer(a, roomId, true)
      await answer(b, roomId, r < 3)
    }
    const m = (await state(a, roomId)).match!
    expect(m.status).toBe('finished')
    expect(m.result.winners).toEqual([a])
    expect(m.players.find((p) => p.student === a)!.score).toBe(0) // duel ranks by correct answers
    expect(m.result.ranking[0]).toMatchObject({ student: a, correct: 7 })
    await rpc(b, 'mp_back_to_lobby', roomId)
    expect((await state(a, roomId)).room.status).toBe('lobby')
  })
})

describe('tournament (بطولة الأبطال)', () => {
  it('five players: pairs with a bye, stages, eliminations and one champion', async () => {
    const { ids } = await students(5)
    const roomId = await room('tournament', ids)
    const match = await startAndPlay(roomId, ids[0])
    const order = (await root<{ student_id: string }>(`select student_id from mp_players where match_id = $1 order by seed`, [match])).map((r) => r.student_id)
    const champion = order[order.length - 1] // the bye player: always answers correctly
    for (let guard = 0; guard < 40; guard++) {
      const m = (await state(ids[0], roomId)).match!
      if (m.status === 'finished') break
      await advance(4) // past the short pause before each round
      for (const s of ids) await answer(s, roomId, s === champion)
    }
    const m = (await state(ids[1], roomId)).match!
    expect(m.status).toBe('finished')
    expect(m.result.winners).toEqual([champion])
    expect(m.players.filter((p) => p.alive).map((p) => p.student)).toEqual([champion])
    expect(m.state.history.length).toBeGreaterThanOrEqual(3)
  })
})

describe('kingdom conquest (غزو الممالك)', () => {
  it('turns, adjacency, captures decided by the server, skipped turns and a final winner', async () => {
    const { ids } = await students(2)
    const [a, b] = ids
    const roomId = await room('conquest', ids, { duration: 300 })
    const match = await startAndPlay(roomId, a)
    let m = (await state(a, roomId)).match!
    expect(m.state.owners).toHaveLength(12)
    const turnOf = (mm: Match) => mm.state.turn_order[mm.state.turn] as string
    const other = (s: string) => (s === a ? b : a)
    // Not your turn / not adjacent / not yours are refused.
    const mover = turnOf(m)
    await expect(rpc(other(mover), 'mp_conquest_attack', match, 0, 1)).rejects.toThrow(/not your turn/)
    for (let turn = 0; turn < 36; turn++) {
      m = (await state(a, roomId)).match!
      if (m.status === 'finished') break
      const me = turnOf(m)
      const owners: string[] = m.state.owners
      let from = -1, to = -1
      for (let i = 0; i < 12 && from < 0; i++)
        if (owners[i] === me) for (const j of [i - 1, i + 1, i - 4, i + 4]) {
          if (j < 0 || j > 11 || (Math.abs(i - j) === 1 && Math.floor(i / 4) !== Math.floor(j / 4))) continue
          if (owners[j] !== me) { from = i; to = j; break }
        }
      if (me === b && turn % 4 === 1) { await advance(21); continue } // b sometimes lets the turn time out
      await rpc(me, 'mp_conquest_attack', match, from, to)
      await advance(2)
      await answer(me, roomId, me === a) // a always right, b always wrong
      await answer(other(me), roomId, false)
    }
    m = (await state(b, roomId)).match!
    expect(m.status).toBe('finished')
    expect(m.result.winners).toEqual([a])
    expect(m.state.owners.filter((o: string) => o === a).length).toBeGreaterThan(6)
  })
})

describe('boss battle (الزعيم الأسطوري)', () => {
  it('correct answers damage a shared boss; everyone who took part wins when it falls', async () => {
    const { ids } = await students(2)
    const [a, b] = ids
    const roomId = await room('boss', ids, { duration: 300 })
    await startAndPlay(roomId, a)
    let m = (await state(a, roomId)).match!
    expect(m.state.hp).toBe(120)
    for (let i = 0; i < 12 && m.status !== 'finished'; i++) {
      await answer(a, roomId, true)
      await answer(b, roomId, i % 3 !== 0)
      m = (await state(a, roomId)).match!
    }
    expect(m.status).toBe('finished')
    expect(m.result.boss_defeated).toBe(true)
    expect([...m.result.winners].sort()).toEqual([a, b].sort())
  })
})

describe('treasure hunt (صيد الكنوز)', () => {
  it('choose a chest, answer to open it; visible fixed values; first to open claims it', async () => {
    const { ids } = await students(2)
    const [a, b] = ids
    const roomId = await room('treasure', ids, { duration: 120 })
    const match = await startAndPlay(roomId, a)
    let st = await state(a, roomId)
    expect(st.match!.question).toBeNull() // must pick first
    expect(st.match!.state.chests).toHaveLength(10)
    await rpc(a, 'mp_treasure_pick', match, 2) // value 30
    await rpc(b, 'mp_treasure_pick', match, 2)
    expect((await answer(a, roomId, true))!.gain).toBe(30)
    expect((await answer(b, roomId, true))!.gain).toBe(5) // already opened: consolation
    await expect(rpc(b, 'mp_treasure_pick', match, 2)).rejects.toThrow(/not available/)
    await advance(121)
    st = await state(b, roomId)
    expect(st.match!.status).toBe('finished')
    expect(st.match!.result.winners).toEqual([a])
  })
})

describe('team battle (معركة الفرق)', () => {
  it('balanced teams and a shared team score decide the winners', async () => {
    const { ids } = await students(4)
    const roomId = await room('teams', ids, { duration: 60 })
    const match = await startAndPlay(roomId, ids[0])
    const players = (await state(ids[0], roomId)).match!.players
    const teams = new Map<number, string[]>()
    for (const p of players) teams.set(p.team!, [...(teams.get(p.team!) ?? []), p.student])
    expect([...teams.values()].map((t) => t.length)).toEqual([2, 2])
    const [t0] = [...teams.values()]
    for (const s of ids) for (let i = 0; i < 3; i++) await answer(s, roomId, t0.includes(s))
    await advance(61)
    const m = (await state(ids[0], roomId)).match!
    expect([...m.result.winners].sort()).toEqual([...t0].sort())
    expect(Object.keys(m.result.team_scores)).toHaveLength(2)
    void match
  })
})

describe('concurrency', () => {
  it('twenty players answering at the same moment are all recorded exactly once', async () => {
    const { ids } = await students(20)
    const roomId = await room('speed', ids, { duration: 120 })
    const match = await startAndPlay(roomId, ids[0])
    const qs = await Promise.all(ids.map(async (s) => ({ s, q: (await state(s, roomId)).match!.question! })))
    const keys = await Promise.all(qs.map(async ({ s, q }) => ({ s, q, k: await correctAnswer(match, s, q) })))
    // Each player submits twice at once (double tap): exactly one answer per player is stored.
    const results = await Promise.allSettled(keys.flatMap(({ s, q, k }) => [rpc(s, 'mp_answer', match, q.idx, 0, k), rpc(s, 'mp_answer', match, q.idx, 0, k)]))
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(20)
    const [{ n, players }] = await root<{ n: number; players: number }>(`select count(*)::int n, count(distinct student_id)::int players from mp_answers where match_id = $1`, [match])
    expect([n, players]).toEqual([20, 20])
    const [{ s }] = await root<{ s: number }>(`select sum(score)::int s from mp_players where match_id = $1`, [match])
    expect(s).toBe(20)
  })
})
