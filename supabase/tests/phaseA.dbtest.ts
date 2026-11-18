// Phase A (Task 07): roles, families, content protection, server-validated quizzes,
// rewards, shop and legacy import — tested against real PostgreSQL with RLS.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { as, createAdmin, createParent, createStudent, dbAvailable, missionOf, pool, root, rpc, wrongOf } from './db'

let ok = false
beforeAll(async () => {
  ok = await dbAvailable()
  if (!ok) throw new Error('Local test database not available: run `npm run test:db` (it resets the database first).')
})
afterAll(() => pool.end())

type Session = { session_id: string; questions: { id: string; options: { id: string; text: string }[] }[] }
type Answer = { feedback: string; result: string | null; correct_option: string | null; explanation: string | null; hint: string | null; reward: { xp: number; coins: number; already_rewarded: boolean } | null }

describe('accounts and roles', () => {
  it('parents sign up as parents even if they claim admin in user metadata', async () => {
    const p = await createParent()
    expect((await root('select role from public.profiles where id = $1', [p]))[0].role).toBe('parent')
  })

  it('a child account created by the backend is a student linked to its parent', async () => {
    const p = await createParent()
    const s = await createStudent(p)
    expect((await root('select role from public.profiles where id = $1', [s]))[0].role).toBe('student')
    expect(await as(p, 'select student_id from public.parent_children')).toEqual([{ student_id: s }])
  })

  it('nobody can change their own role or call grant_admin through the API', async () => {
    const p = await createParent()
    await expect(as(p, `update public.profiles set role = 'admin' where id = $1`, [p])).rejects.toThrow(/role cannot be changed/)
    await expect(as(p, `select public.grant_admin('x@example.test')`)).rejects.toThrow(/permission denied/)
    const s = await createStudent(p)
    await expect(as(s, `update public.profiles set role = 'admin' where id = $1`, [s])).rejects.toThrow(/role cannot be changed/)
  })

  it('students cannot change protected fields (username, character) directly', async () => {
    const s = await createStudent(await createParent())
    await expect(as(s, `update public.student_profiles set character_id = 'owl' where id = $1`, [s])).rejects.toThrow(/cannot be changed/)
    await expect(as(s, `update public.student_profiles set username = 'hacker' where id = $1`, [s])).rejects.toThrow(/cannot be changed/)
  })

  it('a student account can never become an administrator', async () => {
    const s = await createStudent(null)
    const [{ email }] = await root<{ email: string }>('select email from auth.users where id = $1', [s])
    await expect(root('select public.grant_admin($1)', [email])).rejects.toThrow(/cannot become administrators/)
  })
})

describe('family isolation', () => {
  it('a parent sees only their own children', async () => {
    const pa = await createParent()
    const pb = await createParent()
    const a1 = await createStudent(pa)
    const a2 = await createStudent(pa)
    const b1 = await createStudent(pb)
    const seen = (await as<{ id: string }>(pa, 'select id from public.student_profiles')).map((r) => r.id).sort()
    expect(seen).toEqual([a1, a2].sort())
    expect(await as(pa, 'select * from public.student_profiles where id = $1', [b1])).toEqual([])
    expect(await as(pb, 'select * from public.reward_transactions where student_id = $1', [a1])).toEqual([])
  })

  it('a student sees only themself', async () => {
    const p = await createParent()
    const s1 = await createStudent(p)
    const s2 = await createStudent(p)
    expect((await as<{ id: string }>(s1, 'select id from public.student_profiles')).map((r) => r.id)).toEqual([s1])
    expect(await as(s1, 'select * from public.profiles where id = $1', [s2])).toEqual([])
  })

  it('parents cannot attach someone else’s child to themselves', async () => {
    const pa = await createParent()
    const s = await createStudent(await createParent())
    await expect(as(pa, 'insert into public.parent_children (parent_id, student_id) values ($1, $2)', [pa, s])).rejects.toThrow(/permission denied/)
  })

  it('anonymous callers read nothing and cannot call game functions', async () => {
    expect(await as(null, 'select count(*)::int as n from public.subjects').catch((e) => String(e))).toMatch(/permission denied/)
    await expect(rpc(null, 'get_catalog')).rejects.toThrow(/permission denied/)
  })
})

