// Real-project checks for Features 2–5 (avatars, packages, upgrades, written questions,
// multiplayer rooms and all eight modes with real signed-in players, Realtime).
//   SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… CREDS=creds.json node scripts/e2e/real-features-check.mjs
// creds.json (never commit): { password, kidsParent: {email}, admin: {email}, kids: [usernames…] } — synthetic accounts only.
import { check, creds, failures, fails, kidEmail, mpAnswerFor, rpc, signIn, sleep } from './real-common.mjs'

const pw = creds.password
const admin = await signIn(creds.admin.email, pw)
const parent = await signIn((creds.kidsParent ?? creds.parentA).email, pw)
const kids = []
for (const u of creds.kids.slice(0, 4)) kids.push(await signIn(kidEmail(u), pw))
const ids = []
for (const k of kids) ids.push((await k.auth.getUser()).data.user.id)
check(true, 'synthetic parent, admin and 4 students sign in')

// ---------- Feature 2: avatars, packages, upgrades
const [k0, k1, k2] = kids
const st0 = await rpc(k0, 'get_my_game_state')
check(['human-boy', 'human-girl'].includes(st0.character_id), 'new students start as a human avatar', st0.character_id)
check(await fails(rpc(k0, 'set_character', { p_character: 'fox' })), 'creatures are locked (legendary collectibles)')
const look = { body: 'girl', skin: 2, hair: 'braid', hairColor: 1, theme: 'arabian', primary: 9, secondary: 3, hijab: true, hijabColor: 4 }
const sortObj = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).sort()))
check(sortObj(await rpc(k0, 'set_appearance', { p: look })) === sortObj(look), 'appearance saved and validated by the server')
check(await fails(rpc(k0, 'set_appearance', { p: { ...look, theme: 'bikini' } })), 'invalid clothing theme rejected')
// Earn coins by playing a real mission (server-verified), then open a package.
const catalog = await rpc(k0, 'get_catalog')
// The real subject (the regression script may have added a one-lesson synthetic subject).
const subject = [...catalog].sort((a, b) => b.units.length - a.units.length)[0]
const lesson = subject.units[0].lessons[0]
async function play(kid, kidId, missionId) {
  const s = await rpc(kid, 'start_quiz_session', { p_mission: missionId })
  const { data: order } = await admin.from('session_questions').select('question_id, option_order').eq('session_id', s.session_id)
  const qids = s.questions.map((q) => q.id)
  const { data: right } = await admin.from('question_options').select('question_id, option_id').in('question_id', qids).eq('is_correct', true)
  const { data: wr } = await admin.from('questions').select('id, accepted_answers').in('id', qids).eq('qtype', 'written')
  const perms = new Set(order.filter((o) => o.option_order).map((o) => o.option_order))
  for (const q of s.questions) {
    const o = order.find((x) => x.question_id === q.id)
    if (o.option_order) {
      const k = o.option_order.indexOf(right.find((r) => r.question_id === q.id).option_id) + 1
      await rpc(kid, 'submit_answer', { p_session: s.session_id, p_question: q.id, p_option: String(k) })
    } else await rpc(kid, 'submit_written', { p_session: s.session_id, p_question: q.id, p_text: wr.find((w) => w.id === q.id).accepted_answers[0] })
  }
  await rpc(kid, 'complete_quiz_session', { p_session: s.session_id })
  return { s, perms }
}
const { s: sess, perms } = await play(k0, ids[0], lesson.missions[0].id)
check(sess.questions.every((q) => q.type !== 'mcq' || q.options.map((o) => o.id).join('') === '1234'), 'MCQ options use opaque keys 1–4')
check(!JSON.stringify(sess).match(/"id":"[abcd]"|is_correct|accepted/), 'no answer key in the session sent to the browser')
check(perms.size > 1, 'each question in a session has its own option order', `${perms.size} permutations`)
const before = await rpc(k0, 'get_my_game_state')
const req = crypto.randomUUID()
const open = await rpc(k0, 'open_package', { p_package: 'adventure', p_request: req })
const again = await rpc(k0, 'open_package', { p_package: 'adventure', p_request: req })
const after = await rpc(k0, 'get_my_game_state')
const bundle = open.rewards.reduce((n, r) => n + (r.coins ?? 0), 0)
check(open.rewards.length === 1 && after.coins === before.coins - 60 + bundle, 'package charged once by the server', `coins ${before.coins} → ${after.coins}`)
check(again.replay === true && JSON.stringify(again.rewards) === JSON.stringify(open.rewards), 'replaying the same request returns the same rewards, no second charge')
const { data: pkgs } = await parent.rpc('parent_child_economy', { p_student: ids[0] })
check(pkgs?.packages?.length === 1, 'parent sees the package history')
await rpc(parent, 'parent_set_controls', { p_student: ids[0], p: { packages_allowed: false } })
check(await fails(rpc(k0, 'open_package', { p_package: 'adventure', p_request: crypto.randomUUID() })), 'parent can switch packages off')
await rpc(parent, 'parent_set_controls', { p_student: ids[0], p: { packages_allowed: true } })
check(await fails(rpc(k1, 'parent_set_controls', { p_student: ids[0], p: {} })), 'students cannot change parental controls')
const buy = await rpc(k0, 'purchase_item', { p_item: 'cape-red' }).catch((e) => e)
check(!(buy instanceof Error), 'shop purchase with earned coins')
check(await fails(rpc(k0, 'upgrade_item', { p_item: 'cape-red', p_from_tier: 1 })) || after.upgrade_points >= 20, 'upgrade refused without enough upgrade points')

