// Load test on the REAL project: N synthetic students in one سباق المعرفة room, playing like real
// clients (state polling every 1.5 s, answering as soon as a question appears) for a 60-second match.
//   SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… CREDS=creds.json N=50 MODE=speed node scripts/e2e/real-load-test.mjs
import { check, creds, failures, kidEmail, rpc, signIn, sleep } from './real-common.mjs'

const N = Number(process.env.N ?? 50)
const MODE = process.env.MODE ?? 'speed'
const usernames = creds.kids.slice(0, N)
const players = []
for (const [i, u] of usernames.entries()) {
  players.push(await signIn(kidEmail(u), creds.password))
  if (i % 10 === 9) console.log(`signed in ${i + 1}/${N}`)
}
check(players.length === N, `${N} synthetic students signed in`)
for (const p of players) {
  const mine = await rpc(p, 'mp_my_room', {})
  if (mine) await rpc(p, 'mp_leave', { p_room: mine.room_id })
}
const room = await rpc(players[0], 'mp_create_room', { p_mode: MODE, p_subjects: [], p_lessons: [], p_settings: { duration: 60 } })
const joinT0 = Date.now()
const joins = await Promise.allSettled(players.slice(1).map((p) => rpc(p, 'mp_join', { p_code: room.code }).then(() => rpc(p, 'mp_set_ready', { p_room: room.room_id, p_ready: true }))))
check(joins.every((j) => j.status === 'fulfilled'), `${N - 1} players joined and got ready concurrently`, `${Date.now() - joinT0} ms`)
const st0 = await rpc(players[0], 'mp_state', { p_room: room.room_id })
check(st0.members.length === N, 'room shows every member', String(st0.members.length))
await rpc(players[0], 'mp_start', { p_room: room.room_id })

const lat = { state: [], answer: [] }
let errors = 0
let answered = 0
const end = Date.now() + 5000 + Number(process.env.SECONDS ?? 62) * 1000
async function client(p, i) {
  await sleep(Math.random() * 1500)
  while (Date.now() < end) {
    try {
      let t = Date.now()
      const st = await rpc(p, 'mp_state', { p_room: room.room_id })
      lat.state.push(Date.now() - t)
      const q = st.match?.question
      if (q && st.match.status === 'playing') {
        const a = q.type === 'written' ? 'إجابة' : String(1 + ((i + q.idx) % 4))
        t = Date.now()
        await rpc(p, 'mp_answer', { p_match: st.match.id, p_idx: q.idx, p_round: q.round, p_answer: a })
        lat.answer.push(Date.now() - t)
        answered++
        continue
      }
      if (st.match?.status === 'finished') return
    } catch (e) {
      if (!/time is up|not running|not your current/.test(String(e.message))) errors++
    }
    await sleep(1500)
  }
}
const t0 = Date.now()
await Promise.all(players.map((p, i) => client(p, i)))
const pct = (a, q) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * q)] : 0)
console.log(`requests: state ${lat.state.length}, answers ${lat.answer.length}, errors ${errors}, ${Math.round((Date.now() - t0) / 1000)} s`)
console.log(`latency ms — state p50 ${pct(lat.state, 0.5)} p95 ${pct(lat.state, 0.95)} max ${pct(lat.state, 1)} · answer p50 ${pct(lat.answer, 0.5)} p95 ${pct(lat.answer, 0.95)} max ${pct(lat.answer, 1)}`)
await sleep(3000)
const fin = await rpc(players[1], 'mp_state', { p_room: room.room_id })
check(fin.match.status === 'finished', 'match finished on the server clock')
check(fin.match.result.ranking.length === N, `ranking has all ${N} players`)
check(errors === 0, 'no unexpected errors under load', String(errors))
check(pct(lat.answer, 0.95) < 2000 && pct(lat.state, 0.95) < 2000, 'p95 latency under 2 s')
const sum = fin.match.players.reduce((n, p) => n + p.answered, 0)
check(sum === answered, 'every accepted answer counted exactly once', `${sum} / ${answered}`)
for (const p of players) await rpc(p, 'mp_leave', { p_room: room.room_id }).catch(() => {})
console.log(failures() ? `\n${failures()} FAILED` : '\nALL PASSED')
process.exit(failures() ? 1 : 0)