describe('content protection', () => {
  it('students get the published catalogue but never questions or answer keys', async () => {
    const s = await createStudent(await createParent())
    const cat = await rpc<{ slug: string; units: { lessons: unknown[] }[] }[]>(s, 'get_catalog')
    const subject = cat.find((c) => c.slug === 'religion-values')!
    expect(subject.units).toHaveLength(4)
    expect(subject.units.flatMap((u) => u.lessons)).toHaveLength(27)
    expect(await as(s, 'select * from public.questions limit 1')).toEqual([])
    expect(await as(s, 'select * from public.question_options limit 1')).toEqual([])
    expect(await as(s, 'select * from public.textbooks limit 1')).toEqual([])
  })

  it('draft subjects are invisible to students and parents, visible to admins', async () => {
    const admin = await createAdmin()
    await as(admin, `insert into public.subjects (slug, name_ar, grade, semester, status) values ('draft-demo', 'مادة تجريبية', 8, 1, 'draft')`)
    const s = await createStudent(await createParent())
    expect(await as(s, `select * from public.subjects where slug = 'draft-demo'`)).toEqual([])
    expect((await rpc<{ slug: string }[]>(s, 'get_catalog')).some((c) => c.slug === 'draft-demo')).toBe(false)
    expect(await as(admin, `select slug from public.subjects where slug = 'draft-demo'`)).toEqual([{ slug: 'draft-demo' }])
    await root(`delete from public.subjects where slug = 'draft-demo'`)
  })

  it('non-admins cannot write content', async () => {
    const p = await createParent()
    await expect(as(p, `insert into public.subjects (slug, name_ar, grade, semester) values ('x-hack', 'اختراق', 8, 1)`)).rejects.toThrow(/row-level security/)
    expect(await as(p, `update public.questions set text = 'تم التعديل' returning id`)).toEqual([])
  })

  it('the private textbooks bucket accepts uploads from admins only', async () => {
    const admin = await createAdmin()
    const s = await createStudent(await createParent())
    await expect(as(s, `insert into storage.objects (bucket_id, name) values ('textbooks', 'x/book.pdf')`)).rejects.toThrow(/row-level security/)
    await as(admin, `insert into storage.objects (bucket_id, name) values ('textbooks', 'test/book.pdf')`)
    expect(await as(s, `select name from storage.objects where bucket_id = 'textbooks'`)).toEqual([])
    expect((await root(`select public from storage.buckets where id = 'textbooks'`))[0].public).toBe(false)
  })

  it('legacy content: 600 published questions with 4 options and one correct answer each', async () => {
    const [r] = await root<{ q: number; bad: number; flagged: number; flags: number }>(`
      select (select count(*)::int from public.questions where origin = 'legacy_import' and status = 'published') as q,
             (select count(*)::int from public.questions q where (select count(*) from public.question_options o where o.question_id = q.id) <> 4
                or (select count(*) from public.question_options o where o.question_id = q.id and o.is_correct) <> 1) as bad,
             (select count(*)::int from public.questions where needs_academic_review) as flagged,
             (select count(*)::int from public.academic_flags where origin = 'legacy_task05' and status = 'open') as flags`)
    expect(r).toEqual({ q: 600, bad: 0, flagged: 1, flags: 4 })
  })
})