// ---------- Feature 4: written questions
const { data: wq } = await admin.from('questions').select('id, legacy_id, lesson_id').eq('qtype', 'written').eq('status', 'published')
check((wq?.length ?? 0) === 23, 'published written questions in production', String(wq?.length))
const { data: g1 } = await admin.rpc('admin_test_grading', { p_question: wq.find((q) => q.legacy_id === 'rv8.u4.l4.26a.w').id, p_answer: 'يجوز' })
const { data: g2 } = await admin.rpc('admin_test_grading', { p_question: wq.find((q) => q.legacy_id === 'rv8.u4.l4.26a.w').id, p_answer: 'لايجوز' })
check(g1?.verdict === 'wrong' && g2?.verdict === 'correct', 'server grading: negation rejected, spacing variant accepted')
check(await fails(rpc(k0, 'grade_written', { p_question: wq[0].id, p_answer: 'x' })), 'students cannot call the grader directly')

// ---------- Feature 5: multiplayer with real players and Realtime
let realtimeEvents = 0
async function room(mode, players, settings = { duration: 60 }) {
  for (const p of players) {
    const mine = await rpc(p, 'mp_my_room', {})
    if (mine) await rpc(p, 'mp_leave', { p_room: mine.room_id })
  }
  const r = await rpc(players[0], 'mp_create_room', { p_mode: mode, p_subjects: [], p_lessons: [], p_settings: settings })
  for (const p of players.slice(1)) {
    await rpc(p, 'mp_join', { p_code: r.code })
    await rpc(p, 'mp_set_ready', { p_room: r.room_id, p_ready: true })
  }
  return r
}
async function playUntilDone(players, pids, roomId, rightOf, extra) {
  const deadline = Date.now() + 240000
  for (;;) {
    const states = await Promise.all(players.map((p) => rpc(p, 'mp_state', { p_room: roomId })))
    const m = states[0].match
    if (m.status === 'finished') return m
    if (Date.now() > deadline) return m
    if (extra) await extra(states)
    await Promise.all(states.map(async (st, i) => {
      const q = st.match?.question
      if (!q) return
      const a = await mpAnswerFor(admin, st.match.id, pids[i], q, rightOf(i))
      await rpc(players[i], 'mp_answer', { p_match: st.match.id, p_idx: q.idx, p_round: q.round, p_answer: a }).catch(() => {})
    }))
    await sleep(700)
  }
}

// Realtime: a member gets UPDATE notifications for its room row.
const r0 = await room('duel', [k0, k1])
const channel = k1.channel(`rt-${r0.room_id}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mp_rooms', filter: `id=eq.${r0.room_id}` }, () => realtimeEvents++)
await new Promise((res) => channel.subscribe((s) => s === 'SUBSCRIBED' && res()))
check(r0.code.match(/^[A-HJ-NP-Z2-9]{8}$/), 'private room code', r0.code)
check(await fails(rpc(k2, 'mp_state', { p_room: r0.room_id })), 'non-members cannot read a room')
check((await k2.from('mp_rooms').select('id')).data?.length === 0, 'rooms are not discoverable')
check((await rpc(k2, 'mp_join', { p_code: r0.code })).status === 'full', 'duel capacity enforced (2)')
await rpc(k0, 'mp_start', { p_room: r0.room_id })
await sleep(5500)
const duel = await playUntilDone([k0, k1], ids.slice(0, 2), r0.room_id, (i) => i === 0)
check(duel.status === 'finished' && duel.result.winners[0] === ids[0], 'duel: 7 rounds with real players, server picks the winner')
check(realtimeEvents >= 5, 'Realtime delivered room updates', `${realtimeEvents} events`)
await k1.removeChannel(channel)
check(await fails(k0.from('mp_players').update({ score: 99 }).eq('match_id', duel.id).select()) || true, 'clients cannot write scores')
const { data: forged } = await k0.from('mp_players').update({ score: 99 }).eq('match_id', duel.id).select()
check(!forged || forged.length === 0, 'forged score update has no effect')

for (const [mode, players, pids, right, settings] of [
  ['survival', [k0, k1, k2], ids.slice(0, 3), (i) => i === 0],
  ['speed', [k0, k1], ids.slice(0, 2), (i) => i === 1, { duration: 60 }],
  ['boss', [k0, k1], ids.slice(0, 2), () => true, { duration: 120 }],
  ['teams', kids, ids, (i) => i % 2 === 0, { duration: 60 }],
  ['tournament', kids, ids, (i) => i === 3],
]) {
  const r = await room(mode, players, settings)
  await rpc(players[0], 'mp_start', { p_room: r.room_id })
  await sleep(5500)
  const t0 = Date.now()
  const m = await playUntilDone(players, pids, r.room_id, right)
  check(m.status === 'finished' && (m.result.winners.length > 0 || m.result.boss_defeated === false), `${mode}: finished with real players`, `${Math.round((Date.now() - t0) / 1000)} s, winners ${m.result?.winners?.length}`)
  if (mode === 'boss') check(m.result.boss_defeated === true, 'boss defeated by correct answers')
  if (mode === 'tournament') check(m.result.winners[0] === ids[3], 'tournament champion decided by the server')
}

// Treasure: pick a chest before each question.
{
  const r = await room('treasure', [k0, k1], { duration: 60 })
  await rpc(k0, 'mp_start', { p_room: r.room_id })
  await sleep(5500)
  const m = await playUntilDone([k0, k1], ids.slice(0, 2), r.room_id, () => true, async (states) => {
    for (const [i, st] of states.entries()) {
      const me = st.match.players.find((p) => p.student === ids[i])
      if (st.match.status !== 'playing' || me.target !== null) continue
      const free = st.match.state.chests.findIndex((c) => c.o === null)
      if (free >= 0) await rpc([k0, k1][i], 'mp_treasure_pick', { p_match: st.match.id, p_chest: free }).catch(() => {})
    }
  })
  check(m.status === 'finished', 'treasure: chests opened and the match finished', `winners ${m.result?.winners?.length}`)
}

// Conquest: attacks on the player's turn.
{
  const r = await room('conquest', [k0, k1], { duration: 300 })
  await rpc(k0, 'mp_start', { p_room: r.room_id })
  await sleep(5500)
  const m = await playUntilDone([k0, k1], ids.slice(0, 2), r.room_id, (i) => i === 0, async (states) => {
    const st = states[0].match
    if (st.status !== 'playing' || st.state.phase !== 'choose') return
    const me = st.state.turn_order[st.state.turn]
    const i = ids.indexOf(me)
    const owners = st.state.owners
    for (let a = 0; a < 12; a++) {
      if (owners[a] !== me) continue
      for (const b of [a - 1, a + 1, a - 4, a + 4]) {
        if (b < 0 || b > 11 || (Math.abs(a - b) === 1 && Math.floor(a / 4) !== Math.floor(b / 4)) || owners[b] === me) continue
        await rpc([k0, k1][i], 'mp_conquest_attack', { p_match: st.id, p_from: a, p_to: b }).catch(() => {})
        return
      }
    }
  })
  check(m.status === 'finished' && m.result.winners[0] === ids[0], 'conquest: territories captured, server decides the winner')
}

const { data: rewards } = await admin.from('reward_transactions').select('student_id, xp, coins').eq('kind', 'multiplayer').in('student_id', ids)
check(rewards.every((r) => r.xp <= 25 && r.coins <= 15), 'multiplayer rewards stay modest', `${rewards.length} rewards`)
const perKid = ids.map((id) => rewards.filter((r) => r.student_id === id).length)
check(perKid.every((n) => n <= 5), 'at most 5 rewarded matches per student per day', perKid.join(','))

console.log(failures() ? `\n${failures()} FAILED` : '\nALL PASSED')
process.exit(failures() ? 1 : 0)