describe('server-validated quiz and rewards', () => {
  it('a session hides answers, hints and explanations', async () => {
    const s = await createStudent(await createParent())
    const m = await missionOf('u1-l1')
    const sess = await rpc<Session>(s, 'start_quiz_session', m.id)
    expect(sess.questions).toHaveLength(8)
    const json = JSON.stringify(sess)
    expect(json).not.toMatch(/is_correct|explanation|"hint"/)
    expect(sess.questions[0].options).toHaveLength(4)
  })

  it('pays 10/10 first try, 5/5 after a hint or retry, 0 when missed; rejects duplicates', async () => {
    const s = await createStudent(await createParent())
    const m = await missionOf('u1-l1')
    const sess = await rpc<Session>(s, 'start_quiz_session', m.id)
    const [q1, q2, q3, q4] = sess.questions.map((q) => q.id)

    const a1 = await rpc<Answer>(s, 'submit_answer', sess.session_id, q1, m.correct.get(q1))
    expect(a1).toMatchObject({ feedback: 'correct', result: 'first', reward: { xp: 10, coins: 10 } })
    expect(a1.explanation).toBeTruthy()
    await expect(rpc(s, 'submit_answer', sess.session_id, q1, m.correct.get(q1))).rejects.toThrow(/already answered/)

    const hint = await rpc<string>(s, 'request_hint', sess.session_id, q2)
    expect(hint.length).toBeGreaterThan(0)
    expect(await rpc<Answer>(s, 'submit_answer', sess.session_id, q2, m.correct.get(q2))).toMatchObject({ result: 'assisted', reward: { xp: 5, coins: 5 } })

    const w3 = wrongOf(m.correct.get(q3)!)
    const t1 = await rpc<Answer>(s, 'submit_answer', sess.session_id, q3, w3[0])
    expect(t1).toMatchObject({ feedback: 'try-again', result: null, correct_option: null })
    expect(t1.hint).toBeTruthy()
    await expect(rpc(s, 'submit_answer', sess.session_id, q3, w3[0])).rejects.toThrow(/already tried/)
    expect(await rpc<Answer>(s, 'submit_answer', sess.session_id, q3, m.correct.get(q3))).toMatchObject({ result: 'assisted', reward: { xp: 5 } })

    const w4 = wrongOf(m.correct.get(q4)!)
    await rpc(s, 'submit_answer', sess.session_id, q4, w4[0])
    const miss = await rpc<Answer>(s, 'submit_answer', sess.session_id, q4, w4[1])
    expect(miss).toMatchObject({ feedback: 'revealed', result: 'missed', correct_option: m.correct.get(q4), reward: null })
  })

  it('cannot finish early, awards the mission bonus once, and replays never pay twice', async () => {
    const s = await createStudent(await createParent())
    const m = await missionOf('u1-l2')
    const play = async () => {
      const sess = await rpc<Session>(s, 'start_quiz_session', m.id)
      await expect(rpc(s, 'complete_quiz_session', sess.session_id)).rejects.toThrow(/not finished/)
      for (const q of sess.questions) await rpc(s, 'submit_answer', sess.session_id, q.id, m.correct.get(q.id))
      return rpc<{ total: number; first_try_accuracy: number; reward: { xp: number; coins: number; bonus: boolean; already_rewarded: number } }>(
        s, 'complete_quiz_session', sess.session_id)
    }
    const first = await play()
    expect(first.first_try_accuracy).toBe(100)
    expect(first.reward).toMatchObject({ xp: first.total * 10 + 20, coins: first.total * 10 + 20, bonus: true })
    const again = await play()
    expect(again.reward).toMatchObject({ xp: 0, coins: 0, bonus: false, already_rewarded: again.total })
    const [{ xp, coins }] = await root<{ xp: number; coins: number }>('select * from public.wallet_totals($1)', [s])
    expect([xp, coins]).toEqual([first.total * 10 + 20, first.total * 10 + 20])
  })

  it('completing the same session twice returns the stored result without new rewards', async () => {
    const s = await createStudent(await createParent())
    const m = await missionOf('u1-l3')
    const sess = await rpc<Session>(s, 'start_quiz_session', m.id)
    for (const q of sess.questions) await rpc(s, 'submit_answer', sess.session_id, q.id, m.correct.get(q.id))
    await rpc(s, 'complete_quiz_session', sess.session_id)
    const before = await root<{ n: number }>('select count(*)::int as n from public.reward_transactions where student_id = $1', [s])
    const repeat = await rpc<{ repeat: boolean }>(s, 'complete_quiz_session', sess.session_id)
    expect(repeat.repeat).toBe(true)
    expect(await root('select count(*)::int as n from public.reward_transactions where student_id = $1', [s])).toEqual(before)
  })

  it('students cannot touch another student’s session or write rewards directly', async () => {
    const p = await createParent()
    const a = await createStudent(p)
    const b = await createStudent(p)
    const m = await missionOf('u1-l1')
    const sess = await rpc<Session>(a, 'start_quiz_session', m.id)
    await expect(rpc(b, 'submit_answer', sess.session_id, sess.questions[0].id, 'a')).rejects.toThrow(/session not active/)
    await expect(as(b, `insert into public.reward_transactions (student_id, kind, ref, xp, coins) values ($1, 'question', 'x', 1000, 1000)`, [b])).rejects.toThrow(/permission denied/)
    await expect(rpc(p, 'start_quiz_session', m.id)).rejects.toThrow(/student account required/)
  })

  it('rate-limits impossible answer bursts', async () => {
    const s = await createStudent(await createParent())
    await root('update public.game_settings set max_answers_per_minute = 3')
    try {
      const m = await missionOf('u2-l1')
      const sess = await rpc<Session>(s, 'start_quiz_session', m.id)
      for (const q of sess.questions.slice(0, 3)) await rpc(s, 'submit_answer', sess.session_id, q.id, m.correct.get(q.id))
      await expect(rpc(s, 'submit_answer', sess.session_id, sess.questions[3].id, 'a')).rejects.toThrow(/rate_limited/)
    } finally {
      await root('update public.game_settings set max_answers_per_minute = 40')
    }
  })
})

describe('shop and locker', () => {
  async function richStudent(coins: number) {
    const s = await createStudent(await createParent())
    await root(`insert into public.reward_transactions (student_id, kind, ref, xp, coins) values ($1, 'question', 'seed', $2, $2)`, [s, coins])
    return s
  }

  it('rejects purchases without enough coins, deducts the server price, prevents duplicates', async () => {
    const s = await richStudent(100)
    await expect(rpc(s, 'purchase_item', 'hat-crown')).rejects.toThrow(/insufficient coins/)
    expect(await rpc(s, 'purchase_item', 'hat-straw')).toMatchObject({ price: 80, coins: 20 })
    await expect(rpc(s, 'purchase_item', 'hat-straw')).rejects.toThrow(/already owned/)
    await expect(rpc(s, 'purchase_item', 'free-gold')).rejects.toThrow(/unknown item/)
    const state = await rpc<{ coins: number; xp: number; owned: string[] }>(s, 'get_my_game_state')
    expect(state).toMatchObject({ coins: 20, xp: 100, owned: ['hat-straw'] })
  })

  it('equips only owned items and only unlocked characters', async () => {
    const s = await richStudent(400)
    await expect(rpc(s, 'equip_item', 'hat-grad')).rejects.toThrow(/not owned/)
    await rpc(s, 'purchase_item', 'hat-grad')
    await rpc(s, 'equip_item', 'hat-grad')
    // Creatures are legendary collectibles now: not free, not sold in the shop.
    await expect(rpc(s, 'set_character', 'owl')).rejects.toThrow(/character locked/)
    await expect(rpc(s, 'set_character', 'fox')).rejects.toThrow(/character locked/)
    await expect(rpc(s, 'purchase_item', 'char-owl')).rejects.toThrow(/unknown item/)
    await rpc(s, 'set_character', 'human-girl')
    await root(`insert into public.inventory (student_id, item_id, source) values ($1, 'char-owl', 'grant')`, [s])
    await rpc(s, 'set_character', 'owl')
    const state = await rpc<{ character_id: string; equipped: Record<string, string> }>(s, 'get_my_game_state')
    expect(state).toMatchObject({ character_id: 'owl', equipped: { head: 'hat-grad' } })
    await rpc(s, 'unequip_slot', 'head')
    expect((await rpc<{ equipped: object }>(s, 'get_my_game_state')).equipped).toEqual({})
  })

  it('concurrent purchases cannot overspend', async () => {
    const s = await richStudent(130)
    const results = await Promise.allSettled([rpc(s, 'purchase_item', 'hat-grad'), rpc(s, 'purchase_item', 'hat-straw')])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const [{ coins }] = await root<{ coins: number }>('select * from public.wallet_totals($1)', [s])
    expect(coins).toBeGreaterThanOrEqual(0)
  })
})

describe('device-local history import', () => {
  it('imports once as unverified history and creates no XP, coins or items', async () => {
    const s = await createStudent(await createParent())
    const payload = { progress: { missions: { 'u1-l1#1': { timesCompleted: 3 } }, questions: { a: {}, b: {} } }, wallet: { coins: 99999 } }
    expect(await rpc(s, 'import_legacy_progress', JSON.stringify(payload))).toEqual({ missions: 1, questions: 2, verified: false })
    expect(await rpc(s, 'import_legacy_progress', JSON.stringify(payload))).toMatchObject({ already_imported: true })
    expect(await rpc(s, 'get_my_game_state')).toMatchObject({ xp: 0, coins: 0, owned: [], legacy_imported: true })
  })
})

describe('accounts created like Supabase Auth admin createUser (insert, then app_metadata update)', () => {
  it('a child created in two steps becomes a linked student, never a parent', async () => {
    const parent = await createParent()
    const username = `t_${Date.now().toString(36)}`.slice(0, 20)
    const [u] = await root<{ id: string }>(`insert into auth.users (email, raw_app_meta_data) values ($1, '{"provider":"email"}') returning id`, [`${username}@students.alam-altahaddi.invalid`])
    expect((await root('select role from public.profiles where id = $1', [u.id]))[0].role).toBe('parent')
    await root(`update auth.users set raw_app_meta_data = $2 where id = $1`, [u.id, JSON.stringify({ provider: 'email', role: 'student', username, nickname: 'نجم', parent_id: parent })])
    expect((await root('select role from public.profiles where id = $1', [u.id]))[0].role).toBe('student')
    expect(await root('select username from public.student_profiles where id = $1', [u.id])).toEqual([{ username }])
    expect(await root('select 1 from public.parent_children where parent_id = $1 and student_id = $2', [parent, u.id])).toHaveLength(1)
    expect(await root('select 1 from public.parent_settings where parent_id = $1', [u.id])).toHaveLength(0)
  })

  it('an account already in use as a parent cannot be turned into a student', async () => {
    const parent = await createParent()
    await createStudent(parent)
    await expect(root(`update auth.users set raw_app_meta_data = '{"role":"student","username":"x_takeover"}' where id = $1`, [parent])).rejects.toThrow(/account in use/)
  })
})
